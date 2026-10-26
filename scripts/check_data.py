"""Check counter handling, provenance, censoring, and the prepared output tables."""
import json

import prepare_data as p
import numpy as np
import pandas as pd

def self_check():
    fixture = pd.DataFrame({
        'timestamp': pd.date_range('2020-01-01', periods=6, freq='10s'),
        'test_time_s': np.arange(6)*10, 'source_cycle_index': 1, 'step_index': [1,2,2,3,3,4],
        'current_a': [0,.55,.049,-1.1,-1.1,0], 'voltage_v': [3.4,3.5,4.2,4.0,2.7,3.3],
        'charge_counter_ah': [10,10.5,11,11,11,11],
        'discharge_counter_ah': [20,20,20,20.5,21,21],
        'source_file': ['part1']*3+['part2']*3, 'source_archive': 'fixture.zip',
        'source_sheet': 'fixture', 'source_row': np.arange(2,8)})
    duplicate = fixture.iloc[[2]].copy()
    duplicate['source_file'] = 'overlapping_export'
    clean, quality = p.clean_measurements(pd.concat([fixture, duplicate]), 'CS2_35', 'LCO')
    cycle = p.cycle_summaries(clean).iloc[0]
    assert quality['exact_duplicates_removed'] == 1
    assert np.isclose(cycle.delivered_capacity_ah, 1), 'Cumulative counters must be differenced'
    assert cycle.full_cycle_candidate and cycle.source_file_count == 2
    undercharged = fixture.copy()
    undercharged.loc[2,'current_a'] = .55
    partial_charge, _ = p.clean_measurements(undercharged, 'CS2_35', 'LCO')
    assert not p.cycle_summaries(partial_charge).iloc[0].full_cycle_candidate, 'CC-only capacity must not be an SOH label'
    future_charge = fixture.copy()
    future_charge.loc[5,['current_a','voltage_v']] = [.02,4.2]
    future_rows, _ = p.clean_measurements(future_charge,'CS2_35','LCO')
    assert not p.cycle_summaries(future_rows).iloc[0].full_cycle_candidate, 'Charging predictors must not include later charging'
    broken = fixture.copy()
    broken['current_a'] = broken.current_a.astype(object)
    broken.loc[1, 'current_a'] = 'bad sensor value'
    retained, report = p.clean_measurements(broken, 'fixture', 'LCO')
    assert len(retained) == 6 and report['invalid_rows_retained'] == 1
    partial = fixture.copy()
    partial.loc[4, 'voltage_v'] = 3.5
    cleaned, _ = p.clean_measurements(partial, 'fixture', 'LCO')
    assert not p.cycle_summaries(cleaned).iloc[0].full_cycle_candidate
    samples = []
    for cell in p.SPLITS:
        for i, capacity in enumerate([1,.9,.79,.78,.77,.76], start=1):
            row = cycle.to_dict()
            row.update(cell_id=cell, delivered_capacity_ah=1 if cell=='CS2_33' else capacity,
                       observed_cycle_number=i, source_cycle_index=i,
                       start_timestamp=pd.Timestamp('2020-01-01')+pd.Timedelta(days=i),
                       end_timestamp=pd.Timestamp('2020-01-01')+pd.Timedelta(days=i, hours=1))
            samples.append(row)
    _, cells, soh, rul = p.make_life_tables(pd.DataFrame(samples))
    assert rul.loc[rul.cell_id=='CS2_33', 'remaining_observed_cycles_to_80pct'].isna().all()
    assert not cells.loc[cells.cell_id=='CS2_33', 'threshold_80_observed'].item()
    assert np.isclose(soh.loc[(soh.cell_id=='CS2_35') & (soh.observed_cycle_number==2), 'previous_capacity_ah'].item(), 1)
    assert rul.loc[(rul.cell_id=='CS2_35') & (rul.observed_cycle_number==5), 'remaining_observed_cycles_to_80pct'].item() == 0

def check_outputs():
    report = json.loads((p.REPORTS/'data_quality.json').read_text())
    assert len(report['archives']) == 10 and all(a['crc_verified'] for a in report['archives'])
    totals = report['totals']
    assert totals['input_rows']-totals['exact_duplicates_removed'] == totals['cleaned_rows']
    folder = p.PROCESSED/'life_prediction'
    cycles = pd.read_csv(folder/'cycles.csv')
    soh = pd.read_csv(folder/'soh_examples.csv')
    rul = pd.read_csv(folder/'rul_examples.csv')
    assert cycles[['cell_id','run_id','source_cycle_index']].duplicated().sum()==0
    assert soh.target_soh_reference_pct.notna().all()
    assert np.isfinite(soh.select_dtypes('number').to_numpy()).all()
    assert set(cycles.cell_id)==set(p.SPLITS)
    for cell, split in p.SPLITS.items():
        assert cycles.loc[cycles.cell_id==cell,'split'].eq(split).all()
    assert rul.loc[~rul.threshold_80_observed, 'remaining_observed_cycles_to_80pct'].isna().all()
    assert rul.remaining_observed_cycles_to_80pct.dropna().ge(0).all()
    operations = pd.read_csv(p.PROCESSED/'soc_window_comparison/operations.csv')
    assert set(operations.cell_id)=={'PL11','PL13','PL21','PL23'}
    assert len(pd.read_csv(p.PROCESSED/'driving_profiles/sessions.csv').session_id.unique())==3
    expected = {q.get('session_id', q['cell_id']): q['output_rows'] for q in report['quality']}
    counted = 0
    for path in p.PROCESSED.rglob('*.csv.gz'):
        nrows = 0
        last_timestamp = None
        for chunk in pd.read_csv(path, chunksize=100000, usecols=['chemistry','timestamp','row_valid']):
            nrows += len(chunk)
            assert chunk.chemistry.nunique()==1
            timestamps = pd.to_datetime(chunk.loc[chunk.row_valid,'timestamp'], errors='coerce')
            assert timestamps.notna().all()
            if not timestamps.empty:
                assert timestamps.min().year>=2000 and timestamps.is_monotonic_increasing
                assert last_timestamp is None or timestamps.iloc[0]>=last_timestamp
                last_timestamp = timestamps.iloc[-1]
        assert nrows==expected[path.name.removesuffix('.csv.gz')], path
        counted += nrows
    assert counted==totals['cleaned_rows']
    print(f'PASS: {len(report["archives"])} archives; {counted:,} cleaned rows; capacity, splits, and missing RUL checks passed.')

if __name__=='__main__':
    self_check()
    check_outputs()
