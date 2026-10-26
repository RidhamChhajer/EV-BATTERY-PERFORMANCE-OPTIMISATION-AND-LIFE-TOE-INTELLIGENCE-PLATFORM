# Training reference

All model components are implemented: SOH, RUL, charging, lab/vehicle SOC, initialised SOC tracking and driving-energy forecasts with conditional range. Use `BACKEND.md` for run/rebuild commands and `MODEL_INVENTORY.md` for choices, errors and assumptions. The full sequential rebuild is `scripts/build_project.py --rebuild`; without that flag it verifies existing artifacts and APIs. Candidate configurations are explicit in their training scripts; telemetry selections are frozen in report `selection.json` files before opening held-out data.

The remainder documents the user's original SOH candidate run and frozen test evaluation (`reports/evaluation/review.md`). It does not constitute a new independent evaluation. CS2_38 is a consumed holdout; subsequent current-data development is labelled accordingly.

## Configuration timing

Initial configuration happens before training. Edit `config/soh_training.json` when a model setting needs to change. For the first run, keep these defaults:

| Setting | Initial value | Purpose |
|---|---:|---|
| `ridge.alpha` | 1.0 | Regularization for linear regression |
| `random_forest.n_estimators` | 100 | Number of trees |
| `random_forest.max_depth` | 6 | Bound tree complexity |
| `random_forest.min_samples_leaf` | 20 | Avoid leaves fitted to very few cycles |
| `random_state` | 42 | Reproducible forest randomness |

These are starting settings, not optimal values or guarantees against overfitting. Step 5 uses validation results to decide whether tuning is justified. Keep final test outcomes out of configuration and model selection.

Input lists come from the reviewed `reports/pretraining/feature_contract.json`. Battery membership comes from `data/processed/life_prediction/splits.csv`. Neither is randomly reshuffled by training. Dataset paths and output locations are defined in the training script.

## One-time environment setup

Use your installed Python 3.10.11 to create the environment. Dependencies are pinned to Python 3.10-compatible versions. Activation is not needed.

```powershell
Set-Location 'C:\Users\Lenovo\Documents\EV BATTERY PROJECT'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Preparation, training, inference and verification share the pinned Python 3.10-compatible environment in `requirements.txt`. All scripts use packages installed in the virtual environment; they do not inject the old bundled Python dependencies. Active models were rebuilt with scikit-learn 1.7.2. Original Python 3.12 models and reports are preserved in `models/backups/python312_original.zip` and require their original package versions when loaded.

## Current reliability revision

The original candidate training and one-time frozen evaluation have already completed. The current selected artifact is `models/reliable/soh_guarded.joblib`, fitted on all six available cells after charging-profile checks. Its settings are Ridge alpha 10 with combined session, initial-profile window ratios and charge-start voltage. The same cell's initial calibration is required. Details, development error, abstention coverage and remaining failures: `reports/reliability/review.md`.

Rebuild and verify the current version:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe scripts\improve_soh.py
.\.venv\Scripts\python.exe scripts\check_reliable_model.py
.\.venv\Scripts\python.exe scripts\report_reliability.py
```

These commands overwrite only the current reliability-derived tables/model/reports. Previous training runs and the frozen first evaluation remain intact. Candidate selection uses inner battery CV, with outer held batteries for development assessment; preprocessing and equal battery weights are fitted within each training fold. Since all six batteries were already inspected, this is not a new untouched final test. `--reuse-profiles` skips deterministic sensor extraction when its inputs and extraction code have not changed.

## Original candidate training

```powershell
.\.venv\Scripts\python.exe scripts\train_soh.py
```

This one command computes the persistence baseline and trains Ridge regression plus a small random forest for each of two input scenarios:

- `with_history`: recorded operating age, last measured SOH, age of that capacity measurement, and current charging-session features.
- `without_history`: recorded operating age and current charging-session features. It needs no previous capacity value as an input, but still requires the recorded history and completed charging session defined in the feature contract.

Four models are fitted. The persistence baseline is a direct previous-SOH prediction and does not need fitting. It applies to the historical-input scenario. All candidates use the same accepted data cohort for a fair comparison.

Only four training batteries are fitted. Scaling for Ridge is learned on training data only. Each training battery has equal total sample weight, including during scaling. The validation battery is used for provisional comparison; it is never used in fitting. The reserved test battery's numerical features and targets are skipped before parsing. Predictions are not clipped to hide out-of-range outputs.

## Outputs

Each run creates new timestamped directories, preserving earlier runs:

```text
models/training_runs/<run_id>/
  ridge_with_history.joblib
  random_forest_with_history.joblib
  ridge_without_history.joblib
  random_forest_without_history.joblib

reports/training/<run_id>/
  summary.md                 Training/validation comparison table
  metrics.csv                MAE, RMSE, bias, R2 and average per-battery MAE
  by_cell.csv                Errors for each battery
  by_health_range.csv        Errors by target-health range; absent ranges have blank metrics
  predictions.csv            Training/validation predictions and errors
  configuration.json         Exact settings used for this run
  feature_contract.json      Input/timing contract snapshot
  run.json                   Completion marker, source checksum, versions and model paths
```

An output directory without a `run.json` reporting `status: complete` represents an interrupted/incomplete run. No final model is selected automatically. The saved joblib files contain the fitted estimator/pipeline, ordered feature list and model metadata for later prediction code.

MAE and RMSE are in SOH percentage points. R2 is unavailable when a group has constant targets. A health range with no observations has `n=0` and blank errors, not zero error. These are development comparisons: they do not replace the final reserved-test evaluation in step 5.

After training, inspect `reports/training/<run_id>/summary.md`. In step 5 we review the baseline, training/validation differences, health-range coverage and the inputs your eventual frontend can actually provide. Then we select a final model and evaluate it on the reserved test battery. Historical-input models require past capacity measurements; choosing only the smallest error without checking that requirement would be misleading.

Optional checks that fit no models:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_train_soh.py
```

Five checks cover configuration validation, metrics, equal battery weighting, feature-leakage rejection, and refusing to parse test outcomes/split mismatches. Estimator fitting and serialization were exercised by the user's training run and subsequent evaluation. A saved-model round-trip check confirmed that the selected artifact reproduces the saved predictions.

Model documentation: [Ridge](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html), [RandomForestRegressor](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestRegressor.html), [StandardScaler](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html). Package version: [scikit-learn 1.9.1](https://pypi.org/project/scikit-learn/1.9.1/).
