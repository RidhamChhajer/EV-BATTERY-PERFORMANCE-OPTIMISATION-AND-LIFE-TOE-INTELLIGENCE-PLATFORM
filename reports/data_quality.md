# Dataset preparation report

Verified 10 ZIP archives. Preserved 13,469,015 cleaned measurement rows.

Exact duplicate rows removed: 11,657. Invalid rows retained and flagged: 1.

| Cell/session | Source rows | Cleaned rows | Duplicates removed | Invalid rows |
|---|---:|---:|---:|---:|
| CS2_33 | 324,534 | 324,534 | 0 | 1 |
| CS2_34 | 312,131 | 312,131 | 0 | 0 |
| CS2_35 | 266,914 | 260,931 | 5,983 | 0 |
| CS2_36 | 269,656 | 269,656 | 0 | 0 |
| CS2_37 | 290,998 | 290,998 | 0 | 0 |
| CS2_38 | 303,295 | 297,743 | 5,552 | 0 |
| fuds_80soc | 13,681 | 13,681 | 0 | 0 |
| fuds_50soc | 9,308 | 9,308 | 0 | 0 |
| initial_capacity | 26,322 | 26,322 | 0 | 0 |
| PL11 | 1,926,850 | 1,926,823 | 27 | 0 |
| PL13 | 1,856,610 | 1,856,583 | 27 | 0 |
| PL21 | 3,931,969 | 3,931,935 | 34 | 0 |
| PL23 | 3,948,404 | 3,948,370 | 34 | 0 |

Life history: 5,586 observed cycle groups; 5,387 SOH examples.
Threshold targets available for 3,105 full-cycle observations. The target counts recorded cycle groups to a three-observation confirmation of 80% baseline capacity.

The LCO ageing/charge-window experiments and the NMC driving sessions remain separate. Statistical outliers are retained for inspection. Missing data is not filled and unobserved life events are not assigned a target.

See README.md for units, screening rules, feature/target boundaries, splits and reproducibility.
