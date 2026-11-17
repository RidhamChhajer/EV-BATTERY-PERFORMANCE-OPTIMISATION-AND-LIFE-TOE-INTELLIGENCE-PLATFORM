"""Early-life cycle-life predictor: capacity features from the first 100 cycles -> predicted cycle life.

The coefficients live in engine/artifacts/early_life.json (scaled-feature ElasticNet on log life).
"""
from __future__ import annotations

import json

import numpy as np

CAP_FEATURES = ["dq100_10", "slope", "q_min_100", "q1"]
MIN_CYCLES = 100


def features_from_capacity(cap_mah) -> dict[str, float]:
    """Compute features from discharge capacity per cycle (mAh). Uses cycles 1..100 only (no leakage)."""
    q = np.asarray(cap_mah, dtype=float)
    if q.ndim != 1 or len(q) < MIN_CYCLES:
        raise ValueError(f"need at least {MIN_CYCLES} cycles of capacity data, got {len(q)}")
    q = q[:MIN_CYCLES]
    if not np.isfinite(q).all() or (q <= 0).any():
        raise ValueError("capacity series contains NaN or non-positive values")
    return dict(q1=float(q[0]), dq100_10=float(q[99] - q[9]),
                slope=float(np.polyfit(np.arange(10, 100), q[9:99], 1)[0]), q_min_100=float(q.min()))


def predict_life(features: dict[str, float], artifact: dict) -> float:
    names = artifact["features"]
    missing = [n for n in names if n not in features or not np.isfinite(features[n])]
    if missing:
        raise ValueError(f"missing or non-finite features: {missing}")
    x = (np.array([features[n] for n in names]) - np.array(artifact["scaler_mean"])) / np.array(artifact["scaler_scale"])
    life = float(np.exp(artifact["intercept"] + x @ np.array(artifact["coef"])))
    if not (0 < life < 10_000 and np.isfinite(life)):
        raise ValueError("prediction outside sane range")
    return life


def load(path: str = "engine/artifacts/early_life.json") -> dict:
    return json.load(open(path))
