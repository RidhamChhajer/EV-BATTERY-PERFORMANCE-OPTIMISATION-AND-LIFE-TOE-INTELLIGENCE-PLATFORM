"""Independent cross-check of the Pack Horizon cell model against NREL's BLAST-Lite LFP model.

Runs the SAME bus duty (energy per day, charge power, charge window, SOC window, monthly climate + heat rise) through
  * our engine (calendar + cycle ageing fitted to public lab data, with its uncertainty band), and
  * BLAST-Lite's Lfp_Gr_250AhPrismatic (a different public model, fitted by NREL to a different LFP cell),
and writes the comparison to engine/artifacts/crosscheck_blast.json, which /api/v1/evidence serves.

BLAST-Lite is not an app dependency. It needs Python 3.9-3.12, so it is installed in a throw-away environment:

    python3.11 -m venv /tmp/blast-venv && /tmp/blast-venv/bin/pip install blast-lite
    .venv/bin/python scripts/crosscheck_blast.py --blast-python /tmp/blast-venv/bin/python

This is a consistency check between two lab-data models. It is NOT validation on buses.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from engine.bus.scenario import Scenario  # noqa: E402
from engine.bus.translate import translate  # noqa: E402
from engine.cell.uncertainty import load_models, make_draws, simulate_loss  # noqa: E402
from engine.decide.replacement import simulate_scenario  # noqa: E402

OUT = ROOT / "engine" / "artifacts" / "crosscheck_blast.json"
ZONES = json.load(open(ROOT / "engine" / "data" / "zones.json"))["zones"]
HORIZON = 15
THRESHOLD = 0.8

# (id, label, preset, overrides)
CASES = [
    *[(f"{a}_{z}", f"{a} · {z.replace('_', '-')}", a, {"zone": z}) for a in ("12m", "9m") for z in ("hot_dry", "hot_humid", "composite", "cool")],
    ("12m_hot_dry_stop80", "12 m · hot-dry · stop charging at 80 %", "12m", {"zone": "hot_dry", "soc_max_pct": 80.0}),
    ("12m_hot_dry_hotpack", "12 m · hot-dry · pack runs 8 °C above air", "12m", {"zone": "hot_dry", "heat_rise_c": 8.0}),
]


def blast_case(cid: str, s: Scenario) -> dict:
    c = translate(s)
    E = s.km_per_day * s.kwh_per_km
    return {"id": cid, "departure_hour": s.departure_hour, "charge_start_hour": s.charge_start_hour,
            "soc_max": s.soc_max_pct / 100.0, "soc_end": max(s.soc_max_pct - 100.0 * E / s.pack_kwh, s.soc_min_pct) / 100.0,
            "charge_h": c.charge_hours.value, "operating_days": s.operating_days_per_year, "heat_rise_c": s.heat_rise_c,
            "monthly": ZONES[s.zone]["monthly"], "horizon_years": HORIZON}


def single_condition_checks(blast_rows: list[dict], models, draws) -> list[dict]:
    """Same fixed condition in both models, bypassing the duty translation. Ours = median over the uncertainty draws."""
    out = []
    med = lambda m, i: float(np.median(m[:, i]))
    for temp in (25.0, 35.0):
        for soc in (100.0, 50.0):
            t = np.array([365.0, 5 * 365.0])
            r = simulate_loss(t, np.zeros(2), temp, soc, 0.1, models, draws)
            row = {"kind": "storage", "label": f"Storage at {temp:.0f} °C, {soc:.0f} % SOC", "temp_c": temp, "soc_pct": soc,
                   "ours": {"loss_1y": round(med(r["total"], 0), 4), "loss_5y": round(med(r["total"], 1), 4)}}
            for b in blast_rows:
                if b["kind"] == "storage" and b["temp_c"] == temp and b["soc_pct"] == soc:
                    row["blast_250ah" if b["model"] == "q" else "blast_sony_3ah"] = {"loss_1y": b["loss_1y"], "loss_5y": b["loss_5y"]}
            out.append(row)
    for c_rate in (1.0, 0.25):
        efc = np.array([1000.0, 3000.0])
        t = efc * 2.0 / c_rate / 24.0
        r = simulate_loss(t, efc, 25.0, 50.0, c_rate, models, draws)
        row = {"kind": "cycling", "label": f"Full-depth cycling at 25 °C, {c_rate:g} C", "temp_c": 25.0, "c_rate": c_rate,
               "ours": {"loss_1000efc": round(med(r["total"], 0), 4), "loss_3000efc": round(med(r["total"], 1), 4)},
               "ours_extrapolated": bool(r["extrapolated"])}
        for b in blast_rows:
            if b["kind"] == "cycling" and b["c_rate"] == c_rate:
                row["blast_250ah" if b["model"] == "q" else "blast_sony_3ah"] = {"loss_1000efc": b["loss_1000efc"], "loss_3000efc": b["loss_3000efc"]}
        out.append(row)
    return out


def years_to(retention: np.ndarray, months: np.ndarray, level: float) -> float | None:
    below = np.where(retention <= level)[0]
    if len(below) == 0:
        return None
    i = below[0]
    if i == 0:
        return 0.0
    r0, r1 = retention[i - 1], retention[i]
    return float((months[i - 1] + (r0 - level) / (r0 - r1) * (months[i] - months[i - 1])) / 12.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--blast-python", required=True, help="python with blast-lite installed (3.9-3.12)")
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()

    scenarios = {cid: Scenario.from_preset(preset, **ov) for cid, _, preset, ov in CASES}
    proc = subprocess.run([a.blast_python, str(ROOT / "scripts" / "blast_runner.py")],
                          input=json.dumps([blast_case(k, v) for k, v in scenarios.items()]),
                          capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        return proc.returncode
    blast = {r["id"]: r for r in json.loads(proc.stdout)}
    version = subprocess.run([a.blast_python, "-c", "import importlib.metadata as m;print(m.version('BLAST-Lite'))"],
                             capture_output=True, text=True).stdout.strip()

    models = load_models()
    draws = make_draws(2000, models, 0)
    chk = subprocess.run([a.blast_python, str(ROOT / "scripts" / "blast_runner.py"), "checks"], capture_output=True, text=True)
    if chk.returncode != 0:
        print(chk.stderr, file=sys.stderr)
        return chk.returncode
    checks = single_condition_checks(json.loads(chk.stdout), models, draws)
    yearly = list(range(HORIZON + 1))
    results = []
    for cid, label, preset, ov in CASES:
        s = scenarios[cid]
        sim = simulate_scenario(s, models, draws)                                     # default pack penalty 0-8 %
        cell = simulate_scenario(s.model_copy(update={"pack_penalty_min": 0.0, "pack_penalty_max": 0.0}), models, draws)
        months = sim.months
        p10, p50, p90 = np.percentile(sim.retention, [10, 50, 90], axis=0)
        c50 = np.percentile(cell.retention, 50, axis=0)
        bq = np.asarray(blast[cid]["q"])
        bq2 = np.asarray(blast[cid]["q_alt"])
        idx = [y * 12 for y in yearly]
        inside = [bool(p10[i] - 1e-9 <= bq[i] <= p90[i] + 1e-9) for i in idx[1:]]
        results.append({
            "id": cid, "label": label, "archetype": preset, "zone": s.zone,
            "inputs": {"km_per_day": s.km_per_day, "kwh_per_km": s.kwh_per_km, "pack_kwh": s.pack_kwh,
                       "charge_power_kw": s.charge_power_kw, "soc_max_pct": s.soc_max_pct, "heat_rise_c": s.heat_rise_c,
                       "operating_days_per_year": s.operating_days_per_year},
            "efc_per_year": {"ours": round(translate(s).efc_per_year.value, 1), "blast": round(blast[cid]["efc_per_year"], 1)},
            "c_rate_eff": round(translate(s).c_rate_eff.value, 2),
            "daily_swing_pct": round(blast[cid]["daily_swing_pct"], 1),
            "years": yearly,
            "ours_p10": [round(float(p10[i]), 4) for i in idx], "ours_p50": [round(float(p50[i]), 4) for i in idx],
            "ours_p90": [round(float(p90[i]), 4) for i in idx], "ours_cell_p50": [round(float(c50[i]), 4) for i in idx],
            "blast": [round(float(bq[i]), 4) for i in idx], "blast_alt": [round(float(bq2[i]), 4) for i in idx],
            "loss_split": {"ours": {f"{y}y": {"calendar_loss": round(float(np.median(cell.cal_loss[:, y * 12])), 4),
                                               "cycle_loss": round(float(np.median(cell.cyc_loss[:, y * 12])), 4)} for y in (5, 10)},
                           "blast_250ah": blast[cid]["q_split"], "blast_sony_3ah": blast[cid]["q_alt_split"]},
            "years_to_80": {"ours_p50": years_to(p50, months, THRESHOLD), "ours_cell_p50": years_to(c50, months, THRESHOLD),
                            "blast": years_to(bq, months, THRESHOLD),
                            "blast_alt": years_to(bq2, months, THRESHOLD)},
            "blast_inside_band": inside, "blast_inside_band_share": round(float(np.mean(inside)), 2),
            "gap_pts_at_10y": round(float((bq[120] - c50[120]) * 100.0), 1),
        })

    by = {r["id"]: r for r in results}
    base = by["12m_hot_dry"]
    i10 = 10   # index of year 10 in the yearly series
    rng = lambda xs: [round(min(xs), 3), round(max(xs), 3)]
    life = lambda key: [r["years_to_80"][key] for r in results]
    summary = {
        "n_scenarios": len(results),
        "retention_at_10y": {"ours_cell_p50": rng([r["ours_cell_p50"][i10] for r in results]),
                             "blast_250ah": rng([r["blast"][i10] for r in results]),
                             "blast_sony_3ah": rng([r["blast_alt"][i10] for r in results])},
        "years_to_80": {"ours_cell_p50": rng(life("ours_cell_p50")),
                        "blast_250ah_reaches_80_within_horizon": sum(v is not None for v in life("blast")),
                        "blast_sony_3ah_reaches_80_within_horizon": sum(v is not None for v in life("blast_alt"))},
        "blast_inside_our_band_share": round(float(np.mean([r["blast_inside_band_share"] for r in results])), 2),
        "ours_is_lower_in_all_scenarios": all(r["ours_cell_p50"][i10] < min(r["blast"][i10], r["blast_alt"][i10]) for r in results),
    }
    levers = []
    for cid in ("12m_hot_dry_stop80", "12m_hot_dry_hotpack"):
        r = by[cid]
        levers.append({"id": cid, "label": r["label"],
                       "ours_cell_change_pts_at_10y": round((r["ours_cell_p50"][i10] - base["ours_cell_p50"][i10]) * 100, 1),
                       "blast_250ah_change_pts_at_10y": round((r["blast"][i10] - base["blast"][i10]) * 100, 1),
                       "blast_sony_change_pts_at_10y": round((r["blast_alt"][i10] - base["blast_alt"][i10]) * 100, 1)})
    summary["levers"] = levers
    summary["same_direction_of_levers"] = all(
        np.sign(l["ours_cell_change_pts_at_10y"]) == np.sign(l["blast_250ah_change_pts_at_10y"]) == np.sign(l["blast_sony_change_pts_at_10y"]) for l in levers)

    doc = {
        "generated": date.today().isoformat(),
        "what": "Our cell model vs NREL BLAST-Lite (Lfp_Gr_250AhPrismatic) on identical bus duty cycles and climate.",
        "blast_lite": {"version": version, "python": "3.11", "model": "Lfp_Gr_250AhPrismatic (main), Lfp_Gr_SonyMurata3Ah_Battery (second opinion)", "source_url": "https://github.com/NREL/BLAST-Lite",
                       "kind": "cell-level empirical degradation model fitted by NREL to lab data on a different LFP/graphite cell"},
        "threshold": THRESHOLD, "horizon_years": HORIZON,
        "method": [
            "Same inputs for both models: energy per day, pack size, charge power, charge start and departure hour, SOC window, monthly air temperature plus an assumed heat rise, operating days.",
            "BLAST-Lite gets an hourly SOC and temperature series (drain over the duty window, constant-power charge, rest full) tiled over the horizon; ours uses its translated cell conditions.",
            "'Ours (cell)' sets the pack penalty to zero so it is comparable to a cell model; 'Ours (with pack penalty)' is what the app shows by default (0-8 % earlier end of life, an assumption).",
        ],
        "caveats": [
            "Both models are fitted to public lab data on different cells. Agreement shows consistency, not truth; disagreement shows model risk. Neither is validated on buses.",
            "BLAST-Lite documents its LFP model as fitted to low-rate data and 10-45 °C and says to treat results qualitatively; it also suggests pack life can be 20-30 % shorter than cell life.",
            "BLAST-Lite is a cell model: it has no pack-level or weakest-cell effect and no resistance output.",
            "Run offline in a separate environment (Python 3.11); BLAST-Lite is not an app dependency. Licence is listed as BSD-3-Clause on GitHub and Apache-2.0 on PyPI, so it is used here only as an external comparison and none of its code or parameters are shipped.",
        ],
        "summary": summary, "single_condition_checks": checks, "scenarios": results,
    }
    Path(a.out).write_text(json.dumps(doc, indent=1) + "\n")
    print(json.dumps(summary, indent=1))
    for r in results:
        y = r["years_to_80"]
        f = lambda v: "  >15" if v is None else f"{v:5.1f}"
        print(f"{r['id']:22s} 80% at: ours cell {f(y['ours_cell_p50'])} | blast250 {f(y['blast'])} | sony {f(y['blast_alt'])} | 10y ours/b250/sony {r['ours_cell_p50'][10]:.2f}/{r['blast'][10]:.2f}/{r['blast_alt'][10]:.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
