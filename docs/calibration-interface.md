# Calibration interface (Calibrated mode, method demonstration)

**Status.** A working method, proven on public field data, deliberately not wired into the app. Prior mode, which the app
uses, needs no vendor data. **Caveat that goes with every number from this page:** the demonstration data (EVBattery) are
NMC-like cells, not LFP, and their capacity labels were derived by the dataset authors. The errors below are agreement
with those labels, not accuracy against measured ground truth, and say nothing yet about LFP buses.

## What it does

`engine/calibrate/` adjusts a fleet-level capacity model with a vendor's labelled records for each of their vehicles.

```
capacity = fleet_model(mileage, snippet features) + b_vehicle,    b_vehicle ~ N(0, tau^2)
b_vehicle = n tau^2 / (n tau^2 + sigma^2) * mean(residual over the vehicle's n labelled rows)
```

- `fleet_model`: gradient-boosted regressor (`engine/calibrate/model.py: fit_prior`).
- `tau^2` (between vehicles) and `sigma^2` (within a vehicle) come from a mixed model with a vehicle random intercept
  (statsmodels), fitted on **cross-fitted** residuals. A boosted model's residuals on its own training vehicles are far too
  small, so an inner vehicle-grouped cross-fit supplies them.
- With zero labels the prior is returned unchanged. With a few, the correction is shrunk toward the prior. With many, it
  approaches the vehicle's own average miss.

```python
from engine.calibrate.model import fit_prior, calibrate
prior = fit_prior(public_frame)                 # labelled rows from many vehicles
cal = calibrate(prior, vendor_frame)            # vendor rows; unlabelled rows are allowed
cal.predict(frame)                              # prior_ah, offset_ah, calibrated_ah per usable row
cal.warnings                                    # e.g. vehicles with fewer than 5 labelled rows
```

## Vendor file contract

One row per charging snippet. Capacity in **ampere-hours**. A missing or non-positive `capacity` marks an unlabelled row.

| Column | Meaning | Unit |
|---|---|---|
| `vehicle` | vehicle identifier (any string) | – |
| `mileage` | odometer at the snippet | km |
| `dsoc`, `soc0` | state-of-charge span and start | % |
| `vmean`, `v0`, `v1` | mean, first and last cell voltage | V |
| `imean` | mean current (negative while charging) | A |
| `dvm`, `dvx` | mean and maximum cell-voltage spread | V |
| `tmean`, `tspan` | mean temperature and spread | °C |
| `ah` | charge moved during the snippet | Ah |
| `capacity` | vendor's capacity label (optional per row) | Ah |

Rows with a state-of-charge span under 5 points or non-finite features are dropped, because they cannot support a
capacity estimate. The loader refuses a file with a missing column (the message names it), an empty `vehicle`, or
capacity that looks like mAh (median above 1000). An empty file, or one with no labelled rows, returns the prior
unchanged with a warning.

## Evidence (written to `engine/artifacts/metrics.json` as `calibration_demo`)

Run: `python -m engine.train.fit_calibration_demo` (also part of `scripts/train_all.sh`, about 2.5 minutes).

Protocol: vehicle-grouped 5-fold cross-validation, so a vehicle is never on both sides of the split (asserted in the
script). For each held-out vehicle, 100 rows are the fixed evaluation set and the vendor's `k` labelled rows are drawn from
its other rows, three random draws. 141 vehicles with at least 200 usable rows are evaluated.

| Labelled rows for the vehicle | Prior only | Plain average | Shrunk toward prior |
|---|---|---|---|
| 0 | 2.19 % | – | – |
| 5 | 2.19 % | 1.57 % | 1.55 % |
| 20 | 2.19 % | 1.45 % | 1.44 % |
| 100 | 2.19 % | 1.42 % | 1.41 % |

Honest reading:

- Vendor labels help a lot even at `k = 5` (2.19 % to 1.55 %), but not for everyone: the calibrated error was no worse
  for 75 % of vehicles at `k = 5` (84 % at 20, 88 % at 100).
- Shrinkage toward the prior helps only slightly on average here (1.55 % against 1.57 % at `k = 5`). Its real job is to
  limit damage from a few noisy labels; this dataset is not noisy enough to show a large gain.
- Mileage alone is already a strong prior (2.49 % without snippet features), as Phase 0 found.
- Snippet-level labels within a vehicle are correlated, so the three draws per vehicle are not independent trials.

## Deviation from the playbook

The playbook (M7.2) asked for `notebooks/calibration_demo.ipynb`. Jupyter is not installed in the project environment, so
the same experiment is a script (`engine/train/fit_calibration_demo.py`) whose results the Evidence page reads from the API.
A notebook can be added later without changing anything else.
