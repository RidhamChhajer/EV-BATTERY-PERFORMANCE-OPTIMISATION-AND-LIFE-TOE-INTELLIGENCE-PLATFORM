import json

import numpy as np
import pandas as pd
import pytest

from engine.data.ingest_weather import FILL, monthly_stats, parse_daily

ZONES = json.load(open("engine/data/zones.json"))["zones"]


def _js(n=3650, fill_rows=0):
    idx = pd.date_range("2015-01-01", periods=n)
    t = 25 + 5 * np.sin(2 * np.pi * idx.dayofyear / 365)
    par = {"T2M": dict(zip(idx.strftime("%Y%m%d"), t)),
           "T2M_MAX": dict(zip(idx.strftime("%Y%m%d"), t + 5)),
           "T2M_MIN": dict(zip(idx.strftime("%Y%m%d"), t - 5))}
    for k in list(par["T2M"])[:fill_rows]:
        par["T2M"][k] = FILL
    return {"geometry": {"coordinates": [0, 0, 100]}, "properties": {"parameter": par}}


def test_four_zones_twelve_months():
    assert set(ZONES) == {"hot_dry", "hot_humid", "composite", "cool"}
    assert all(len(z["monthly"]) == 12 for z in ZONES.values())


def test_plausible_ranges_and_ordering():
    for z in ZONES.values():
        for m in z["monthly"]:
            assert 0 < m["tmean_c"] < 40
            assert m["tmin_mean_c"] < m["tmean_c"] < m["tmax_mean_c"]
    july = {k: z["monthly"][6]["tmean_c"] for k, z in ZONES.items()}
    assert july["hot_dry"] > july["cool"]
    assert ZONES["cool"]["elevation_m"] > 1000


def test_no_place_names():
    text = open("engine/data/zones.json").read().lower()
    for name in ("mumbai", "delhi", "chennai", "bengaluru", "pune", "kolkata", "jaipur", "shimla", "hyderabad"):
        assert name not in text


def test_bad_response_rejected():
    with pytest.raises(ValueError):
        parse_daily({"properties": {}})
    with pytest.raises(ValueError):
        parse_daily({"geometry": {"coordinates": [0, 0, 1]}, "properties": {"parameter": {"T2M": {}, "T2M_MAX": {}, "T2M_MIN": {}}}})


def test_fill_values_excluded():
    df = parse_daily(_js(fill_rows=200))
    assert df.T2M.isna().sum() == 200
    stats = monthly_stats(df)
    assert all(m["tmean_c"] > -100 for m in stats)


def test_too_few_days_raises():
    with pytest.raises(ValueError, match="valid days"):
        monthly_stats(parse_daily(_js(n=200)))


def test_deterministic_from_cache():
    from engine.data.ingest_weather import build_zones
    pytest.importorskip("os")
    import os
    if not os.path.exists("data/weather_raw/hot_dry.json"):
        pytest.skip("raw cache missing")
    assert build_zones() == build_zones()
