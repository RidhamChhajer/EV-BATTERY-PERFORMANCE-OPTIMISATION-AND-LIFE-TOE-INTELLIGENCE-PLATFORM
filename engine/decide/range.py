"""Seasonal usable range (Layer 4): usable energy x retention / consumption, optional temperature factor.

Temperature effect on usable capacity: NO measured LFP-bus source exists in the project data. Default is "none"
(factor 1.0, i.e. not modelled). "datasheet_example" uses ONE manufacturer datasheet for a 12 V LFP battery
(0 C: 90 %, 25 C: 100 %, 40 C: 101 %): illustrative only. HVAC load and consumption seasonality are not modelled.
"""
from __future__ import annotations

import numpy as np
from pydantic import BaseModel

from engine.bus.scenario import Scenario
from engine.decide.replacement import ScenarioSim
from engine.labels import Labelled, L

TABLES = {
    "none": ([0.0, 100.0], [1.0, 1.0]),
    "datasheet_example": ([-10.0, 0.0, 25.0, 40.0], [0.75, 0.90, 1.00, 1.01]),
}


def temperature_factor(temp_c, mode: str = "none") -> np.ndarray:
    if mode not in TABLES:
        raise ValueError(f"unknown temperature-factor mode {mode!r}; choose from {sorted(TABLES)}")
    x, y = TABLES[mode]
    return np.interp(np.asarray(temp_c, dtype=float), x, y)


class RangeResult(BaseModel):
    ages_years: list[float]
    range_km_p50: dict[str, Labelled]     # key: age in years -> 12 monthly values
    range_km_p10: dict[str, Labelled]
    new_pack_range_km: Labelled
    temperature_factor_mode: str
    warnings: list[str]


def monthly_range(sim: ScenarioSim, ages_years=(0.0, 3.0, 6.0), mode: str = "none") -> RangeResult:
    s: Scenario = sim.scenario
    c = sim.conditions
    tf = temperature_factor(c.monthly_cell_temp_c.value, mode)
    base = c.usable_kwh.value / s.kwh_per_km
    p50, p10 = {}, {}
    for a in ages_years:
        if a < 0 or a > s.horizon_years:
            raise ValueError(f"age {a} outside 0..{s.horizon_years} years")
        i = int(round(a * 12))
        r50, r10 = np.percentile(sim.retention[:, i], 50), np.percentile(sim.retention[:, i], 10)
        p50[f"{a:g}"] = L((base * r50 * tf).tolist(), "km", "derived", "12 monthly values, Jan-Dec")
        p10[f"{a:g}"] = L((base * r10 * tf).tolist(), "km", "derived", "pessimistic (retention p10)")
    warns = ["Consumption is held constant: HVAC load and seasonal energy use are not modelled (no public bus data)."]
    warns.append("Temperature effect on usable capacity is not modelled." if mode == "none" else
                 "Temperature factor comes from one manufacturer datasheet for a 12 V LFP battery: illustrative, not a bus measurement.")
    return RangeResult(ages_years=list(ages_years), range_km_p50=p50, range_km_p10=p10,
                       new_pack_range_km=L(base, "km", "derived", "usable energy / consumption, both assumptions"),
                       temperature_factor_mode=mode, warnings=warns)
