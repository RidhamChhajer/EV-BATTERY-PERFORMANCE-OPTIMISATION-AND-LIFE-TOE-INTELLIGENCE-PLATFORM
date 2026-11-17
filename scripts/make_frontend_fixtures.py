"""Captures real API responses (200 draws, to stay small) as fixtures for the frontend tests. Run: python scripts/make_frontend_fixtures.py"""
import json
import os
import sys

sys.path.insert(0, os.getcwd())
os.environ["EV_AUTH_REQUIRED"] = "false"
from fastapi.testclient import TestClient

from backend.app.main import create_app
from engine.bus.scenario import Scenario

OUT = "frontend/src/test/fixtures"
with TestClient(create_app()) as c:
    sc = Scenario.from_preset("12m", battery_cost_per_kwh_inr=12000).model_dump()
    sc2 = {**sc, "soc_max_pct": 90.0}
    files = {
        "health": c.get("/api/v1/health").json(),
        "presets": c.get("/api/v1/presets").json(),
        "zones": c.get("/api/v1/zones").json(),
        "evidence": c.get("/api/v1/evidence").json(),
        "predict": c.post("/api/v1/predict", json={"scenario": sc, "n_draws": 200}).json(),
        "compare": c.post("/api/v1/compare", json={"scenarios": [sc, sc2], "n_draws": 200}).json(),
        "recommend": c.post("/api/v1/recommend", json={"scenario": {**sc, "km_per_day": 150.0}, "n_draws": 200}).json(),
    }
for k, v in files.items():
    json.dump(v, open(f"{OUT}/{k}.json", "w"), separators=(",", ":"))
    print(k, os.path.getsize(f"{OUT}/{k}.json"), "bytes")
