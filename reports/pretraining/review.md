# Pretraining review

All three requested checks are complete. We can proceed to step 4 with a laboratory SOH prototype.

## 1. Capacity histories and sampling gaps

The review found that some CS2 cycles reached the upper voltage during constant-current charging but did not finish the constant-voltage stage. Those undercharged discharge capacities must not be interpreted as fully charged battery health. The shared preparation code now requires recorded CV completion near 4.2 V and at or below 0.055 A, using a 5 mA tolerance around CALCE's stated 0.05 A cutoff. All charging features must precede the discharge measurement. Original records are retained; affected cycles have no SOH label.

In the five development batteries, 142 recorded cycle groups fail charge-completion verification. After this correction, 1 change larger than five SOH percentage points remains. It occurs after a roughly 11-day recording break and is retained for review; its cause is not established.

The 13,149 active intervals longer than 300 seconds have nearly constant high voltage and tapering current, consistent with sparse CV logging. No long within-step active interval lacks that signature. This is not proof that every physical cycle or measurement was recorded. There are 55 gaps longer than 24 hours between recorded cycle groups; no missing cycles are invented.

Sampling is irregular. Charge current/voltage features are sample-weighted means, not time-weighted physical averages. Deployment must reproduce the feature construction or separately validate a change in sampling protocol.

## 2. Useful inputs and prediction timing

Prediction is made after current charging finishes, before current discharge capacity is measured. There are no missing candidate input values in the accepted development examples. Recorded timing confirms that charging inputs in accepted cycles precede discharge.

The initial input list is in feature_contract.json: recorded cycle count, elapsed recording days, previous measured relative SOH, recorded cycles since that previous measurement, charge-voltage mean, charge-current mean and approximate charging duration. Past SOH requires a previous completed capacity test and the reference measurement; it is not automatically available from live voltage/current data. A second feature set excludes both historical-capacity inputs.

Exclude current discharge capacity/current SOH, future end-of-life indicators and targets from predictors. Cell identity and split labels are metadata. Constant nominal capacity and redundant past-capacity columns are omitted. Future discharge rate is used for coverage reporting rather than as an input unless the protocol is known in advance.

There are 149 examples whose previous capacity comes from more than one recorded cycle group earlier. The new previous_capacity_age_observed_cycles field exposes that staleness.

## 3. Feature distributions and condition coverage

Prepared development examples: 3,636 from four training batteries and 758 from one validation battery. The reserved test battery is excluded from all EDA plots, distributions and selection statistics. The corrected shared label rule was applied mechanically to every split.

| Split | Discharge rate (C) | Independent cells | Examples |
|---|---:|---:|---:|
| train | 0.5 | 1 | 832 |
| train | 1 | 3 | 2804 |
| validation | 0.5 | 1 | 758 |

| Split | Relative SOH range (%) | Examples |
|---|---|---:|
| train | <20 | 161 |
| train | 20-40 | 275 |
| train | 40-60 | 351 |
| train | 60-80 | 798 |
| train | 80-100 | 2051 |
| train | >=100 | 0 |
| validation | <20 | 0 |
| validation | 20-40 | 0 |
| validation | 40-60 | 67 |
| validation | 60-80 | 222 |
| validation | 80-100 | 469 |
| validation | >=100 | 0 |

High-health examples dominate. Validation has no accepted SOH labels below 40% and only the 0.5C discharge condition, so its overall error cannot establish performance in those missing regions. Health ranges are regression evaluation strata, not classification labels. Discharge condition and cell identity are also confounded by the small experimental design.

Start with the previous-SOH persistence baseline, then simple regression and a small tree model. Compare a model using historical capacity with one without it. Report errors separately by battery and health range, plus an average giving each battery equal weight. Consider grouped cross-validation on training batteries for additional coverage; keep the separate validation and final test roles intact. Fit any preprocessing on training batteries only.

No statistical outliers were deleted, no missing measurements were filled, and no model was trained during this review. These six LCO ageing cells still do not validate lifetime predictions for an EV pack.

## Saved evidence

- degradation_curves.png: accepted full-charge health histories, without smoothing.
- feature_distributions.png and feature_statistics.csv: candidate-input distributions; numerical reference ranges are calculated from training batteries only.
- health_coverage.png, health_coverage.csv and condition_coverage.csv: representation by health and discharge condition.
- review_flags.csv and largest_capacity_changes.csv: remaining recording breaks, sparse intervals and capacity-change flags.
- sampling_gaps_by_cell.csv: interval counts and their CV-taper classification.
- feature_contract.json: input allowlists, timing assumptions and excluded columns.

Source protocol: [CALCE battery experiment descriptions](https://calce.umd.edu/data).
