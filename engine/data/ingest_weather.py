"""Real historical weather (NASA POWER daily, 2015-2024) summarised to monthly stats for 4 climate zones.

Zones are climate labels only; coordinates are grid points rounded to 0.5 degrees. No place names.
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd
import requests

ZONES = {
    "hot_dry": dict(label="Hot-dry (semi-arid interior)", lat=26.0, lon=73.0),
    "hot_humid": dict(label="Hot-humid (tropical coast side)", lat=13.0, lon=80.0),
    "composite": dict(label="Composite (northern plains)", lat=27.0, lon=80.5),
    "cool": dict(label="Cool (hill region, about 1900 m)", lat=31.0, lon=77.5),
}
START, END = "20150101", "20241231"
URL = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN"
       "&community=RE&longitude={lon}&latitude={lat}&start=" + START + "&end=" + END + "&format=JSON")
RAW_DIR = "data/weather_raw"
OUT = "engine/data/zones.json"
FILL = -999.0


def fetch_raw(zone: str, force: bool = False) -> dict:
    os.makedirs(RAW_DIR, exist_ok=True)
    path = f"{RAW_DIR}/{zone}.json"
    if os.path.exists(path) and not force:
        return json.load(open(path))
    z = ZONES[zone]
    r = requests.get(URL.format(lat=z["lat"], lon=z["lon"]), timeout=120)
    r.raise_for_status()
    js = r.json()
    json.dump(js, open(path, "w"))
    return js


def parse_daily(js: dict) -> pd.DataFrame:
    try:
        par = js["properties"]["parameter"]
        df = pd.DataFrame({k: pd.Series(par[k]) for k in ("T2M", "T2M_MAX", "T2M_MIN")})
        elev = js["geometry"]["coordinates"][2]
    except (KeyError, TypeError) as e:
        raise ValueError(f"unexpected NASA POWER response shape: {e}") from e
    if df.empty:
        raise ValueError("NASA POWER response has no daily data")
    df = df.replace(FILL, np.nan)
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df.attrs["elevation_m"] = float(elev)
    return df


def monthly_stats(df: pd.DataFrame) -> list[dict]:
    out = []
    for m in range(1, 13):
        g = df[df.index.month == m].dropna()
        if len(g) < 100:
            raise ValueError(f"month {m}: only {len(g)} valid days")
        out.append(dict(month=m, tmean_c=round(float(g.T2M.mean()), 2), tmax_mean_c=round(float(g.T2M_MAX.mean()), 2),
                        tmin_mean_c=round(float(g.T2M_MIN.mean()), 2),
                        diurnal_range_c=round(float((g.T2M_MAX - g.T2M_MIN).mean()), 2),
                        tmax_p95_c=round(float(g.T2M_MAX.quantile(0.95)), 2), n_days=int(len(g))))
    return out


def build_zones() -> dict:
    zones = {}
    for key, z in ZONES.items():
        df = parse_daily(fetch_raw(key))
        zones[key] = dict(label=z["label"], lat=z["lat"], lon=z["lon"], elevation_m=round(df.attrs["elevation_m"]),
                          monthly=monthly_stats(df))
    return dict(
        source="NASA POWER daily point data, parameters T2M, T2M_MAX, T2M_MIN (2 m air temperature)",
        source_url="https://power.larc.nasa.gov/", period=f"{START}-{END}",
        attribution=("These data were obtained from the NASA Langley Research Center (LaRC) POWER Project "
                     "funded through the NASA Earth Science/Applied Science Program."),
        note="Air temperature, not battery temperature. Zones are climate labels, not places.",
        synthetic=False, zones=zones)


def main() -> None:
    z = build_zones()
    json.dump(z, open(OUT, "w"), indent=1, sort_keys=True)
    from engine.data.build import sha256, write_prov
    write_prov("weather", source_url=z["source_url"], licence="NASA POWER open data; attribution required",
               file=OUT, sha256=sha256(OUT), period=z["period"], attribution=z["attribution"],
               limitations="2 m air temperature from a gridded reanalysis/satellite product (about 50 km cells), not measured depot or battery temperature")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
