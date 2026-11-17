"""Agreement between this port and the BLAST-Lite package, measured against the package outputs stored in
engine/artifacts/crosscheck_blast.json (written by scripts/crosscheck_blast.py, which needs the package itself).
Used by tests and by scripts/check_reference_port.py, which stores the summary the Evidence page shows."""
from __future__ import annotations

import json

import numpy as np

from engine.bus.scenario import Scenario
from engine.reference import blast_lfp as B
from engine.reference.simulate import day_profile, run_model

PACKAGE = {"blast_250ah": ("blast", B.LFP250), "blast_sony_3ah": ("blast_alt", B.LFPSONY)}


def storage_loss(model: B.LfpModel, temp_c: float, soc: float, years: int) -> dict[int, float]:
    """Capacity lost at a fixed temperature and state of charge, after each whole year (the package's constant-input mode)."""
    st = {"t_k": np.array([temp_c + 273.15]), "soc": np.array([soc]), "ua": B.graphite_potential([soc]),
          "w": np.array([1.0]), "dod": np.array([0.0]), "crate": np.array([0.0])}
    r, s, out = B.rates(model, st), B.initial_state(model, 1), {}
    for yr in range(1, years + 1):
        s = B.advance(model, s, r, 365.0, np.zeros(1), 1.0)
        out[yr] = float(1.0 - B.capacity(s)[0])
    return out


def cycling_loss(model: B.LfpModel, temp_c: float, c_rate: float, at_efc: tuple[int, ...] = (1000, 3000)) -> dict[int, float]:
    """Capacity lost by full-depth cycling at a fixed temperature, after the given numbers of full cycles."""
    period_h = 2.0 / c_rate
    x = np.linspace(0, period_h * 3600.0, 61)
    soc = np.where(x <= x[-1] / 2, 1 - 2 * x / x[-1], 2 * x / x[-1] - 1)
    w = np.full(61, 1 / 60.0)
    w[[0, -1]] = 0.5 / 60.0                                          # trapezoid weights over one period
    # the package integrates |dSOC/dt| over t[1:] but divides by the full span, hence the 59/60
    st = {"t_k": np.full(61, temp_c + 273.15), "soc": soc, "ua": B.graphite_potential(soc), "w": w,
          "dod": np.array([1.0]), "crate": np.array([c_rate * 59 / 60])}
    r, s, out = B.rates(model, st), B.initial_state(model, 1), {}
    for n in range(1, max(at_efc) + 1):
        s = B.advance(model, s, r, period_h / 24.0, np.ones(1), 1.0)
        if n in at_efc:
            out[n] = float(1.0 - B.capacity(s)[0])
    return out


def duty_retention(s: Scenario, model: B.LfpModel, years: int = 15) -> np.ndarray:
    """Cell-level capacity at each whole year for a bus scenario, one degradation scalar of 1 and no pack penalty."""
    cal, cyc = run_model(model, s, day_profile(s), np.array([1.0]), years * 12)
    return (1.0 - cal[0] - cyc[0])[:: 12]


def compare_with_package(artifact: dict, scenarios: dict[str, Scenario]) -> dict:
    """Largest differences, in percentage points of capacity, between this port and the stored package outputs."""
    duty = 0.0
    for sc in artifact["scenarios"]:
        for key, model in (("blast", B.LFP250), ("blast_alt", B.LFPSONY)):
            mine = duty_retention(scenarios[sc["id"]], model, artifact["horizon_years"])
            duty = max(duty, float(np.max(np.abs(mine - np.array(sc[key]))) * 100))
    cond = 0.0
    for c in artifact["single_condition_checks"]:
        for who, (_, model) in PACKAGE.items():
            if c["kind"] == "storage":
                got = storage_loss(model, c["temp_c"], c["soc_pct"] / 100.0, 5)
                cond = max(cond, abs(got[1] - c[who]["loss_1y"]), abs(got[5] - c[who]["loss_5y"]))
            else:
                got = cycling_loss(model, c["temp_c"], c["c_rate"])
                cond = max(cond, abs(got[1000] - c[who]["loss_1000efc"]), abs(got[3000] - c[who]["loss_3000efc"]))
    return {"package_version": artifact["blast_lite"]["version"], "scenarios_compared": len(artifact["scenarios"]),
            "bus_duty_max_diff_points": round(duty, 2), "fixed_condition_max_diff_points": round(cond * 100, 3),
            "fixed_conditions_compared": len(artifact["single_condition_checks"])}
