# Run the completed research backend

The backend exposes SOH, remaining-life, charging-policy optimisation, lab/vehicle SOC, driving-energy forecasts and conditional range estimates. Seven model artifacts are loaded. The Cellwise frontend is available in `frontend/`; start it with `python frontend/serve.py` and open http://127.0.0.1:5173/. No model retraining is needed to run it. See `MODEL_INVENTORY.md` for the exact models, evaluation conditions and references.

## Start

Open PowerShell in this project:

```powershell
Set-Location 'C:\Users\Lenovo\Documents\EV BATTERY PROJECT'
.\.venv\Scripts\python.exe backend\server.py
```

The API listens on `http://127.0.0.1:8000`. Stop it with Ctrl+C. It uses the Python standard library HTTP server and the existing training environment; no web framework dependency was added. It is a local demonstration server with no authentication or public deployment setup.

In a second PowerShell window, run an example:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health'
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/assess' -Method Post -ContentType 'application/json' -Body (Get-Content -Raw '.\examples\assess_request.json')
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/charging' -Method Post -ContentType 'application/json' -Body (Get-Content -Raw '.\examples\charging_request.json')
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/soc' -Method Post -ContentType 'application/json' -Body (Get-Content -Raw '.\examples\soc_calce_request.json')
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/vehicle' -Method Post -ContentType 'application/json' -Body (Get-Content -Raw '.\examples\vehicle_request.json')
```

Example inputs are real processed CALCE readings from CS2_35 cycle 200 and its initial calibration. They are demonstration cases, not unseen evaluation data. CSV versions are supplied beside the JSON requests for your later upload UI.

## API contract

Send JSON objects with `Content-Type: application/json`. The maximum body is 5 MB. Uploading a CSV later means parsing it into the documented arrays in your frontend; the API takes records rather than local file paths. It does not accept uploaded model/pickle files.

| Endpoint | Inputs | Result |
|---|---|---|
| `GET /health` | None | Service and model-load status |
| `GET /api/models` | None | Model domains and input requirements |
| `POST /api/soh` | `protocol`, `measurements`, `reference_measurements`, `observed_cycle_number`, `elapsed_days` | SOH relative to first recorded capacity, or an abstention status |
| `POST /api/rul` | `protocol`, `health_history`, `discharge_c_rate`, optional `health_source` | Remaining recorded cycle groups to the project threshold, or an abstention status |
| `POST /api/assess` | SOH inputs plus past `health_history` and `discharge_c_rate` | Current sensor SOH and RUL using that estimate with measured past history |
| `POST /api/charging` | `protocol`, `max_c_rate`, optional `selection` | Ranked tested study protocols and their evidence, or no feasible recommendation |
| `POST /api/soc` | `protocol`, `observations`; optional known `initial_soc_pct` | Lab or vehicle SOC; known starting SOC selects the calibrated vehicle tracking mode |
| `POST /api/driving` | `protocol`, `observations`; optional `range_inputs` | Next-60-second net Wh and next-km Wh/km; optional configured range scenario |
| `POST /api/range` | Vehicle observations and usable-capacity/SOC-window parameters | SOC-informed conditional range estimate |
| `POST /api/vehicle` | Same inputs as `/api/range` | SOC, both driving forecasts and the range scenario together |

### SOH measurements

Use `protocol: "CALCE_CS2"`. Each sensor record needs numeric `test_time_s`, `voltage_v`, `current_a`, `charge_counter_ah`, `step_index`. Optional `observed_cycle_number` must match the request cycle. Records must be chronological and belong to one charging session. Current SOH, discharge capacity and future outcomes are not supplied as predictors.

The completed current charge must cover the 4.0–4.1 V constant-current window and finish the CV taper. The initial reference charge must be from the same cell and precede the current cycle. The selected combined-feature model requires this calibration. The helper rejects incomplete/top-up profiles, inadequate sampling and inputs outside fitted ranges. Statuses include `voltage_window_not_observed`, `charge_not_completed`, `missing_initial_charge_reference`, and `outside_training_range`; their SOH value is `null`.

### Health history and RUL

Each record has `observed_cycle_number`, `elapsed_days`, `soh_reference_pct`. Supply at least five observations in increasing cycle order, all using the same capacity reference. The latest twenty determine slope/std/span. Retain earlier threshold-crossing observations in the supplied history; the first three-observation confirmation remains an event even after a later rebound. A truncated history cannot reveal an earlier event you omitted.

For `/api/rul`, history includes the latest health observation. Supported source discharge C-rates are 0.5 and 1.0. `health_source` is `measured` by default; set it to `predicted` when estimates are included. For `/api/assess`, history ends **before** the current charging cycle, and the service appends the predicted current SOH. It refuses future or duplicate current-cycle history. If SOH is unavailable, it returns that status and `rul.status: "soh_unavailable"`.

RUL is returned in `remaining_observed_cycles`. This unit counts recorded groups, not physical EV full cycles, kilometres or years. Negative regression results are explicitly floored at zero; `raw_prediction` and `nonnegative_floor_applied` expose that decision. A measured three-observation crossing returns `threshold_already_confirmed`; one based on predicted health returns `estimated_threshold_crossing`. Those are different evidence levels.

### Charging study

Use `protocol: "ATTIA2020_LFP_10MIN"`. `max_c_rate` must be positive and no greater than 8; the service only ranks tested protocols for which every stage satisfies it. A 4C maximum has no tested feasible policy and returns `no_tested_feasible_protocol`.

`selection: "observed_mean"` is the default and ranks the measured five-cell means. `selection: "model_prediction"` ranks the fitted surrogate predictions. The response includes replicate count, observed mean/std/range, fitted lifetime estimate, four stage rates, SOC windows, stage times and the study conditions. Nominal 0–80% charging time is fixed at ten minutes for every candidate. The 80–100% tail was fixed in the source experiments and is included in the reported lifetime outcome.

This is a separate A123 LFP research domain. Sending `CALCE_CS2` or an NMC/unknown protocol to this endpoint returns `unsupported_protocol`. The service does not translate the recommendation into a personalised CALCE/EV lifetime gain, vary temperature/voltage, or control a charger.

### SOC, driving and range inputs

For lab SOC, use `protocol: "CALCE_NMC_25C"` with observations containing `time_s`, `voltage_v`, `current_a`, `temperature_c`. This lab temperature field represents the fixed 25°C experiment setting, not a measured cell-temperature series. The source cell is SP20-2 NMC and is distinct from the ageing LCO cells. Thirty seconds of history are required. `examples/soc_calce_request.json` is ready to send.

For vehicle SOC, use `protocol: "TUM_BMW_I3"` and the same four fields, with actual battery temperature. **Positive current means charging; negative means discharging.** Time must increase strictly; values must be finite. Prefer actual observations at about 1 Hz. Do not bridge sensor gaps. With no starting SOC, the sensor-only model uses a 30-second window. With a correct `initial_soc_pct`, the calibrated observer tracks from the first supplied observation and requires uninterrupted current history; it must be reinitialised after a gap over five seconds. The SOC seed is a known state at the beginning, not an estimate taken from a later point. Later reported SOC values are never model inputs. The two modes have different errors and input requirements; see their reviews.

Driving/range observations add `speed_kmh`, `ambient_temperature_c`, `heating_power_kw`, and `elevation_m`. Sixty seconds of history are required. The service forecasts net energy over the next minute and net consumption over the next kilometre. Negative energy is retained as regenerative recovery. Stationary charging is not a driving forecast context. Out-of-training-range cases return nullable statuses per forecast. The models use only present and earlier observations; future speed or whole-trip statistics are not accepted as predictors.

`/api/range` and `/api/vehicle` also require `usable_capacity_kwh`, `soc_min_pct`, `soc_max_pct`; `reserve_usable_soc_pct` defaults to 10. A supplied initial SOC enables the more accurate tracking mode; otherwise range uses the sensor-only SOC estimate. These SOC min/max values define the **operational window corresponding to the supplied usable capacity**. Physical BMS SOC is not automatically displayed/usable SOC. The service normalises that window, removes the reserve, then divides available Wh by predicted Wh/km. It does not apply the CALCE SOH model to the BMW pack. The 18.8 kWh, 8–90% configuration in the example is an explicitly supplied demonstration scenario, not a measured depletion-range label.

If predicted consumption is nonpositive, no finite range is returned. The response records the assumption that recent conditions continue. Road traffic, future route changes and uncertain capacity can change actual range; no full-depletion kilometre accuracy is claimed. Read `reports/driving/review.md` for the measured energy-forecast errors.

### HTTP and browser behaviour

Successful predictions and expected abstentions return HTTP 200; inspect `status` and nullable values before displaying an estimate. Invalid JSON/schema returns 400, unknown routes 404, an oversized body 413, and non-JSON content 415. Nonfinite numeric JSON is rejected. Errors do not expose filesystem paths or model contents.

Browser origins `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000` and `http://127.0.0.1:3000` are allowed by default. Change the port or allowed frontend origin if needed:

```powershell
.\.venv\Scripts\python.exe backend\server.py --port 8001 --allow-origin http://localhost:8080
```

The `--allow-origin` values replace the defaults and can be repeated. An unlisted browser origin receives 403. The server remains bound to localhost.

## Evaluation and verification

- SOH: `reports/reliability/review.md` and its coverage/error tables.
- RUL: `reports/rul/review.md`, battery-level CV, mixed/predicted SOH sensitivity and error ranges.
- Charging: `reports/charging/review.md`, held-protocol CV and the measured validation data provenance.
- SOC: `reports/soc_calce/review.md`, `reports/soc_vehicle/review.md`, `reports/soc_tracking/review.md`.
- Driving/range: `reports/driving/review.md`; source cleaning and day splits in `reports/vehicle_data/`.

Run the checks:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe scripts\check_reliable_model.py
.\.venv\Scripts\python.exe scripts\check_project.py
.\.venv\Scripts\python.exe scripts\build_project.py
```

Integration tests start a temporary localhost server, test the example requests and invalid inputs, then stop it. No external service is contacted.

## Rebuilding

The existing Python 3.10.11 virtual environment is ready. On another workstation, create a Python 3.10 environment and install `requirements.txt`; it provides the pinned stack for preparation, training, plotting, inference and verification. Active models were rebuilt with scikit-learn 1.7.2 and passed 32 tests. Original Python 3.12 artifacts and reports are preserved in `models/backups/python312_original.zip`; those historical models require their original library versions. Migration comparisons are in `reports/backend/python310_compatibility.json`.

All current models can be rebuilt sequentially with:

```powershell
.\.venv\Scripts\python.exe scripts\build_project.py --rebuild
```

This uses the saved telemetry selections, preserving their held-out groups rather than tuning to already observed test errors. Individual steps for the additional components are:

```powershell
.\.venv\Scripts\python.exe scripts\prepare_soc.py
.\.venv\Scripts\python.exe scripts\train_soc.py calce
.\.venv\Scripts\python.exe scripts\prepare_vehicle.py
.\.venv\Scripts\python.exe scripts\train_soc.py vehicle --select-only
.\.venv\Scripts\python.exe scripts\train_soc_tracking.py --select-only
.\.venv\Scripts\python.exe scripts\train_driving.py
.\.venv\Scripts\python.exe scripts\train_soc.py vehicle
.\.venv\Scripts\python.exe scripts\train_soc_tracking.py
.\.venv\Scripts\python.exe scripts\make_examples.py
.\.venv\Scripts\python.exe scripts\report_dynamics.py
```

Run these in order, not simultaneously. Source archives are already present; `scripts/download_dynamics.py` downloads the public files only when they are missing. Raw archives are retained and CRC/hash-checked. The original ten-archive CALCE reader remains separate from the supplemental readers. Vehicle held-out trips are parsed only after sensor SOC, calibrated tracking and driving selections have been frozen. Rebuilding repeats an evaluation on the same held-out data; it does not create a fresh independent test.

```powershell
.\.venv\Scripts\python.exe scripts\improve_soh.py
.\.venv\Scripts\python.exe scripts\report_reliability.py
.\.venv\Scripts\python.exe scripts\train_rul.py
.\.venv\Scripts\python.exe scripts\train_charging.py
.\.venv\Scripts\python.exe scripts\make_examples.py
.\.venv\Scripts\python.exe scripts\report_project.py
```

The SOH report produces the per-cycle runtime support table used by the RUL pipeline evaluation, so keep that order. On another workstation with the full requirements installed, use its environment's Python for the report scripts. Charging raw data are already included locally; `scripts/download_charging_data.py` can fetch the public source files again with network access. Hashes in `provenance.json` record the downloaded snapshot. Rebuild commands overwrite current derived artifacts, preserving original CALCE raw data and the first frozen test evaluation.

The application backend now has every requested model component. The Cellwise frontend provides the interactive examples, prediction views, charts and exports. Scientific limits remain: study-specific cells/one source vehicle, reported/derived SOC references, conditional range, and no certified vehicle charging control or zero-error guarantee.
