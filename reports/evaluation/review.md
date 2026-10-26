# Step 5: SOH model evaluation

Model selection and the first reserved-test evaluation are complete. The selected artifacts are research prototypes; the no-history model has severe occasional errors.

## Selection before the test

A fixed small search tested Ridge alpha values 0.1, 1 and 10, plus the original forest settings and a shallower forest. Hyperparameters were selected by average leave-one-battery-out MAE across the four training cells. Scaling and weights were fitted separately inside each fold. The model family was then selected by validation MAE on CS2_34. No model was refitted on validation.

The historical-input choice is the previous-SOH persistence baseline, not a learned improvement. The no-history choice is Ridge regression with alpha=10. Its validation MAE is 2.281 pp, compared with 2.275 pp for the original alpha=1 run; stronger regularization improved the training-only grouped-CV average rather than validation error. Small tuning did not establish a meaningful accuracy gain on validation.

Selection was saved in selection.json and both final artifacts were written before test outcomes were opened. CS2_38 was evaluated only after that boundary. Test results did not change the choices.

## Test results

| Input scenario | Selected method | Examples | MAE (pp) | RMSE (pp) |
|---|---|---:|---:|---:|
| with_history | persistence | 993 | 0.337 | 0.538 |
| without_history | ridge | 993 | 1.690 | 4.283 |

| Input scenario | 95th-percentile absolute error (pp) | Maximum absolute error (pp) | Errors over 10 pp |
|---|---:|---:|---:|
| with_history | 1.116 | 4.097 | 0 |
| without_history | 2.920 | 63.711 | 7 |

## Interpretation and limitations

The no-history forest showed a large training-to-validation gap (training MAE about 0.69 pp versus validation MAE about 4.21 pp). This is consistent with overfitting and/or a shift between batteries and conditions. Grouped CV alone preferred the forest on average, but validation preferred Ridge; results vary by held-out battery, so ranking is not universally stable.

The historical baseline requires a recent measured SOH. It is a carry-forward estimate, not a way to infer fresh health from voltage/current alone. Its small average error does not establish battery-life forecasting capability.

The no-history regression has good average performance on the test cell but rare errors above 50 percentage points. For example, the largest error predicts roughly 20% SOH when the measured target is roughly 84%. Such tail errors make it unsuitable for confident standalone EV diagnosis. All cases remain in the reported metrics; predictions were not clipped and no test-driven exclusions were applied.

The model uses recorded cycle count, recorded calendar age and charging-session summary features. Those summary means depend on the laboratory logging protocol. Missing initial-SOC/context and unusual charge sessions are possible sources of error; this evaluation does not prove their causal contribution.

Validation included one cell at 0.5C and no accepted targets below 40% SOH. The test includes one cell at 1C and no accepted targets below 20%. Neither evaluation supports claims for those uncovered ranges, other chemistries or EV packs. SOH is relative to the first recorded complete-charge reference, not certified factory-new health.

CS2_38 is now a consumed holdout. Further model or feature changes need a new independent holdout for an honest final evaluation. Do not rerun model selection using the current test errors.

## Artifacts and next step

- models/final/soh_without_history.joblib: selected research Ridge pipeline and ordered input names.
- models/final/with_history_rule.json: selected carry-forward rule when previous measured SOH is available.
- selection.json: locked parameters, validation scores, data checksum and artifact paths.
- grouped_cv_folds.csv and grouped_cv_ranking.csv: training-only transfer comparisons.
- development_metrics.csv and validation_predictions.png: training/validation comparison and large mistakes.
- test_metrics.csv, test_health_ranges.csv, test_error_tails.csv and test_predictions.png: final test findings.
- largest_errors_with_inputs.csv: error cases with the original input features, for investigation without retuning this test.

Step 6 can build a research dashboard/API around these saved artifacts with their input assumptions and limitations visible. A reliable EV diagnostic model needs further data/context and fresh independent evaluation. RUL and charging optimisation remain separate tasks, not capabilities demonstrated here.
