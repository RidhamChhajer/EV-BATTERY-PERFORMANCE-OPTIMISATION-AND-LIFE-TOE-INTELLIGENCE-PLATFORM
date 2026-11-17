"""Bus scenario -> capacity curves from the two NREL LFP models (the "reference engine").

A bus year is described by one representative operating day (drain over the duty window, constant-power charge, rest full)
plus rest days at the top of the charge window, with monthly air temperature (min / mean / max) plus the heat-rise assumption.
The models are stepped one month at a time, rates recomputed every month from the stressors of that month, with BLAST-Lite's
"conserve energy throughput" rule (depth of discharge grows as capacity falls).

The ensemble returned for one scenario has rows = {2 models} x {5 degradation scalars} x {5 pack-penalty values}:
* degradation scalar ~ N(1, 0.15), five equal-probability strata: 0.15 is the default in BLAST-Lite's own
  ``simulate_battery_life_distribution`` helper. It is a convention, not a measured uncertainty.
* pack penalty = assumed weakest-cell earlier end of life, applied as time compression:
  retention_pack(t) = retention_cell(t / (1 - penalty)). NREL's guidance is that pack life is 20-30 % shorter than cell life.
Percentiles over the rows are therefore the SPREAD between two published models, cell-to-cell scatter and an assumption,
not a statistical confidence interval, and none of it is validated on buses.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from engine.bus.scenario import Scenario
from engine.bus.translate import translate
from engine.reference import blast_lfp as B

DAYS_PER_MONTH = 365.25 / 12
SAMPLES = 96                                   # points per day (15 min)
SCALAR_STD = 0.15
SCALAR_Z = (-1.2816, -0.5244, 0.0, 0.5244, 1.2816)      # centres of five equal-probability bins of a standard normal
PENALTY_STEPS = 5
_ZONES = json.load(open("engine/data/zones.json"))["zones"]


# ------------------------------------------------------------------ duty description
@dataclass(frozen=True)
class DayProfile:
    soc: np.ndarray                  # (SAMPLES,) fraction, operating day, uniform in time over 24 h
    top: float                       # soc_max as a fraction
    end: float                       # lowest state of charge reached (fraction)
    charge_h: float
    duty_h: float
    f_op: float                      # share of days that are operating days


def day_profile(s: Scenario) -> DayProfile:
    c = translate(s)
    energy = s.km_per_day * s.kwh_per_km
    top = s.soc_max_pct / 100.0
    end = max(s.soc_max_pct - 100.0 * energy / s.pack_kwh, s.soc_min_pct) / 100.0
    dep, cs = s.departure_hour, s.charge_start_hour
    window = (24.0 - cs + dep) % 24.0
    charge_h = c.charge_hours.value
    if window > 0:
        charge_h = min(charge_h, window)
    duty_h = (cs - dep) % 24.0
    hours = np.arange(SAMPLES) * 24.0 / SAMPLES
    x = (hours - dep) % 24.0                    # hours since departure
    y = x - duty_h                              # hours since charging began
    drain = top + (end - top) * (x / duty_h if duty_h else 1.0)
    charge = end + (top - end) * (y / charge_h if charge_h else 1.0)
    soc = np.where(x <= duty_h, drain, np.where(y <= charge_h, charge, top))
    return DayProfile(soc, top, end, charge_h, duty_h, min(s.operating_days_per_year / 365.0, 1.0))


def month_air_cell_temps(s: Scenario, month: int) -> np.ndarray:
    """Cell temperature (K) at each sample of a day in calendar month ``month`` (0 = January)."""
    mm = _ZONES[s.zone]["monthly"][month % 12]
    hours = np.arange(SAMPLES) * 24.0 / SAMPLES
    amp = max(mm["tmax_mean_c"] - mm["tmin_mean_c"], 0.0) / 2.0
    return mm["tmean_c"] + s.heat_rise_c + amp * np.sin(2 * np.pi * (hours - 9.0) / 24.0) + 273.15


# ------------------------------------------------------------------ one model, a set of scalars
def _step_stressors(day: DayProfile, t_day_k: np.ndarray, q: np.ndarray) -> tuple[dict, np.ndarray]:
    """Stressors for one month given current capacity ``q`` of each member. Returns (stressors, delta_efc per day)."""
    n = SAMPLES
    soc_eff = np.clip(day.top - (day.top - day.soc)[None, :] / q[:, None], 0.0, 1.0)            # (S, n) rescaled by capacity
    rest = np.full_like(soc_eff, np.clip(day.top, 0.0, 1.0))
    soc = np.concatenate([soc_eff, rest], axis=1)
    f = day.f_op
    w = np.concatenate([np.full(n, f / n), np.full(n, (1.0 - f) / n)])
    step = np.abs(np.diff(soc_eff, axis=1, append=soc_eff[:, :1]))                               # periodic day
    rate_h = step / (24.0 / n)
    rate_h = np.where(rate_h < 1e-2, 0.0, rate_h)                                               # package ignores storage-like rates
    crate = f * rate_h.sum(axis=1) * (24.0 / n) / 24.0 * q
    efc_day = step.sum(axis=1) / 2.0 * q
    dod = day.top - soc_eff.min(axis=1)
    st = {"t_k": np.concatenate([t_day_k, t_day_k]), "soc": soc, "ua": B.graphite_potential(soc), "w": w, "dod": dod, "crate": crate}
    return st, efc_day * f


def run_model(model: B.LfpModel, s: Scenario, day: DayProfile, scalars: np.ndarray, n_months: int) -> tuple[np.ndarray, np.ndarray]:
    """Cell-level calendar and cycling loss, shape (S, n_months + 1), at month ends."""
    S = len(scalars)
    state = B.initial_state(model, S)
    cal = np.zeros((S, n_months + 1))
    cyc = np.zeros((S, n_months + 1))
    temps = [month_air_cell_temps(s, m) for m in range(12)]
    for m in range(n_months):
        q = B.capacity(state)
        st, efc_per_day = _step_stressors(day, temps[m % 12], q)
        r = B.rates(model, st)
        state = B.advance(model, state, r, DAYS_PER_MONTH, efc_per_day * DAYS_PER_MONTH, scalars)
        c = B.calendar_loss(model, state)
        cal[:, m + 1] = c
        cyc[:, m + 1] = sum(state.values()) - c
    return cal, cyc


# ------------------------------------------------------------------ extrapolation reasons
def extrapolation_reasons(s: Scenario, day: DayProfile) -> list[str]:
    reasons: list[str] = []
    c = translate(s)
    swing = day.top - day.end
    lo, hi = B.LFP250.dod
    if swing < lo - 1e-9:
        reasons.append(f"daily depth of discharge {swing * 100:.0f} % is below the {lo * 100:.0f}-{hi * 100:.0f} % that both NREL cells were cycled at")
    cell_temps = np.array(c.monthly_cell_temp_c.value)
    for m in (B.LFP250, B.LFPSONY):
        a, b = m.cycling_temperature_c
        if cell_temps.min() < a or cell_temps.max() > b:
            reasons.append(f"cell temperature {cell_temps.min():.0f}-{cell_temps.max():.0f} degC is outside the {a:.0f}-{b:.0f} degC cycling range of the {m.nominal_ah:g} Ah model")
    c_chg = s.charge_power_kw / s.pack_kwh
    for m in (B.LFP250, B.LFPSONY):
        if c_chg > m.max_rate_charge:
            reasons.append(f"charge rate {c_chg:.2f} C is above the {m.max_rate_charge:g} C tested on the {m.nominal_ah:g} Ah model")
    return reasons


# ------------------------------------------------------------------ ensemble
@dataclass(frozen=True)
class RefCurves:
    months: np.ndarray               # (T,)
    cal_loss: np.ndarray             # (D, T)  pack level, penalty applied as time compression
    cyc_loss: np.ndarray             # (D, T)
    pack_penalty: np.ndarray         # (D,)
    model_of_row: tuple[str, ...]    # (D,) model key of each row
    reasons: tuple[str, ...]


def _key(s: Scenario) -> tuple:
    return (s.pack_kwh, s.kwh_per_km, s.km_per_day, s.operating_days_per_year, s.soc_min_pct, s.soc_max_pct, s.charge_power_kw,
            s.charge_start_hour, s.departure_hour, s.zone, s.heat_rise_c, s.pack_penalty_min, s.pack_penalty_max, s.horizon_years)


@lru_cache(maxsize=256)
def _curves(key: tuple) -> RefCurves:
    (pack_kwh, kwh_per_km, km_per_day, op_days, soc_min, soc_max, charge_kw, cs, dep, zone, heat, pmin, pmax, horizon) = key
    s = Scenario(archetype="12m", pack_kwh=pack_kwh, kwh_per_km=kwh_per_km, km_per_day=km_per_day, operating_days_per_year=op_days,
                 soc_min_pct=soc_min, soc_max_pct=soc_max, charge_power_kw=charge_kw, charge_start_hour=cs, departure_hour=dep,
                 zone=zone, heat_rise_c=heat, pack_penalty_min=pmin, pack_penalty_max=pmax, horizon_years=horizon)
    day = day_profile(s)
    out_months = horizon * 12
    ext = int(math.ceil(out_months / (1.0 - pmax))) + 2                       # cell must be simulated longer than the pack horizon
    scalars = 1.0 + SCALAR_STD * np.array(SCALAR_Z)
    cells_cal, cells_cyc, who = [], [], []
    for model in (B.LFP250, B.LFPSONY):
        cal, cyc = run_model(model, s, day, scalars, ext)
        cells_cal.append(cal); cells_cyc.append(cyc); who += [model.key] * len(scalars)
    cal_c, cyc_c = np.vstack(cells_cal), np.vstack(cells_cyc)                # (10, ext+1)
    pens = np.linspace(pmin, pmax, PENALTY_STEPS)
    grid = np.arange(ext + 1, dtype=float)
    t_out = np.arange(out_months + 1, dtype=float)
    rows_cal, rows_cyc, row_pen, row_model = [], [], [], []
    for i in range(cal_c.shape[0]):
        for p in pens:
            src = t_out / (1.0 - p)                                          # pack time t is cell time t / (1 - penalty)
            rows_cal.append(np.interp(src, grid, cal_c[i])); rows_cyc.append(np.interp(src, grid, cyc_c[i]))
            row_pen.append(p); row_model.append(who[i])
    cal_arr, cyc_arr = np.array(rows_cal), np.array(rows_cyc)
    cal_arr.setflags(write=False); cyc_arr.setflags(write=False)
    return RefCurves(t_out, cal_arr, cyc_arr, np.array(row_pen), tuple(row_model), tuple(extrapolation_reasons(s, day)))


def reference_curves(s: Scenario) -> RefCurves:
    """Cached per ageing-relevant inputs: threshold and battery price do not change the curves."""
    return _curves(_key(s))
