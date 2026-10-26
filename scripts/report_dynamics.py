"""Report final SOC/vehicle tests, conditions and coverage without changing fitted models."""
import json
import os
from pathlib import Path
import pandas as pd
import matplotlib
ROOT=Path(__file__).resolve().parents[1]
os.environ['MPLCONFIGDIR']=str(ROOT/'work/matplotlib_cache')
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def markdown_table(frame,columns):
    lines=['| '+' | '.join(columns)+' |','|'+'|'.join(['---']*len(columns))+'|']
    for r in frame.to_dict('records'):
        lines.append('| '+' | '.join(f'{r[c]:.3f}' if isinstance(r[c],float) else str(r[c]) for c in columns)+' |')
    return '\n'.join(lines)

def main():
    overview=[]
    for name,title in [('soc_calce','CALCE lab SOC'),('soc_vehicle','Vehicle SOC without a starting value'),('soc_tracking','Vehicle SOC with a known starting value')]:
        out=ROOT/f'reports/{name}';summary=json.loads((out/'summary.json').read_text());metrics=pd.read_csv(out/'metrics.csv')
        test=metrics.loc[metrics.split=='test']
        if 'cohort' in test:test=test.loc[test.cohort=='all eligible']
        predictions=pd.read_csv(out/'predictions.csv').loc[lambda d:d.split=='test']
        fig,axes=plt.subplots(1,2,figsize=(12,4),layout='constrained')
        for session,g in predictions.groupby('session_id'):
            g=g.iloc[::max(1,len(g)//1000)]
            axes[0].scatter(g.actual_soc_pct,g.predicted_soc_pct,s=3,alpha=.3)
        axes[0].plot([0,100],[0,100],'k--',linewidth=1)
        axes[0].set(xlabel='Reference SOC (%)',ylabel='Predicted SOC (%)',title=title+' — held-out data')
        error=predictions.predicted_soc_pct-predictions.actual_soc_pct
        axes[1].hist(error,bins=60,color='#317e99')
        axes[1].set(xlabel='SOC error (percentage points)',ylabel='Observations',title='All eligible held-out observations')
        fig.savefig(out/'evaluation.png',dpi=150);plt.close(fig)
        method='calibrated_tracking' if name=='soc_tracking' else 'selected_soc'
        result=test.loc[test.recipe==method].iloc[0]
        overview.append({'component':title,'mae':float(result.mae),'unit':'SOC percentage points','evaluation':'Held complete BJDST profile' if name=='soc_calce' else 'Held recording days'})
        calibration_note='The capacity reference was measured earlier (October 2015); dynamic sessions are November 2015. Completed CC-CV charge establishes 100%; net discharge/charge counters give a causal coulomb reference including regeneration. The reference is not an independent true-SOC sensor. Values below zero from calibration/condition differences are retained in the data but excluded as physically invalid supervised targets; no endpoint-based capacity normalisation or silent target clipping was applied.' if name=='soc_calce' else 'Targets are the recorded vehicle BMS SoC [%], not displayed SOC, min/max SOC, a new true-SOC sensor or a capacity estimate. Displayed/min/max SOC are excluded from learned inputs.'
        if name=='soc_tracking':
            method_note='The calibrated observer learns SOC change per integrated Ah from training trips. It requires a correct known SOC at the first observation. Each later prediction uses only current history since that initialisation; no later BMS SOC is an input. A recording gap requires reinitialisation. The near-0.1-point result applies to this initialised scenario and must not be advertised as accuracy without a starting SOC.'
            selection_note='Three predefined inverse-capacity models (constant, temperature-dependent, and temperature/initial-SOC-dependent) were compared on validation recording days. The constant calibrated model was selected before opening test trips.'
            coverage='The held-out result uses all 15 test trips with one known SOC seed per uninterrupted segment. Runtime additionally rejects out-of-domain voltage, temperature and missing current intervals.'
        else:
            method_note='The sensor-only estimator uses present voltage/current/temperature and backward-looking 5/30-second summaries. It needs thirty seconds of history and no reported current SOC or cumulative charge counter. Raw predictions are retained; outputs are bounded to 0–100% and both raw/bounded errors are reported.'
            selection_note='Ridge, two histogram-gradient boosting configurations, random forest and extra trees were compared using training-only grouped CV and independent validation groups. Candidate selection minimised validation macro-session MAE. Then the selected settings were fitted on training+validation data and evaluated on untouched held groups. Preprocessing is fitted inside each training fold and sessions have equal total fitting weight.'
            coverage=f'Runtime feature-range coverage among eligible test observations: {summary["test_runtime_supported"]}/{summary["test_eligible_rows"]} ({100*summary["test_runtime_supported"]/summary["test_eligible_rows"]:.1f}%). Warmup and physically invalid reference labels are counted in the data audits rather than silently scored as zero error.'
        (out/'review.md').write_text(f'''# {title}

Selected model: `{summary['selected']}`. Predictions and complete comparisons are in `metrics.csv` and `predictions.csv`.

## Reference and input scenario

{calibration_note}

{method_note}

## Evaluation

{selection_note}

{markdown_table(test,['recipe','n','sessions','mae','macro_session_mae','rmse','p95_absolute_error','max_absolute_error'])}

{coverage}

Lab data use one SP20-2 NMC cell at 25°C: FUDS/DST train, US06 validation, BJDST final test. Vehicle data use 70 trips from one BMW i3: 48 train, 7 validation, 15 test; recording days never cross splits. These are new held profile/day results within the same source cell/vehicle, not evidence of generalisation to unseen chemistries, packs or cars. All selections were frozen before opening their test outcomes; subsequent reproduction does not create a new independent test.

## Sources and limits

[CALCE experiment description](https://calce.umd.edu/data). Vehicle source: Steinstraeter, Buberger and Trifonov, [Battery and Heating Data in Real Driving Cycles](https://doi.org/10.21227/6jr9-5235). The public Kaggle mirror was used because the publisher page was inaccessible; source identity, URLs, archive hashes and CRC checks are recorded in `reports/dynamics/source_manifest.json`. The mirror is not claimed to have a publisher-certified checksum. Raw files remain intact. Nonfinite/physically invalid source readings split histories; no interpolation hides missing current or SOC.
''',encoding='utf-8')
    out=ROOT/'reports/driving';metrics=pd.read_csv(out/'metrics.csv');predictions=pd.read_csv(out/'predictions.csv')
    test=metrics.loc[(metrics.split=='test')&(metrics.cohort=='all eligible')]
    fig,axes=plt.subplots(1,2,figsize=(12,4),layout='constrained')
    for ax,(name,unit) in zip(axes,[('next_60s','Wh'),('next_km','Wh/km')]):
        p=predictions.loc[(predictions.split=='test')&(predictions.target==name)]
        ax.scatter(p.actual,p.predicted,s=4,alpha=.25)
        low=min(p.actual.min(),p.predicted.min());high=max(p.actual.max(),p.predicted.max())
        ax.plot([low,high],[low,high],'k--',linewidth=1)
        ax.set(xlabel='Actual '+unit,ylabel='Predicted '+unit,title=name+' — held recording days')
        r=test.loc[(test.target==name)&(test.recipe=='selected_strategy')].iloc[0]
        overview.append({'component':name,'mae':float(r.mae),'unit':unit,'evaluation':'Held recording days'})
    fig.savefig(out/'evaluation.png',dpi=150);plt.close(fig)
    audits=pd.read_csv(ROOT/'reports/vehicle_data/trip_audit.csv');splits=pd.read_csv(ROOT/'reports/vehicle_data/splits.csv')
    for target,g in predictions.loc[predictions.split=='test'].groupby('target'):
        error=(g.predicted-g.actual).abs()
        g.assign(absolute_error=error).nlargest(20,'absolute_error').to_csv(out/f'{target}_largest_errors.csv',index=False)
    (out/'review.md').write_text(f'''# Driving energy forecasts and range scenario

Two models are fitted in `models/final/driving.joblib`: next-60-second net energy (Wh) and next-kilometre net consumption (Wh/km). A positive value means net battery consumption; negative values retain regenerative recovery.

## Data, labels and splitting

The vehicle archive has 70 trip CSVs plus an overview and a source reader (72 archive members). Source readers were not executed. There are {int(audits.source_rows.sum()):,} original sensor rows and {int(audits.invalid_rows.sum())} flagged invalid rows. Signals are standardised with positive current meaning charging. Energy is integrated at the original 0.1-second resolution from `-voltage*current`; distance is integrated from speed. Labels refer strictly to future energy. Predictors include only present and prior voltage/current, speed, temperature, heating and elevation, with a 60-second warmup. Neither future speed/route, future energy, SOC labels nor whole-trip averages are predictors.

No integration crosses an invalid reading or recording gap. Histories use real observations sampled at about 1 Hz rather than invented interpolated sensor values. Future energy labels use time/distance interpolation only at the exact horizon boundary. A next-kilometre target requires the km to occur within ten minutes. Targets crossing extended stationary charging are undefined; regeneration remains valid. Missing future horizons remain unlabelled.

Splits hold out entire recording days, with deterministic summer/winter stratification: {int((splits.split=='train').sum())} training trips, {int((splits.split=='validation').sum())} validation, {int((splits.split=='test').sum())} test. Train-only grouped CV compares five learner configurations. Validation macro-trip error chooses the settings and compares the best ML candidate against recent-rate persistence. Frozen choices precede test opening. The final models fit only training+validation trips. Test figures and every baseline remain available.

## Final held-day errors

{markdown_table(test,['target','recipe','n','sessions','mae','macro_session_mae','rmse','p95_absolute_error','max_absolute_error'])}

Runtime-range-filtered results are separate rows in `metrics.csv`, not a replacement for full eligible-test results. Input/outcome coverage is in `reports/vehicle_data/trip_audit.csv`; difficult events are retained in the largest-error tables. Minute-energy errors are substantial because future acceleration, traffic and route changes are not known inputs.

## Range calculation

Range uses the learned next-km consumption with current SOC, a **supplied** usable capacity and **supplied operational SOC minimum/maximum**. Physical BMS SOC and displayed usable SOC are different scales: available usable fraction is `(soc - soc_min) / (soc_max - soc_min)`, bounded to 0–1. An explicit usable-SOC reserve is removed before dividing available Wh by predicted Wh/km. Nonpositive consumption produces no finite range estimate. Capacities and reserves are checked for finite, valid values.

This is a conditional estimate of how far the available energy would last if recent conditions continue. The data do not contain independently measured full-depletion range labels, so no kilometre-range MAE is invented and no separate range regressor is claimed. The underlying consumption forecasts and SOC tracking are evaluated; the conversion formula and complete API path are tested. User-supplied capacity must already reflect the intended pack's usable energy; the CALCE LCO SOH model is not silently applied to this BMW pack.

## Limits

One vehicle and two seasons do not establish performance for every EV. Data-derived SOC references, capacity uncertainty, traffic, gradients and future driving changes remain sources of error. Predicted range is not a guarantee. The LFP charging-policy model and CALCE ageing models retain their separate supported domains. Frontend integration should display nullable statuses, initialisation requirements and these scenario assumptions.
''',encoding='utf-8')
    pd.DataFrame(overview).to_csv(ROOT/'reports/dynamics/model_metrics.csv',index=False)
    print('SOC, tracking, driving and range documentation/figures saved; models unchanged.')

if __name__=='__main__':main()
