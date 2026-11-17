"""Captures one real /fleet request and response as a frontend test fixture (the segment code is tested against the real response shape).
Run: python scripts/make_fleet_fixture.py"""
import json
import os
import sys

sys.path.insert(0, os.getcwd())
os.environ["EV_AUTH_REQUIRED"] = "false"
from fastapi.testclient import TestClient

from backend.app.main import create_app
from engine.bus.scenario import Scenario

a = Scenario.from_preset("12m", battery_cost_per_kwh_inr=12000).model_dump()
b = Scenario.from_preset("9m", battery_cost_per_kwh_inr=12000, km_per_day=150.0).model_dump()
months = ["2019-03", "2020-07", "2021-01", "2021-09", "2022-04", "2022-11", "2023-05", "2023-12", "2024-06", "2025-02", "2025-10", None]
buses = [{"id": f"B-{200 + i}", "class_id": "A" if i % 3 else "B", **({"in_service": m} if m else {})} for i, m in enumerate(months)]
req = {"as_of": "2026-11-11", "forecast_years": 10, "mode": "prior", "classes": [{"id": "A", "scenario": a}, {"id": "B", "scenario": b}], "buses": buses}
with TestClient(create_app()) as c:
    res = c.post("/api/v1/fleet", json=req)
    assert res.status_code == 200, res.text
json.dump({"request": req, "response": res.json()}, open("frontend/src/test/fixtures/fleet.json", "w"), separators=(",", ":"))
print("fleet", os.path.getsize("frontend/src/test/fixtures/fleet.json"), "bytes")
