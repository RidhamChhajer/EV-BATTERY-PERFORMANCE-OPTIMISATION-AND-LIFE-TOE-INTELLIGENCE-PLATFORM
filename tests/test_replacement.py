import time

import numpy as np
import pytest
from pydantic import ValidationError

from engine.bus.scenario import Scenario
from engine.cell.uncertainty import load_models, make_draws
from engine.decide.replacement import first_crossing, replacement_window, simulate_scenario
from engine.labels import Labelled, walk_numbers

M = load_models()
D = make_draws(1000, M, seed=2)


def S(**kw):
    return Scenario.from_preset("12m", **kw)


def rw(s, **kw):
    return replacement_window(s, models=M, draws=D, **kw)


def test_percentile_order_and_labels():
    r = rw(S())
    a, b, c = (x.value for x in (r.months_p10, r.months_p50, r.months_p90))
    assert a <= b <= c
    assert all(isinstance(n, Labelled) and n.evidence_level != "lab" and n.validated_on_buses is False for n in walk_numbers(r))
    assert r.mode == "prior" and r.extrapolated


def test_more_distance_earlier():
    assert rw(S(km_per_day=300)).months_p50.value < rw(S(km_per_day=200)).months_p50.value


def test_hotter_zone_earlier_or_equal():
    assert rw(S(zone="hot_humid")).months_p50.value <= rw(S(zone="cool")).months_p50.value


def test_threshold_monotone():
    assert rw(S(threshold=0.85)).months_p50.value < rw(S(threshold=0.75)).months_p50.value


def test_censoring_light_duty():
    r = rw(S(km_per_day=20, horizon_years=3))
    assert r.probability_within_horizon.value < 1.0
    assert any("threshold within" in w or "does not reach" in w for w in r.warnings)
    assert r.months_p90 is None


def test_probability_curve_monotone():
    p = np.array(rw(S()).probability_by_month.value)
    assert p[0] == 0.0 and (np.diff(p) >= 0).all() and p[-1] <= 1.0


def test_paired_draws_identical():
    a, b = rw(S()), rw(S())
    assert a.model_dump() == b.model_dump()


def test_speed_default_draws():
    t = time.time()
    replacement_window(S(), models=M, n_draws=2000)
    assert time.time() - t < 2.0


def test_invalid_threshold_rejected():
    with pytest.raises((ValidationError, ValueError)):
        S(threshold=1.2)


def test_first_crossing_analytic():
    months = np.arange(0, 61, dtype=float)
    ret = np.vstack([1 - 0.01 * months, 1 - 0.005 * months, np.ones_like(months)])
    c = first_crossing(ret, months, 0.8)
    assert c[0] == pytest.approx(20.0) and c[1] == pytest.approx(40.0) and np.isinf(c[2])


def test_driver_split_in_unit_interval_and_bias_warning():
    r = rw(S())
    assert 0.0 <= r.calendar_share_of_loss.value <= 1.0
    assert any("OVERSTATED" in w for w in r.warnings)


def test_pack_penalty_makes_replacement_earlier():
    none = rw(S(pack_penalty_min=0.0, pack_penalty_max=0.0)).months_p50.value
    pen = rw(S(pack_penalty_min=0.05, pack_penalty_max=0.15)).months_p50.value
    assert pen < none


def test_simulation_shapes():
    sim = simulate_scenario(S(horizon_years=5), models=M, draws=D)
    assert sim.retention.shape == (1000, 61) and sim.cross_months.shape == (1000,)
    assert sim.retention.max() <= 1.0 and sim.retention.min() >= 0.0
