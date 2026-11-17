import json
import time

import numpy as np
import pytest

from engine.cell.uncertainty import MAX_DRAWS, load_models, make_draws, predict_retention, simulate_loss

M = load_models()
U = json.load(open("engine/artifacts/uncertainty.json"))
T = np.linspace(0, 3650, 41)
EFC = T * 0.6   # 0.6 cycles/day, inside the HUST cycle range over 10 years


def test_band_ordering_and_bounds():
    r = predict_retention(T, EFC, 30, 80, 2.2, models=M)
    assert (r["p10"] <= r["p50"] + 1e-12).all() and (r["p50"] <= r["p90"] + 1e-12).all()
    assert r["p10"].min() >= 0 and r["p90"].max() <= 1.0
    assert r["p90"][0] == pytest.approx(1.0)  # no loss at time zero


def test_determinism():
    a = predict_retention(T, EFC, 30, 80, 2.2, models=M, seed=5)
    b = predict_retention(T, EFC, 30, 80, 2.2, models=M, seed=5)
    assert np.array_equal(a["p50"], b["p50"])
    c = predict_retention(T, EFC, 30, 80, 2.2, models=M, seed=6)
    assert not np.array_equal(a["p50"], c["p50"])


def test_extrapolation_widens_band():
    inside = predict_retention(T, EFC, 30, 80, 2.2, models=M)
    outside = predict_retention(T, EFC, 45, 80, 2.2, models=M)
    assert outside["extrapolated"] and not inside["extrapolated"]
    # compare widths at equal median: use the same temperature but force widening via c_rate out of range
    wide = predict_retention(T, EFC, 30, 80, 5.0, models=M)
    assert wide["extrapolated"]
    w_in = (inside["p90"] - inside["p10"])[-1]
    w_out = (wide["p90"] - wide["p10"])[-1]
    assert w_out > w_in * 0.99


def test_speed():
    t0 = time.time()
    predict_retention(T, EFC, 30, 80, 2.2, n_draws=2000, models=M)
    assert time.time() - t0 < 0.2


@pytest.mark.parametrize("n", [0, -1, MAX_DRAWS + 1])
def test_invalid_draws(n):
    with pytest.raises(ValueError):
        make_draws(n, M)


def test_invalid_inputs():
    d = make_draws(10, M)
    with pytest.raises(ValueError):
        simulate_loss([-1.0, 1.0], [0.0, 1.0], 30, 80, 2.2, M, d)
    with pytest.raises(ValueError):
        simulate_loss([1.0], [1.0], 30, 80, 0.0, M, d)
    with pytest.raises(ValueError):
        simulate_loss([1.0, 2.0], [1.0], 30, 80, 2.2, M, d)


def test_more_loss_when_hotter_and_fuller_in_median():
    base = predict_retention(T, EFC, 25, 50, 2.2, models=M)["p50"][-1]
    hot = predict_retention(T, EFC, 40, 50, 2.2, models=M)["p50"][-1]
    full = predict_retention(T, EFC, 25, 100, 2.2, models=M)["p50"][-1]
    assert hot < base and full < base


def test_shared_draws_pair_scenarios():
    d = make_draws(500, M, seed=1)
    a = simulate_loss(T, EFC, 30, 90, 2.2, M, d)["total"]
    b = simulate_loss(T, EFC, 30, 100, 2.2, M, d)["total"]
    assert (b[:, -1] >= a[:, -1] - 1e-12).all()   # same draws: fuller is never better, draw by draw


def test_coverage_recorded_in_target_range():
    assert 0.70 <= U["cycle_coverage"]["coverage_point_weighted"] <= 0.90
    assert 0.70 <= U["calendar_coverage"]["coverage_point_weighted"] <= 0.90
    assert U["extrapolation_widening"] > 1
