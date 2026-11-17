"""The Cost page draws cost per km against the replacement line from the retention curves alone (frontend/src/lib/costcalc.ts costAtThreshold).
This mirrors that formula in Python and checks it against what /predict returns for the same scenario at other thresholds, so the page never
shows a number the engine would not."""
import json

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from tests.test_api_predict import BODY, body

# Relative tolerance per percentile. p10 and p90 match to a fraction of a percent. The engine's median averages the costs of the two middle runs,
# while the curve gives 1 / (life of the median curve), so p50 differs by up to about 4 % when lives are short; the Cost page anchors it to the
# engine's own value at the scenario's line (costcalc.ts anchorCost) and says the curve is an estimate.
TOL = {"p10": 0.01, "p50": 0.05, "p90": 0.01}


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def crossing_years(series_pct, v_pct):
    """Mirror of crossingYear in frontend/src/lib/format.ts."""
    for i in range(1, len(series_pct)):
        if series_pct[i] <= v_pct:
            return (i - 1 + (series_pct[i - 1] - v_pct) / (series_pct[i - 1] - series_pct[i])) / 12
    return None


def mirror(curves, thr_pct, price, km_day, op_days):
    horizon = (len(curves["p50"]) - 1) / 12
    life = lambda c: (crossing_years(c, thr_pct) or horizon) * op_days * km_day
    return {"p10": price / life(curves["p90"]), "p50": price / life(curves["p50"]), "p90": price / life(curves["p10"])}


@pytest.mark.parametrize("thr", [0.7, 0.8, 0.9])
def test_curve_formula_matches_the_engine_at_other_thresholds(client, thr):
    ref = client.post("/api/v1/predict", json=body(threshold=0.8)).json()
    got = client.post("/api/v1/predict", json=body(threshold=thr)).json()
    for q in ("p10", "p50", "p90"):           # the curves do not depend on the threshold
        assert got["replacement"][f"retention_{q}"]["value"] == ref["replacement"][f"retention_{q}"]["value"]
    curves = {q: [x * 100 for x in ref["replacement"][f"retention_{q}"]["value"]] for q in ("p10", "p50", "p90")}
    s = BODY["scenario"]
    price = s["pack_kwh"] * s["battery_cost_per_kwh_inr"]
    m = mirror(curves, thr * 100, price, s["km_per_day"], s["operating_days_per_year"])
    for q in ("p10", "p50", "p90"):
        e = got["cost"][f"cost_per_km_{q}"]["value"]
        assert m[q] == pytest.approx(e, rel=TOL[q]), (thr, q, m[q], e)
