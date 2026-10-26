# EV Battery Performance Optimisation and Life Intelligence Platform

An end-to-end battery research application with trained machine-learning models, a local prediction API, and the Cellwise web interface. It estimates battery health, remaining recorded life, state of charge, driving-energy consumption and conditional range, and compares tested charging policies.

The application runs from saved models. Retraining and the full datasets are not required for a demonstration.

## Features

- **Vehicle analysis:** SOC, next-minute energy, next-kilometre consumption and conditional range from recorded telemetry.
- **Battery health and life:** SOH from a completed charging profile and same-cell reference; remaining recorded cycles from health history.
- **State of charge:** laboratory estimation, vehicle sensor-only estimation, and current tracking from a known starting SOC.
- **Charging optimisation:** constrained ranking of nine tested LFP charging protocols using measured lifetimes or model predictions.
- **Interactive frontend:** recorded examples, telemetry charts, editable parameters, JSON/CSV input, exports and model evidence.

## Quick start

Clone the repository, then enter its directory:

```powershell
git lfs install
git clone https://github.com/RidhamChhajer/EV-BATTERY-PERFORMANCE-OPTIMISATION-AND-LIFE-TOE-INTELLIGENCE-PLATFORM.git
Set-Location EV-BATTERY-PERFORMANCE-OPTIMISATION-AND-LIFE-TOE-INTELLIGENCE-PLATFORM
```

Use **Python 3.10**. The saved models were rebuilt with Python 3.10.11 and scikit-learn 1.7.2. Run the following commands in PowerShell from the project directory.

If the existing `.venv` is available, skip environment creation and installation.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Start the backend:

```powershell
.\.venv\Scripts\python.exe backend\server.py
```

In a second terminal, start the frontend:

```powershell
.\.venv\Scripts\python.exe frontend\serve.py
```

Open **http://127.0.0.1:5173/**. The API runs at **http://127.0.0.1:8000**; `/health` reports model-load status. Stop each server with `Ctrl+C`. Node.js is needed only for frontend development checks; the interface itself uses HTML, CSS and JavaScript modules without a build step.

Choose a study in the Project guide and select **Open recorded example**, then **Run analysis**. On an analysis tab, **Run example** loads and predicts immediately. Change a parameter and run again to compare outputs. Uploaded inputs must follow the domain, units and reference requirements described in [BACKEND.md](BACKEND.md).

## Models and evaluation

Seven saved model artifacts contain eight fitted estimators. Range is calculated from SOC, predicted consumption and supplied usable-energy settings.

| Component | Method | Reported MAE | Evaluation scope |
|---|---|---|---|
| SOH | Guarded Ridge regression | 1.017 percentage points | Accepted sessions, battery-grouped development CV |
| Remaining life | Ridge regression | 37.23 recorded cycles | Battery-grouped development CV |
| Charging lifetime | Random forest surrogate | 112.77 study cycles | Held-protocol development CV |
| Laboratory SOC | Histogram gradient boosting | 0.667 percentage points | Held BJDST profile |
| Vehicle sensor SOC | Ridge regression | 4.271 percentage points | Held recording days |
| Vehicle SOC tracking | Calibrated current integration | 0.098 percentage points | Held recording days; correct starting SOC required |
| Next-minute energy | Random forest | 66.77 Wh | Held recording days |
| Next-kilometre consumption | Extra Trees | 50.35 Wh/km | Held recording days |

MAE is mean absolute error. Results describe different datasets and conditions and must not be combined into a single accuracy percentage. SOH coverage is 81.9% of development sessions, with rare errors up to 33.86 percentage points. No independent full-depletion range MAE is available. See [MODEL_INVENTORY.md](MODEL_INVENTORY.md) for baselines, model paths, feature choices and evaluation limitations.

## Data sources

| Source | Role |
|---|---|
| CALCE CS2_33â€“CS2_38, six LCO cells | SOH and recorded-cycle life prediction |
| CALCE SP20-2 NMC calibration and dynamic profiles | Laboratory SOC |
| Attia et al., nine A123 LFP protocols with five replicates each | Charging-lifetime prediction and tested-policy ranking |
| Steinstraeter et al., 70 BMW i3 driving/heating trips | Vehicle SOC and driving-energy forecasts |
| CALCE PL SOC-window experiments, including PL11 | Retained comparison data; excluded from the active CS2 health model |

Processing standardises units, removes exact duplicate measurements, flags invalid readings and retains provenance. Features use current and past observations. Vehicle evaluation keeps complete recording days together; lab SOC holds out load profiles. SOH, RUL and charging results are development evaluations, and the original CS2 holdout has already been consumed.

Sources: [CALCE](https://calce.umd.edu/data), [Attia et al.](https://doi.org/10.1038/s41586-020-1994-5), [charging-study repository](https://github.com/chueh-ermon/battery-fast-charging-optimization), and [vehicle dataset](https://doi.org/10.21227/6jr9-5235). Source acquisition details and usage requirements are recorded with the raw data.

## Project structure

```text
backend/          Local HTTP/JSON prediction API
frontend/         Cellwise interface, static server and UI tests
scripts/          Preparation, training, inference and verification
tests/            Python unit and API integration tests
config/           Original SOH training configuration
examples/         Canonical demonstration requests and measurements
models/           Active artifacts and preserved training history
data/raw/         Original sources and provenance
data/processed/   Cleaned tables, features, labels and splits
reports/          Data audits, evaluation results and model evidence
requirements.txt  Pinned Python dependencies
```

The frontend server reuses requests from `examples/`. Generated frontend verification output, caches and local environments are ignored. Historical model artifacts and research reports remain available for reproducibility.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service and model status |
| GET | `/api/models` | Domains and input requirements |
| POST | `/api/soh` | Health from a completed charge and reference |
| POST | `/api/rul` | Remaining recorded cycles from health history |
| POST | `/api/assess` | Combined health and life analysis |
| POST | `/api/charging` | Tested-policy ranking under a C-rate limit |
| POST | `/api/soc` | Laboratory or vehicle SOC |
| POST | `/api/driving` | Driving-energy forecasts |
| POST | `/api/range` | Conditional range |
| POST | `/api/vehicle` | Combined vehicle analysis |

Example request:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/vehicle' -Method Post -ContentType 'application/json' -Body (Get-Content -Raw '.\examples\vehicle_request.json')
```

Positive current means charging; negative current means discharging. Inspect `status` and nullable values before displaying a prediction. Expected unavailable estimates can return HTTP 200. API schemas, limits and CORS configuration are documented in [BACKEND.md](BACKEND.md).

## Verification and training

Run Python unit and API integration tests (full datasets are not required):

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

Frontend checks require Node.js and both servers running:

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd test
npm.cmd run test:e2e
```

On Windows, browser checks use installed Chrome. On other platforms, install Playwright Chromium before running them. Browser checks cover real API outputs, imports, validation, exports, cancellation, offline recovery, mobile layout and accessibility.

With the full datasets restored, verify model/source hashes, splits and offline/API consistency:

```powershell
.\.venv\Scripts\python.exe scripts\build_project.py
```

To rebuild current models from the available data and frozen selections:

```powershell
.\.venv\Scripts\python.exe scripts\build_project.py --rebuild
```

Rebuilding overwrites derived model/report files and requires the source/prepared datasets. It does not create a new independent evaluation. See [TRAINING.md](TRAINING.md) for pipeline order, individual commands and historical SOH experiments.

## Running and sharing

To run the application elsewhere, include `backend/`, `frontend/`, `scripts/`, `examples/`, `requirements.txt` and the seven active model files listed in [MODEL_INVENTORY.md](MODEL_INVENTORY.md). Keep their directory structure. The full `data/` folder is required for data verification or rebuilding, but not for inference. Create a new virtual environment on the destination computer; do not copy `.venv/` or `node_modules/`. The seven active model artifacts are included through Git LFS. Install Git LFS before cloning, or run `git lfs pull` in an existing checkout to download them. Raw/processed datasets, historical model backups and local environments are excluded. See [data/README.md](data/README.md) for dataset acquisition and rebuild requirements.

## Scientific scope

This is a local research prototype using six ageing cells, one laboratory SOC cell and one source vehicle. The datasets describe different battery chemistries and conditions. RUL counts recorded cycle groups to a defined capacity threshold, not vehicle years or kilometres. Current tracking requires a correct initial SOC and continuous measurements. Range assumes recent driving conditions continue and the supplied capacity/SOC window is correct. Charging optimisation ranks a finite tested set under fixed study conditions; it does not control a vehicle charger.

The local server has no authentication or production deployment configuration. Further independent data and validation are required before applying these models to other vehicles or operational battery management.
