import json
import os

import numpy as np
import pandas as pd
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from engine.cell.calendar import CalendarParams, calendar_loss, calendar_loss_flagged, is_extrapolated

ART = "engine/artifacts/calendar_params.json"
P = CalendarParams(**json.load(open(ART))["params"])


def test_artifact_basics():
    a = json.load(open(ART))
    assert a["optimizer_success"] and a["synthetic_data"] is False
    assert 10e3 <= a["params"]["Ea"] <= 100e3 and 0.3 <= a["params"]["z"] <= 1.0
    assert a["n_boot_ok"] >= 450 and os.path.getsize(ART) < 200_000


@settings(max_examples=100, deadline=None)
@given(st.floats(0, 85), st.floats(0, 85), st.floats(0, 100), st.floats(1, 3000))
def test_temperature_monotone(t1, t2, soc, days):
    lo, hi = sorted((t1, t2))
    assert calendar_loss(days, hi, soc, P) >= calendar_loss(days, lo, soc, P) - 1e-12


@settings(max_examples=100, deadline=None)
@given(st.floats(0, 100), st.floats(0, 100), st.floats(0, 85), st.floats(1, 3000))
def test_soc_monotone(s1, s2, temp, days):
    lo, hi = sorted((s1, s2))
    assert calendar_loss(days, temp, hi, P) >= calendar_loss(days, temp, lo, P) - 1e-12


@settings(max_examples=100, deadline=None)
@given(st.floats(0, 3000), st.floats(0, 3000), st.floats(0, 85), st.floats(0, 100))
def test_time_monotone(a, b, temp, soc):
    lo, hi = sorted((a, b))
    assert calendar_loss(hi, temp, soc, P) >= calendar_loss(lo, temp, soc, P)


def test_zero_time_zero_loss():
    assert calendar_loss(0.0, 40, 80, P) == 0.0


def test_negative_time_rejected():
    with pytest.raises(ValueError):
        calendar_loss(-1, 25, 50, P)


def test_out_of_range_flagged():
    loss, flag = calendar_loss_flagged(100, 120, 50, P)
    assert bool(flag) is True and np.isfinite(loss)
    assert bool(is_extrapolated(30, 50)) is False


def test_known_point_naumann():
    # Naumann 25 C, 100 % SOC after 885 days retained 0.89; the model is known to be optimistic here
    # (see docs/model-card.md), so the tolerance documents the real error rather than hiding it.
    ret = 1 - calendar_loss(885, 25, 100, P)
    assert abs(ret - 0.89) < 0.045


@pytest.mark.data
def test_fit_quality_and_determinism():
    from engine.train.fit_calendar import TABLE, fit, rmse, to_params
    if not os.path.exists(TABLE):
        pytest.skip("run scripts/build_data.sh")
    df = pd.read_parquet(TABLE)
    r1, r2 = fit(df), fit(df)
    assert r1.success and np.allclose(r1.x, r2.x)
    assert rmse(df, to_params(r1.x)) < 0.03


def test_soc_nodes_ordered():
    p = P
    assert p.g0 <= p.g25 <= 1.0 <= p.g75 <= p.g100
