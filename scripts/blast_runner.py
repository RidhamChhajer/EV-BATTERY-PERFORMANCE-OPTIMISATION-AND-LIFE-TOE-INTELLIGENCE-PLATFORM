"""Runs NREL's BLAST-Lite LFP cell model on bus duty cycles. Stand-alone: reads cases as JSON on stdin, writes curves to stdout.

BLAST-Lite is NOT a dependency of the app. It needs Python 3.9-3.12 and is installed in a separate, throw-away environment
(see scripts/crosscheck_blast.py). This file only needs numpy, pandas and blast-lite.

Each case describes ONE bus day in terms the Pack Horizon scenario already uses; the day is expanded to an hourly
state-of-charge / cell-temperature series for a full year (monthly climate, operating days only) which BLAST-Lite repeats.
"""
from __future__ import annotations

import json
import sys

import numpy as np
import pandas as pd

HOURS_PER_YEAR = 8760


def build_year(case: dict) -> pd.DataFrame:
    """Hourly SOC (fraction) and cell temperature (C) for one year.

    Day shape (all piecewise linear): leave the depot at `soc_max` at `departure_hour`, drain evenly to `soc_end` by
    `charge_start_hour`, charge at constant power back to `soc_max`, rest full until next departure. Non-operating days
    (365 - operating_days, spread evenly) rest at `soc_max`. Cell temperature = monthly mean air temperature plus a
    sinusoidal day (min 03:00, max 15:00, from the monthly tmin/tmax means) plus the assumed heat rise.
    """
    dep, cs = float(case["departure_hour"]), float(case["charge_start_hour"])
    soc_max, soc_end = case["soc_max"], case["soc_end"]
    window = (24.0 - cs + dep) % 24.0            # hours from end of charge window start to next departure
    charge_h = min(float(case["charge_h"]), window) if window > 0 else float(case["charge_h"])
    duty_h = (cs - dep) % 24.0
    h = np.arange(24, dtype=float)

    def day_soc(hr: float) -> float:
        x = (hr - dep) % 24.0                    # hours since departure
        if x <= duty_h:
            return soc_max + (soc_end - soc_max) * (x / duty_h if duty_h else 1.0)
        y = x - duty_h                           # hours since charging began
        if y <= charge_h:
            return soc_end + (soc_max - soc_end) * (y / charge_h if charge_h else 1.0)
        return soc_max

    day_profile = np.array([day_soc(x) for x in h])
    rest_profile = np.full(24, soc_max)
    n_op = int(round(case["operating_days"]))
    n_off = 365 - n_op
    off_days = set(np.linspace(0, 364, n_off, dtype=int).tolist()) if n_off > 0 else set()

    month_end = np.cumsum([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
    soc, temp = [], []
    for d in range(365):
        m = int(np.searchsorted(month_end, d, side="right"))
        mm = case["monthly"][m]
        mean = mm["tmean_c"] + case["heat_rise_c"]
        amp = max(mm["tmax_mean_c"] - mm["tmin_mean_c"], 0.0) / 2.0
        temp.append(mean + amp * np.sin(2 * np.pi * (h - 9.0) / 24.0))     # min 03:00, max 15:00
        soc.append(rest_profile if d in off_days else day_profile)
    return pd.DataFrame({"Time_s": np.arange(HOURS_PER_YEAR) * 3600.0, "SOC": np.concatenate(soc),
                         "Temperature_C": np.concatenate(temp)})


MODELS = {"q": "Lfp_Gr_250AhPrismatic", "q_alt": "Lfp_Gr_SonyMurata3Ah_Battery"}
CALENDAR_KEY = {"Lfp_Gr_250AhPrismatic": "q_t", "Lfp_Gr_SonyMurata3Ah_Battery": "q_LLI_t"}   # time-driven capacity factor in each model


def _run_model(name: str, full: pd.DataFrame, years: int) -> tuple[list[float], float, dict]:
    from blast import models

    cell = getattr(models, name)()
    # Whole horizon as one series; ageing is stepped about every 30 days (the constant-input mode agrees to <0.2 pt but only steps yearly).
    cell.simulate_battery_life(full, breakpoints_max_time_diff_s=30 * 86400.0, breakpoints_max_EFC_diff=1e9)
    t_years = np.asarray(cell.stressors["t_days"], dtype=float) / 365.0
    q = np.asarray(cell.outputs["q"], dtype=float)
    n = min(len(t_years), len(q))
    grid = np.arange(0, years * 12 + 1) / 12.0
    efc = np.asarray(cell.stressors["efc"], dtype=float)
    qt = np.asarray(cell.outputs[CALENDAR_KEY[name]], dtype=float)
    at = lambda arr, y: float(np.interp(y, t_years[:n], arr[:n]))
    # cycle loss = what is left of the total after the time-driven part (both models combine additively)
    split = {f"{y}y": {"calendar_loss": round(1 - at(qt, y), 4), "cycle_loss": round((1 - at(q, y)) - (1 - at(qt, y)), 4)} for y in (5, 10)}
    return np.interp(grid, t_years[:n], q[:n]).tolist(), float(efc[n - 1] / max(t_years[n - 1], 1e-9)), split


def run_case(case: dict) -> dict:
    year = build_year(case)
    years = int(case["horizon_years"])
    full = pd.DataFrame({"Time_s": np.arange(HOURS_PER_YEAR * years) * 3600.0,
                         "SOC": np.tile(year["SOC"].to_numpy(), years),
                         "Temperature_C": np.tile(year["Temperature_C"].to_numpy(), years)})
    out = {"id": case["id"], "months": list(range(0, years * 12 + 1)),
           "daily_swing_pct": float((case["soc_max"] - case["soc_end"]) * 100.0)}
    for key, name in MODELS.items():
        out[key], efc, out[f"{key}_split"] = _run_model(name, full, years)
        if key == "q":
            out["efc_per_year"] = efc
    return out


def run_checks() -> list[dict]:
    """Single-condition runs that bypass the duty translation: fixed-temperature storage and full-depth cycling."""
    from blast import models

    res = []
    for key, name in MODELS.items():
        for temp in (25.0, 35.0):
            for soc in (1.0, 0.5):
                cell = getattr(models, name)()
                ts = {"Time_s": np.arange(0, 8761) * 3600.0, "SOC": np.full(8761, soc), "Temperature_C": np.full(8761, temp)}
                cell.simulate_battery_life(ts, threshold_time=5.0, is_constant_input=True)
                t = np.asarray(cell.stressors["t_days"], dtype=float) / 365.0
                q = np.asarray(cell.outputs["q"], dtype=float)
                n = min(len(t), len(q))
                res.append({"model": key, "kind": "storage", "temp_c": temp, "soc_pct": soc * 100,
                            "loss_1y": round(1 - float(np.interp(1.0, t[:n], q[:n])), 4), "loss_5y": round(1 - float(np.interp(5.0, t[:n], q[:n])), 4)})
        for c_rate in (1.0, 0.25):
            cell = getattr(models, name)()
            period = 2.0 / c_rate * 3600.0                      # s for one full discharge + charge
            x = np.linspace(0, period, 61)
            soc = np.where(x <= period / 2, 1 - 2 * x / period, 2 * x / period - 1)
            ts = {"Time_s": x, "SOC": soc, "Temperature_C": np.full(61, 25.0)}
            cell.simulate_battery_life(ts, threshold_efc=3000.0, is_constant_input=True)
            e = np.asarray(cell.stressors["efc"], dtype=float)
            q = np.asarray(cell.outputs["q"], dtype=float)
            n = min(len(e), len(q))
            qt = np.asarray(cell.outputs[CALENDAR_KEY[name]], dtype=float)
            res.append({"model": key, "kind": "cycling", "temp_c": 25.0, "c_rate": c_rate,
                        "loss_1000efc": round(1 - float(np.interp(1000, e[:n], q[:n])), 4), "loss_3000efc": round(1 - float(np.interp(3000, e[:n], q[:n])), 4),
                        "calendar_part_loss_3000efc": round(1 - float(np.interp(3000, e[:n], qt[:n])), 4)})
    return res


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "checks":
        json.dump(run_checks(), sys.stdout)
    else:
        cases = json.load(sys.stdin)
        json.dump([run_case(c) for c in cases], sys.stdout)
