"""HUST LFP cycling data: per-cell summary and per-cycle capacity tables."""
from __future__ import annotations

import glob
import os
from multiprocessing import Pool

import numpy as np
import pandas as pd

from engine.data.safe_unpickle import load_one
from engine.data.validate import validate_hust
from engine.train.phase0_baselines import _qv


GRID3 = np.linspace(3.05, 2.0, 50)


def _qv_step(df: pd.DataFrame, step: str):
    x = df[df.Status.str.endswith(step)]
    if len(x) < 10:
        return None
    v = x["Voltage (V)"].values
    q = np.abs(x["Capacity (mAh)"].values - x["Capacity (mAh)"].values[0])
    if v.max() < GRID3[0] or v.min() > GRID3[-1]:
        return None
    idx = np.argsort(-v)
    return np.interp(GRID3, v[idx][::-1], q[idx][::-1])


def _one(path: str):
    key = os.path.basename(path)[:-4]
    d = load_one(path)[key]
    dq = pd.Series(d["dq"]).sort_index()
    n = len(dq)
    cell = dict(cell=key, life=n, q1=dq.iloc[0], q10=dq.iloc[9], q100=dq.iloc[min(99, n - 1)],
                dq100_10=dq.iloc[99] - dq.iloc[9],
                slope=float(np.polyfit(np.arange(10, 100), dq.iloc[9:99].values, 1)[0]),
                eol_ratio=dq.iloc[-1] / dq.iloc[0], q_min_100=dq.iloc[:100].min())
    a, b = _qv(d["data"][10]), _qv(d["data"][100])
    if a is not None and b is not None:
        dd = b - a
        cell.update(dQ_var=float(np.log10(np.var(dd) + 1e-9)), dQ_min=float(np.log10(abs(dd.min()) + 1e-9)),
                    dQ_mean=float(np.mean(dd)), dQ_skew=float(pd.Series(dd).skew()))
    # discharge_3 step (common low-rate step): Q(V) difference between cycles 100 and 10, protocol-consistent window
    q3a, q3b = _qv_step(d["data"][10], "discharge_3"), _qv_step(d["data"][100], "discharge_3")
    if q3a is not None and q3b is not None:
        d3 = q3b - q3a
        cell.update(dQ3_var=float(np.log10(np.var(d3) + 1e-9)), dQ3_min=float(np.log10(abs(d3.min()) + 1e-9)),
                    dQ3_mean=float(np.mean(d3)))
    # effective C-rates from cycle 50 (nominal capacity 1100 mAh): time-weighted mean current of charge / discharge steps
    x = d["data"][50]
    dt = x["Time (s)"].diff().fillna(0)
    is_dis = x.Status.str.contains("discharge")
    cur = x["Current (mA)"].abs()
    cell["chg_c_mean"] = float((cur[~is_dis] * dt[~is_dis]).sum() / dt[~is_dis].sum() / 1100)
    cell["dis_c_mean"] = float((cur[is_dis] * dt[is_dis]).sum() / dt[is_dis].sum() / 1100)
    cyc = pd.DataFrame(dict(cell=key, cycle=dq.index.astype(int), capacity_mah=dq.values.astype(float)))
    return cell, cyc


def build_hust(hust_dir: str = "data/hust/ex/our_data", workers: int = 6):
    files = sorted(glob.glob(f"{hust_dir}/*.pkl"))
    if not files:
        raise FileNotFoundError(f"no HUST pickles under {hust_dir}")
    with Pool(workers) as p:
        res = p.map(_one, files, chunksize=1)
    cells = pd.DataFrame([r[0] for r in res])
    cycles = pd.concat([r[1] for r in res], ignore_index=True)
    errs = validate_hust(cells, cycles)
    if errs:
        raise ValueError("; ".join(errs))
    return cells, cycles
