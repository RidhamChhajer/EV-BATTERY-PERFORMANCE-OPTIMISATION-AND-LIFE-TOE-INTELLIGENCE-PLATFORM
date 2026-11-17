"""Schema and range checks for processed tables. Each returns a list of problems (empty = ok)."""
from __future__ import annotations

import pandas as pd

CALENDAR_COLS = ["source", "cell", "temp_c", "soc_pct", "days", "retention"]
HUST_CELL_COLS = ["cell", "life", "q1", "q10", "q100", "dq100_10", "slope", "eol_ratio", "q_min_100"]
HUST_CYCLE_COLS = ["cell", "cycle", "capacity_mah"]


def _missing(df: pd.DataFrame, cols: list[str], name: str) -> list[str]:
    miss = [c for c in cols if c not in df.columns]
    return [f"{name}: missing columns {miss}"] if miss else []


def validate_calendar(df: pd.DataFrame) -> list[str]:
    errs = _missing(df, CALENDAR_COLS, "calendar")
    if errs:
        return errs
    if df[["source", "cell", "temp_c", "soc_pct", "days", "retention"]].isna().any().any():
        errs.append("calendar: NaN in required columns")
    if not df.retention.between(0.4, 1.05).all():
        errs.append("calendar: retention outside [0.4, 1.05]")
    if not df.temp_c.between(0, 85).all():
        errs.append("calendar: temp_c outside [0, 85]")
    if not df.soc_pct.between(0, 100).all():
        errs.append("calendar: soc_pct outside [0, 100]")
    for cell, g in df.groupby(["source", "cell"]):
        if not g.days.is_monotonic_increasing:
            errs.append(f"calendar: days not non-decreasing for {cell}")
            break
    return errs


def validate_hust(cells: pd.DataFrame, cycles: pd.DataFrame) -> list[str]:
    errs = _missing(cells, HUST_CELL_COLS, "hust_cells") + _missing(cycles, HUST_CYCLE_COLS, "hust_cycles")
    if errs:
        return errs
    if cells.cell.duplicated().any():
        errs.append("hust_cells: duplicate cell ids")
    if (cells.life < 100).any():
        errs.append("hust_cells: life below 100 cycles")
    if cycles.capacity_mah.le(0).any() or cycles.capacity_mah.isna().any():
        errs.append("hust_cycles: non-positive or NaN capacity")
    counts = cycles.groupby("cell").size()
    bad = cells.set_index("cell").life.sub(counts).abs().gt(0)
    if bad.any():
        errs.append("hust: cycle row count differs from life for some cells")
    return errs
