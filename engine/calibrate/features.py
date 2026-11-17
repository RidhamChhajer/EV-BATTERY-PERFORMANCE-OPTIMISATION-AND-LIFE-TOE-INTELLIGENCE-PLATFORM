"""Vendor-file contract and snippet features for the Calibrated-mode method demonstration.

The demo runs on EVBattery (NMC-like, not LFP, capacity labels derived by the dataset authors). A vendor file for the
real Calibrated mode must carry the same columns. Capacity is in ampere-hours; a missing or non-positive capacity marks
an unlabelled row (it can still be predicted, it just teaches the model nothing about its vehicle).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

REQUIRED = ["vehicle", "mileage", "dsoc", "soc0", "vmean", "v0", "v1", "imean", "dvm", "dvx", "tmean", "tspan", "ah"]
LABEL = "capacity"
SNIPPET_FEATURES = ["mileage", "dsoc", "soc0", "vmean", "v0", "v1", "imean", "dvm", "dvx", "tmean", "tspan", "ah", "implied"]

MIN_DSOC = 5.0            # a snippet covering fewer points of state of charge cannot support a capacity estimate
AH_RANGE = (5.0, 1000.0)  # plausible cell or module capacity in Ah; anything above looks like mAh


class VendorFileError(ValueError):
    """The vendor file cannot be used; the message says why."""


def validate(frame: pd.DataFrame) -> None:
    missing = [c for c in REQUIRED if c not in frame.columns]
    if missing:
        raise VendorFileError(f"vendor file is missing column(s): {', '.join(missing)}")
    if LABEL in frame.columns:
        lab = pd.to_numeric(frame[LABEL], errors="coerce")
        lab = lab[lab > 0]
        if len(lab) and lab.median() > AH_RANGE[1]:
            raise VendorFileError(f"'{LABEL}' median is {lab.median():.0f}, which looks like mAh; supply capacity in Ah")
        if len(lab) and lab.median() < AH_RANGE[0]:
            raise VendorFileError(f"'{LABEL}' median is {lab.median():.2f}, too small for Ah; check the unit")
    if frame["vehicle"].isna().any():
        raise VendorFileError("column 'vehicle' has empty values")


def prepare(frame: pd.DataFrame) -> pd.DataFrame:
    """Rows that can be used: finite features and a state-of-charge span large enough to mean something."""
    validate(frame)
    d = frame.copy()
    d["vehicle"] = d["vehicle"].astype(str)
    d["implied"] = d["ah"] / (d["dsoc"] / 100.0)
    d[LABEL] = pd.to_numeric(d[LABEL], errors="coerce") if LABEL in d.columns else np.nan
    ok = np.isfinite(d[SNIPPET_FEATURES].to_numpy(dtype=float)).all(axis=1) & (d["dsoc"] >= MIN_DSOC)
    return d[ok].reset_index(drop=True)
MILEAGE_ONLY = ["mileage"]
