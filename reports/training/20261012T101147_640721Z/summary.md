# SOH training candidates

Training and validation results only. No final model has been selected and the test battery has not been evaluated.

| Model | Inputs | Split | MAE (pp) | RMSE (pp) | Equal-cell MAE (pp) |
|---|---|---|---:|---:|---:|
| persistence | with_history | train | 0.334 | 0.573 | 0.332 |
| persistence | with_history | validation | 0.243 | 0.463 | 0.243 |
| ridge | with_history | train | 0.327 | 0.556 | 0.325 |
| ridge | with_history | validation | 0.246 | 0.453 | 0.246 |
| random_forest | with_history | train | 0.361 | 0.570 | 0.360 |
| random_forest | with_history | validation | 0.311 | 0.515 | 0.311 |
| ridge | without_history | train | 1.660 | 4.192 | 1.685 |
| ridge | without_history | validation | 2.275 | 4.443 | 2.275 |
| random_forest | without_history | train | 0.687 | 1.232 | 0.689 |
| random_forest | without_history | validation | 4.207 | 6.515 | 4.207 |

Inputs with history require a previous measured capacity/health value. The no-history models use recorded age and charging-session measurements. Compare models within the input scenario you can supply.

Inspect by_cell.csv and by_health_range.csv: validation contains one battery and no accepted SOH below 40%. Empty health strata have n=0 and blank metrics, not zero error.

Step 5 will review baseline performance, training/validation differences and any tuning before final model selection and reserved-test evaluation.
