"""The fleet duty-class tolerances are measured (scripts/measure_fleet_tolerance.py). These tests keep them honest."""
import importlib.util
import json
import os

import numpy as np
import pytest

from engine.bus.scenario import Scenario
from engine.cell.uncertainty import load_models

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOL = json.load(open(os.path.join(ROOT, "frontend/src/lib/fleetTolerance.json")))


@pytest.fixture(scope="module")
def tool():
    spec = importlib.util.spec_from_file_location("measure_fleet_tolerance", os.path.join(ROOT, "scripts/measure_fleet_tolerance.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture(scope="module")
def models():
    return load_models("engine/artifacts", engine="reference")


def test_every_step_keeps_one_step_inside_the_budget(tool):
    assert set(TOL["step"]) == set(tool.FIELDS) == set(TOL["slope_months_per_unit"])
    for f, step in TOL["step"].items():
        assert step * TOL["slope_months_per_unit"][f] <= TOL["budget_months"] + 1e-6, f
        assert step <= tool.FIELDS[f][1], f


def test_stored_slopes_still_cover_the_engine_at_the_preset_buses(tool, models):
    """If the engine changes, the stored numbers go stale: this fails and the script is rerun."""
    for arch in ("12m", "9m"):
        for zone in tool.ZONES:
            base = Scenario.from_preset(arch, zone=zone)
            l0 = tool.life(base, models)
            if l0 is None:
                continue
            for f, (probe, _) in tool.FIELDS.items():
                for sign in (1, -1):
                    try:
                        s = Scenario(**{**base.model_dump(), f: getattr(base, f) + sign * probe})
                    except ValueError:
                        continue
                    l1 = tool.life(s, models)
                    if l1 is not None:
                        assert np.max(np.abs(l1 - l0)) / probe <= TOL["slope_months_per_unit"][f] * 1.001 + 1e-9, (arch, zone, f)


@pytest.mark.parametrize("mult", [1, 8])
def test_buses_inside_one_class_stay_inside_the_stated_bound(tool, models, mult):
    """Draw buses whose every duty input is within `mult` steps of a centre bus (1x is the tight class, 8x the widest the app will use when a fleet needs
    more than 50 classes). Their real change in life must not exceed sum(|difference| x slope), the bound the front end shows as the class's spread."""
    rng = np.random.default_rng(7 + mult)
    checked, worst_ratio = 0, 0.0
    for arch, zone in (("12m", "hot_dry"), ("9m", "composite"), ("12m", "hot_humid"), ("9m", "hot_dry")):
        centre = Scenario.from_preset(arch, zone=zone)
        l0 = tool.life(centre, models)
        if l0 is None:
            continue
        for _ in range(12):
            diffs = {f: float(rng.uniform(-1, 1)) * TOL["step"][f] * mult for f in TOL["step"]}
            try:
                s = Scenario(**{**centre.model_dump(), **{f: getattr(centre, f) + d for f, d in diffs.items()}})
            except ValueError:
                continue
            l1 = tool.life(s, models)
            if l1 is None:
                continue
            bound = sum(abs(d) * TOL["slope_months_per_unit"][f] for f, d in diffs.items())
            actual = float(np.max(np.abs(l1 - l0)))
            assert actual <= bound + 1e-6, (mult, arch, zone, actual, bound)
            worst_ratio, checked = max(worst_ratio, actual / bound if bound else 0), checked + 1
    assert checked >= 20
    print(f"{mult}x: checked {checked} buses, largest actual/bound = {worst_ratio:.2f}")
