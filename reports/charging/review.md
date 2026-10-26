# Charging protocol model and optimiser

Final surrogate: random_forest with {'n_estimators': 100, 'max_depth': 3, 'min_samples_leaf': 5, 'n_jobs': 1}. Model file: `models/final/charging.joblib`. The optimiser ranks the nine **tested** protocols subject to a user-supplied peak C-rate limit. The default maximises measured mean lifetime; an optional mode ranks saved ML lifetime estimates. It performs no hardware control and invents no outcome for an untested protocol.

## Data and scope

The authors' [released measured validation table](https://github.com/chueh-ermon/battery-fast-charging-optimization/blob/master/figures/fig4/final_results.csv) contains nine protocols and five replicate cells each. Training uses these measured lifetimes, not `predictions.csv` early model estimates. The [study methods](https://web.mit.edu/braatzgroup/Attia_Nature_2020.pdf) specify A123 APR18650M1A LFP/graphite cells, 1.1 Ah nominal capacity, 30°C ambient and a 3.6 V upper limit. The first four stages cover 0–20–40–60–80% SOC in ten minutes; the fourth C-rate follows the time-budget equation. The subsequent fixed 1C CC-CV charge to 100% and 4C discharge remain part of the lifetime experiment. The target is cycles until capacity falls below 80% of nominal, distinct from the CALCE RUL reference/confirmation rule.

Raw tables/source descriptions and SHA-256 provenance are preserved in `data/raw/charging_attia2020/`. Clean rows and protocol summaries are in `data/processed/charging_attia2020/`. Downloaded upstream Python files were inspected for protocol meaning and never executed. These cells are not merged with CALCE LCO cells. The original CALCE CS2 data use one charging policy and cannot identify a charging-current lifetime response.

## Evaluation

| recipe | n | mae_cycles | rmse_cycles | r2 |
|---|---|---|---|---|
| mean_life_baseline | 45 | 150.84 | 188.45 | -0.18 |
| selected_surrogate | 45 | 112.77 | 138.91 | 0.36 |

All five replicates of a held protocol stay outside fitting. Inner held-protocol CV chooses Ridge alpha 1/10 or a small forest; outer protocol predictions evaluate the selection process. Final training then fits all 45 replicate cells. The model gives a modest improvement over the mean-life baseline, but has only nine independent protocol groups. It is not a reproduction of the paper's full 224-policy closed-loop system. Fitted predictions attached to the known protocols are not independent validation of ranking those same protocols. Default measured rankings are retrospective evidence with substantial replicate variation, not guaranteed lifetime gains.

## Optimisation constraints

The request protocol must be `ATTIA2020_LFP_10MIN`; CALCE/NMC/unknown protocols are refused. `max_c_rate` must be positive and no greater than 8; all four stages must satisfy it. A limit with no tested feasible protocol returns no recommendation. Every candidate has the same nominal ten-minute 0–80% budget, so this is lifetime optimisation under a fixed charging time, not a time/life tradeoff optimiser. Temperature and voltage are study conditions, not newly predicted or validated outputs. Changing SOC windows, charging time, chemistry or operating conditions requires new data and evaluation.

A request with maximum 6C selects `protocol_04` by measured mean. It has first-stage rates 5.2C, 5.2C, 4.8C with a fourth rate derived from the ten-minute constraint. Do not apply those currents to the CALCE LCO cells or a real EV from this project. The response includes its five-cell observed mean, standard deviation, observed range, model estimate, SOC windows and stage times.
