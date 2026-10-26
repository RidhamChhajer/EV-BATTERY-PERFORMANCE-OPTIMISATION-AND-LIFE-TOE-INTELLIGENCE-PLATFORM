# Vehicle SOC with a known starting value

Selected model: `{'features': ['net_charge_ah'], 'alpha': 0.01, 'validation': {'n': 1945, 'sessions': 7, 'mae': 0.11906656927684849, 'macro_session_mae': 0.08611113790235796, 'rmse': 0.1585775390160612, 'bias': 0.11423515613152481, 'p95_absolute_error': 0.336469519672692, 'max_absolute_error': 0.4233551684706178}}`. Predictions and complete comparisons are in `metrics.csv` and `predictions.csv`.

## Reference and input scenario

Targets are the recorded vehicle BMS SoC [%], not displayed SOC, min/max SOC, a new true-SOC sensor or a capacity estimate. Displayed/min/max SOC are excluded from learned inputs.

The calibrated observer learns SOC change per integrated Ah from training trips. It requires a correct known SOC at the first observation. Each later prediction uses only current history since that initialisation; no later BMS SOC is an input. A recording gap requires reinitialisation. The near-0.1-point result applies to this initialised scenario and must not be advertised as accuracy without a starting SOC.

## Evaluation

Three predefined inverse-capacity models (constant, temperature-dependent, and temperature/initial-SOC-dependent) were compared on validation recording days. The constant calibrated model was selected before opening test trips.

| recipe | n | sessions | mae | macro_session_mae | rmse | p95_absolute_error | max_absolute_error |
|---|---|---|---|---|---|---|---|
| calibrated_tracking | 5235 | 15 | 0.098 | 0.081 | 0.224 | 0.220 | 1.604 |
| nominal_60ah_coulomb_baseline | 5235 | 15 | 0.274 | 0.249 | 0.372 | 0.739 | 1.473 |

The held-out result uses all 15 test trips with one known SOC seed per uninterrupted segment. Runtime additionally rejects out-of-domain voltage, temperature and missing current intervals.

Lab data use one SP20-2 NMC cell at 25°C: FUDS/DST train, US06 validation, BJDST final test. Vehicle data use 70 trips from one BMW i3: 48 train, 7 validation, 15 test; recording days never cross splits. These are new held profile/day results within the same source cell/vehicle, not evidence of generalisation to unseen chemistries, packs or cars. All selections were frozen before opening their test outcomes; subsequent reproduction does not create a new independent test.

## Sources and limits

[CALCE experiment description](https://calce.umd.edu/data). Vehicle source: Steinstraeter, Buberger and Trifonov, [Battery and Heating Data in Real Driving Cycles](https://doi.org/10.21227/6jr9-5235). The public Kaggle mirror was used because the publisher page was inaccessible; source identity, URLs, archive hashes and CRC checks are recorded in `reports/dynamics/source_manifest.json`. The mirror is not claimed to have a publisher-certified checksum. Raw files remain intact. Nonfinite/physically invalid source readings split histories; no interpolation hides missing current or SOC.
