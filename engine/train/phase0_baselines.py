"""Phase 0 baselines promoted to functions that return metrics (reproduce docs/phase0-report.md)."""
from __future__ import annotations

import glob
import os
from multiprocessing import Pool

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import ElasticNetCV
from sklearn.model_selection import GroupKFold, LeaveOneOut, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from engine.data.safe_unpickle import load_one

GRID = np.linspace(3.3, 2.0, 60)


def _qv(df: pd.DataFrame):
    x = df[df.Status.str.contains("discharge")]
    if len(x) < 10:
        return None
    v = x["Voltage (V)"].values
    cap = x["Capacity (mAh)"].values
    q = np.cumsum(np.abs(np.diff(cap, prepend=cap[0])))
    idx = np.argsort(-v)
    v, q = v[idx], q[idx]
    return np.interp(GRID, v[::-1], q[::-1])


def _hust_one(path: str) -> dict:
    try:
        key = os.path.basename(path)[:-4]
        d = load_one(path)[key]
        dq = pd.Series(d["dq"]).sort_index()
        n = len(dq)
        r = dict(cell=key, life=n, q1=dq.iloc[0], q10=dq.iloc[9], q100=dq.iloc[min(99, n - 1)],
                 dq100_10=dq.iloc[99] - dq.iloc[9],
                 slope=np.polyfit(np.arange(10, 100), dq.iloc[9:99].values, 1)[0],
                 eol_ratio=dq.iloc[-1] / dq.iloc[0], q_min_100=dq.iloc[:100].min())
        a, b = _qv(d["data"][10]), _qv(d["data"][100])
        if a is not None and b is not None:
            dd = b - a
            r.update(dQ_var=np.log10(np.var(dd) + 1e-9), dQ_min=np.log10(abs(dd.min()) + 1e-9),
                     dQ_mean=np.mean(dd), dQ_skew=float(pd.Series(dd).skew()))
        return r
    except Exception as e:  # keep going; caller checks for error rows
        return dict(cell=path, err=str(e)[:80])


def hust_features(hust_dir: str = "data/hust/ex/our_data", workers: int = 6) -> pd.DataFrame:
    files = sorted(glob.glob(f"{hust_dir}/*.pkl"))
    if not files:
        raise FileNotFoundError(f"no HUST pickles under {hust_dir}")
    with Pool(workers) as p:
        rows = p.map(_hust_one, files, chunksize=1)
    return pd.DataFrame(rows)


FEATURE_SETS = {
    "mean only": [],
    "capacity-fade feats": ["dq100_10", "slope", "q_min_100", "q1"],
    "dQ(V) feats": ["dQ_var", "dQ_min", "dQ_mean", "dQ_skew"],
    "both": ["dq100_10", "slope", "q_min_100", "q1", "dQ_var", "dQ_min", "dQ_mean", "dQ_skew"],
}


def hust_cycle_life_baseline(feats: pd.DataFrame) -> dict[str, dict[str, float]]:
    """Leave-one-cell-out cycle-life error (log-life target). Returns metrics per feature set."""
    d = feats.dropna(subset=["life", "dQ_var"]).copy()
    y = np.log(d.life.values)
    out = {}
    for name, cols in FEATURE_SETS.items():
        if not cols:
            p = np.array([np.mean(np.delete(y, i)) for i in range(len(y))])
        else:
            m = make_pipeline(StandardScaler(), ElasticNetCV(l1_ratio=[.1, .5, .9], cv=5, max_iter=20000))
            p = cross_val_predict(m, d[cols].values, y, cv=LeaveOneOut())
        e = np.abs(np.exp(p) - d.life.values) / d.life.values
        out[name] = dict(mape=float(e.mean() * 100), within15=float((e < .15).mean() * 100), n=int(len(d)))
    return out


def naumann_retention(xlsx: str = "data/naumann_lfp_calendar/DischargeCapacity.xlsx") -> pd.DataFrame:
    df = pd.read_excel(xlsx, header=None)
    cols = df.iloc[1, 1:].tolist()
    d = df.iloc[2:].copy()
    d.columns = ["h"] + cols
    d = d.apply(pd.to_numeric, errors="coerce").dropna(subset=["h"])
    rows = []
    for c in cols:
        s = d[["h", c]].dropna()
        rows.append((c, float(s[c].iloc[-1] / s[c].iloc[0] * 100), float(s.h.iloc[-1] / 24)))
    return pd.DataFrame(rows, columns=["condition", "retention_pct", "days"])


def evb_capacity_baseline(table: str = "engine/data/processed/evb_segments.parquet", seed: int = 0,
                          n_sample: int = 60000) -> dict[str, dict[str, float]]:
    """Vehicle-grouped CV capacity error on per-snippet features (see docs/phase0-report.md 3.2)."""
    d = pd.read_parquet(table)
    d = d[(d.capacity > 0) & (d.dsoc >= 5)].sample(n_sample, random_state=seed)
    d = d[np.isfinite(d.ah) & (d.dsoc > 0)].copy()
    d["implied"] = d.ah / (d.dsoc / 100)
    d = d.rename(columns={"capacity": "cap"})
    feats = ["mileage", "dsoc", "soc0", "vmean", "v0", "v1", "imean", "dvm", "dvx", "tmean", "tspan", "ah", "implied"]
    y, g = d.cap.values, d.vehicle.values
    out = {}
    for name, fs in [("mileage only", ["mileage"]), ("segment feats", feats)]:
        p = np.zeros(len(d))
        for tr, te in GroupKFold(5).split(d, y, g):
            m = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08, random_state=seed).fit(d.iloc[tr][fs], y[tr])
            p[te] = m.predict(d.iloc[te][fs])
        e = np.abs(p - y) / y
        out[name] = dict(mape=float(e.mean() * 100), within5=float((e < .05).mean() * 100))
    return out
