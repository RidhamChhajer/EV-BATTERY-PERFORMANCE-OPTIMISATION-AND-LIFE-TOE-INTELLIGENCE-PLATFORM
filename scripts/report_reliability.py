"""Report development error and abstention coverage without fitting any models."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ['MPLCONFIGDIR'] = str(ROOT/'work/matplotlib_cache')
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import train_soh as training
from predict_soh import in_bounds

OUT = ROOT/'reports/reliability'

def main():
    summary = json.loads((OUT/'summary.json').read_text())
    profiles = pd.read_csv(ROOT/'data/processed/soh_reliable/profiles.csv')
    examples = profiles.loc[profiles.status=='ok']
    predictions = pd.read_csv(OUT/'out_of_fold_predictions.csv')
    folds = pd.read_csv(OUT/'by_battery.csv')
    candidates = json.loads((OUT/'inner_cv_settings.json').read_text())
    statuses = []
    for held,g in examples.groupby('cell_id'):
        winner = min((r for r in candidates if r['outer_held_cell']==held),key=lambda r:r['macro_cell_mae_pp'])
        fitted = examples.loc[examples.cell_id!=held]
        bounds = {f:[float(fitted[f].min()),float(fitted[f].max())] for f in winner['features']}
        statuses.extend({'cell_id':held,'observed_cycle_number':int(r['observed_cycle_number']),
                         'runtime_status':'ok' if in_bounds(r,bounds) else 'outside_training_range'} for r in g.to_dict('records'))
    status = pd.DataFrame(statuses)
    status.to_csv(OUT/'runtime_status_by_cycle.csv',index=False)
    predictions = predictions.merge(status,on=['cell_id','observed_cycle_number'],how='left',validate='many_to_one')
    runtime = predictions.loc[predictions.runtime_status=='ok']
    rows = []
    for recipe,g in runtime.groupby('recipe'):
        score = training.scores(g.actual_soh_pct.tolist(),g.predicted_soh_pct.tolist())
        error = g.error_pp.abs()
        rows.append({'recipe':recipe,**score,'p95_absolute_error_pp':float(error.quantile(.95)),
                     'max_absolute_error_pp':float(error.max()),'errors_over_10pp':int(error.gt(10).sum())})
    metrics = pd.DataFrame(rows)
    metrics.to_csv(OUT/'runtime_metrics.csv',index=False)
    coverage = profiles[['cell_id','observed_cycle_number','status']].merge(status,on=['cell_id','observed_cycle_number'],how='left',validate='one_to_one')
    coverage['runtime_status'] = coverage.runtime_status.fillna(coverage.status)
    coverage.groupby(['cell_id','runtime_status']).size().rename('n').to_csv(OUT/'runtime_coverage.csv')
    n_runtime = int(coverage.runtime_status.eq('ok').sum())
    ranges = []
    for recipe,g in runtime.groupby('recipe'):
        for label,low,high in training.HEALTH_RANGES:
            selected = g.loc[(g.actual_soh_pct>=low)&(g.actual_soh_pct<high)]
            ranges.append({'recipe':recipe,'health_range':label,**training.scores(selected.actual_soh_pct.tolist(),selected.predicted_soh_pct.tolist())})
    pd.DataFrame(ranges).to_csv(OUT/'runtime_by_health_range.csv',index=False)
    fig,axes = plt.subplots(1,2,figsize=(12,4),layout='constrained')
    labels = ['Previous model','Updated model','Previous measured SOH']
    recipes = ['old_same_supported_profiles','guarded_selected_model','previous_soh_baseline']
    ordered = metrics.set_index('recipe').loc[recipes]
    axes[0].bar(labels,ordered.mae_pp,color=['#9b5563','#237c99','#748563'])
    axes[0].set_ylabel('SOH mean absolute error (percentage points)')
    axes[0].set_title('Same supported sessions; development battery CV')
    counts = coverage.runtime_status.value_counts()
    axes[1].barh(counts.index,counts.values,color='#237c99')
    axes[1].set_xlabel('Charging sessions')
    axes[1].set_title('Prediction coverage including all original sessions')
    fig.savefig(OUT/'reliability.png',dpi=160)
    plt.close(fig)
    old = ordered.loc['old_same_supported_profiles'];new = ordered.loc['guarded_selected_model']
    table = ['| Method | Sessions | MAE (pp) | RMSE (pp) | Worst error (pp) | Errors >10 pp |',
             '|---|---:|---:|---:|---:|---:|']
    for label,(_,r) in zip(labels,ordered.iterrows()):
        table.append(f'| {label} | {int(r.n)} | {r.mae_pp:.3f} | {r.rmse_pp:.3f} | {r.max_absolute_error_pp:.2f} | {int(r.errors_over_10pp)} |')
    report = f'''# Current-data reliability review

The selected final laboratory model is `{summary['selected']['model']}` with `{summary['selected']['parameters']}`, using `{summary['selected']['feature_set']}` features. It was fitted on {summary['supported_examples']:,} supported sessions from all six available ageing cells. The scaler and estimator use equal total sample weight per battery.

## What was fixed

Short top-up sessions sometimes start with the cell already largely charged. Whole-session average voltage/current and charge duration can then resemble a degraded battery despite a valid later discharge-capacity label. Valid labels were retained; unsupported inputs now produce an explicit no-estimate result. Current-charge inputs must cover the measured 4.0–4.1 V constant-current window with adequate sampling and finish the CV taper. Ratios compare charge counter increments with the cell's initial charging profile, avoiding sample-mean bias for those features. The starting voltage helps describe partial charging. No current discharge capacity or future health is an input.

The voltage-window-only candidate was worse than the existing regression; it was not automatically promoted. Inner battery CV chooses among session, window and combined features with Ridge alpha 1/10 or a restricted forest. Outer held-battery outcomes evaluate this selection procedure. Final all-data settings are chosen separately using all six development cells. The report does not treat all-data fitting error as predictive performance.

## Error and coverage

{chr(10).join(table)}

These rows use exactly the same {n_runtime:,} sessions after both charging checks and each outer fold's fitted feature-range checks. The updated MAE is {(1-new.mae_pp/old.mae_pp)*100:.1f}% lower on this cohort. The original unguarded recipe's full-cohort results remain in `metrics.csv`; they include unsupported sessions and must not be called a same-cohort comparison.

Charge-profile coverage is {summary['coverage_pct']:.1f}% ({summary['supported_examples']:,}/{summary['original_examples']:,}). Outer-fold runtime coverage is {100*n_runtime/summary['original_examples']:.1f}% ({n_runtime:,}/{summary['original_examples']:,}); the remaining cases receive no estimate. Coverage depends on the fitted training ranges and will differ on new data. All abstention reasons are recorded in `runtime_coverage.csv`. Errors by health range are in `runtime_by_health_range.csv`, including empty groups. This is regression: uneven battery/health coverage matters more than classification class balancing. Rows from the same battery are never randomly split across fitting and validation.

## How to use the final model

Use `models/reliable/soh_guarded.joblib` through `scripts/predict_soh.py`, which checks the raw charging measurements and age inputs before prediction. Supply one chronological, completed charge with the processed sensor column names, recorded cycle number and elapsed days. The selected combined/window model also needs an initial charge CSV from the same cell. Do not use another cell's calibration. Prediction occurs before the current discharge capacity is measured. The target is SOH relative to the first recorded full-cycle capacity, which may already reflect ageing.

Example PowerShell command (replace input filenames and age with your actual measurements):

```powershell
.\\.venv\\Scripts\\python.exe scripts\\predict_soh.py current_charge.csv --cycle 200 --elapsed-days 60 --protocol CALCE_CS2 --reference initial_charge.csv
```

When a previous capacity measurement exists, carrying its SOH forward remains more accurate in this dataset. That is a historical estimate, not a new sensor diagnosis. The existing `models/final/with_history_rule.json` explicitly describes this rule. `soh_charge_window.joblib` is the earlier experimental candidate; use `soh_guarded.joblib` for the current selected estimator.

## Remaining limits

All six cells, including the old test cell, have already been inspected. These numbers are nested development cross-validation, not a new untouched final test; feature investigation used these data and can make the numbers optimistic. A new independent battery dataset is needed to quantify generalisation. Large errors still occur; the charging/range guards do not guarantee accurate in-range estimates. No confidence interval or EV deployment claim is justified.

Only six LCO laboratory cells support the SOH model. Chemistry, temperature and real pack/driving coverage have not been added by cleaning. Initial calibration, completed charging and the source protocol remain necessary. This work does not train RUL or validate a charging optimiser. Raw data, original targets and the previous frozen evaluation remain intact.

## Verification and rebuilding

```powershell
.\\.venv\\Scripts\\python.exe -m unittest discover -s tests
.\\.venv\\Scripts\\python.exe scripts\\improve_soh.py
```

The first command checks timing, invalid inputs, incomplete/top-up profiles, sampling resolution, cumulative-counter resets, calibration, metrics and battery weighting. Fitting verifies saved-model prediction round trips. The report script uses matplotlib from the full processing environment; training requires only the existing training dependencies.
'''
    (OUT/'review.md').write_text(report,encoding='utf-8')
    summary['runtime_cv_examples'] = n_runtime
    summary['runtime_cv_coverage_pct'] = 100*n_runtime/summary['original_examples']
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2,allow_nan=False),encoding='utf-8')
    print(metrics.to_string(index=False))
    print(f'Runtime CV coverage: {n_runtime}/{summary["original_examples"]}; report saved.')

if __name__=='__main__':
    main()
