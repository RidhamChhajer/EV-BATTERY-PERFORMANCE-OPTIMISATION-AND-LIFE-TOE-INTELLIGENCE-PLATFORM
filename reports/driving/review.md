# Driving energy forecasts and range scenario

Two models are fitted in `models/final/driving.joblib`: next-60-second net energy (Wh) and next-kilometre net consumption (Wh/km). A positive value means net battery consumption; negative values retain regenerative recovery.

## Data, labels and splitting

The vehicle archive has 70 trip CSVs plus an overview and a source reader (72 archive members). Source readers were not executed. There are 1,094,793 original sensor rows and 30793 flagged invalid rows. Signals are standardised with positive current meaning charging. Energy is integrated at the original 0.1-second resolution from `-voltage*current`; distance is integrated from speed. Labels refer strictly to future energy. Predictors include only present and prior voltage/current, speed, temperature, heating and elevation, with a 60-second warmup. Neither future speed/route, future energy, SOC labels nor whole-trip averages are predictors.

No integration crosses an invalid reading or recording gap. Histories use real observations sampled at about 1 Hz rather than invented interpolated sensor values. Future energy labels use time/distance interpolation only at the exact horizon boundary. A next-kilometre target requires the km to occur within ten minutes. Targets crossing extended stationary charging are undefined; regeneration remains valid. Missing future horizons remain unlabelled.

Splits hold out entire recording days, with deterministic summer/winter stratification: 48 training trips, 7 validation, 15 test. Train-only grouped CV compares five learner configurations. Validation macro-trip error chooses the settings and compares the best ML candidate against recent-rate persistence. Frozen choices precede test opening. The final models fit only training+validation trips. Test figures and every baseline remain available.

## Final held-day errors

| target | recipe | n | sessions | mae | macro_session_mae | rmse | p95_absolute_error | max_absolute_error |
|---|---|---|---|---|---|---|---|---|
| next_60s | selected_strategy | 2342 | 15 | 66.767 | 72.273 | 98.664 | 212.972 | 770.652 |
| next_60s | ml_candidate | 2342 | 15 | 66.767 | 72.273 | 98.664 | 212.972 | 770.652 |
| next_60s | recent_rate_baseline | 2342 | 15 | 72.054 | 81.530 | 116.225 | 249.019 | 804.049 |
| next_60s | training_median_baseline | 2342 | 15 | 86.085 | 89.928 | 131.665 | 322.949 | 855.105 |
| next_km | selected_strategy | 2141 | 15 | 50.353 | 52.196 | 67.842 | 131.871 | 376.136 |
| next_km | ml_candidate | 2141 | 15 | 50.353 | 52.196 | 67.842 | 131.871 | 376.136 |
| next_km | recent_rate_baseline | 2141 | 15 | 93.611 | 103.367 | 136.773 | 270.726 | 1361.430 |
| next_km | training_median_baseline | 2141 | 15 | 60.679 | 62.244 | 81.885 | 158.451 | 434.140 |

Runtime-range-filtered results are separate rows in `metrics.csv`, not a replacement for full eligible-test results. Input/outcome coverage is in `reports/vehicle_data/trip_audit.csv`; difficult events are retained in the largest-error tables. Minute-energy errors are substantial because future acceleration, traffic and route changes are not known inputs.

## Range calculation

Range uses the learned next-km consumption with current SOC, a **supplied** usable capacity and **supplied operational SOC minimum/maximum**. Physical BMS SOC and displayed usable SOC are different scales: available usable fraction is `(soc - soc_min) / (soc_max - soc_min)`, bounded to 0–1. An explicit usable-SOC reserve is removed before dividing available Wh by predicted Wh/km. Nonpositive consumption produces no finite range estimate. Capacities and reserves are checked for finite, valid values.

This is a conditional estimate of how far the available energy would last if recent conditions continue. The data do not contain independently measured full-depletion range labels, so no kilometre-range MAE is invented and no separate range regressor is claimed. The underlying consumption forecasts and SOC tracking are evaluated; the conversion formula and complete API path are tested. User-supplied capacity must already reflect the intended pack's usable energy; the CALCE LCO SOH model is not silently applied to this BMW pack.

## Limits

One vehicle and two seasons do not establish performance for every EV. Data-derived SOC references, capacity uncertainty, traffic, gradients and future driving changes remain sources of error. Predicted range is not a guarantee. The LFP charging-policy model and CALCE ageing models retain their separate supported domains. Frontend integration should display nullable statuses, initialisation requirements and these scenario assumptions.
