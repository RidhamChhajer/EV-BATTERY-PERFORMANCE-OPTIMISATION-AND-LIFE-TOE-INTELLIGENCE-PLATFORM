# Active model inventory

All requested application components are implemented and connected to the API. There are seven fitted artifacts; the driving artifact contains two forecasting estimators. Range is a tested calculation using the learned consumption model, not a fabricated regressor trained on nonexistent depletion-range labels. The frontend remains unbuilt as requested.

| Component | Active artifact | Selected method / input scenario | Evaluation evidence |
|---|---|---|---|
| Battery health (SOH) | `models/reliable/soh_guarded.joblib` | Ridge, charging profile plus initial calibration; CALCE LCO | Development battery CV, 1.017 pp MAE on accepted same-cohort sessions |
| Remaining recorded life (RUL) | `models/final/rul.joblib` | Ridge, past health trajectory; CALCE LCO | Development battery CV, 37.23 recorded-cycle MAE |
| Charging policy optimisation | `models/final/charging.joblib` | Small forest surrogate plus constrained ranking of nine tested LFP protocols | Held-protocol development CV, 112.77 study-cycle MAE; measured means are the default ranking evidence |
| Lab SOC without a starting value | `models/final/soc_calce.joblib` | Histogram gradient boosting, present/past voltage/current; SP20-2 NMC at 25°C | Held BJDST load profile, **0.667 pp MAE**, 2.360 pp voltage baseline |
| Vehicle SOC without a starting value | `models/final/soc_vehicle.joblib` | Ridge, present/past voltage/current/temperature; BMW i3 | Held recording days, **4.271 pp MAE**, 5.216 pp static-voltage baseline |
| Vehicle SOC with a known starting value | `models/final/soc_tracking.joblib` | Calibrated coulomb observer fitted to training trips | Held recording days, **0.098 pp MAE**, 0.274 pp nominal-capacity baseline; correct initial SOC is required |
| Next-minute driving energy | `models/final/driving.joblib`, `next_60s` | Restricted random forest, past 60-second telemetry | Held recording days, **66.77 Wh MAE**, 72.05 Wh recent-rate baseline |
| Next-km consumption | `models/final/driving.joblib`, `next_km` | Extra trees, past telemetry | Held recording days, **50.35 Wh/km MAE**, 93.61 Wh/km recent-rate baseline |
| Range | `scripts/predict_dynamics.py`, `range_scenario` | SOC + predicted Wh/km + configured usable energy/SOC window/reserve | Formula, units and full API path tested; no measured full-depletion range MAE exists |

pp means percentage points. Results use the documented eligible cohorts; runtime abstention coverage and larger errors are reported separately. Initialised SOC tracking and sensor-only SOC have different inputs and should not be compared as if the initial state were equally known.

Active artifacts were rebuilt on Python 3.10.11 with scikit-learn 1.7.2, retaining frozen telemetry selections and the existing splits. The numbers above reflect that rebuild. The original Python 3.12 artifacts and reports are preserved in `models/backups/python312_original.zip`; the migration comparison is recorded in `reports/backend/python310_compatibility.json`. Re-evaluation uses the same previously seen data and is not a new independent test.

## How models were selected

The added sensor/forecast tasks compared Ridge, two regularised histogram-gradient boosting configurations, a restricted random forest and extra trees. Train-only grouped CV and validation macro-session MAE determined the settings. Scalers were fitted only on their training fold. The vehicle splits group entire recording days and stratify summer/winter; 48 trips train, 7 validate, 15 test. The lab splits hold whole load profiles: FUDS/DST train, US06 validate, BJDST test. Choices were frozen before opening their test outcomes; final added-model fits use training plus validation, leaving the held groups outside fitting.

The initialised observer compared constant, temperature-dependent and temperature/initial-SOC-dependent inverse-capacity responses. A constant learned response was best on validation days. It integrates only observed current since one known starting SOC. Missing current intervals require reinitialisation; later reported SOC is not passed into predictions.

## References and limits

The original data were enough for SOH/RUL prototypes and initial SOC exploration but not vehicle kilometre targets. Additional [CALCE](https://calce.umd.edu/data) profiles support a full held-profile SOC test. The vehicle data are [Steinstraeter et al.'s published driving/heating dataset](https://doi.org/10.21227/6jr9-5235), downloaded from its public Kaggle mirror with recorded provenance; the archive contains 70 trip CSVs plus two metadata/reader files. Calibration/reference uncertainty, one-cell/one-vehicle coverage and source-specific conditions remain limits.

The LCO ageing model, NMC lab SOC, BMW pack telemetry and A123 LFP charging study are kept separate. Unsupported protocols and inadequate input history return no estimate. Lab SOC targets are coulomb references; vehicle SOC is the reported BMS reference. Range assumes that recent conditions continue and that the supplied usable capacity and SOC window are correct. Prediction error is measured, not eliminated or guaranteed zero.

Full reviews: `reports/reliability/`, `reports/rul/`, `reports/charging/`, `reports/soc_calce/`, `reports/soc_vehicle/`, `reports/soc_tracking/`, `reports/driving/`. Raw sources and cleaning/split audits remain available.
