"""Build all processed tables and provenance files. Usage: python -m engine.data.build"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os

from engine.data.ingest_calendar import build_calendar
from engine.data.ingest_hust import build_hust

PROCESSED = "engine/data/processed"
PROV = "engine/data/provenance"


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_prov(name: str, **kw) -> None:
    os.makedirs(PROV, exist_ok=True)
    kw["retrieved_for_project"] = kw.get("retrieved_for_project", dt.date.today().isoformat())
    kw["synthetic"] = False
    with open(f"{PROV}/{name}.json", "w") as f:
        json.dump(kw, f, indent=2, sort_keys=True)


def main() -> None:
    os.makedirs(PROCESSED, exist_ok=True)
    cells, cycles = build_hust()
    cells.to_parquet(f"{PROCESSED}/hust_cells.parquet")
    cycles.to_parquet(f"{PROCESSED}/hust_cycles.parquet")
    write_prov("hust", source_url="https://data.mendeley.com/datasets/nsc7hnsg4s", licence="CC BY 4.0",
               file="data/hust/our_data.zip", sha256=sha256("data/hust/our_data.zip"), rows_cells=len(cells),
               rows_cycles=len(cycles), limitations="77 A123 LFP 1.1 Ah cells, 30 C, one batch, varied charge protocols; no temperature variation")
    cal = build_calendar()
    cal.to_parquet(f"{PROCESSED}/calendar_obs.parquet")
    write_prov("stanford_calendar", source_url="https://osf.io/ju325/", licence="none declared (coursework use)",
               file="data/stanford_calendar/joule_declass_sum.zip",
               sha256=sha256("data/stanford_calendar/joule_declass_sum.zip"),
               cells=int(cal[cal.source == "stanford"].cell.nunique()),
               limitations="storage only, 24-85 C, 50/100% SOC; retention vs first reference test, not nameplate")
    write_prov("naumann_calendar", source_url="https://data.mendeley.com/datasets/kxh42bfgtj", licence="CC BY 4.0",
               file="data/naumann_lfp_calendar/DischargeCapacity.xlsx",
               sha256=sha256("data/naumann_lfp_calendar/DischargeCapacity.xlsx"),
               conditions=int(cal[cal.source == "naumann"].cell.nunique()),
               limitations="Sony/Murata LFP/graphite cells, 29 months, one series per storage condition as published (cell count per series not verified)")
    if os.path.exists("data/evbattery/ex1"):
        from engine.data.ingest_evbattery import build_evbattery
        evb = build_evbattery()
        evb.to_parquet(f"{PROCESSED}/evb_segments.parquet")
        write_prov("evbattery", source_url="https://figshare.com/articles/dataset/23301881", licence="CC BY 4.0",
                   file="data/evbattery/battery_dataset1.tar.gz", sha256=sha256("data/evbattery/battery_dataset1.tar.gz"),
                   snippets=len(evb), vehicles=int(evb.vehicle.nunique()),
                   chemistry="NMC-like, NOT LFP (cell voltage up to 4.29 V); undisclosed by authors",
                   limitations="values perturbed by authors; capacity labels derived, not measured; 1270 s snippets")
    print("built", len(cells), "hust cells,", len(cycles), "cycles,", len(cal), "calendar rows")


if __name__ == "__main__":
    main()
