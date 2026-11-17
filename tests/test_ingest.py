import hashlib
import json
import os

import pandas as pd
import pytest

from engine.data.validate import validate_calendar, validate_hust

P = "engine/data/processed"



def _need(path):
    if not os.path.exists(path):
        pytest.skip(f"missing {path}; run scripts/build_data.sh")


@pytest.mark.data
def test_hust_counts():
    _need(f"{P}/hust_cells.parquet")
    c = pd.read_parquet(f"{P}/hust_cells.parquet")
    assert len(c) == 77 and c.life.min() == 1142 and c.life.max() == 2689


@pytest.mark.data
def test_calendar_counts():
    _need(f"{P}/calendar_obs.parquet")
    d = pd.read_parquet(f"{P}/calendar_obs.parquet")
    assert d[d.source == "stanford"].cell.nunique() == 80
    assert d[d.source == "naumann"].cell.nunique() == 17


@pytest.mark.data
def test_tables_validate():
    _need(f"{P}/calendar_obs.parquet")
    assert validate_calendar(pd.read_parquet(f"{P}/calendar_obs.parquet")) == []
    assert validate_hust(pd.read_parquet(f"{P}/hust_cells.parquet"), pd.read_parquet(f"{P}/hust_cycles.parquet")) == []


@pytest.mark.data
def test_naumann_known_value():
    _need(f"{P}/calendar_obs.parquet")
    d = pd.read_parquet(f"{P}/calendar_obs.parquet")
    g = d[(d.source == "naumann") & (d.temp_c == 25) & (d.soc_pct == 100)]
    assert abs(g.retention.iloc[-1] - 0.89) < 0.002


def test_provenance_real_sources_only():
    for n in ("hust", "stanford_calendar", "naumann_calendar"):
        p = json.load(open(f"engine/data/provenance/{n}.json"))
        assert p["synthetic"] is False
        assert p["source_url"].startswith("https://")
        assert len(p["sha256"]) == 64


@pytest.mark.data
def test_build_idempotent():
    _need(f"{P}/calendar_obs.parquet")
    from engine.data.ingest_calendar import build_calendar
    a, b = build_calendar(), build_calendar()
    assert pd.util.hash_pandas_object(a).sum() == pd.util.hash_pandas_object(b).sum()


# validation / failure tests need no data
def test_validate_catches_bad_ranges():
    bad = pd.DataFrame(dict(source=["x"], cell=["a"], temp_c=[120.0], soc_pct=[50.0], days=[1.0], retention=[0.9]))
    assert any("temp_c" in e for e in validate_calendar(bad))
    bad2 = bad.assign(temp_c=25.0, retention=2.0)
    assert any("retention" in e for e in validate_calendar(bad2))


def test_validate_catches_missing_column_and_nonmonotone():
    assert any("missing" in e for e in validate_calendar(pd.DataFrame({"source": ["x"]})))
    d = pd.DataFrame(dict(source="x", cell="a", temp_c=25.0, soc_pct=50.0, days=[5.0, 1.0], retention=[0.9, 0.8]))
    assert any("non-decreasing" in e for e in validate_calendar(d))


def test_naumann_corrupt_input(tmp_path):
    from engine.data.ingest_calendar import ingest_naumann
    p = tmp_path / "bad.xlsx"
    pd.DataFrame([[1, 2], [3, 4], [5, 6]]).to_excel(p, header=False, index=False)
    with pytest.raises(ValueError, match="header row"):
        ingest_naumann(str(p))
