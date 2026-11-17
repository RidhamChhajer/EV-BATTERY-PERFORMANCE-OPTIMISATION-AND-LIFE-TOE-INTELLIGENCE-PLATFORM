"""Reference data served by GET endpoints. Everything is read from repo files (archetypes, weather, provenance, metrics):
no number in these responses is typed by hand."""
from __future__ import annotations

import json
import os

from engine.bus.scenario import Scenario
from engine.cell.uncertainty import Models
from engine.labels import L

PROV_DIR = "engine/data/provenance"
ZONES_PATH = "engine/data/zones.json"
ARCH_PATH = "engine/bus/archetypes.json"

UNITS = {"pack_kwh": "kWh", "kwh_per_km": "kWh/km", "km_per_day": "km/day", "charge_power_kw": "kW", "operating_days_per_year": "days/year"}
USED_FOR = {
    "hust": "Our own fit (retained in the code, not shown): cycling ageing and early-life cycle-life predictor on LFP cells",
    "stanford_calendar": "Our own fit (retained in the code, not shown): calendar ageing on LFP cells",
    "naumann_calendar": "Our own fit (retained in the code, not shown): calendar ageing on LFP cells. The same Naumann tests underlie the NREL 3 Ah model",
    "weather": "Monthly air temperature for the four climate zones (measured/reanalysis, not battery temperature)",
    "evbattery": "Method demonstration for the future Calibrated mode only (not LFP, not used in the Prior)",
}
LIMITATIONS = [
    "No public LFP bus-pack data exists: nothing in this tool has been validated on buses.",
    "Both ageing models are NREL fits to laboratory tests on one cell design each. Neither has been checked against a battery pack in service.",
    "Both cells were cycled at 80 to 100 % depth of discharge. A bus using about 70 % a day is outside that range, so the cycling term is extrapolated.",
    "The two models differ by roughly 2 to 3 times on calendar ageing. The range shown is that disagreement plus assumed cell-to-cell scatter, not a statistical confidence interval.",
    "The weakest-cell pack penalty (20 to 30 % earlier end of life) follows NREL's rule of thumb. It is an assumption, not data.",
    "Neither model represents a sudden late-life knee: capacity loss never accelerates sharply, so timing near the end of life is likely optimistic.",
    "Cell temperature is air temperature plus an assumed heat rise. Charge power only acts through time spent full; HVAC load and seasonal energy use are not modelled.",
    "BMS-reported state of health is never treated as ground truth, and vendor data may only calibrate.",
]


def _load(path: str):
    with open(path) as f:
        return json.load(f)


def presets() -> list[dict]:
    arch = _load(ARCH_PATH)
    out = []
    for pid, a in arch["archetypes"].items():
        fields = {}
        for k, unit in UNITS.items():
            v = a[k]
            fields[k] = {"value": L(float(v["value"]), unit, v["evidence_level"], v["source"]),
                         "range": L([float(x) for x in v["range"]], unit, "assumption", "plausible design range") if "range" in v else None}
        out.append({"id": pid, "label": a["label"], "fields": fields,
                    "scenario": Scenario.from_preset(pid).model_dump()})
    return out


def presets_json() -> list[dict]:
    return [{**p, "fields": {k: {kk: (vv.model_dump() if vv is not None else None) for kk, vv in f.items()}
                             for k, f in p["fields"].items()}} for p in presets()]


def reference_engine(artifact_dir: str = "engine/artifacts") -> dict:
    """What the app's ageing numbers come from. Everything is read from the engine, so it cannot drift from the code."""
    from engine.reference import blast_lfp as B
    from engine.reference.simulate import PENALTY_STEPS, SCALAR_STD, SCALAR_Z
    structure = {
        "lfp250": ("Loss grows with time to the power 0.526 (calendar) and with equivalent full cycles to the power 0.828 (cycling): both sublinear, "
                   "so the curve falls early and then flattens."),
        "lfpsony": ("Calendar loss is a saturating sigmoid in time. Cycling loss grows as (rate x cycles) to the power 1.13, slightly faster than linear. "
                    "A break-in term acts only above 3 full cycles a day, so it is inactive for buses."),
    }
    models = [{"id": m.key, "label": m.label, "package_class": m.package_class, "nominal_ah": m.nominal_ah, "n_parameters": len(m.params),
               "structure": structure[m.key], "data": m.data_note, "data_sources": list(m.data_sources),
               "tested_range": {"cycling_temperature_c": list(m.cycling_temperature_c), "depth_of_discharge": list(m.dod),
                                "max_charge_c_rate": m.max_rate_charge, "max_discharge_c_rate": m.max_rate_discharge}} for m in B.MODELS.values()]
    check = f"{artifact_dir}/reference_port_check.json"
    return {"name": "NREL BLAST-Lite LFP models", "version": B.SOURCE_VERSION, "source_url": B.SOURCE_URL,
            "licence": "BSD-3-Clause, notice kept in engine/reference/NOTICE", "models": models,
            "ensemble": {"models": len(models), "degradation_scalars": len(SCALAR_Z), "pack_penalty_values": PENALTY_STEPS,
                         "runs_per_scenario": len(models) * len(SCALAR_Z) * PENALTY_STEPS, "degradation_scalar_std": SCALAR_STD,
                         "scalar_note": "This is the default spread in BLAST-Lite's own distribution helper, a convention and not a measured uncertainty.",
                         "pack_penalty_note": "Applied as time compression: pack capacity at time t equals cell capacity at t / (1 - penalty)."},
            "port_check": _load(check) if os.path.exists(check) else None}


def zones() -> dict:
    z = _load(ZONES_PATH)
    prov = _load(f"{PROV_DIR}/weather.json")
    return {"data_kind": "measured_weather", "note": z["note"], "period": z["period"],
            "units": {"tmean_c": "C", "tmax_mean_c": "C", "tmin_mean_c": "C", "tmax_p95_c": "C", "diurnal_range_c": "C",
                      "elevation_m": "m", "n_days": "days"},
            "provenance": {k: prov[k] for k in ("source_url", "licence", "attribution", "limitations", "period", "synthetic")},
            "zones": [{"id": k, **v} for k, v in z["zones"].items()]}


def evidence(artifact_dir: str, versions: dict, model_version: str, models: Models) -> dict:
    datasets = []
    for fn in sorted(os.listdir(PROV_DIR)):
        if fn.endswith(".json"):
            did = fn[:-5]
            datasets.append({"id": did, "used_for": USED_FOR.get(did, ""), **_load(f"{PROV_DIR}/{fn}")})
    c = models.cyc
    ref = reference_engine(artifact_dir)
    # metrics, uncertainty and training_coverage describe our own fit, which is kept in the code but is not what the app shows.
    return {"mode": "prior", "engine": models.engine, "validated_on_buses": False, "model_version": model_version, "artifacts": versions,
            "reference_engine": ref, "datasets": datasets, "metrics": _load(f"{artifact_dir}/metrics.json"),
            "uncertainty": _load(f"{artifact_dir}/uncertainty.json"),
            "training_coverage": {"cycling_temperature_c": list(c.valid_temp_c), "cycling_c_rate": list(c.valid_c_rate),
                                  "cycling_efc_max": c.valid_efc_max},
            "limitations": LIMITATIONS}
