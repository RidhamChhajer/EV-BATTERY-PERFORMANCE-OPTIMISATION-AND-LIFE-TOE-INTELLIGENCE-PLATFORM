import json

import numpy as np
import pandas as pd
import pytest

from engine.cell.early_life import CAP_FEATURES, MIN_CYCLES, features_from_capacity, load, predict_life

A = load()
M = json.load(open("engine/artifacts/metrics.json"))["early_life"]


def test_selection_recorded():
    names = [c["model"] for c in M["candidates"]]
    assert "mean only" in names and M["winner"] == A["model"]
    assert sum("ElasticNet" in n for n in names) >= 2 and sum("Gradient" in n for n in names) == 1


def test_beats_naive_and_reproduces_phase0():
    c = {r["model"]: r for r in M["candidates"]}
    assert c[A["model"]]["mape"] < c["mean only"]["mape"]
    assert 12.4 <= c["ElasticNet capacity features"]["mape"] <= 13.0
    assert M["improvement_ci95"][0] > 0  # improvement over naive is not noise


def test_explainability():
    imp = A["importance"]
    assert len(imp) >= 3 and all(isinstance(v, float) for v in imp.values())
    assert sum(abs(v) > 1e-9 for v in imp.values()) >= 3


def test_nan_features_rejected():
    f = dict.fromkeys(CAP_FEATURES, 1.0)
    f["slope"] = float("nan")
    with pytest.raises(ValueError, match="slope"):
        predict_life(f, A)


def test_short_series_rejected():
    with pytest.raises(ValueError, match="at least 100"):
        features_from_capacity(np.linspace(1100, 1090, 50))


def test_bad_series_rejected():
    q = np.linspace(1100, 1090, 120)
    q[5] = np.nan
    with pytest.raises(ValueError):
        features_from_capacity(q)


def test_no_leakage_beyond_cycle_100():
    q = np.linspace(1180, 1100, 300)
    q2 = q.copy()
    q2[100:] = 500.0  # change everything after cycle 100
    assert features_from_capacity(q) == features_from_capacity(q2)


@pytest.mark.data
def test_output_sane_on_every_cell():
    cy = pd.read_parquet("engine/data/processed/hust_cycles.parquet")
    for cell, g in cy.groupby("cell"):
        life = predict_life(features_from_capacity(g.sort_values("cycle").capacity_mah.values), A)
        assert 0 < life < 10_000 and np.isfinite(life)
