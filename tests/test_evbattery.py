import json
import pickle

import pandas as pd
import pytest

from engine.data.ingest_evbattery import validate_evbattery

T = "engine/data/processed/evb_segments.parquet"


def _need():
    import os
    if not os.path.exists(T):
        pytest.skip("run scripts/build_data.sh")


@pytest.mark.data
def test_counts_and_vehicles():
    _need()
    d = pd.read_parquet(T)
    assert len(d) == 1_278_277
    assert d.vehicle.nunique() == 464
    assert d[d.capacity > 0].vehicle.nunique() == 191


@pytest.mark.data
def test_label_range_and_namespacing():
    _need()
    d = pd.read_parquet(T)
    lab = d.capacity[d.capacity > 0]
    assert lab.min() >= 24 and lab.max() <= 47
    assert validate_evbattery(d) == []
    assert d.groupby("vehicle").ds.nunique().max() == 1  # each vehicle id belongs to one dataset


def test_provenance_flags_chemistry():
    p = json.load(open("engine/data/provenance/evbattery.json")) if __import__("os").path.exists("engine/data/provenance/evbattery.json") else pytest.skip("not built")
    assert "NOT LFP" in p["chemistry"] and p["synthetic"] is False


def test_validate_rejects_bad():
    bad = pd.DataFrame({"x": [1]})
    assert validate_evbattery(bad)


def test_malicious_snippet_is_counted_as_failure(tmp_path):
    from engine.data.ingest_evbattery import _one

    class E:
        def __reduce__(self):
            import os
            return (os.system, ("touch PWNED",))

    p = tmp_path / "1.pkl"
    p.write_bytes(pickle.dumps(E()))
    assert _one((1, str(p))) is None
    assert not (tmp_path / "PWNED").exists()
