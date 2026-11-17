"""Cross-lab and leave-one-condition-out validation of the calendar model (M2.2).

Overlap region (conditions both labs cover): 24-60 C, SOC 50 or 100 %.
Acceptance threshold fixed in advance: mean absolute retention error < 0.05 inside the overlap.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.cell.calendar import calendar_loss
from engine.train.fit_calendar import TABLE, fit, to_params
from engine.train.metrics_store import update

THRESHOLD = 0.05
OVERLAP_T = (24.0, 60.0)
OVERLAP_SOC = (50.0, 100.0)


def overlap(df: pd.DataFrame) -> pd.DataFrame:
    return df[df.temp_c.between(*OVERLAP_T) & df.soc_pct.isin(OVERLAP_SOC) & (df.days > 0)]


def _mae(df: pd.DataFrame, params) -> float:
    pred = 1.0 - calendar_loss(df.days.values, df.temp_c.values, df.soc_pct.values, params)
    return float(np.mean(np.abs(pred - df.retention.values)))


def cross_lab(df: pd.DataFrame) -> dict:
    out = {}
    for train, test in (("stanford", "naumann"), ("naumann", "stanford")):
        tr, te = df[df.source == train], overlap(df[df.source == test])
        assert set(tr.cell) .isdisjoint(set(te.cell))  # no leakage between sources
        p = to_params(fit(tr).x)
        res = dict(mae_all=_mae(te, p), n=int(len(te)), conditions=int(te.groupby(["temp_c", "soc_pct"]).ngroups))
        # same-horizon check: only times the training lab also observed
        res["mae_within_train_horizon"] = _mae(te[te.days <= tr.days.max()], p)
        res["train_horizon_days"] = float(tr.days.max())
        out[f"{train}_to_{test}"] = res
    return out


def leave_one_condition_out(df: pd.DataFrame, source: str) -> dict:
    d = df[df.source == source]
    conds = d[["temp_c", "soc_pct"]].drop_duplicates().itertuples(index=False)
    errs = []
    for t, s in conds:
        held = (d.temp_c == t) & (d.soc_pct == s)
        p = to_params(fit(d[~held]).x)
        errs.append(dict(temp_c=t, soc_pct=s, mae=_mae(d[held & (d.days > 0)], p)))
    e = pd.DataFrame(errs)
    return dict(mean_mae=float(e.mae.mean()), max_mae=float(e.mae.max()), n_conditions=int(len(e)),
                worst=e.sort_values("mae").iloc[-1][["temp_c", "soc_pct"]].to_dict())


def run() -> dict:
    df = pd.read_parquet(TABLE)
    res = dict(cross_lab=cross_lab(df), loco_stanford=leave_one_condition_out(df, "stanford"),
               loco_naumann=leave_one_condition_out(df, "naumann"), threshold=THRESHOLD,
               overlap=f"{OVERLAP_T[0]}-{OVERLAP_T[1]} C, SOC {OVERLAP_SOC}")
    res["passes_threshold"] = bool(all(v["mae_all"] < THRESHOLD for v in res["cross_lab"].values()))
    update("calendar_validation", res)
    return res


if __name__ == "__main__":
    import json
    print(json.dumps(run(), indent=1, default=float))
