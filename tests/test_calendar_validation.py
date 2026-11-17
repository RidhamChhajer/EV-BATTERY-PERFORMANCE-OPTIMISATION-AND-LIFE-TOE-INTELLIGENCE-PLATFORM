import json
import os

import pandas as pd
import pytest

from engine.train.validate_calendar import OVERLAP_SOC, OVERLAP_T, THRESHOLD, overlap

M = json.load(open("engine/artifacts/metrics.json"))["calendar_validation"]


def test_results_recorded_both_directions():
    assert set(M["cross_lab"]) == {"stanford_to_naumann", "naumann_to_stanford"}
    for v in M["cross_lab"].values():
        assert v["mae_all"] > 0 and v["n"] > 0 and v["conditions"] >= 4


def test_threshold_gate():
    waiver = "docs/waivers/m2.2-calendar.md"
    assert M["passes_threshold"] or os.path.exists(waiver)
    assert M["threshold"] == THRESHOLD


def test_overlap_selection():
    df = pd.DataFrame(dict(source="s", cell="c", temp_c=[10, 30, 70, 30], soc_pct=[50, 50, 50, 25],
                           days=[1, 1, 1, 1], retention=[.9] * 4))
    o = overlap(df)
    assert o.temp_c.tolist() == [30]
    assert OVERLAP_T == (24.0, 60.0) and OVERLAP_SOC == (50.0, 100.0)


@pytest.mark.data
def test_cross_lab_reproduces_and_no_leak():
    from engine.train.fit_calendar import TABLE
    from engine.train.validate_calendar import cross_lab
    if not os.path.exists(TABLE):
        pytest.skip("run scripts/build_data.sh")
    df = pd.read_parquet(TABLE)
    r = cross_lab(df)  # asserts source cells are disjoint internally
    assert abs(r["stanford_to_naumann"]["mae_all"] - M["cross_lab"]["stanford_to_naumann"]["mae_all"]) < 1e-6
