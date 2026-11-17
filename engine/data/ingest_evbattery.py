"""EVBattery charging snippets -> one validated table (vehicle ids namespaced by dataset).

Chemistry is undisclosed and cell voltage reaches ~4.29 V, so these cells are NMC-like, NOT LFP.
Used for the calibration-method demonstration only. Authors state the values were perturbed.
"""
from __future__ import annotations

import glob
import os
from multiprocessing import Pool

import numpy as np
import pandas as pd

from engine.data.safe_unpickle import load_all

COLS = ["ds", "file", "vehicle", "label_code", "mileage", "capacity", "soc0", "soc1", "dsoc", "ah", "vmean", "v0",
        "v1", "imean", "dvm", "dvx", "tmean", "tspan", "dur"]


def _one(args):
    ds, path = args
    try:
        a, m = load_all(path)[3]
        t = a[:, 7]
        dt = np.diff(t, prepend=t[0])
        ah = -(a[:, 1] * dt).sum() / 3600
        spread = a[:, 3] - a[:, 4]
        return (ds, os.path.basename(path), f"{ds}_{m['car']}", str(m.get("label")), float(m["mileage"]),
                float(m.get("capacity") or 0), a[0, 2], a[-1, 2], a[-1, 2] - a[0, 2], ah, a[:, 0].mean(), a[0, 0],
                a[-1, 0], a[:, 1].mean(), spread.mean(), spread.max(), a[:, 5:7].mean(), (a[:, 5] - a[:, 6]).mean(),
                t[-1] - t[0])
    except Exception:
        return None


def validate_evbattery(df: pd.DataFrame) -> list[str]:
    errs = [f"missing column {c}" for c in COLS if c not in df.columns]
    if errs:
        return errs
    lab = df.capacity[df.capacity > 0]
    if len(lab) and not lab.between(20, 50).all():
        errs.append("capacity labels outside 20-50 Ah")
    if not df.vmean.between(2.5, 4.5).all():
        errs.append("mean cell voltage outside 2.5-4.5 V")
    if df.vehicle.str.match(r"^[123]_\d+$").mean() < 1:
        errs.append("vehicle ids not namespaced as <dataset>_<car>")
    return errs


def build_evbattery(root: str = "data/evbattery", workers: int = 11) -> pd.DataFrame:
    jobs = []
    for i in (1, 2, 3):
        jobs += [(i, f) for f in glob.glob(f"{root}/ex{i}/battery_dataset{i}/data/*.pkl")]
    if not jobs:
        raise FileNotFoundError(f"no EVBattery pickles under {root}")
    with Pool(workers) as p:
        rows = p.map(_one, jobs, chunksize=500)
    failed = sum(r is None for r in rows)
    df = pd.DataFrame([r for r in rows if r], columns=COLS)
    df.attrs["failed"] = failed
    errs = validate_evbattery(df)
    if errs:
        raise ValueError("; ".join(errs))
    if failed:
        raise ValueError(f"{failed} snippet files failed to load")
    return df
