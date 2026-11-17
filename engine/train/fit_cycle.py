"""Fit cycle fade on HUST. Usage: python -m engine.train.fit_cycle

Two stages: (1) pooled exponent m with per-cell scale B_i (closed form for B_i given m);
(2) regress log B_i on log(C_i/C0) for the C-rate exponent k; residual SD = between-cell spread.
Bootstrap over cells gives parameter draws. The temperature term is assumed (single-temperature data).
"""
from __future__ import annotations

import hashlib
import json
import os

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar

from engine.cell.cycle import CycleParams, cycle_loss
from engine.train.metrics_store import update

CELLS = "engine/data/processed/hust_cells.parquet"
CYCLES = "engine/data/processed/hust_cycles.parquet"
OUT = "engine/artifacts/cycle_params.json"
EB_ASSUMED = 30e3      # J/mol, mid-range of published LFP cycling activation energies; NOT fitted
T0_C = 30.0            # HUST test temperature
N_BOOT = 500
SEED = 0


def _series(cycles: pd.DataFrame):
    out = {}
    for cell, g in cycles.groupby("cell"):
        g = g.sort_values("cycle")
        q = g.capacity_mah.values
        out[cell] = (g.cycle.values.astype(float), 1.0 - q / q[0])
    return out


def _fit_m(series: dict, cells: list[str]):
    def sse(m):
        tot = 0.0
        for c in cells:
            n, loss = series[c]
            x = n ** m
            B = (loss * x).sum() / (x * x).sum()
            tot += ((loss - B * x) ** 2).mean()
        return tot
    r = minimize_scalar(sse, bounds=(0.3, 2.0), method="bounded")
    m = float(r.x)
    B = {c: float((series[c][1] * series[c][0] ** m).sum() / (series[c][0] ** (2 * m)).sum()) for c in cells}
    return m, B


def _stage2(cells_df: pd.DataFrame, B: dict, C0: float):
    d = cells_df.set_index("cell").loc[list(B)]
    x = np.log(d.c_eff.values / C0)
    y = np.log([B[c] for c in d.index])
    A = np.vstack([np.ones_like(x), x]).T
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    res = y - A @ coef
    sigma = float(res.std(ddof=2))
    cov = sigma ** 2 * np.linalg.inv(A.T @ A)
    return float(coef[0]), float(coef[1]), sigma, float(np.sqrt(cov[1, 1]))


def main() -> None:
    cells = pd.read_parquet(CELLS)
    cells["c_eff"] = 0.5 * (cells.chg_c_mean + cells.dis_c_mean)
    series = _series(pd.read_parquet(CYCLES))
    names = list(cells.cell)
    C0 = float(cells.c_eff.mean())
    m, B = _fit_m(series, names)
    # C-rate regression is kept as a DIAGNOSTIC only. In HUST it comes out with the unphysical sign (higher C,
    # less fade), i.e. it is confounded with the protocol, so the model uses k = 0 (no C-rate effect claimed).
    _, k_diag, _, k_se = _stage2(cells, B, C0)
    logBs = np.log(list(B.values()))
    logB, sigma, k = float(logBs.mean()), float(logBs.std(ddof=1)), 0.0
    rng = np.random.default_rng(SEED)
    draws = []
    for _ in range(N_BOOT):
        pick = list(rng.choice(names, len(names), replace=True))
        # unique keys for repeated draws
        sub = {f"{c}#{i}": series[c] for i, c in enumerate(pick)}
        cd = pd.concat([cells[cells.cell == c].assign(cell=f"{c}#{i}") for i, c in enumerate(pick)])
        mb, Bb = _fit_m(sub, list(sub))
        lbs = np.log(list(Bb.values()))
        draws.append([float(lbs.mean()), mb, 0.0, float(lbs.std(ddof=1))])
    p = CycleParams(logB=logB, m=m, k=k, C0=C0, Eb=EB_ASSUMED, T0_c=T0_C, valid_temp_c=(25.0, 35.0),
                    valid_c_rate=(float(cells.c_eff.min()), float(cells.c_eff.max())),
                    valid_efc_max=float(cells.life.max()))
    # fit quality, two views: (a) shape fit with each cell's own scale B_i; (b) pooled prediction from the mean scale
    se_shape, se_pooled, nobs = 0.0, 0.0, 0
    for c in names:
        n, loss = series[c]
        se_shape += ((B[c] * n ** m - loss) ** 2).sum()
        se_pooled += ((cycle_loss(n, T0_C, C0, p) - loss) ** 2).sum()
        nobs += len(n)
    rmse_shape, rmse = float(np.sqrt(se_shape / nobs)), float(np.sqrt(se_pooled / nobs))
    art = dict(model="loss = exp(logB) * (C/C0)^k * exp(-(Eb/R)(1/T-1/T0)) * EFC^m", params=p.to_dict(),
               sigma_logB_between_cells=sigma, c_rate_regression_diagnostic=dict(k=k_diag, standard_error=k_se,
               note="unphysical sign (higher C-rate, less fade): confounded with protocol; not used (k=0)"),
               rmse_fade_shape_per_cell_scale=rmse_shape,
               bootstrap_draws_logB_m_k_sigma=np.round(draws, 6).tolist(), n_boot=N_BOOT, seed=SEED,
               rmse_fade_pooled=rmse, n_cells=len(names), n_obs=nobs,
               c_rate_definition="mean of time-weighted mean charge and discharge C-rate at cycle 50 (nominal 1.1 Ah)",
               data_hash=hashlib.sha256(pd.util.hash_pandas_object(cells.drop(columns=["c_eff"]), index=False).values.tobytes()).hexdigest(),
               synthetic_data=False)
    os.makedirs("engine/artifacts", exist_ok=True)
    json.dump(art, open(OUT, "w"), indent=1, sort_keys=True)
    update("cycle_fit", dict(m=m, k_used=k, k_diagnostic=k_diag, k_diagnostic_se=k_se, sigma_logB=sigma,
                             rmse_shape=rmse_shape, rmse_pooled=rmse, n_cells=len(names)))
    print(json.dumps({k_: v for k_, v in art.items() if not k_.startswith("bootstrap")}, indent=1))


if __name__ == "__main__":
    main()
