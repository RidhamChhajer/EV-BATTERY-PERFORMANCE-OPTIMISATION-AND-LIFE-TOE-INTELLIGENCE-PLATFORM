"""Fit the calendar ageing model on Stanford + Naumann LFP storage data.

Usage: python -m engine.train.fit_calendar
Writes engine/artifacts/calendar_params.json and docs/figures/calendar_residuals.png.
"""
from __future__ import annotations

import hashlib
import json
import os

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

from engine.cell.calendar import SOC_NODES, VALID_SOC, VALID_T, CalendarParams, calendar_loss

SEED = 0
N_BOOT = 500
# Raw fit vector: [logA, Ea, z, u0, g25, d75, d100]. SOC stress is forced non-decreasing:
# g0 = u0*g25 (u0<=1), g25 <= 1, g75 = 1 + d75, g100 = g75 + d100 (d >= 0).
X0 = np.array([np.log(0.01), 40e3, 0.6, 0.5, 0.8, 0.3, 0.5])
LB = np.array([-12.0, 10e3, 0.3, 0.01, 0.01, 0.0, 0.0])
UB = np.array([2.0, 100e3, 1.0, 1.0, 1.0, 5.0, 5.0])


def to_params(v) -> CalendarParams:
    logA, Ea, z, u0, g25, d75, d100 = [float(x) for x in v]
    g75 = 1.0 + d75
    return CalendarParams(logA, Ea, z, u0 * g25, g25, g75, g75 + d100)


def to_raw(p: CalendarParams) -> np.ndarray:
    return np.array([p.logA, p.Ea, p.z, p.g0 / p.g25, p.g25, p.g75 - 1.0, p.g100 - p.g75])
TABLE = "engine/data/processed/calendar_obs.parquet"
OUT = "engine/artifacts/calendar_params.json"


def _weights(df: pd.DataFrame) -> np.ndarray:
    """Each source carries equal total weight; within a source each series carries equal weight."""
    w = np.zeros(len(df))
    for src, g in df.groupby("source"):
        n_series = g.cell.nunique()
        per_series = g.groupby("cell").cell.transform("size")
        w[df.index.get_indexer(g.index)] = 1.0 / (n_series * per_series)
    return w / w.mean()


def fit(df: pd.DataFrame, x0=X0):
    df = df[df.days > 0].reset_index(drop=True)
    w = np.sqrt(_weights(df))
    t, T, S, y = df.days.values, df.temp_c.values, df.soc_pct.values, 1.0 - df.retention.values

    def resid(v):
        return w * (calendar_loss(t, T, S, to_params(v)) - y)

    return least_squares(resid, x0, bounds=(LB, UB), loss="soft_l1", f_scale=0.02, max_nfev=2000)


def rmse(df: pd.DataFrame, p: CalendarParams) -> float:
    d = df[df.days > 0]
    pred = 1.0 - calendar_loss(d.days.values, d.temp_c.values, d.soc_pct.values, p)
    return float(np.sqrt(np.mean((pred - d.retention.values) ** 2)))


def bootstrap(df: pd.DataFrame, x0: np.ndarray, n: int = N_BOOT, seed: int = SEED) -> np.ndarray:
    rng = np.random.default_rng(seed)
    keys = df[["source", "cell"]].drop_duplicates()
    groups = {k: g for k, g in df.groupby(["source", "cell"])}
    draws = []
    for _ in range(n):
        parts = []
        for src, ks in keys.groupby("source"):
            pick = ks.sample(len(ks), replace=True, random_state=int(rng.integers(1 << 31)))
            for i, (s, c) in enumerate(zip(pick.source, pick.cell)):
                parts.append(groups[(s, c)].assign(cell=f"{c}#{i}"))
        r = fit(pd.concat(parts, ignore_index=True), x0)
        if r.success:
            draws.append(r.x)
    return np.array(draws)


def main() -> None:
    df = pd.read_parquet(TABLE)
    r = fit(df)
    p = to_params(r.x)
    draws = np.array([to_params(v).vector() for v in bootstrap(df, r.x)])
    art = dict(
        model="loss = exp(logA) * exp(-(Ea/R)(1/T-1/Tref)) * g(SOC) * t_days^z; g(50)=1; Tref=298.15 K",
        params=p.to_dict(), soc_nodes=SOC_NODES.tolist(),
        bootstrap_draws=np.round(draws, 6).tolist(), n_boot_requested=N_BOOT, n_boot_ok=int(len(draws)),
        valid_temp_c=list(VALID_T), valid_soc_pct=list(VALID_SOC),
        rmse_retention=rmse(df, p), n_obs=int((df.days > 0).sum()), n_series=int(df.groupby(["source", "cell"]).ngroups),
        optimizer_success=bool(r.success), seed=SEED,
        data_hash=hashlib.sha256(pd.util.hash_pandas_object(df, index=False).values.tobytes()).hexdigest(),
        synthetic_data=False)
    os.makedirs("engine/artifacts", exist_ok=True)
    json.dump(art, open(OUT, "w"), indent=1, sort_keys=True)
    print(json.dumps({k: v for k, v in art.items() if k != "bootstrap_draws"}, indent=1))
    plot_residuals(df, p)


def plot_residuals(df: pd.DataFrame, p: CalendarParams) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    d = df[df.days > 0].copy()
    d["pred"] = 1.0 - calendar_loss(d.days.values, d.temp_c.values, d.soc_pct.values, p)
    d["res"] = d.retention - d.pred
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    for src, g in d.groupby("source"):
        ax[0].scatter(g.temp_c, g.res, s=4, alpha=.4, label=src)
        ax[1].scatter(g.days, g.res, s=4, alpha=.4, label=src)
    ax[0].set_xlabel("storage temperature (C)"); ax[1].set_xlabel("days")
    for a in ax:
        a.axhline(0, color="k", lw=.5); a.set_ylabel("observed - predicted retention")
    ax[0].legend()
    fig.tight_layout()
    os.makedirs("docs/figures", exist_ok=True)
    fig.savefig("docs/figures/calendar_residuals.png", dpi=110)


if __name__ == "__main__":
    main()
