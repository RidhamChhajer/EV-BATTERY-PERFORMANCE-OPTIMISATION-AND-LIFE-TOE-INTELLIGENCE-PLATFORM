"""Calibrate the calendar residual spread and check band coverage (leave-one-out). Usage: python -m engine.train.fit_uncertainty

Calendar: sigma_cal = std of log(observed loss / predicted loss) over out-of-fold points (leave-one-condition-out).
Cycle: sigma comes from the between-cell spread; coverage is checked leave-one-cell-out with a proper refit.
Nominal band: p10-p90 (80 %). Writes engine/artifacts/uncertainty.json.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from engine.cell.calendar import calendar_loss
from engine.train.fit_calendar import TABLE, fit, to_params
from engine.train.fit_cycle import CELLS, CYCLES, _fit_m, _series
from engine.train.metrics_store import update

Z80 = 1.2815515655446004
MIN_LOSS = 0.02   # ignore points with tiny loss (ratio is meaningless)
OUT = "engine/artifacts/uncertainty.json"


def calendar_oof(df: pd.DataFrame, source_groups=("stanford", "naumann")):
    """Out-of-fold observed and predicted loss per point, leaving one (source, temp, SOC) condition out."""
    rows = []
    for src in source_groups:
        d = df[df.source == src]
        for (t, s), idx in d.groupby(["temp_c", "soc_pct"]).groups.items():
            held = d.loc[idx]
            held = held[held.days > 0]
            p = to_params(fit(df.drop(index=idx)).x)   # train on everything except this condition (both labs)
            pred = calendar_loss(held.days.values, held.temp_c.values, held.soc_pct.values, p)
            rows.append(pd.DataFrame(dict(source=src, cond=f"{t}C/{s}%", obs=1 - held.retention.values, pred=pred)))
    return pd.concat(rows, ignore_index=True)


def calendar_calibration(oof: pd.DataFrame) -> dict:
    d = oof[(oof.obs > MIN_LOSS) & (oof.pred > MIN_LOSS)]
    lr = np.log(d.obs / d.pred)
    sigma = float(lr.std())
    mu = float(lr.mean())
    lo, hi = np.exp(mu - Z80 * sigma), np.exp(mu + Z80 * sigma)
    cov = float(((d.obs >= d.pred * lo) & (d.obs <= d.pred * hi)).mean())
    # per-condition coverage so one big condition cannot hide misses
    per = d.assign(inb=(d.obs >= d.pred * lo) & (d.obs <= d.pred * hi)).groupby(["source", "cond"]).inb.mean()
    return dict(sigma_cal=sigma, log_ratio_mean=mu, n_points=int(len(d)), coverage_point_weighted=cov,
                coverage_condition_mean=float(per.mean()), coverage_condition_min=float(per.min()))


def cycle_loco_coverage() -> dict:
    cells = pd.read_parquet(CELLS)
    series = _series(pd.read_parquet(CYCLES))
    names = list(cells.cell)
    hits, tot, per_cell = 0, 0, []
    for held in names:
        train = [c for c in names if c != held]
        m, B = _fit_m(series, train)
        lb = np.log(list(B.values()))
        mu, sd = lb.mean(), lb.std(ddof=1)
        n, loss = series[held]
        sel = loss > MIN_LOSS
        lo, hi = np.exp(mu - Z80 * sd) * n[sel] ** m, np.exp(mu + Z80 * sd) * n[sel] ** m
        inb = (loss[sel] >= lo) & (loss[sel] <= hi)
        hits += inb.sum(); tot += inb.size
        per_cell.append(inb.mean())
    return dict(coverage_point_weighted=float(hits / tot), coverage_cell_mean=float(np.mean(per_cell)),
                coverage_cell_min=float(np.min(per_cell)), n_cells=len(names))


def main() -> None:
    df = pd.read_parquet(TABLE)
    cal = calendar_calibration(calendar_oof(df))
    cyc = cycle_loco_coverage()
    art = dict(sigma_cal=cal["sigma_cal"], log_ratio_mean_cal=cal["log_ratio_mean"], extrapolation_widening=1.5,
               extrapolation_widening_note="ASSUMPTION: sigma multiplied by 1.5 when inputs leave the training range",
               nominal_band="p10-p90 (80 %)", calendar_coverage=cal, cycle_coverage=cyc, synthetic_data=False)
    json.dump(art, open(OUT, "w"), indent=1, sort_keys=True)
    update("uncertainty", dict(calendar=cal, cycle=cyc))
    print(json.dumps(art, indent=1))


if __name__ == "__main__":
    main()
