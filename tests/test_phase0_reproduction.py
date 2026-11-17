"""Reproduce docs/phase0-report.md numbers. Skipped when datasets are not downloaded."""
import os

import pytest

pytestmark = pytest.mark.data


def _need(path):
    if not os.path.exists(path):
        pytest.skip(f"missing {path}; run scripts/fetch_data.sh and scripts/extract_data.sh")


def test_hust_cycle_life_baseline():
    _need("data/hust/ex/our_data")
    from engine.train.phase0_baselines import hust_cycle_life_baseline, hust_features
    f = hust_features()
    assert f.get("err") is None or f["err"].isna().all()
    r = hust_cycle_life_baseline(f)
    assert r["mean only"]["n"] == 77
    assert 12.4 <= r["capacity-fade feats"]["mape"] <= 13.0
    assert r["capacity-fade feats"]["mape"] < r["mean only"]["mape"]


def test_naumann_calendar():
    _need("data/naumann_lfp_calendar/DischargeCapacity.xlsx")
    from engine.train.phase0_baselines import naumann_retention
    r = naumann_retention().set_index("condition")
    assert 88.9 <= r.loc["TP_25°C,100%SOC", "retention_pct"] <= 89.1


def test_evbattery_capacity_baseline():
    _need("engine/data/processed/evb_segments.parquet")
    from engine.train.phase0_baselines import evb_capacity_baseline
    r = evb_capacity_baseline()
    assert 2.1 <= r["segment feats"]["mape"] <= 2.45
    assert r["segment feats"]["mape"] < r["mileage only"]["mape"]
