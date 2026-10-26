"""Create model reviews and scientific figures from saved predictions; never fit."""
import json
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
os.environ['MPLCONFIGDIR']=str(ROOT/'work/matplotlib_cache')
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def table(frame,columns):
    lines=['| '+' | '.join(columns)+' |','|'+'|'.join(['---']*len(columns))+'|']
    for row in frame.to_dict('records'):
        values=[f'{row[c]:.2f}' if isinstance(row[c],float) else str(row[c]) for c in columns]
        lines.append('| '+' | '.join(values)+' |')
    return '\n'.join(lines)

def main():
    rul=ROOT/'reports/rul';charging=ROOT/'reports/charging'
    summary=json.loads((rul/'summary.json').read_text())
    metrics=pd.read_csv(rul/'metrics.csv');pred=pd.read_csv(rul/'out_of_fold_predictions.csv')
    selected=pred.loc[pred.recipe=='selected_model_measured_soh'].copy()
    selected['absolute_error_cycles']=(selected.predicted_remaining_cycles-selected.actual_remaining_cycles).abs()
    selected.nlargest(20,'absolute_error_cycles').to_csv(rul/'largest_errors.csv',index=False)
    ranges=[]
    for name,low,high in [('0-50',0,50),('50-200',50,200),('>=200',200,np.inf)]:
        group=selected.loc[(selected.actual_remaining_cycles>=low)&(selected.actual_remaining_cycles<high)]
        ranges.append({'actual_remaining_range':name,'n':len(group),'mae_cycles':float(group.absolute_error_cycles.mean()),'max_error_cycles':float(group.absolute_error_cycles.max())})
    pd.DataFrame(ranges).to_csv(rul/'by_remaining_life_range.csv',index=False)
    fig,axes=plt.subplots(1,2,figsize=(12,4),layout='constrained')
    for cell,g in selected.groupby('cell_id'):
        axes[0].scatter(g.actual_remaining_cycles,g.predicted_remaining_cycles,s=5,alpha=.4,label=cell)
    axes[0].plot([0,620],[0,620],color='black',linestyle='--',linewidth=1)
    axes[0].set(xlabel='Measured remaining recorded cycles',ylabel='Predicted remaining recorded cycles',title='RUL: held-battery development predictions')
    axes[0].legend(fontsize=7)
    folds=pd.read_csv(rul/'by_battery.csv')
    for index,recipe in enumerate(['age_prior','selected_model_measured_soh']):
        g=folds.loc[folds.recipe==recipe]
        axes[1].bar(np.arange(len(g))+(index-.5)*.35,g.mae_cycles,width=.35,label=recipe)
    axes[1].set_xticks(np.arange(6),sorted(selected.cell_id.unique()),rotation=30)
    axes[1].set(ylabel='Mean absolute error (recorded cycles)',title='Error varies by independent battery')
    axes[1].legend(fontsize=8)
    fig.savefig(rul/'evaluation.png',dpi=160);plt.close(fig)
    report=f'''# Remaining-life model review

Final model: {summary['selected']['model']} with {summary['selected']['parameters']}, fitted on {summary['examples']:,} examples from all six CALCE LCO cells. Model file: `models/final/rul.joblib`.

## Target and timing

Predict remaining **recorded cycle groups** to the first three-observation confirmation of SOH at or below 80% of the first recorded valid capacity. All six current cells have an observed event. Censored cells would be excluded from ordinary regression; unknown future events are never labelled zero. Examples after the event are excluded. The training builder checks the event against the actual three-observation threshold. Its health trajectory features use only the latest and earlier observations: five observations minimum and the latest twenty for slope/std/span. Current SOH is allowed here because forecasting happens after a health observation. Age and source discharge C-rate are also required. Neither event flags nor future event cycles are predictors.

## Development evaluation

{table(metrics,['recipe','cohort','n','mae_cycles','rmse_cycles'])}

Inner leave-one-battery-out CV selects Ridge alpha 10/100 or a forest limited to depth 6 and 15 samples per leaf. An outer battery is never used to fit its scaler or estimator. Equal total battery weights prevent long records dominating fitting. Final all-data fitting is separate from the reported held-battery predictions. All six cells had already been inspected during SOH work, so this is development evaluation, not a fresh untouched EV test.

The age baseline subtracts current age from the other training cells' average event cycle. Naive linear health extrapolation is unstable when the early degradation slope is nearly flat; its large errors remain visible rather than being silently removed. Negative model estimates are explicitly floored at zero ({summary['negative_predictions_floored']} measured-input raw predictions were negative). Three measured below-threshold observations return zero; when the health input is predicted, the API labels this an **estimated threshold crossing**, not a confirmed capacity measurement.

SOH error propagation is evaluated with held-battery SOH predictions, filtered by their actual runtime guards. `selected_model_mixed_soh` uses measured earlier health and a predicted current health, matching `/api/assess`. `selected_model_predicted_soh` uses an entirely predicted history. Paired rows compare scenarios on identical accepted cycles. Missing SOH estimates remain missing; no interpolation manufactures health history. Coverage for measured-input RUL is {int(selected.runtime_supported.sum())}/{len(selected)}, or {100*selected.runtime_supported.mean():.1f}%. Sensor-to-RUL coverage is lower and is shown in the corresponding metric counts. The same six-cell development data inform both components, which limits independent evidence.

## Remaining limits

Worst measured-input development error: {selected.absolute_error_cycles.max():.1f} recorded cycles; 95th percentile: {selected.absolute_error_cycles.quantile(.95):.1f}. Battery-specific errors and errors near the event remain important; see the figure, `largest_errors.csv`, and `by_remaining_life_range.csv`. No conversion into EV kilometres, years or real full-cycle equivalents is supported. Factory-new capacity, missing physical cycles, temperature, new chemistry and pack behaviour are outside this model's scope. A new independent battery set is required for final generalisation evidence.
'''
    (rul/'review.md').write_text(report,encoding='utf-8')
    c_summary=json.loads((charging/'summary.json').read_text());c_metrics=pd.read_csv(charging/'metrics.csv')
    protocols=pd.read_csv(ROOT/'data/processed/charging_attia2020/tested_protocols.csv')
    c_pred=pd.read_csv(charging/'out_of_protocol_predictions.csv')
    fig,ax=plt.subplots(figsize=(10,4),layout='constrained')
    x=np.arange(len(protocols))
    ax.bar(x,protocols.observed_mean_life_cycles,yerr=protocols.observed_std_life_cycles,capsize=3,alpha=.65,label='Measured mean ± replicate SD (five cells)')
    held=c_pred.loc[c_pred.recipe=='selected_surrogate'].groupby('held_protocol').predicted_cycles.mean()
    ax.scatter(x,held.loc[protocols.protocol_id],color='darkred',marker='D',label='Held-protocol surrogate prediction')
    ax.set_xticks(x,protocols.protocol_id,rotation=25)
    ax.set(ylabel='Study cycle life',title='Charging study: measured variation and held-protocol predictions')
    ax.legend(fontsize=9)
    fig.savefig(charging/'evaluation.png',dpi=160);plt.close(fig)
    report=f'''# Charging protocol model and optimiser

Final surrogate: {c_summary['selected']['model']} with {c_summary['selected']['parameters']}. Model file: `models/final/charging.joblib`. The optimiser ranks the nine **tested** protocols subject to a user-supplied peak C-rate limit. The default maximises measured mean lifetime; an optional mode ranks saved ML lifetime estimates. It performs no hardware control and invents no outcome for an untested protocol.

## Data and scope

The authors' [released measured validation table](https://github.com/chueh-ermon/battery-fast-charging-optimization/blob/master/figures/fig4/final_results.csv) contains nine protocols and five replicate cells each. Training uses these measured lifetimes, not `predictions.csv` early model estimates. The [study methods](https://web.mit.edu/braatzgroup/Attia_Nature_2020.pdf) specify A123 APR18650M1A LFP/graphite cells, 1.1 Ah nominal capacity, 30°C ambient and a 3.6 V upper limit. The first four stages cover 0–20–40–60–80% SOC in ten minutes; the fourth C-rate follows the time-budget equation. The subsequent fixed 1C CC-CV charge to 100% and 4C discharge remain part of the lifetime experiment. The target is cycles until capacity falls below 80% of nominal, distinct from the CALCE RUL reference/confirmation rule.

Raw tables/source descriptions and SHA-256 provenance are preserved in `data/raw/charging_attia2020/`. Clean rows and protocol summaries are in `data/processed/charging_attia2020/`. Downloaded upstream Python files were inspected for protocol meaning and never executed. These cells are not merged with CALCE LCO cells. The original CALCE CS2 data use one charging policy and cannot identify a charging-current lifetime response.

## Evaluation

{table(c_metrics,['recipe','n','mae_cycles','rmse_cycles','r2'])}

All five replicates of a held protocol stay outside fitting. Inner held-protocol CV chooses Ridge alpha 1/10 or a small forest; outer protocol predictions evaluate the selection process. Final training then fits all 45 replicate cells. The model gives a modest improvement over the mean-life baseline, but has only nine independent protocol groups. It is not a reproduction of the paper's full 224-policy closed-loop system. Fitted predictions attached to the known protocols are not independent validation of ranking those same protocols. Default measured rankings are retrospective evidence with substantial replicate variation, not guaranteed lifetime gains.

## Optimisation constraints

The request protocol must be `ATTIA2020_LFP_10MIN`; CALCE/NMC/unknown protocols are refused. `max_c_rate` must be positive and no greater than 8; all four stages must satisfy it. A limit with no tested feasible protocol returns no recommendation. Every candidate has the same nominal ten-minute 0–80% budget, so this is lifetime optimisation under a fixed charging time, not a time/life tradeoff optimiser. Temperature and voltage are study conditions, not newly predicted or validated outputs. Changing SOC windows, charging time, chemistry or operating conditions requires new data and evaluation.

A request with maximum 6C selects `protocol_04` by measured mean. It has first-stage rates 5.2C, 5.2C, 4.8C with a fourth rate derived from the ten-minute constraint. Do not apply those currents to the CALCE LCO cells or a real EV from this project. The response includes its five-cell observed mean, standard deviation, observed range, model estimate, SOC windows and stage times.
'''
    (charging/'review.md').write_text(report,encoding='utf-8')
    print('RUL and charging reviews and figures saved; no models refitted.')

if __name__=='__main__':main()
