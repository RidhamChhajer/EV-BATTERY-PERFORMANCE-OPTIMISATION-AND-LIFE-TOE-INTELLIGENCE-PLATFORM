"""Writes an ILLUSTRATIVE duty-summary CSV for trying the import in the UI.

It is made up (seeded random numbers around the 12 m archetype defaults). It is NOT real fleet data and is never used
to train or tune any model; it only exercises the CSV import. Run: python scripts/make_sample_duty_csv.py
"""
import csv
import datetime as dt
import random

OUT = "frontend/public/samples/sample-fleet-duty-ILLUSTRATIVE.csv"
rng = random.Random(7)
PACK, KWH_KM, POWER = 350.0, 1.2, 105.0


def hhmm(h):
    h %= 24
    return f"{int(h):02d}:{int(round((h - int(h)) * 60)) % 60:02d}"


rows, day = [], dt.date(2025, 1, 6)
for _ in range(100):
    day += dt.timedelta(days=1)
    if day.weekday() == 6 and rng.random() < 0.85:
        continue                                              # most Sundays off
    km = max(60.0, rng.gauss(198 if day.weekday() < 5 else 150, 16))
    end_soc = min(100.0, max(80.0, rng.gauss(98, 2.5)))
    use = km * KWH_KM
    arrival = max(8.0, end_soc - 100 * use / PACK + rng.gauss(0, 1.5))
    kwh = PACK * (end_soc - arrival) / 100
    start = 22 + abs(rng.gauss(0.6, 0.7))
    end = start + kwh / (POWER * rng.uniform(0.9, 1.05))
    dep = 5 + rng.gauss(0.2, 0.25)
    rows.append([day.isoformat(), f"{km:.1f}", f"{arrival:.0f}", f"{end_soc:.0f}", hhmm(start), hhmm(end), f"{kwh * rng.uniform(1.03, 1.07):.1f}", hhmm(dep)])
with open(OUT, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["date", "km", "arrival_soc_pct", "end_soc_pct", "charge_start", "charge_end", "charge_kwh", "departure"])
    w.writerows(rows)
print(len(rows), "rows ->", OUT)
