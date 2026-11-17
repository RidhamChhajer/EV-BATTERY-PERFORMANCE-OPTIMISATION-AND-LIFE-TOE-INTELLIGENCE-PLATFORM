"""Cycle-induced capacity fade: loss = B * (C/C0)^k * exp(-(Eb/R)(1/T - 1/T0)) * EFC^m.

EFC = equivalent full cycles. C is the effective mean C-rate (mean of charge and discharge). B, m, k are fitted
on HUST (30 C only). The temperature term Eb is NOT fitted: HUST has a single temperature, so Eb is an assumed
literature-range value and every result that depends on it must be labelled an assumption.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

R = 8.314


@dataclass(frozen=True)
class CycleParams:
    logB: float
    m: float
    k: float
    C0: float
    Eb: float          # J/mol, ASSUMED
    T0_c: float        # reference temperature of the data (deg C)
    valid_temp_c: tuple[float, float]
    valid_c_rate: tuple[float, float]
    valid_efc_max: float

    def to_dict(self) -> dict:
        d = asdict(self)
        d["temperature_term"] = "assumed"
        return d

    @staticmethod
    def from_dict(d: dict) -> "CycleParams":
        keys = ("logB", "m", "k", "C0", "Eb", "T0_c", "valid_efc_max")
        return CycleParams(**{k: d[k] for k in keys}, valid_temp_c=tuple(d["valid_temp_c"]),
                           valid_c_rate=tuple(d["valid_c_rate"]))


def cycle_loss(efc, temp_c, c_rate, p: CycleParams):
    """Fractional capacity loss from cycling. Raises ValueError for negative EFC or non-positive C-rate."""
    n = np.asarray(efc, dtype=float)
    c = np.asarray(c_rate, dtype=float)
    if np.any(n < 0):
        raise ValueError("efc must be >= 0")
    if np.any(c <= 0):
        raise ValueError("c_rate must be > 0")
    T = np.asarray(temp_c, dtype=float) + 273.15
    T0 = p.T0_c + 273.15
    return np.exp(p.logB) * (c / p.C0) ** p.k * np.exp(-(p.Eb / R) * (1.0 / T - 1.0 / T0)) * n ** p.m


def is_extrapolated(efc, temp_c, c_rate, p: CycleParams):
    T, c, n = (np.asarray(x, dtype=float) for x in (temp_c, c_rate, efc))
    return ((T < p.valid_temp_c[0]) | (T > p.valid_temp_c[1]) | (c < p.valid_c_rate[0]) | (c > p.valid_c_rate[1])
            | (n > p.valid_efc_max))


def cycle_loss_flagged(efc, temp_c, c_rate, p: CycleParams):
    return cycle_loss(efc, temp_c, c_rate, p), is_extrapolated(efc, temp_c, c_rate, p)
