"""Plot and report the frozen evaluation; never refit or change model selection."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ['MPLCONFIGDIR'] = str(ROOT/'work/matplotlib_cache')
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

OUT = ROOT/'reports/evaluation'

def main():
    lock_path = OUT/'selection.json'
    lock_before = lock_path.read_bytes()
    selection = json.loads(lock_before)
    complete = json.loads((OUT/'evaluation_complete.json').read_text())
    assert complete['status']=='complete' and not complete['selection_changed_after_test']
    predictions = pd.read_csv(OUT/'test_predictions.csv')
    development = pd.read_csv(OUT/'development_predictions.csv')
    tail = []
    for (variant,model),group in predictions.groupby(['feature_variant','model']):
        absolute = group.error_pp.abs()
        assert group.cell_id.eq('CS2_38').all()
        assert len(group)==complete['test_examples']
        assert np.allclose(group.predicted_soh_pct-group.actual_soh_pct,group.error_pp)
        tail.append({'feature_variant':variant,'model':model,'n':len(group),
                     'median_absolute_error_pp':absolute.median(),'p95_absolute_error_pp':absolute.quantile(.95),
                     'p99_absolute_error_pp':absolute.quantile(.99),'max_absolute_error_pp':absolute.max(),
                     'errors_over_5pp':int(absolute.gt(5).sum()),'errors_over_10pp':int(absolute.gt(10).sum())})
    pd.DataFrame(tail).to_csv(OUT/'test_error_tails.csv',index=False)
    # These summaries describe saved errors; they do not exclude difficult cases or tune a guard.
    features = pd.read_csv(ROOT/'data/processed/life_prediction/soh_examples.csv')
    largest = predictions.loc[predictions.feature_variant=='without_history'].assign(abs_error=lambda d:d.error_pp.abs()).nlargest(10,'abs_error')
    largest.merge(features,on=['cell_id','observed_cycle_number'],validate='one_to_one').to_csv(OUT/'largest_errors_with_inputs.csv',index=False)
    plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
    fig,axes = plt.subplots(2,2,figsize=(12,8),layout='constrained')
    for column,variant in enumerate(['with_history','without_history']):
        group = predictions.loc[predictions.feature_variant==variant]
        ax = axes[0,column]
        ax.scatter(group.actual_soh_pct,group.predicted_soh_pct,s=9,alpha=.55)
        ax.plot([0,105],[0,105],ls='--',c='#666',lw=1)
        ax.set(title=f'{variant}: {group.model.iloc[0]}',xlabel='Measured reference SOH (%)',ylabel='Predicted SOH (%)',xlim=(0,105),ylim=(0,105))
        ax.grid(alpha=.15)
        ax = axes[1,column]
        ax.scatter(group.observed_cycle_number,group.error_pp,s=9,alpha=.65,c='#c34a36')
        ax.axhline(0,c='#666',lw=1)
        ax.set(xlabel='Recorded cycle group',ylabel='Prediction error (percentage points)')
        ax.grid(alpha=.15)
    fig.suptitle('Final test battery CS2_38: frozen selections, all cases retained',fontsize=14)
    fig.savefig(OUT/'test_predictions.png',dpi=160)
    plt.close(fig)
    fig,ax = plt.subplots(figsize=(11,5),layout='constrained')
    val = development.loc[(development.split=='validation') & (development.feature_variant=='without_history')]
    first = val.loc[val.model=='ridge']
    ax.plot(first.observed_cycle_number,first.actual_soh_pct,label='Measured',c='#222',lw=1.5)
    for model,group in val.groupby('model'):
        ax.plot(group.observed_cycle_number,group.predicted_soh_pct,label=model,alpha=.8,lw=.9)
    ax.set(title='Validation battery CS2_34: finalists without capacity history',xlabel='Recorded cycle group',ylabel='Reference SOH (%)')
    ax.legend();ax.grid(alpha=.15)
    fig.savefig(OUT/'validation_predictions.png',dpi=160)
    plt.close(fig)
    metrics = pd.read_csv(OUT/'test_metrics.csv')
    lines = ['# Step 5: SOH model evaluation', '', 'Model selection and the first reserved-test evaluation are complete. The selected artifacts are research prototypes; the no-history model has severe occasional errors.', '',
             '## Selection before the test', '',
             'A fixed small search tested Ridge alpha values 0.1, 1 and 10, plus the original forest settings and a shallower forest. Hyperparameters were selected by average leave-one-battery-out MAE across the four training cells. Scaling and weights were fitted separately inside each fold. The model family was then selected by validation MAE on CS2_34. No model was refitted on validation.', '',
             'The historical-input choice is the previous-SOH persistence baseline, not a learned improvement. The no-history choice is Ridge regression with alpha=10. Its validation MAE is 2.281 pp, compared with 2.275 pp for the original alpha=1 run; stronger regularization improved the training-only grouped-CV average rather than validation error. Small tuning did not establish a meaningful accuracy gain on validation.', '',
             'Selection was saved in selection.json and both final artifacts were written before test outcomes were opened. CS2_38 was evaluated only after that boundary. Test results did not change the choices.', '',
             '## Test results', '', '| Input scenario | Selected method | Examples | MAE (pp) | RMSE (pp) |', '|---|---|---:|---:|---:|']
    for row in metrics.itertuples():
        lines.append(f'| {row.feature_variant} | {row.model} | {row.n} | {row.mae_pp:.3f} | {row.rmse_pp:.3f} |')
    lines += ['', '| Input scenario | 95th-percentile absolute error (pp) | Maximum absolute error (pp) | Errors over 10 pp |', '|---|---:|---:|---:|']
    for row in tail:
        lines.append(f'| {row["feature_variant"]} | {row["p95_absolute_error_pp"]:.3f} | {row["max_absolute_error_pp"]:.3f} | {row["errors_over_10pp"]} |')
    lines += ['', '## Interpretation and limitations', '',
              'The no-history forest showed a large training-to-validation gap (training MAE about 0.69 pp versus validation MAE about 4.21 pp). This is consistent with overfitting and/or a shift between batteries and conditions. Grouped CV alone preferred the forest on average, but validation preferred Ridge; results vary by held-out battery, so ranking is not universally stable.', '',
              'The historical baseline requires a recent measured SOH. It is a carry-forward estimate, not a way to infer fresh health from voltage/current alone. Its small average error does not establish battery-life forecasting capability.', '',
              'The no-history regression has good average performance on the test cell but rare errors above 50 percentage points. For example, the largest error predicts roughly 20% SOH when the measured target is roughly 84%. Such tail errors make it unsuitable for confident standalone EV diagnosis. All cases remain in the reported metrics; predictions were not clipped and no test-driven exclusions were applied.', '',
              'The model uses recorded cycle count, recorded calendar age and charging-session summary features. Those summary means depend on the laboratory logging protocol. Missing initial-SOC/context and unusual charge sessions are possible sources of error; this evaluation does not prove their causal contribution.', '',
              'Validation included one cell at 0.5C and no accepted targets below 40% SOH. The test includes one cell at 1C and no accepted targets below 20%. Neither evaluation supports claims for those uncovered ranges, other chemistries or EV packs. SOH is relative to the first recorded complete-charge reference, not certified factory-new health.', '',
              'CS2_38 is now a consumed holdout. Further model or feature changes need a new independent holdout for an honest final evaluation. Do not rerun model selection using the current test errors.', '',
              '## Artifacts and next step', '',
              '- models/final/soh_without_history.joblib: selected research Ridge pipeline and ordered input names.',
              '- models/final/with_history_rule.json: selected carry-forward rule when previous measured SOH is available.',
              '- selection.json: locked parameters, validation scores, data checksum and artifact paths.',
              '- grouped_cv_folds.csv and grouped_cv_ranking.csv: training-only transfer comparisons.',
              '- development_metrics.csv and validation_predictions.png: training/validation comparison and large mistakes.',
              '- test_metrics.csv, test_health_ranges.csv, test_error_tails.csv and test_predictions.png: final test findings.',
              '- largest_errors_with_inputs.csv: error cases with the original input features, for investigation without retuning this test.', '',
              'Step 6 can build a research dashboard/API around these saved artifacts with their input assumptions and limitations visible. A reliable EV diagnostic model needs further data/context and fresh independent evaluation. RUL and charging optimisation remain separate tasks, not capabilities demonstrated here.']
    (OUT/'review.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    (ROOT/'models/final/README.md').write_text('Selected before reserved-test evaluation. See reports/evaluation/review.md.\n\nsoh_without_history.joblib is a research model with severe occasional errors; it is not a validated EV diagnostic. with_history_rule.json is a previous-measured-SOH rule, not a learned inference model.\n',encoding='utf-8')
    assert lock_before==lock_path.read_bytes(), 'Reporting must not alter the frozen model selection'
    print(pd.DataFrame(tail).to_string(index=False))
    print('Evaluation report and plots saved; selection unchanged.')

if __name__=='__main__':
    main()
