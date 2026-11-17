"""Unify Stanford (LFP) and Naumann calendar-ageing data into one table."""
from __future__ import annotations

import json
import re
import zipfile

import pandas as pd

from engine.data.validate import validate_calendar

COLS = ["source", "cell", "temp_c", "soc_pct", "days", "retention"]


def ingest_stanford(zip_path: str, cell_csv: str) -> pd.DataFrame:
    ids = pd.read_csv(cell_csv)
    lfp = ids[ids.Cell_chemistry.str.contains("LFP", case=False, na=False)]
    z = zipfile.ZipFile(zip_path)
    rows = []
    for _, r in lfp.iterrows():
        name = f"joule_declass_sum/{r.Cell_id}_sum.json"
        try:
            d = json.loads(z.read(name))
        except KeyError:
            continue
        s = pd.DataFrame(json.loads(d["summary_data"]))
        if "RPT0.2C_2_D_capacity" not in s or "Calendar_Time(date)" not in s:
            raise ValueError(f"Stanford {r.Cell_id}: expected columns RPT0.2C_2_D_capacity, Calendar_Time(date)")
        t = pd.to_datetime(s["Calendar_Time(date)"], errors="coerce")
        cap = s["RPT0.2C_2_D_capacity"]
        ok = cap.notna() & t.notna()
        if ok.sum() < 3:
            continue
        cap, t = cap[ok], t[ok]
        days = (t - t.iloc[0]).dt.days.astype(float)
        for dd, c in zip(days, cap):
            rows.append(("stanford", r.Cell_id, float(r.Temperature), float(r.SOC), dd, c / cap.iloc[0]))
    return pd.DataFrame(rows, columns=COLS)


def ingest_naumann(xlsx: str) -> pd.DataFrame:
    df = pd.read_excel(xlsx, header=None)
    if df.shape[0] < 3 or str(df.iloc[1, 0]).strip() != "Storage time / hours":
        raise ValueError("Naumann DischargeCapacity.xlsx: header row 'Storage time / hours' not found")
    cols = df.iloc[1, 1:].tolist()
    d = df.iloc[2:].copy()
    d.columns = ["h"] + cols
    d = d.apply(pd.to_numeric, errors="coerce").dropna(subset=["h"])
    rows = []
    for c in cols:
        m = re.match(r"TP_(-?[\d.]+)°C,([\d.]+)%SOC", str(c))
        if not m:
            raise ValueError(f"Naumann: cannot parse condition '{c}'")
        s = d[["h", c]].dropna()
        for h, q in zip(s.h, s[c]):
            rows.append(("naumann", str(c), float(m.group(1)), float(m.group(2)), h / 24.0, q / s[c].iloc[0]))
    return pd.DataFrame(rows, columns=COLS)


def build_calendar(root: str = "data") -> pd.DataFrame:
    st = ingest_stanford(f"{root}/stanford_calendar/joule_declass_sum.zip", f"{root}/stanford_calendar/Joule_cell_id.csv")
    na = ingest_naumann(f"{root}/naumann_lfp_calendar/DischargeCapacity.xlsx")
    out = pd.concat([st, na], ignore_index=True)
    errs = validate_calendar(out)
    if errs:
        raise ValueError("; ".join(errs))
    return out
