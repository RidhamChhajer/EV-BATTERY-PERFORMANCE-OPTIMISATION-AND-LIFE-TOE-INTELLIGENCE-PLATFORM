# Remaining-life model review

Final model: ridge with {'alpha': 10.0}, fitted on 3,081 examples from all six CALCE LCO cells. Model file: `models/final/rul.joblib`.

## Target and timing

Predict remaining **recorded cycle groups** to the first three-observation confirmation of SOH at or below 80% of the first recorded valid capacity. All six current cells have an observed event. Censored cells would be excluded from ordinary regression; unknown future events are never labelled zero. Examples after the event are excluded. The training builder checks the event against the actual three-observation threshold. Its health trajectory features use only the latest and earlier observations: five observations minimum and the latest twenty for slope/std/span. Current SOH is allowed here because forecasting happens after a health observation. Age and source discharge C-rate are also required. Neither event flags nor future event cycles are predictors.

## Development evaluation

| recipe | cohort | n | mae_cycles | rmse_cycles |
|---|---|---|---|---|
| age_prior | all available | 3081 | 48.78 | 53.39 |
| age_prior | runtime supported | 3012 | 49.08 | 53.62 |
| linear_health_trend | all available | 3081 | 2616.87 | 4965.47 |
| linear_health_trend | runtime supported | 3012 | 2609.04 | 4971.15 |
| selected_model_measured_soh | all available | 3081 | 37.23 | 44.47 |
| selected_model_measured_soh | runtime supported | 3012 | 37.31 | 44.55 |
| selected_model_mixed_soh | all available | 2764 | 38.68 | 47.20 |
| selected_model_mixed_soh | runtime supported | 2698 | 38.61 | 46.22 |
| selected_model_predicted_soh | all available | 2754 | 41.25 | 51.48 |
| selected_model_predicted_soh | runtime supported | 2547 | 39.48 | 46.72 |
| age_prior | paired selected_model_predicted_soh | 2511 | 47.81 | 53.00 |
| linear_health_trend | paired selected_model_predicted_soh | 2511 | 2652.06 | 4983.59 |
| selected_model_measured_soh | paired selected_model_predicted_soh | 2511 | 39.78 | 46.88 |
| selected_model_predicted_soh | paired selected_model_predicted_soh | 2511 | 39.71 | 46.92 |
| age_prior | paired selected_model_mixed_soh | 2693 | 48.22 | 53.23 |
| linear_health_trend | paired selected_model_mixed_soh | 2693 | 2680.03 | 5040.16 |
| selected_model_measured_soh | paired selected_model_mixed_soh | 2693 | 38.83 | 46.05 |
| selected_model_mixed_soh | paired selected_model_mixed_soh | 2693 | 38.60 | 46.23 |

Inner leave-one-battery-out CV selects Ridge alpha 10/100 or a forest limited to depth 6 and 15 samples per leaf. An outer battery is never used to fit its scaler or estimator. Equal total battery weights prevent long records dominating fitting. Final all-data fitting is separate from the reported held-battery predictions. All six cells had already been inspected during SOH work, so this is development evaluation, not a fresh untouched EV test.

The age baseline subtracts current age from the other training cells' average event cycle. Naive linear health extrapolation is unstable when the early degradation slope is nearly flat; its large errors remain visible rather than being silently removed. Negative model estimates are explicitly floored at zero (48 measured-input raw predictions were negative). Three measured below-threshold observations return zero; when the health input is predicted, the API labels this an **estimated threshold crossing**, not a confirmed capacity measurement.

SOH error propagation is evaluated with held-battery SOH predictions, filtered by their actual runtime guards. `selected_model_mixed_soh` uses measured earlier health and a predicted current health, matching `/api/assess`. `selected_model_predicted_soh` uses an entirely predicted history. Paired rows compare scenarios on identical accepted cycles. Missing SOH estimates remain missing; no interpolation manufactures health history. Coverage for measured-input RUL is 3012/3081, or 97.8%. Sensor-to-RUL coverage is lower and is shown in the corresponding metric counts. The same six-cell development data inform both components, which limits independent evidence.

## Remaining limits

Worst measured-input development error: 96.3 recorded cycles; 95th percentile: 78.5. Battery-specific errors and errors near the event remain important; see the figure, `largest_errors.csv`, and `by_remaining_life_range.csv`. No conversion into EV kilometres, years or real full-cycle equivalents is supported. Factory-new capacity, missing physical cycles, temperature, new chemistry and pack behaviour are outside this model's scope. A new independent battery set is required for final generalisation evidence.
