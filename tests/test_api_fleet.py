"""POST /api/v1/fleet."""
import json
import time

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from tests.helpers import find_bare_numbers

SCEN = {"pack_kwh": 350, "kwh_per_km": 1.2, "km_per_day": 200, "operating_days_per_year": 340, "charge_power_kw": 120, "battery_cost_per_kwh_inr": 12000}


def body(n=30, **over):
    b = {"as_of": "2026-11-11", "forecast_years": 10,
         "classes": [{"id": "A", "scenario": SCEN}, {"id": "B", "scenario": {**SCEN, "km_per_day": 160, "charge_start_hour": 1.0}}],
         "buses": [{"id": f"B-{i}", "class_id": "A" if i % 2 else "B", **({"in_service": f"{2019 + i % 6}-0{1 + i % 9}"} if i % 5 else {})} for i in range(n)]}
    b.update(over)
    return b


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


def test_fleet_ok_shape_labels_and_cache(client):
    r = client.post("/api/v1/fleet", json=body())
    assert r.status_code == 200 and r.headers["X-Cache"] == "MISS"
    j = r.json()
    assert j["mode"] == "prior" and len(j["model_version"]) == 12 and "validated on buses" in j["disclaimer"]
    assert find_bare_numbers(j) == []
    n = len(j["period_labels"])
    assert n >= 10 and j["period_labels"][0] == "FY2026-27" and len(j["buses_expected"]["value"]) == n and len(j["period_edges_months"]["value"]) == n + 1
    assert {c["id"] for c in j["classes"]} == {"A", "B"} and sum(c["n_buses"]["value"] for c in j["cohorts"]) == 30
    assert any("age_unknown" in c["flags"] for c in j["cohorts"])
    again = client.post("/api/v1/fleet", json=body())
    assert again.headers["X-Cache"] == "HIT" and again.json() == j


def test_classes_that_differ_only_in_price_cost_no_extra_model_run(client):
    """Price is not part of the ageing-curve key, so re-pricing a whole fleet reruns no ageing model."""
    from engine.reference.simulate import _curves
    client.post("/api/v1/fleet", json=body())
    before = _curves.cache_info().misses
    b = body()
    for c in b["classes"]:
        c["scenario"] = {**c["scenario"], "battery_cost_per_kwh_inr": 9000}
    r = client.post("/api/v1/fleet", json=b)
    assert r.status_code == 200 and _curves.cache_info().misses == before


def test_unfittable_fleet_is_422_with_a_reason(client):
    b = body(n=3)
    b["buses"][0]["in_service"] = "2005-01"
    r = client.post("/api/v1/fleet", json=b)
    assert r.status_code == 422 and r.json()["error"]["code"] == "fleet_not_forecastable" and "20-year horizon" in r.json()["error"]["message"]
    b = body(n=3)
    b["buses"][0]["in_service"] = "2027-05"
    assert client.post("/api/v1/fleet", json=b).status_code == 422


@pytest.mark.parametrize("mutate", [
    lambda b: b["buses"].append({"id": "B-0", "class_id": "A"}),                      # duplicate bus id
    lambda b: b["classes"].append({"id": "A", "scenario": SCEN}),                    # duplicate class id
    lambda b: b["buses"].__setitem__(0, {"id": "x", "class_id": "nope"}),            # unknown class
    lambda b: b["buses"].__setitem__(0, {"id": "x", "class_id": "A", "in_service": "2023-13"}),
    lambda b: b.update(buses=[]),
    lambda b: b.update(forecast_years=40),
    lambda b: b["buses"][0].update(pack_price_inr=-1),
    lambda b: b.update(extra_field=1),
])
def test_bad_requests_are_rejected(client, mutate):
    b = body(n=5)
    mutate(b)
    assert client.post("/api/v1/fleet", json=b).status_code == 422


def test_limits(client):
    many = body(n=5001)
    assert client.post("/api/v1/fleet", json=many).status_code == 422
    too_many_classes = body(n=3, classes=[{"id": f"C{i}", "scenario": SCEN} for i in range(51)])
    assert client.post("/api/v1/fleet", json=too_many_classes).status_code == 422


def test_unsupported_mode_is_400(client):
    assert client.post("/api/v1/fleet", json=body(n=3, mode="calibrated")).status_code == 400


def test_five_thousand_buses_fit_the_body_limit_and_the_time_budget(client):
    b = body(n=5000)
    assert len(json.dumps(b)) < 1_000_000
    t = time.perf_counter()
    r = client.post("/api/v1/fleet", json=b)
    assert r.status_code == 200 and time.perf_counter() - t < 5


def test_openapi_lists_the_endpoint(client):
    assert "/api/v1/fleet" in client.get("/openapi.json").json()["paths"]


# The oldest bus the forecast can take, in months, by the month of `as_of` (10-year forecast). The front end keeps the same table
# (frontend/src/lib/fleet/roster.test.ts) so its Fleet page rejects exactly what this endpoint would 422 on.
MAX_AGE_BY_MONTH = {1: 117, 2: 118, 3: 119, 4: 120, 5: 109, 6: 110, 7: 111, 8: 112, 9: 113, 10: 114, 11: 115, 12: 116}


def _months_ago(as_of_year, as_of_month, n):
    idx = as_of_year * 12 + as_of_month - 1 - n
    return f"{idx // 12}-{idx % 12 + 1:02d}"


@pytest.mark.parametrize("month", sorted(MAX_AGE_BY_MONTH))
def test_the_oldest_bus_the_forecast_takes_matches_the_published_table(client, month):
    oldest = MAX_AGE_BY_MONTH[month]
    one = lambda age: {"as_of": f"2026-{month:02d}-11", "forecast_years": 10, "classes": [{"id": "A", "scenario": SCEN}],
                       "buses": [{"id": "B-1", "class_id": "A", "in_service": _months_ago(2026, month, age)}]}
    assert client.post("/api/v1/fleet", json=one(oldest)).status_code == 200
    r = client.post("/api/v1/fleet", json=one(oldest + 1))
    assert r.status_code == 422 and r.json()["error"]["code"] == "fleet_not_forecastable"


def _subset(b, keep):
    """The same request for only the buses `keep` accepts, with only the classes they use (what the Fleet page sends for one class or one depot)."""
    buses = [x for x in b["buses"] if keep(x)]
    used = {x["class_id"] for x in buses}
    return {**b, "buses": buses, "classes": [c for c in b["classes"] if c["id"] in used]}


def test_expected_counts_and_spend_add_up_across_subsets_but_the_band_does_not(client):
    """The Fleet page stacks per-depot spend and lists per-class counts under a whole-fleet total, which is only right because expectations add across
    independent buses. The 10th and 90th percentiles do not, so the page draws the band on the whole-fleet total only. This test pins both facts to the real engine."""
    b = body(n=40)
    depot = {x["id"]: ("north" if i % 3 else "south") for i, x in enumerate(b["buses"])}   # the API has no depots; the page splits the roster itself
    whole = client.post("/api/v1/fleet", json=b).json()
    n = len(whole["period_labels"])
    splits = {"class": ("A", "B", lambda x, g: x["class_id"] == g), "depot": ("north", "south", lambda x, g: depot[x["id"]] == g)}
    for name, (g1, g2, pick) in splits.items():
        parts = [client.post("/api/v1/fleet", json=_subset(b, lambda x, g=g: pick(x, g))) for g in (g1, g2)]
        assert all(p.status_code == 200 for p in parts), name
        parts = [p.json() for p in parts]
        for series in ("buses_expected", "spend_expected"):
            total = [sum(p[series]["value"][i] for p in parts) for i in range(n)]
            assert total == pytest.approx(whole[series]["value"], rel=1e-9, abs=1e-6), (name, series)
        assert sum(p["beyond_forecast_buses"]["value"] for p in parts) == pytest.approx(whole["beyond_forecast_buses"]["value"], rel=1e-9, abs=1e-6)
        assert all(p["period_labels"] == whole["period_labels"] and p["period_edges_months"]["value"] == whole["period_edges_months"]["value"] for p in parts)
        # percentiles: the whole fleet's 90th percentile is not the sum of the parts' (the parts rarely all land high together)
        p90_sum = [sum(p["spend_p90"]["value"][i] for p in parts) for i in range(n)]
        assert any(abs(s - w) > 1 for s, w in zip(p90_sum, whole["spend_p90"]["value"])), name


def test_fleet_pdf_downloads_says_what_it_leaves_out_and_reuses_the_forecast(client):
    from backend.app import fleet_report
    b = body(n=30)
    client.post("/api/v1/fleet", json=b)                                   # warms the forecast cache
    r = client.post("/api/v1/report/fleet-pdf", json={**b, "name": "Test <fleet> & co"})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content[:5] == b"%PDF-"
    assert "pack-horizon-fleet-forecast-" in r.headers["content-disposition"] and r.headers["cache-control"] == "no-store"
    assert len(r.content) > 5000
    from datetime import datetime, timezone
    from backend.app import service
    from backend.app.schemas import FleetRequest
    res = service.run_fleet(FleetRequest(**b), client.app.state.models, client.app.state.model_version)
    text = " ".join(_plain(x) for x in fleet_report.fleet_story(res, 30, "Test <fleet> & co", datetime.now(timezone.utc)))
    for must in ("Budget about", "Budget by financial year", "Duty classes", "Assumptions and limits", "not yet validated on buses", "50/50", "Depots, routes and reported battery health stay in your browser"):
        assert must.lower() in text.lower(), must
    assert "Test <fleet> & co" in text
    assert fleet_report.filename().startswith("pack-horizon-fleet-forecast-")


def test_fleet_pdf_rejects_what_the_forecast_rejects_and_a_long_name(client):
    b = body(n=3)
    b["buses"][0]["in_service"] = "2005-01"
    assert client.post("/api/v1/report/fleet-pdf", json=b).status_code == 422
    assert client.post("/api/v1/report/fleet-pdf", json={**body(n=3), "name": "x" * 81}).status_code == 422
    assert client.post("/api/v1/report/fleet-pdf", json={**body(n=3), "mode": "calibrated"}).status_code == 400


def _plain(flow) -> str:
    """All the text in a flowable, including table cells."""
    if hasattr(flow, "getPlainText"):
        return flow.getPlainText()
    cells = getattr(flow, "_cellvalues", None)
    return " ".join(_plain(c) for row in cells for c in row) if cells else ""
