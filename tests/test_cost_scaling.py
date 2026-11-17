"""The Cost page draws cost per km against battery price as an exact straight scaling. This locks the assumption behind it:
each run's cost is pack price / km driven, and price does not change how fast the pack ages, so every cost percentile scales with price."""
import json

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app

BASE = {"pack_kwh": 350, "kwh_per_km": 1.2, "km_per_day": 200, "operating_days_per_year": 340, "charge_power_kw": 120}


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


def cost(client, price):
    s = dict(BASE, battery_cost_per_kwh_inr=price)
    r = client.post("/api/v1/predict", json={"scenario": s})
    assert r.status_code == 200
    c = r.json()["cost"]
    return {k: c[k]["value"] for k in ("cost_per_km_p10", "cost_per_km_p50", "cost_per_km_p90")}, r.json()["replacement"]["months_p50"]


def test_every_percentile_scales_with_price_and_life_is_unchanged(client):
    a, life_a = cost(client, 10000)
    b, life_b = cost(client, 15000)
    for k in a:
        assert b[k] == pytest.approx(a[k] * 1.5, rel=1e-9), k
    assert json.dumps(life_a) == json.dumps(life_b)
