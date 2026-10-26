"""Review training/validation data only; preserve the reserved test battery."""
import csv
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import numpy as np
import pandas as pd

OUT = ROOT/'reports/pretraining'
DATA = ROOT/'data/processed/life_prediction'
TARGET = 'target_soh_reference_pct'
FEATURES = ['observed_cycle_number', 'elapsed_days', 'previous_soh_reference_pct', 'previous_capacity_age_observed_cycles',
            'charge_voltage_mean_v', 'charge_current_mean_a', 'charge_duration_approx_s']

def development_rows(name):
    with (DATA/name).open(newline='', encoding='utf-8') as handle:
        rows = [r for r in csv.DictReader(handle) if r['split'] in ('train', 'validation')]
    frame = pd.DataFrame(rows)
    for col in frame:
        if col not in ['cell_id','split','chemistry','start_timestamp','end_timestamp']:
            if frame[col].isin(['True','False']).all():
                frame[col] = frame[col].map({'True':True,'False':False})
            else:
                frame[col] = pd.to_numeric(frame[col].replace('', np.nan), errors='raise')
    assert 'CS2_38' not in set(frame.cell_id)
    assert set(frame.cell_id)=={'CS2_33','CS2_34','CS2_35','CS2_36','CS2_37'}
    return frame

def sensor_gaps(cells):
    summaries, detail = [], []
    columns = ['run_id','source_cycle_index','observed_cycle_number','test_time_s','step_index','current_a','voltage_v','phase','row_valid']
    for cell in cells:
        frame = pd.read_csv(DATA/'measurements'/f'{cell}.csv.gz', usecols=columns)
        frame = frame.loc[frame.row_valid].copy()
        keys = ['run_id','source_cycle_index']
        same_cycle = frame[keys].eq(frame[keys].shift()).all(axis=1)
        dt = frame.test_time_s.diff()
        active = same_cycle & frame.step_index.eq(frame.step_index.shift()) & frame.phase.eq(frame.phase.shift()) & frame.phase.isin(['charge','discharge']) & dt.gt(0)
        cv_taper = (frame.phase.eq('charge') & frame.voltage_v.ge(4.15) & frame.voltage_v.shift().ge(4.15)
                    & (frame.voltage_v-frame.voltage_v.shift()).abs().lt(.01) & frame.current_a.lt(frame.current_a.shift()))
        frame['active_gap_s'] = dt.where(active)
        frame['charge_gap_s'] = dt.where(active & frame.phase.eq('charge'))
        frame['unexplained_gap_s'] = dt.where(active & ~cv_taper)
        frame['cv_taper_long_interval'] = active & cv_taper & dt.gt(300)
        frame['discharge_time_s'] = frame.test_time_s.where(frame.phase.eq('discharge'))
        first_discharge = frame.groupby(keys).discharge_time_s.transform('min')
        frame['charge_after_discharge'] = frame.phase.eq('charge') & frame.test_time_s.gt(first_discharge)
        grouped = frame.groupby(keys, sort=False).agg(
            observed_cycle_number=('observed_cycle_number','first'),
            max_active_sampling_gap_s=('active_gap_s','max'),
            max_charge_sampling_gap_s=('charge_gap_s','max'),
            max_unexplained_active_sampling_gap_s=('unexplained_gap_s','max'),
            cv_taper_long_intervals=('cv_taper_long_interval','sum'),
            charge_after_discharge=('charge_after_discharge','any'))
        grouped['cell_id'] = cell
        detail.append(grouped.reset_index())
        summaries.append({'cell_id':cell, 'typical_active_interval_s':float(dt.loc[active].median()),
                          'active_intervals_over_300s':int((dt.loc[active]>300).sum()),
                          'largest_active_interval_s':float(dt.loc[active].max()),
                          'charge_intervals_over_300s':int((dt.loc[active & frame.phase.eq('charge')]>300).sum()),
                          'cv_taper_intervals_over_300s':int(frame.cv_taper_long_interval.sum()),
                          'unexplained_active_intervals_over_300s':int((active & ~cv_taper & dt.gt(300)).sum())})
    return pd.DataFrame(summaries), pd.concat(detail, ignore_index=True)

def plots(cycles, examples, coverage):
    os.environ['MPLCONFIGDIR'] = str(ROOT/'work/matplotlib_cache')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.size':9, 'axes.spines.top':False, 'axes.spines.right':False})
    fig, axes = plt.subplots(3,2,figsize=(11,10),layout='constrained')
    for ax,(cell,g) in zip(axes.flat, cycles.groupby('cell_id')):
        good = g.loc[g.full_cycle_candidate]
        color = '#e87924' if g.split.iloc[0]=='validation' else '#2474ad'
        ax.plot(good.observed_cycle_number,good.soh_reference_pct,color=color,lw=1)
        flagged = good.loc[good.capacity_jump_over_5pp]
        ax.scatter(flagged.observed_cycle_number,flagged.soh_reference_pct,c='#c53535',s=18,zorder=3,label='>5 pp change')
        ax.axhline(80,color='#777',ls='--',lw=.8)
        ax.set(title=f'{cell} ({g.split.iloc[0]})',xlabel='Recorded cycle group',ylabel='SOH relative to baseline (%)',ylim=(0,110))
        ax.grid(alpha=.15)
    axes.flat[-1].axis('off')
    axes.flat[-1].text(.05,.85,'Training + validation only\n\nRed points: capacity change >5 percentage points\nFlags prompt review; they do not prove faulty readings.\n\nDashed line: project 80% threshold\nNo smoothing or outlier removal\nReserved test battery excluded',va='top',linespacing=1.6)
    fig.suptitle('Recorded degradation histories',fontsize=14)
    fig.savefig(OUT/'degradation_curves.png',dpi=160)
    plt.close(fig)
    fig,axes = plt.subplots(2,4,figsize=(14,7),layout='constrained')
    cells = list(examples.cell_id.unique())
    for ax,col in zip(axes.flat,FEATURES):
        artists = ax.boxplot([examples.loc[examples.cell_id==c,col] for c in cells],tick_labels=[c.replace('CS2_','') for c in cells],patch_artist=True,showfliers=True,flierprops={'markersize':2})
        for patch,cell in zip(artists['boxes'],cells):
            patch.set_facecolor('#e87924' if cell=='CS2_34' else '#7db8db')
        ax.set(title=col.replace('_',' '),xlabel='CS2 cell (34 = validation)')
        ax.grid(axis='y',alpha=.15)
    axes.flat[-1].axis('off')
    fig.suptitle('Candidate input distributions by battery',fontsize=14)
    fig.savefig(OUT/'feature_distributions.png',dpi=160)
    plt.close(fig)
    pivot = coverage.pivot(index='health_range',columns='split',values='examples').fillna(0)
    pivot = pivot.reindex(['<20','20-40','40-60','60-80','80-100','>=100'])
    fig,ax = plt.subplots(figsize=(9,4.5),layout='constrained')
    pivot.plot.bar(ax=ax,color=['#2474ad','#e87924'],rot=0)
    ax.set(title='Health-range coverage (cycles, not independent batteries)',xlabel='Reference SOH (%)',ylabel='Examples')
    ax.grid(axis='y',alpha=.15)
    fig.savefig(OUT/'health_coverage.png',dpi=160)
    plt.close(fig)

def write_report():
    summary = json.loads((OUT/'summary.json').read_text())
    coverage = pd.read_csv(OUT/'health_coverage.csv')
    conditions = pd.read_csv(OUT/'condition_coverage.csv')
    text = ['# Pretraining review', '', 'All three requested checks are complete. We can proceed to step 4 with a laboratory SOH prototype.', '',
            '## 1. Capacity histories and sampling gaps', '',
            'The review found that some CS2 cycles reached the upper voltage during constant-current charging but did not finish the constant-voltage stage. Those undercharged discharge capacities must not be interpreted as fully charged battery health. The shared preparation code now requires recorded CV completion near 4.2 V and at or below 0.055 A, using a 5 mA tolerance around CALCE\'s stated 0.05 A cutoff. All charging features must precede the discharge measurement. Original records are retained; affected cycles have no SOH label.', '',
            f"In the five development batteries, {summary['charge_completion_not_verified_cycles']} recorded cycle groups fail charge-completion verification. After this correction, {summary['capacity_changes_over_5pp']} change larger than five SOH percentage points remains. It occurs after a roughly 11-day recording break and is retained for review; its cause is not established.", '',
            f"The {summary['cv_taper_long_intervals']:,} active intervals longer than 300 seconds have nearly constant high voltage and tapering current, consistent with sparse CV logging. No long within-step active interval lacks that signature. This is not proof that every physical cycle or measurement was recorded. There are {summary['inter_cycle_gaps_over_24h']} gaps longer than 24 hours between recorded cycle groups; no missing cycles are invented.", '',
            'Sampling is irregular. Charge current/voltage features are sample-weighted means, not time-weighted physical averages. Deployment must reproduce the feature construction or separately validate a change in sampling protocol.', '',
            '## 2. Useful inputs and prediction timing', '',
            'Prediction is made after current charging finishes, before current discharge capacity is measured. There are no missing candidate input values in the accepted development examples. Recorded timing confirms that charging inputs in accepted cycles precede discharge.', '',
            'The initial input list is in feature_contract.json: recorded cycle count, elapsed recording days, previous measured relative SOH, recorded cycles since that previous measurement, charge-voltage mean, charge-current mean and approximate charging duration. Past SOH requires a previous completed capacity test and the reference measurement; it is not automatically available from live voltage/current data. A second feature set excludes both historical-capacity inputs.', '',
            'Exclude current discharge capacity/current SOH, future end-of-life indicators and targets from predictors. Cell identity and split labels are metadata. Constant nominal capacity and redundant past-capacity columns are omitted. Future discharge rate is used for coverage reporting rather than as an input unless the protocol is known in advance.', '',
            f"There are {summary['examples_using_capacity_older_than_one_recorded_cycle']} examples whose previous capacity comes from more than one recorded cycle group earlier. The new previous_capacity_age_observed_cycles field exposes that staleness.", '',
            '## 3. Feature distributions and condition coverage', '',
            f"Prepared development examples: {summary['training_examples']:,} from four training batteries and {summary['validation_examples']:,} from one validation battery. The reserved test battery is excluded from all EDA plots, distributions and selection statistics. The corrected shared label rule was applied mechanically to every split.", '',
            '| Split | Discharge rate (C) | Independent cells | Examples |', '|---|---:|---:|---:|']
    for row in conditions.itertuples():
        text.append(f'| {row.split} | {row.discharge_c_rate:g} | {row.cells} | {row.examples} |')
    text += ['', '| Split | Relative SOH range (%) | Examples |', '|---|---|---:|']
    for row in coverage.itertuples():
        text.append(f'| {row.split} | {row.health_range} | {row.examples} |')
    text += ['', 'High-health examples dominate. Validation has no accepted SOH labels below 40% and only the 0.5C discharge condition, so its overall error cannot establish performance in those missing regions. Health ranges are regression evaluation strata, not classification labels. Discharge condition and cell identity are also confounded by the small experimental design.', '',
             'Start with the previous-SOH persistence baseline, then simple regression and a small tree model. Compare a model using historical capacity with one without it. Report errors separately by battery and health range, plus an average giving each battery equal weight. Consider grouped cross-validation on training batteries for additional coverage; keep the separate validation and final test roles intact. Fit any preprocessing on training batteries only.', '',
             'No statistical outliers were deleted, no missing measurements were filled, and no model was trained during this review. These six LCO ageing cells still do not validate lifetime predictions for an EV pack.', '',
             '## Saved evidence', '',
             '- degradation_curves.png: accepted full-charge health histories, without smoothing.',
             '- feature_distributions.png and feature_statistics.csv: candidate-input distributions; numerical reference ranges are calculated from training batteries only.',
             '- health_coverage.png, health_coverage.csv and condition_coverage.csv: representation by health and discharge condition.',
             '- review_flags.csv and largest_capacity_changes.csv: remaining recording breaks, sparse intervals and capacity-change flags.',
             '- sampling_gaps_by_cell.csv: interval counts and their CV-taper classification.',
             '- feature_contract.json: input allowlists, timing assumptions and excluded columns.', '',
             'Source protocol: [CALCE battery experiment descriptions](https://calce.umd.edu/data).']
    (OUT/'review.md').write_text('\n'.join(text)+'\n',encoding='utf-8')

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    examples = development_rows('soh_examples.csv')
    cycles = development_rows('cycles.csv')
    train = examples.loc[examples.split=='train']
    validation = examples.loc[examples.split=='validation']
    assert train.cell_id.nunique()==4 and validation.cell_id.nunique()==1
    assert TARGET not in FEATURES and not set(FEATURES).intersection(['cell_id','split','delivered_capacity_ah'])
    assert np.isfinite(examples[FEATURES+[TARGET]].to_numpy()).all()
    statistics = train.drop(columns=['cell_id','split']).describe(percentiles=[.01,.25,.5,.75,.99]).T
    statistics['missing_train'] = train.isna().sum()
    statistics['missing_validation'] = validation.isna().sum()
    statistics['validation_below_train_min'] = (validation[statistics.index]<statistics['min']).sum()
    statistics['validation_above_train_max'] = (validation[statistics.index]>statistics['max']).sum()
    statistics.to_csv(OUT/'feature_statistics.csv',index_label='column')
    train.drop(columns=['cell_id','split']).corr(method='spearman').to_csv(OUT/'training_correlations.csv',index_label='column')
    examples['health_range'] = pd.cut(examples[TARGET],[-np.inf,20,40,60,80,100,np.inf],right=False,
                                     labels=['<20','20-40','40-60','60-80','80-100','>=100'])
    coverage = examples.groupby(['split','health_range'],observed=False).size().rename('examples').reset_index()
    coverage.to_csv(OUT/'health_coverage.csv',index=False)
    condition = examples.groupby(['split','discharge_c_rate']).agg(cells=('cell_id','nunique'),examples=('cell_id','size')).reset_index()
    condition.to_csv(OUT/'condition_coverage.csv',index=False)
    full = cycles.loc[cycles.full_cycle_candidate].copy()
    full['change_from_previous_full_cycle_pp'] = full.groupby('cell_id').soh_reference_pct.diff()
    full['capacity_jump_over_5pp'] = full.change_from_previous_full_cycle_pp.abs()>5
    cycles = cycles.merge(full[['cell_id','observed_cycle_number','change_from_previous_full_cycle_pp','capacity_jump_over_5pp']],
                          on=['cell_id','observed_cycle_number'],how='left',validate='one_to_one')
    cycles['capacity_jump_over_5pp'] = cycles.capacity_jump_over_5pp.fillna(False).astype(bool)
    gap_summary,gaps = sensor_gaps(sorted(cycles.cell_id.unique()))
    gap_summary.to_csv(OUT/'sampling_gaps_by_cell.csv',index=False)
    cycles = cycles.merge(gaps,on=['cell_id','run_id','source_cycle_index','observed_cycle_number'],how='left',validate='one_to_one')
    cycles['sampling_gap_over_300s'] = cycles.max_active_sampling_gap_s>300
    cycles['unexplained_sampling_gap_over_300s'] = cycles.max_unexplained_active_sampling_gap_s>300
    accepted = cycles.loc[cycles.full_cycle_candidate]
    assert not accepted.charge_after_discharge.any(), 'Charging inputs must precede the measured discharge target'
    assert accepted.charge_completion_verified.all(), 'SOH requires completed CC/CV charging'
    cycles['previous_cycle_gap_hours'] = (pd.to_datetime(cycles.start_timestamp)-pd.to_datetime(cycles.groupby('cell_id').end_timestamp.shift())).dt.total_seconds()/3600
    cycles['inter_cycle_gap_over_24h'] = cycles.previous_cycle_gap_hours>24
    flags = cycles.loc[cycles.capacity_jump_over_5pp | cycles.sampling_gap_over_300s | cycles.inter_cycle_gap_over_24h,
                       ['cell_id','split','run_id','source_cycle_index','observed_cycle_number','start_timestamp','delivered_capacity_ah',
                        'soh_reference_pct','full_cycle_candidate','change_from_previous_full_cycle_pp','capacity_jump_over_5pp',
                        'max_active_sampling_gap_s','max_charge_sampling_gap_s','sampling_gap_over_300s',
                        'max_unexplained_active_sampling_gap_s','cv_taper_long_intervals','unexplained_sampling_gap_over_300s',
                        'charge_completion_verified','previous_cycle_gap_hours','inter_cycle_gap_over_24h']]
    flags.to_csv(OUT/'review_flags.csv',index=False)
    flags.loc[flags.capacity_jump_over_5pp].sort_values('change_from_previous_full_cycle_pp',key=lambda s:s.abs(),ascending=False).head(20).to_csv(OUT/'largest_capacity_changes.csv',index=False)
    manifest = {'prediction_time':'After current charge, before current discharge capacity is measured',
                'target':TARGET,'primary_features':FEATURES,
                'without_historical_capacity_features':[f for f in FEATURES if f not in ('previous_soh_reference_pct','previous_capacity_age_observed_cycles')],
                'baseline':'Use previous_soh_reference_pct as the prediction',
                'availability':{'observed_cycle_number':'Requires recorded operating history; counts observed groups, not guaranteed physical cycles',
                                'elapsed_days':'Days from first recorded test; available from timestamps, not factory age',
                                'previous_soh_reference_pct':'Requires a previous completed capacity measurement and recorded reference; not automatically available from voltage/current alone',
                                'previous_capacity_age_observed_cycles':'Recorded cycle groups since the last valid capacity measurement; known before prediction',
                                'charge_voltage_mean_v':'Recorded current charging session; sample-weighted mean',
                                'charge_current_mean_a':'Recorded current charging session; sample-weighted mean',
                                'charge_duration_approx_s':'Recorded current charging session; approximate sampled duration'},
                'excluded_columns':{'cell_id':'Identity/provenance only','split':'Evaluation membership only',
                                    'nominal_capacity_ah':'Constant 1.1 Ah in this experiment',
                                    'previous_capacity_ah':'Redundant with prior relative SOH and reference capacity',
                                    'reference_capacity_ah':'Used to define relative health; omitted as a cell-constant predictor',
                                    'charge_voltage_max_v':'Controlled upper-voltage limit; little independent variation',
                                    'charge_current_max_a':'Transient maximum; omit from initial simple feature set',
                                    'discharge_c_rate':'Future discharge protocol; use for coverage reporting, not as an input unless known in advance',
                                    'delivered_capacity_ah':'Current discharge capacity directly defines the target',
                                    'soh_reference_pct':'Current health target, not a same-cycle predictor',
                                    'threshold_80_observed':'Uses future observations',
                                    'remaining_observed_cycles_to_80pct':'Future life target, not an SOH predictor'}}
    (OUT/'feature_contract.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    summary = {'test_battery_included':False,'training_cells':int(train.cell_id.nunique()),'validation_cells':int(validation.cell_id.nunique()),
               'training_examples':len(train),'validation_examples':len(validation),
               'missing_candidate_input_values':int(examples[FEATURES].isna().sum().sum()),
               'capacity_changes_over_5pp':int(cycles.capacity_jump_over_5pp.sum()),
               'cycles_with_active_sampling_gap_over_300s':int(cycles.sampling_gap_over_300s.sum()),
               'cycles_with_charge_sampling_gap_over_300s':int((cycles.max_charge_sampling_gap_s>300).sum()),
               'cycles_with_unexplained_active_sampling_gap_over_300s':int(cycles.unexplained_sampling_gap_over_300s.sum()),
               'cv_taper_long_intervals':int(gap_summary.cv_taper_intervals_over_300s.sum()),
               'charge_completion_not_verified_cycles':int((~cycles.charge_completion_verified).sum()),
               'examples_using_capacity_older_than_one_recorded_cycle':int((examples.previous_capacity_age_observed_cycles>1).sum()),
               'inter_cycle_gaps_over_24h':int(cycles.inter_cycle_gap_over_24h.sum()),
               'statistical_outliers_deleted':0,'data_imputed':False}
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    print(json.dumps(summary,indent=2),flush=True)
    plots(cycles,examples,coverage)
    write_report()
    print('Saved review tables, feature contract and three plots. Test battery excluded.',flush=True)

if __name__=='__main__':
    main()
