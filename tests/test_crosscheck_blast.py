"""BLAST-Lite cross-check: the duty-cycle builder (pure numpy) and the committed package-output artifact. The artifact is the golden
reference the Python port in engine/reference is tested against (tests/test_reference_blast.py); it is not shown in the app.

BLAST-Lite itself is not installed here (it needs Python <= 3.12), so these tests never import it.
"""
import json
import sys

import numpy as np
import pytest

sys.path.insert(0, "scripts")
import blast_runner  # noqa: E402  (imports blast only inside functions)

ART = "engine/artifacts/crosscheck_blast.json"
ZONES = json.load(open("engine/data/zones.json"))["zones"]


def case(**kw):
    base = dict(id="t", departure_hour=5.0, charge_start_hour=22.0, soc_max=1.0, soc_end=1.0 - 240 / 350, charge_h=240 / 120,
                operating_days=340, heat_rise_c=3.0, monthly=ZONES["hot_dry"]["monthly"], horizon_years=1)
    base.update(kw)
    return base


def test_year_series_shape_and_bounds():
    ts = blast_runner.build_year(case())
    assert len(ts) == 8760 and ts["Time_s"].iloc[1] - ts["Time_s"].iloc[0] == 3600
    assert ts["SOC"].max() == pytest.approx(1.0) and ts["SOC"].min() == pytest.approx(1.0 - 240 / 350)


def test_year_series_throughput_matches_the_scenario_arithmetic():
    ts = blast_runner.build_year(case())
    efc = np.abs(np.diff(ts["SOC"].to_numpy())).sum() / 2
    assert efc == pytest.approx(340 * 240 / 350, rel=0.03)         # 340 operating days x 0.686 EFC per day


def test_idle_days_hold_full_and_charge_finishes_before_departure():
    ts = blast_runner.build_year(case(operating_days=300))
    day = ts["SOC"].to_numpy().reshape(365, 24)
    assert int((day.min(axis=1) == 1.0).sum()) == 65            # 365 - 300 rest days never leave the top
    d = day[1]
    assert d[4] == pytest.approx(1.0) and d[5] == pytest.approx(1.0)  # full at 04:00 and at departure


def test_temperature_follows_monthly_climate_plus_heat_rise():
    hot, cool = (blast_runner.build_year(case(monthly=ZONES[z]["monthly"], heat_rise_c=h)) for z, h in (("hot_dry", 3.0), ("cool", 3.0)))
    assert hot["Temperature_C"].mean() > cool["Temperature_C"].mean()
    plus = blast_runner.build_year(case(heat_rise_c=11.0))
    assert (plus["Temperature_C"] - blast_runner.build_year(case())["Temperature_C"]).round(6).eq(8.0).all()


def test_artifact_is_consistent_and_honest():
    a = json.load(open(ART))
    assert a["horizon_years"] == 15 and a["threshold"] == 0.8
    assert any("validated on buses" in c for c in a["caveats"]) and any("licen" in c.lower() for c in a["caveats"])
    assert a["blast_lite"]["version"] and a["blast_lite"]["source_url"].startswith("https://github.com/NREL/")
    assert len(a["scenarios"]) == 10 and {"12m_hot_dry", "9m_cool", "12m_hot_dry_stop80", "12m_hot_dry_hotpack"} <= {s["id"] for s in a["scenarios"]}
    for s in a["scenarios"]:
        n = len(s["years"])
        assert s["years"][0] == 0 and n == 16
        for k in ("ours_p10", "ours_p50", "ours_p90", "ours_cell_p50", "blast", "blast_alt"):
            v = s[k]
            assert len(v) == n and v[0] == 1.0 and all(0.0 <= x <= 1.0 for x in v)
            assert all(b <= x + 1e-9 for x, b in zip(v, v[1:])), f"{k} must not increase"
        assert all(lo <= m + 1e-9 <= hi + 2e-9 for lo, m, hi in zip(s["ours_p10"], s["ours_p50"], s["ours_p90"]))
    s10 = {s["id"]: s for s in a["scenarios"]}["12m_hot_dry"]
    assert s10["blast"][10] > s10["ours_cell_p50"][10] and s10["blast_alt"][10] > s10["ours_cell_p50"][10]   # the finding the card reports
    assert a["summary"]["ours_is_lower_in_all_scenarios"] is all(s["ours_cell_p50"][10] < min(s["blast"][10], s["blast_alt"][10]) for s in a["scenarios"])


def test_artifact_loss_split_adds_up_and_checks_cover_both_kinds():
    a = json.load(open(ART))
    for s in a["scenarios"]:
        for who, y in (("blast_250ah", "10y"), ("blast_sony_3ah", "10y")):
            sp = s["loss_split"][who][y]
            assert sp["calendar_loss"] > 0 and sp["calendar_loss"] + sp["cycle_loss"] == pytest.approx(1 - s["blast" if who == "blast_250ah" else "blast_alt"][10], abs=0.01)
    kinds = {c["kind"] for c in a["single_condition_checks"]}
    assert kinds == {"storage", "cycling"}
    assert all({"ours", "blast_250ah", "blast_sony_3ah"} <= set(c) for c in a["single_condition_checks"])


def test_crosscheck_is_not_a_model_artifact():
    from backend.app.main import ARTIFACTS
    assert "crosscheck_blast.json" not in ARTIFACTS             # keeps model_version tied to the fitted models only
