# Vehicle SOC without a starting value

Selected model: `{'family': 'ridge', 'parameters': {'alpha': 10.0}}`. Predictions and complete comparisons are in `metrics.csv` and `predictions.csv`.

## Reference and input scenario

Targets are the recorded vehicle BMS SoC [%], not displayed SOC, min/max SOC, a new true-SOC sensor or a capacity estimate. Displayed/min/max SOC are excluded from learned inputs.

The sensor-only estimator uses present voltage/current/temperature and backward-looking 5/30-second summaries. It needs thirty seconds of history and no reported current SOC or cumulative charge counter. Raw predictions are retained; outputs are bounded to 0–100% and both raw/bounded errors are reported.

## Evaluation

Ridge, two histogram-gradient boosting configurations, random forest and extra trees were compared using training-only grouped CV and independent validation groups. Candidate selection minimised validation macro-session MAE. Then the selected settings were fitted on training+validation data and evaluated on untouched held groups. Preprocessing is fitted inside each training fold and sessions have equal total fitting weight.

| recipe | n | sessions | mae | macro_session_mae | rmse | p95_absolute_error | max_absolute_error |
|---|---|---|---|---|---|---|---|
| selected_soc | 26153 | 15 | 4.271 | 4.200 | 5.370 | 11.430 | 19.918 |
| raw_selected_soc | 26153 | 15 | 4.271 | 4.200 | 5.370 | 11.430 | 19.918 |
| static_voltage_ridge_baseline | 26153 | 15 | 5.216 | 5.052 | 6.783 | 15.299 | 28.807 |

Runtime feature-range coverage among eligible test observations: 25570/26153 (97.8%). Warmup and physically invalid reference labels are counted in the data audits rather than silently scored as zero error.

Lab data use one SP20-2 NMC cell at 25°C: FUDS/DST train, US06 validation, BJDST final test. Vehicle data use 70 trips from one BMW i3: 48 train, 7 validation, 15 test; recording days never cross splits. These are new held profile/day results within the same source cell/vehicle, not evidence of generalisation to unseen chemistries, packs or cars. All selections were frozen before opening their test outcomes; subsequent reproduction does not create a new independent test.

## Sources and limits

[CALCE experiment description](https://calce.umd.edu/data). Vehicle source: Steinstraeter, Buberger and Trifonov, [Battery and Heating Data in Real Driving Cycles](https://doi.org/10.21227/6jr9-5235). The public Kaggle mirror was used because the publisher page was inaccessible; source identity, URLs, archive hashes and CRC checks are recorded in `reports/dynamics/source_manifest.json`. The mirror is not claimed to have a publisher-certified checksum. Raw files remain intact. Nonfinite/physically invalid source readings split histories; no interpolation hides missing current or SOC.
