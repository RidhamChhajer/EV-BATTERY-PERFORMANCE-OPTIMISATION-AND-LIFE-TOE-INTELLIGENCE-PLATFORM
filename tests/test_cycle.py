import json

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from engine.cell.calendar import CalendarParams
from engine.cell.combined import extrapolated, total_loss
from engine.cell.cycle import CycleParams, cycle_loss, cycle_loss_flagged

A = json.load(open("engine/artifacts/cycle_params.json"))
P = CycleParams.from_dict(A["params"])
CAL = CalendarParams(**json.load(open("engine/artifacts/calendar_params.json"))["params"])


def test_artifact_flags_and_fit():
    assert A["params"]["temperature_term"] == "assumed" and A["synthetic_data"] is False
    assert 1.0 < P.m < 2.5 and A["n_cells"] == 77
    assert A["rmse_fade_shape_per_cell_scale"] < 0.03
    assert A["sigma_logB_between_cells"] > 0
    assert A["rmse_fade_pooled"] < 0.06  # honest: pooled error is dominated by between-cell spread


def test_c_rate_not_claimed():
    assert P.k == 0.0
    assert A["c_rate_regression_diagnostic"]["k"] < 0  # unphysical sign recorded, not used


@settings(max_examples=100, deadline=None)
@given(st.floats(0, 5000), st.floats(0, 5000), st.floats(15, 45), st.floats(1.0, 4.0))
def test_efc_monotone_and_zero(a, b, temp, c):
    lo, hi = sorted((a, b))
    assert cycle_loss(hi, temp, c, P) >= cycle_loss(lo, temp, c, P)
    assert cycle_loss(0.0, temp, c, P) == 0.0


@settings(max_examples=100, deadline=None)
@given(st.floats(1.0, 4.0), st.floats(1.0, 4.0), st.floats(100, 3000), st.floats(15, 45))
def test_c_rate_non_decreasing(c1, c2, n, temp):
    lo, hi = sorted((c1, c2))
    assert cycle_loss(n, temp, hi, P) >= cycle_loss(n, temp, lo, P) - 1e-15


def test_hotter_never_less():
    assert cycle_loss(1000, 40, 2, P) > cycle_loss(1000, 30, 2, P)


def test_extrapolation_flags():
    _, f = cycle_loss_flagged(1000, 45, 3.0, P)
    assert bool(f)
    _, ok = cycle_loss_flagged(1000, 30, 2.2, P)
    assert not bool(ok)
    _, long = cycle_loss_flagged(P.valid_efc_max + 1, 30, 2.2, P)
    assert bool(long)


def test_invalid_inputs():
    with pytest.raises(ValueError):
        cycle_loss(-5, 30, 2, P)
    with pytest.raises(ValueError):
        cycle_loss(5, 30, 0, P)


@settings(max_examples=60, deadline=None)
@given(st.floats(0, 4000), st.floats(0, 4000), st.floats(10, 40), st.floats(0, 100))
def test_combined_loss(d, n, temp, soc):
    tot, lc, ly = total_loss(d, n, temp, soc, 2.2, CAL, P)
    assert tot >= max(lc, ly) - 1e-12 or tot == 1.0
    tot2, _, _ = total_loss(d + 10, n + 10, temp, soc, 2.2, CAL, P)
    assert tot2 >= tot - 1e-12


def test_combined_extrapolation_union():
    assert bool(extrapolated(100, 100, 50, 50, 2.2, CAL, P))
    assert not bool(extrapolated(100, 100, 30, 50, 2.2, CAL, P))


def test_bootstrap_draws_shape():
    d = np.array(A["bootstrap_draws_logB_m_k_sigma"])
    assert d.shape == (A["n_boot"], 4) and (d[:, 3] > 0).all()
