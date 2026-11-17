"""Translate bus duty and charging inputs into cell-level operating conditions (Layer 2).

Conventions: EFC (equivalent full cycle) = energy throughput / NOMINAL pack energy, the same basis HUST cycles
(full-depth) are counted on. Depth-of-discharge effects are NOT modelled (HUST has no partial-cycle data).
"""
from __future__ import annotations

import json

import numpy as np
from pydantic import BaseModel

from engine.bus.scenario import Scenario
from engine.bus.thermal import effective_temperature, monthly_cell_temps
from engine.labels import Labelled, L

_CAL = json.load(open("engine/artifacts/calendar_params.json"))["params"]


def _g_at(soc):
    from engine.cell.calendar import CalendarParams, g_soc
    return g_soc(soc, CalendarParams(**_CAL))


def equivalent_soc(charge_h, idle_h, op_h, soc_end, soc_max) -> float:
    """SOC whose calendar stress g equals the time-weighted mean g over the daily SOC profile.

    Averaging g (not SOC) keeps the extra stress of hours spent full, which a mean SOC would wash out.
    """
    ramp = np.linspace(soc_end, soc_max, 50)
    g_ramp = float(np.mean(_g_at(ramp)))
    g_mean = (charge_h * g_ramp + idle_h * float(_g_at(soc_max)) + op_h * g_ramp) / 24.0
    nodes = np.linspace(0, 100, 1001)
    gs = _g_at(nodes)
    # g is non-decreasing: pick the lowest SOC reaching the target (unique above the flat 50-75 % stretch)
    return float(nodes[min(np.searchsorted(gs, g_mean - 1e-12), len(nodes) - 1)])


class CellConditions(BaseModel):
    energy_per_day_kwh: Labelled
    usable_kwh: Labelled
    efc_per_day: Labelled
    efc_per_year: Labelled
    mean_soc_pct: Labelled
    calendar_equivalent_soc_pct: Labelled
    idle_hours_at_soc_max: Labelled
    charge_hours: Labelled
    c_rate_eff: Labelled
    effective_temp_c: Labelled
    monthly_cell_temp_c: Labelled
    pack_penalty_min: Labelled
    pack_penalty_max: Labelled
    warnings: list[str]


def translate(s: Scenario) -> CellConditions:
    warns: list[str] = []
    E = s.km_per_day * s.kwh_per_km
    usable = s.pack_kwh * (s.soc_max_pct - s.soc_min_pct) / 100.0
    efc_day = E / s.pack_kwh
    soc_end = s.soc_max_pct - 100.0 * E / s.pack_kwh
    if E > usable + 1e-9:
        warns.append("Duty exceeds the usable pack energy per charge: add a mid-day charge, lower km/day or widen the SOC window.")
        soc_end = s.soc_min_pct
    soc_end = max(soc_end, s.soc_min_pct)
    e_charged = s.pack_kwh * (s.soc_max_pct - soc_end) / 100.0
    charge_h = e_charged / s.charge_power_kw
    start, dep = s.charge_start_hour, s.departure_hour
    if dep <= start:
        dep += 24.0
    idle_h = dep - (start + charge_h)
    if idle_h < 0:
        warns.append("Charging is not finished before departure: the bus leaves below the top of the SOC window.")
        idle_h = 0.0
    idle_h = min(idle_h, 24.0 - charge_h)
    op_h = max(24.0 - charge_h - idle_h, 1e-6)
    mean_soc = (charge_h * (soc_end + s.soc_max_pct) / 2 + idle_h * s.soc_max_pct + op_h * (s.soc_max_pct + soc_end) / 2) / 24.0
    soc_eq = equivalent_soc(charge_h, idle_h, op_h, soc_end, s.soc_max_pct)
    c_charge = s.charge_power_kw / s.pack_kwh
    c_dis = (E / op_h) / s.pack_kwh
    c_eff = 0.5 * (c_charge + c_dis)
    t_eff = effective_temperature(s.zone, s.heat_rise_c, _CAL["Ea"])
    warns.append("Depth-of-discharge effects on cycle fade are not modelled (training cycles were full-depth).")
    warns.append("Cell temperature = air temperature + an assumed constant heat rise; no thermal-management data exists for buses.")
    return CellConditions(
        energy_per_day_kwh=L(E, "kWh/day", "derived", "km_per_day x kwh_per_km (both assumptions)"),
        usable_kwh=L(usable, "kWh", "derived"),
        efc_per_day=L(efc_day, "EFC/day", "derived", "energy per day / nominal pack energy"),
        efc_per_year=L(efc_day * s.operating_days_per_year, "EFC/year", "derived"),
        mean_soc_pct=L(mean_soc, "%", "derived", "time-weighted over charge, idle at top, driving"),
        calendar_equivalent_soc_pct=L(soc_eq, "%", "derived", "SOC that gives the same calendar stress as the daily profile (averages stress, not SOC)"),
        idle_hours_at_soc_max=L(idle_h, "h/day", "derived"),
        charge_hours=L(charge_h, "h/day", "derived"),
        c_rate_eff=L(c_eff, "C", "derived", "mean of charge and discharge C-rate, same definition as the HUST fit"),
        effective_temp_c=L(t_eff, "degC", "derived", "Arrhenius-weighted from real monthly air temperature + assumed heat rise"),
        monthly_cell_temp_c=L(monthly_cell_temps(s.zone, s.heat_rise_c).tolist(), "degC", "derived"),
        pack_penalty_min=L(s.pack_penalty_min, "fraction", "assumption", "weakest-cell effect; no public data"),
        pack_penalty_max=L(s.pack_penalty_max, "fraction", "assumption", "weakest-cell effect; no public data"),
        warnings=warns,
    )


def sample_pack_penalty(s: Scenario, n: int, seed: int = 0) -> np.ndarray:
    """Uniform draws of the ASSUMED weakest-cell earlier-end-of-life fraction in [min, max]."""
    return np.random.default_rng(seed).uniform(s.pack_penalty_min, s.pack_penalty_max, n)
