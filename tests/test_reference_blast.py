"""The reference engine must reproduce NREL BLAST-Lite. The package is not installed here (it needs Python <= 3.12), so the
expected values are the package's own outputs stored in engine/artifacts/crosscheck_blast.json by scripts/crosscheck_blast.py."""
import json
import sys

import numpy as np
import pytest

from engine.bus.scenario import Scenario
from engine.bus.translate import translate
from engine.reference import blast_lfp as B
from engine.reference.checks import PACKAGE, cycling_loss, duty_retention, storage_loss

sys.path.insert(0, "scripts")
import crosscheck_blast as X  # noqa: E402

ART = json.load(open("engine/artifacts/crosscheck_blast.json"))
SCEN = {cid: Scenario.from_preset(preset, **ov) for cid, _, preset, ov in X.CASES}


@pytest.mark.parametrize("who", list(PACKAGE))
def test_storage_matches_the_package(who):
    model = PACKAGE[who][1]
    for c in (c for c in ART["single_condition_checks"] if c["kind"] == "storage"):
        got = storage_loss(model, c["temp_c"], c["soc_pct"] / 100.0, 5)
        assert got[1] == pytest.approx(c[who]["loss_1y"], abs=2e-4), c["label"]
        assert got[5] == pytest.approx(c[who]["loss_5y"], abs=2e-4), c["label"]


@pytest.mark.parametrize("who", list(PACKAGE))
def test_cycling_matches_the_package(who):
    model = PACKAGE[who][1]
    for c in (c for c in ART["single_condition_checks"] if c["kind"] == "cycling"):
        got = cycling_loss(model, c["temp_c"], c["c_rate"])
        assert got[1000] == pytest.approx(c[who]["loss_1000efc"], abs=2e-4), c["label"]
        assert got[3000] == pytest.approx(c[who]["loss_3000efc"], abs=2e-4), c["label"]


@pytest.mark.parametrize("who", list(PACKAGE))
def test_bus_duty_curves_match_the_package_within_half_a_point(who):
    key, model = PACKAGE[who]
    for sc in ART["scenarios"]:
        mine = duty_retention(SCEN[sc["id"]], model, ART["horizon_years"])
        assert np.max(np.abs(mine - np.array(sc[key]))) < 0.005, (sc["id"], who)       # 0.5 percentage points at every whole year


def test_stored_port_check_summary_is_current():
    from engine.reference.checks import compare_with_package
    stored = json.load(open("engine/artifacts/reference_port_check.json"))
    now = compare_with_package(ART, SCEN)
    assert stored == now, "run scripts/check_reference_port.py"
    assert now["bus_duty_max_diff_points"] < 0.5 and now["fixed_condition_max_diff_points"] < 0.02


def test_models_carry_the_package_ranges_and_sources():
    assert B.LFP250.cycling_temperature_c == (10.0, 45.0) and B.LFPSONY.cycling_temperature_c == (20.0, 40.0)
    assert B.LFP250.dod == B.LFPSONY.dod == (0.8, 1.0)
    assert len(B.LFP250.params) == 10 and len(B.LFPSONY.params) == 21        # capacity parameters; the package's resistance parameters are not ported
    assert all(u.startswith("https://doi.org/") for m in B.MODELS.values() for u in m.data_sources)


def test_power_state_follows_its_closed_form():
    # y = k x^p stepped monthly. Like the package, each step uses the slope at the start of the step, so it tracks the
    # closed form to within about half a percent rather than exactly; the first step (state zero) is exact.
    assert float(B.power_state(0.0, 30.0, 0.01, 0.526)) == pytest.approx(0.01 * 30.0 ** 0.526, rel=1e-12)
    y, k, p = 0.0, 0.01, 0.526
    for _ in range(120):
        y += float(B.power_state(y, 30.0, k, p))
    assert y == pytest.approx(k * (120 * 30.0) ** p, rel=0.01)


def test_licence_notice_is_shipped():
    text = open("engine/reference/NOTICE").read()
    assert "Alliance for Energy Innovation" in text and "BSD" in text and "Redistributions of source code must retain" in text


def test_evidence_page_default_bus_figures_are_true():
    """The Evidence page prints the default 12 m bus next to each model's tested range; keep those printed numbers honest."""
    from engine.reference.simulate import day_profile
    s = Scenario.from_preset("12m", zone="hot_dry")
    d = day_profile(s)
    assert round((d.top - d.end) * 100) == 69
    assert round(s.charge_power_kw / s.pack_kwh, 2) == 0.34
    cells = translate(s).monthly_cell_temp_c.value
    assert (round(min(cells)), round(max(cells))) == (19, 38)
