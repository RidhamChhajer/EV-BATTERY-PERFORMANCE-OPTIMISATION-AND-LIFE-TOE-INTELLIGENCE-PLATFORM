# CALCE lab SOC

Selected model: `{'family': 'hist_gradient_boosting', 'parameters': {'max_iter': 350, 'max_leaf_nodes': 31, 'min_samples_leaf': 30, 'learning_rate': 0.05, 'l2_regularization': 5.0}}`. Predictions and complete comparisons are in `metrics.csv` and `predictions.csv`.

## Reference and input scenario

The capacity reference was measured earlier (October 2015); dynamic sessions are November 2015. Completed CC-CV charge establishes 100%; net discharge/charge counters give a causal coulomb reference including regeneration. The reference is not an independent true-SOC sensor. Values below zero from calibration/condition differences are retained in the data but excluded as physically invalid supervised targets; no endpoint-based capacity normalisation or silent target clipping was applied.

The sensor-only estimator uses present voltage/current/temperature and backward-looking 5/30-second summaries. It needs thirty seconds of history and no reported current SOC or cumulative charge counter. Raw predictions are retained; outputs are bounded to 0–100% and both raw/bounded errors are reported.

## Evaluation

Ridge, two histogram-gradient boosting configurations, random forest and extra trees were compared using training-only grouped CV and independent validation groups. Candidate selection minimised validation macro-session MAE. Then the selected settings were fitted on training+validation data and evaluated on untouched held groups. Preprocessing is fitted inside each training fold and sessions have equal total fitting weight.

| recipe | n | sessions | mae | macro_session_mae | rmse | p95_absolute_error | max_absolute_error |
|---|---|---|---|---|---|---|---|
| selected_soc | 17937 | 2 | 0.667 | 0.673 | 0.861 | 1.765 | 4.025 |
| raw_selected_soc | 17937 | 2 | 0.667 | 0.673 | 0.861 | 1.765 | 4.025 |
| calibration_voltage_baseline | 17937 | 2 | 2.360 | 2.413 | 2.818 | 5.258 | 6.812 |

Runtime feature-range coverage among eligible test observations: 17937/17937 (100.0%). Warmup and physically invalid reference labels are counted in the data audits rather than silently scored as zero error.

Lab data use one SP20-2 NMC cell at 25°C: FUDS/DST train, US06 validation, BJDST final test. Vehicle data use 70 trips from one BMW i3: 48 train, 7 validation, 15 test; recording days never cross splits. These are new held profile/day results within the same source cell/vehicle, not evidence of generalisation to unseen chemistries, packs or cars. All selections were frozen before opening their test outcomes; subsequent reproduction does not create a new independent test.

## Sources and limits

[CALCE experiment description](https://calce.umd.edu/data). Vehicle source: Steinstraeter, Buberger and Trifonov, [Battery and Heating Data in Real Driving Cycles](https://doi.org/10.21227/6jr9-5235). The public Kaggle mirror was used because the publisher page was inaccessible; source identity, URLs, archive hashes and CRC checks are recorded in `reports/dynamics/source_manifest.json`. The mirror is not claimed to have a publisher-certified checksum. Raw files remain intact. Nonfinite/physically invalid source readings split histories; no interpolation hides missing current or SOC.
