"""Stores the EVBattery capacity-estimation baseline (Phase 0 section 3.2) in metrics.json for the /evidence endpoint.

Method demonstration for the future Calibrated mode only: EVBattery is NMC-like, not LFP, and its capacity labels are
derived by the dataset authors, so this error is agreement with their label, not accuracy against ground truth.
"""
from engine.train import metrics_store
from engine.train.phase0_baselines import evb_capacity_baseline

if __name__ == "__main__":
    r = evb_capacity_baseline()
    out = {"mileage_only": r["mileage only"], "snippet_features": r["segment feats"],
           "split": "5-fold, vehicles never shared between train and test",
           "chemistry": "not LFP (cell voltage reaches 4.29 V); method demonstration only",
           "caveat": "Error against the dataset's own derived capacity label, not against measured ground truth."}
    metrics_store.update("evbattery_capacity", out)
    print(out["mileage_only"], out["snippet_features"])
