# Current-data reliability review

The selected final laboratory model is `ridge` with `{'alpha': 10.0}`, using `combined` features. It was fitted on 5,210 supported sessions from all six available ageing cells. The scaler and estimator use equal total sample weight per battery.

## What was fixed

Short top-up sessions sometimes start with the cell already largely charged. Whole-session average voltage/current and charge duration can then resemble a degraded battery despite a valid later discharge-capacity label. Valid labels were retained; unsupported inputs now produce an explicit no-estimate result. Current-charge inputs must cover the measured 4.0–4.1 V constant-current window with adequate sampling and finish the CV taper. Ratios compare charge counter increments with the cell's initial charging profile, avoiding sample-mean bias for those features. The starting voltage helps describe partial charging. No current discharge capacity or future health is an input.

The voltage-window-only candidate was worse than the existing regression; it was not automatically promoted. Inner battery CV chooses among session, window and combined features with Ridge alpha 1/10 or a restricted forest. Outer held-battery outcomes evaluate this selection procedure. Final all-data settings are chosen separately using all six development cells. The report does not treat all-data fitting error as predictive performance.

## Error and coverage

| Method | Sessions | MAE (pp) | RMSE (pp) | Worst error (pp) | Errors >10 pp |
|---|---:|---:|---:|---:|---:|
| Previous model | 4412 | 1.395 | 1.912 | 35.92 | 9 |
| Updated model | 4412 | 1.017 | 1.575 | 33.86 | 8 |
| Previous measured SOH | 4412 | 0.320 | 0.539 | 4.85 | 0 |

These rows use exactly the same 4,412 sessions after both charging checks and each outer fold's fitted feature-range checks. The updated MAE is 27.1% lower on this cohort. The original unguarded recipe's full-cohort results remain in `metrics.csv`; they include unsupported sessions and must not be called a same-cohort comparison.

Charge-profile coverage is 96.7% (5,210/5,387). Outer-fold runtime coverage is 81.9% (4,412/5,387); the remaining cases receive no estimate. Coverage depends on the fitted training ranges and will differ on new data. All abstention reasons are recorded in `runtime_coverage.csv`. Errors by health range are in `runtime_by_health_range.csv`, including empty groups. This is regression: uneven battery/health coverage matters more than classification class balancing. Rows from the same battery are never randomly split across fitting and validation.

## How to use the final model

Use `models/reliable/soh_guarded.joblib` through `scripts/predict_soh.py`, which checks the raw charging measurements and age inputs before prediction. Supply one chronological, completed charge with the processed sensor column names, recorded cycle number and elapsed days. The selected combined/window model also needs an initial charge CSV from the same cell. Do not use another cell's calibration. Prediction occurs before the current discharge capacity is measured. The target is SOH relative to the first recorded full-cycle capacity, which may already reflect ageing.

Example PowerShell command (replace input filenames and age with your actual measurements):

```powershell
.\.venv\Scripts\python.exe scripts\predict_soh.py current_charge.csv --cycle 200 --elapsed-days 60 --protocol CALCE_CS2 --reference initial_charge.csv
```

When a previous capacity measurement exists, carrying its SOH forward remains more accurate in this dataset. That is a historical estimate, not a new sensor diagnosis. The existing `models/final/with_history_rule.json` explicitly describes this rule. `soh_charge_window.joblib` is the earlier experimental candidate; use `soh_guarded.joblib` for the current selected estimator.

## Remaining limits

All six cells, including the old test cell, have already been inspected. These numbers are nested development cross-validation, not a new untouched final test; feature investigation used these data and can make the numbers optimistic. A new independent battery dataset is needed to quantify generalisation. Large errors still occur; the charging/range guards do not guarantee accurate in-range estimates. No confidence interval or EV deployment claim is justified.

Only six LCO laboratory cells support the SOH model. Chemistry, temperature and real pack/driving coverage have not been added by cleaning. Initial calibration, completed charging and the source protocol remain necessary. This work does not train RUL or validate a charging optimiser. Raw data, original targets and the previous frozen evaluation remain intact.

## Verification and rebuilding

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe scripts\improve_soh.py
```

The first command checks timing, invalid inputs, incomplete/top-up profiles, sampling resolution, cumulative-counter resets, calibration, metrics and battery weighting. Fitting verifies saved-model prediction round trips. The report script uses matplotlib from the full processing environment; training requires only the existing training dependencies.
