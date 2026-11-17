"""Measure how far battery life moves when each duty input moves, and set the fleet duty-class tolerances from it.

Two buses may share a model run (a "duty class") only if their duty inputs are close. How close is a MEASUREMENT, not a taste: for each
duty input this finds the largest change in life (months, 10th and 50th percentile, 20-year horizon) per unit of the input over a spread of
realistic base buses, then sets the class step so one step moves life by at most BUDGET_MONTHS in the worst case measured.

    python scripts/measure_fleet_tolerance.py            # writes frontend/src/lib/fleetTolerance.json and prints a table

The front end uses the slopes to bound how far apart two buses in one class can be (sum of |difference| x slope, which is conservative
because it assumes every difference pushes the same way). tests/test_fleet_tolerance.py re-checks the stored slopes against the engine.
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.bus.scenario import Scenario  # noqa: E402
from engine.cell.uncertainty import load_models  # noqa: E402
from engine.decide.replacement import replacement_window  # noqa: E402

HORIZON_MONTHS = 240
BUDGET_MONTHS = 1.0
SEED = 20261111
N_BASE = 40
# field: (smallest step worth measuring with, largest step ever used, unit)
FIELDS = {
    "km_per_day": (1.0, 20.0), "kwh_per_km": (0.01, 0.1), "operating_days_per_year": (2.0, 20.0), "soc_max_pct": (1.0, 5.0),
    "soc_min_pct": (1.0, 5.0), "charge_start_hour": (0.25, 1.0), "departure_hour": (0.25, 1.0), "charge_power_kw": (5.0, 20.0), "heat_rise_c": (0.25, 1.0),
}
GRID = [m * 10.0 ** e for e in range(-4, 3) for m in (1, 2, 5)]


def life(s: Scenario, models) -> np.ndarray | None:
    r = replacement_window(s.model_copy(update={"horizon_years": 20}), models=models)
    ms = [r.months_p10, r.months_p50, r.months_p90]
    if any(m is None for m in ms[:2]):
        return None                                                   # censored at the horizon: the slope would be understated
    return np.array([m.value for m in ms[:2]])


ZONES = ["hot_dry", "hot_humid", "composite", "cool"]


def base_points(rng: np.random.Generator) -> tuple[list[Scenario], int]:
    """The eight preset buses (bus type x zone), so the slopes cover the defaults for sure, then N_BASE random buses across realistic duty."""
    out: list[Scenario] = [Scenario.from_preset(a, zone=z) for a in ("12m", "9m") for z in ZONES]
    n_presets = len(out)
    zones = ZONES
    while len(out) < N_BASE + n_presets:
        arch = "12m" if len(out) % 2 == 0 else "9m"
        mx = float(rng.choice([80, 85, 90, 95, 100]))
        try:
            s = Scenario.from_preset(
                arch, zone=zones[rng.integers(4)], km_per_day=float(rng.uniform(100, 280)), kwh_per_km=float(rng.uniform(0.9, 1.5)),
                soc_max_pct=mx, soc_min_pct=float(rng.choice([5, 10, 15, 20])), charge_start_hour=float(rng.uniform(17, 24) % 24),
                departure_hour=float(rng.uniform(4, 7)), heat_rise_c=float(rng.uniform(0, 8)), operating_days_per_year=float(rng.uniform(280, 360)),
                charge_power_kw=float(rng.uniform(60, 200)))
        except ValueError:
            continue
        out.append(s)
    return out, n_presets


def measure(models) -> dict:
    rng = np.random.default_rng(SEED)
    slopes: dict[str, list[float]] = {f: [] for f in FIELDS}
    used = used_presets = 0
    points, n_presets = base_points(rng)
    for i, base in enumerate(points):
        l0 = life(base, models)
        if l0 is None:
            continue
        used += 1
        used_presets += i < n_presets
        for f, (probe, _) in FIELDS.items():
            for sign in (1, -1):
                try:
                    s = Scenario(**{**base.model_dump(), f: getattr(base, f) + sign * probe})
                except ValueError:
                    continue
                l1 = life(s, models)
                if l1 is not None:
                    slopes[f].append(float(np.max(np.abs(l1 - l0)) / probe))        # months per unit, worse of the 10th and 50th percentile
    return {"slopes": {f: max(v) if v else 0.0 for f, v in slopes.items()}, "typical": {f: float(np.median(v)) if v else 0.0 for f, v in slopes.items()},
            "samples": {f: len(v) for f, v in slopes.items()}, "base_points_used": used, "presets_used": used_presets, "presets_total": n_presets,
            "random_used": used - used_presets, "random_total": N_BASE}


def step_for(slope: float, cap: float) -> float:
    if slope <= 1e-9:
        return cap
    ok = [g for g in GRID if g * slope <= BUDGET_MONTHS + 1e-9 and g <= cap]
    return max(ok) if ok else min(GRID)


def main():
    models = load_models("engine/artifacts", engine="reference")
    m = measure(models)
    steps = {f: step_for(m["slopes"][f], FIELDS[f][1]) for f in FIELDS}
    out = {"generated_by": "scripts/measure_fleet_tolerance.py", "seed": SEED, "budget_months": BUDGET_MONTHS, "horizon_years": 20,
           "metric": "worse of the 10th and 50th percentile life, months per unit of the input", "base_points": {"presets_used": m["presets_used"], "presets_total": m["presets_total"], "random_used": m["random_used"], "random_total": m["random_total"],
                           "dropped": "a base point whose 10th or 50th percentile life is beyond the 20-year horizon is dropped, since its slope would be understated"},
           "slope_months_per_unit": {f: round(v, 4) for f, v in m["slopes"].items()}, "typical_months_per_unit": {f: round(v, 4) for f, v in m["typical"].items()},
           "step": {f: float(f"{v:.6g}") for f, v in steps.items()}}
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend/src/lib/fleetTolerance.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=2)
        fh.write("\n")
    print(f"base points used: {m['presets_used']} of {m['presets_total']} presets and {m['random_used']} of {m['random_total']} random buses")
    print(f"{'input':26s}{'worst slope':>14s}{'typical':>10s}{'step':>9s}{'worst months per step':>24s}")
    for f in FIELDS:
        print(f"{f:26s}{m['slopes'][f]:14.3f}{m['typical'][f]:10.3f}{steps[f]:9g}{m['slopes'][f] * steps[f]:24.2f}")
    print("wrote", path)


if __name__ == "__main__":
    main()
