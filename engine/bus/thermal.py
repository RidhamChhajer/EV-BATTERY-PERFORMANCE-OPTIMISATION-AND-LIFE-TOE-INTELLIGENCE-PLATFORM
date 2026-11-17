"""Effective Arrhenius temperature from monthly air temperature, diurnal range and a heat-rise assumption."""
from __future__ import annotations

import json

import numpy as np

from engine.cell.calendar import R, TREF

_ZONES = json.load(open("engine/data/zones.json"))["zones"]
W = np.array([0.25, 0.5, 0.25])   # weights for daily min, mean, max air temperature (simple 3-point day)


def monthly_cell_temps(zone: str, heat_rise_c: float) -> np.ndarray:
    """Mean cell temperature per month: air temperature + assumed constant heat rise."""
    return np.array([m["tmean_c"] for m in _ZONES[zone]["monthly"]]) + heat_rise_c


def effective_temperature(zone: str, heat_rise_c: float, Ea: float) -> float:
    """Single temperature that gives the same average Arrhenius factor as the real monthly/diurnal profile."""
    f = []
    for m in _ZONES[zone]["monthly"]:
        T = np.array([m["tmin_mean_c"], m["tmean_c"], m["tmax_mean_c"]]) + heat_rise_c + 273.15
        f.append(float((W * np.exp(-(Ea / R) * (1.0 / T - 1.0 / TREF))).sum()))
    F = float(np.mean(f))
    return float(1.0 / (1.0 / TREF - (R / Ea) * np.log(F)) - 273.15)
