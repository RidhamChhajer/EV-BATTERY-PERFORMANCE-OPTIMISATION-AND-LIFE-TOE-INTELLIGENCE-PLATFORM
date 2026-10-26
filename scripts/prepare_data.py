"""Prepare the supplied CALCE archives without changing their contents."""
import io
import json
import hashlib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import numpy as np
import pandas as pd

RAW = ROOT / 'data/raw'
PROCESSED = ROOT / 'data/processed'
REPORTS = ROOT / 'reports'
SPLITS = {'CS2_33': 'train', 'CS2_34': 'validation', 'CS2_35': 'train',
          'CS2_36': 'train', 'CS2_37': 'train', 'CS2_38': 'test'}
RENAME = {'Data_Point': 'data_point', 'Test_Time(s)': 'test_time_s', 'Date_Time': 'timestamp',
          'Step_Time(s)': 'step_time_s', 'Step_Index': 'step_index', 'Cycle_Index': 'source_cycle_index',
          'Current(A)': 'current_a', 'Voltage(V)': 'voltage_v',
          'Charge_Capacity(Ah)': 'charge_counter_ah', 'Discharge_Capacity(Ah)': 'discharge_counter_ah',
          'Charge_Energy(Wh)': 'charge_counter_wh', 'Discharge_Energy(Wh)': 'discharge_counter_wh'}
MEASUREMENT_COLS = ['cell_id', 'chemistry', 'source_archive', 'source_file', 'source_sheet', 'source_row',
                    'operation_index', 'operation', 'timestamp', 'test_time_s', 'data_point',
                    'step_time_s', 'step_index', 'source_cycle_index', 'run_id', 'observed_cycle_number',
                    'current_a', 'voltage_v', 'charge_counter_ah', 'discharge_counter_ah',
                    'charge_counter_wh', 'discharge_counter_wh', 'phase', 'row_valid']

def save_csv(frame, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.partial')
    compression = {'method': 'gzip', 'compresslevel': 1, 'mtime': 0} if path.name.endswith('.gz') else None
    frame.to_csv(temporary, index=False, compression=compression, date_format='%Y-%m-%dT%H:%M:%S.%f')
    temporary.replace(path)

def write_quality_summary(report):
    totals = report['totals']
    lines = ['# Dataset preparation report', '',
             f"Verified {len(report['archives'])} ZIP archives. Preserved {totals['cleaned_rows']:,} cleaned measurement rows.", '',
             f"Exact duplicate rows removed: {totals['exact_duplicates_removed']:,}. Invalid rows retained and flagged: {totals['invalid_rows_retained']:,}.", '',
             '| Cell/session | Source rows | Cleaned rows | Duplicates removed | Invalid rows |',
             '|---|---:|---:|---:|---:|']
    for item in report['quality']:
        lines.append(f"| {item.get('session_id', item['cell_id'])} | {item['input_rows']:,} | {item['output_rows']:,} | {item['exact_duplicates_removed']:,} | {item['invalid_rows_retained']:,} |")
    lines += ['', f"Life history: {totals['life_prediction_cycles']:,} observed cycle groups; {totals['soh_examples']:,} SOH examples.",
              f"Threshold targets available for {totals['rul_examples_with_observed_target']:,} full-cycle observations. The target counts recorded cycle groups to a three-observation confirmation of 80% baseline capacity.", '',
              'The LCO ageing/charge-window experiments and the NMC driving sessions remain separate. Statistical outliers are retained for inspection. Missing data is not filled and unobserved life events are not assigned a target.', '',
              'See README.md for units, screening rules, feature/target boundaries, splits and reproducibility.']
    (REPORTS / 'data_quality.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')

def group_for(name):
    if name.startswith('CS2_'):
        return 'cs2_aging'
    if name.startswith('SOC_'):
        return 'pl_soc_windows'
    if name.startswith('SP2_'):
        return 'nmc_driving'
    raise ValueError(f'Unrecognized archive: {name}')

def organize_archives():
    for folder in (RAW, PROCESSED, REPORTS):
        folder.mkdir(parents=True, exist_ok=True)
    for source in sorted((ROOT / 'DATASETS').glob('*.zip')):
        with zipfile.ZipFile(source) as archive:
            if archive.testzip() is not None:
                raise ValueError(f'Damaged archive: {source.name}')
        target = RAW / group_for(source.name) / source.name
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            raise FileExistsError(f'Refusing to overwrite original archive: {target}')
        source.rename(target)

def read_workbook(content, member, archive_name):
    # The supplied .xls files are actually XLSX; detect content rather than the suffix.
    if not content.startswith(b'PK'):
        raise ValueError(f'Unexpected workbook format: {member}')
    parts = []
    with pd.ExcelFile(io.BytesIO(content), engine='openpyxl') as workbook:
        sheets = [s for s in workbook.sheet_names if s.startswith('Channel')]
        if not sheets:
            raise ValueError(f'No measurement sheet in {member}')
        for sheet in sheets:
            frame = pd.read_excel(workbook, sheet_name=sheet)
            frame.columns = [str(c).strip() for c in frame.columns]
            frame = frame.rename(columns=RENAME)
            required = ['test_time_s', 'timestamp', 'step_index', 'source_cycle_index',
                        'current_a', 'voltage_v', 'charge_counter_ah', 'discharge_counter_ah']
            if not set(required).issubset(frame.columns):
                raise ValueError(f'Missing columns in {member}: {set(required)-set(frame.columns)}')
            frame['source_row'] = np.arange(2, len(frame)+2)
            frame['source_file'] = member
            frame['source_archive'] = archive_name
            frame['source_sheet'] = sheet
            parts.append(frame[[c for c in MEASUREMENT_COLS if c in frame.columns]])
    return pd.concat(parts, ignore_index=True)

def clean_measurements(frame, cell_id, chemistry, separate_operations=False):
    frame = frame.copy()
    frame['cell_id'], frame['chemistry'] = cell_id, chemistry
    for c in MEASUREMENT_COLS:
        if c not in frame:
            frame[c] = np.nan
    numeric = ['test_time_s', 'data_point', 'step_time_s', 'step_index', 'source_cycle_index',
               'current_a', 'voltage_v', 'charge_counter_ah', 'discharge_counter_ah',
               'charge_counter_wh', 'discharge_counter_wh']
    coerced = {}
    for col in numeric:
        before = frame[col].notna()
        frame[col] = pd.to_numeric(frame[col], errors='coerce').replace([np.inf, -np.inf], np.nan)
        coerced[col] = int((before & frame[col].isna()).sum())
    frame['timestamp'] = pd.to_datetime(frame['timestamp'], errors='coerce')
    key = ['timestamp', 'test_time_s', 'step_index', 'source_cycle_index', 'current_a',
           'voltage_v', 'charge_counter_ah', 'discharge_counter_ah']
    if separate_operations:
        key = ['operation_index'] + key
    input_rows = len(frame)
    duplicates = frame.duplicated(key, keep='first')
    # Unknown timestamps cannot establish that two otherwise equal records are duplicates.
    duplicates &= frame['timestamp'].notna()
    frame = frame.loc[~duplicates].sort_values(['timestamp', 'test_time_s', 'data_point'], kind='stable').reset_index(drop=True)
    critical = ['timestamp', 'test_time_s', 'step_index', 'source_cycle_index', 'current_a',
                'voltage_v', 'charge_counter_ah', 'discharge_counter_ah']
    frame['row_valid'] = frame[critical].notna().all(axis=1)
    frame['row_valid'] &= (frame['voltage_v'] > 0) & (frame['test_time_s'] >= 0)
    frame['row_valid'] &= (frame[['step_index', 'source_cycle_index', 'charge_counter_ah', 'discharge_counter_ah']] >= 0).all(axis=1)
    frame['row_valid'] &= (frame[['step_index', 'source_cycle_index']] % 1 == 0).all(axis=1)
    frame['phase'] = np.select([frame.current_a > 0.01, frame.current_a < -0.01], ['charge', 'discharge'], default='rest')
    frame.loc[frame.current_a.isna(), 'phase'] = 'unknown'
    if separate_operations:
        frame['run_id'] = pd.to_numeric(frame.operation_index).astype('int64')
    else:
        reset = (frame.test_time_s.diff() < -1) | (frame.source_cycle_index.diff() < 0)
        frame['run_id'] = reset.cumsum() + 1
    pairs = pd.MultiIndex.from_frame(frame[['run_id', 'source_cycle_index']])
    frame['observed_cycle_number'] = pd.factorize(pairs, sort=False)[0] + 1
    assert not frame.loc[frame.row_valid, 'timestamp'].isna().any()
    report = {'cell_id': cell_id, 'input_rows': input_rows, 'exact_duplicates_removed': int(duplicates.sum()),
              'output_rows': len(frame), 'invalid_rows_retained': int((~frame.row_valid).sum()),
              'numeric_values_coerced_to_missing': coerced,
              'missing_values': {c: int(frame[c].isna().sum()) for c in critical}}
    return frame[MEASUREMENT_COLS], report

def cycle_summaries(frame):
    valid = frame.loc[frame.row_valid].copy()
    records = []
    for (run_id, cycle), group in valid.groupby(['run_id', 'source_cycle_index'], sort=False):
        charge = group.loc[group.phase == 'charge']
        discharge = group.loc[group.phase == 'discharge']
        counter_reset = any((group[c].diff() < -1e-8).any() for c in ['charge_counter_ah', 'discharge_counter_ah'])
        intervals = group.test_time_s.diff().clip(lower=0).fillna(0)
        discharged = group.discharge_counter_ah.max() - group.discharge_counter_ah.min()
        charged = group.charge_counter_ah.max() - group.charge_counter_ah.min()
        reaches_top = len(charge) >= 2 and charge.voltage_v.max() >= 4.15
        reaches_bottom = len(discharge) >= 2 and discharge.voltage_v.iloc[-1] <= 2.80
        ordered = len(charge) > 0 and len(discharge) > 0 and charge.timestamp.iloc[0] < discharge.timestamp.iloc[-1]
        cs2 = str(group.cell_id.iloc[0]).startswith('CS2_')
        charge_complete = None
        if cs2:
            # Reaching 4.2 V during CC is insufficient: CS2 requires CV taper to the 0.05 A cutoff.
            charge_complete = bool(len(charge) >= 2 and charge.voltage_v.iloc[-1] >= 4.15
                                   and charge.current_a.iloc[-1] <= 0.055)
            ordered = bool(len(charge)>0 and len(discharge)>0 and charge.timestamp.iloc[-1]<discharge.timestamp.iloc[0])
        record = {'cell_id': group.cell_id.iloc[0], 'chemistry': group.chemistry.iloc[0],
                  'run_id': int(run_id), 'source_cycle_index': int(cycle),
                  'observed_cycle_number': int(group.observed_cycle_number.iloc[0]),
                  'start_timestamp': group.timestamp.iloc[0], 'end_timestamp': group.timestamp.iloc[-1],
                  'n_measurements': len(group), 'source_file_count': group.source_file.nunique(),
                  'delivered_capacity_ah': discharged, 'charged_capacity_ah': charged,
                  'counter_reset_within_cycle': bool(counter_reset),
                  'full_cycle_candidate': bool(reaches_top and reaches_bottom and ordered and not counter_reset and discharged > 0
                                               and (charge_complete if cs2 else True)),
                  'charge_completion_verified': charge_complete,
                  'charge_end_current_a': charge.current_a.iloc[-1] if len(charge) else np.nan,
                  'charge_end_voltage_v': charge.voltage_v.iloc[-1] if len(charge) else np.nan,
                  'voltage_min_v': group.voltage_v.min(), 'voltage_max_v': group.voltage_v.max(),
                  'charge_voltage_mean_v': charge.voltage_v.mean(), 'charge_voltage_max_v': charge.voltage_v.max(),
                  'charge_current_mean_a': charge.current_a.mean(), 'charge_current_max_a': charge.current_a.max(),
                  'charge_duration_approx_s': intervals.loc[charge.index].sum(),
                  'discharge_current_mean_a': discharge.current_a.mean(),
                  'discharge_duration_approx_s': intervals.loc[discharge.index].sum(),
                  'max_sampling_gap_s': intervals.max()}
        if pd.notna(group.operation.iloc[0]):
            record['operation'] = group.operation.iloc[0]
            record['operation_index'] = int(group.operation_index.iloc[0])
        records.append(record)
    result = pd.DataFrame(records)
    if result.empty:
        raise ValueError(f'No valid cycles: {frame.cell_id.iloc[0]}')
    return result.sort_values('start_timestamp').reset_index(drop=True)

def make_life_tables(cycles):
    cycles = cycles.copy()
    cycles['split'] = cycles.cell_id.map(SPLITS)
    cycles['nominal_capacity_ah'] = 1.1
    cycles['discharge_c_rate'] = cycles.cell_id.map({'CS2_33': 0.5, 'CS2_34': 0.5}).fillna(1.0)
    cells = []
    for cell_id, group in cycles.groupby('cell_id', sort=False):
        good = group.loc[group.full_cycle_candidate]
        if good.empty:
            raise ValueError(f'No full-cycle capacity reference: {cell_id}')
        reference = good.delivered_capacity_ah.iloc[0]
        idx = group.index
        cycles.loc[idx, 'reference_capacity_ah'] = reference
        cycles.loc[idx, 'soh_reference_pct'] = np.where(group.full_cycle_candidate, 100*group.delivered_capacity_ah/reference, np.nan)
        cycles.loc[idx, 'soh_nominal_pct'] = np.where(group.full_cycle_candidate, 100*group.delivered_capacity_ah/1.1, np.nan)
        complete_soh = 100 * good.delivered_capacity_ah/reference
        # shortcut: 80% capacity is a project threshold, revise for the target vehicle's EOL policy.
        below = complete_soh <= 80
        confirmed = below.rolling(3, min_periods=3).sum() == 3
        eol_observed = bool(confirmed.any())
        eol_number = int(good.loc[confirmed].observed_cycle_number.iloc[0]) if eol_observed else None
        cycles.loc[idx, 'threshold_80_observed'] = eol_observed
        cycles.loc[idx, 'remaining_observed_cycles_to_80pct'] = np.nan
        if eol_observed:
            before = idx[group.observed_cycle_number <= eol_number]
            cycles.loc[before, 'remaining_observed_cycles_to_80pct'] = eol_number - cycles.loc[before, 'observed_cycle_number']
        cells.append({'cell_id': cell_id, 'split': SPLITS[cell_id], 'reference_capacity_ah': reference,
                      'reference_observed_cycle': int(good.observed_cycle_number.iloc[0]),
                      'observed_cycles': len(group), 'full_cycle_candidates': len(good),
                      'test_runs': group.run_id.nunique(), 'threshold_80_observed': eol_observed,
                      'threshold_confirmation_observed_cycle': eol_number,
                      'last_full_cycle_soh_pct': complete_soh.iloc[-1]})
    good = cycles.loc[cycles.full_cycle_candidate].copy()
    good['previous_capacity_ah'] = good.groupby('cell_id').delivered_capacity_ah.shift()
    good['previous_soh_reference_pct'] = good.groupby('cell_id').soh_reference_pct.shift()
    good['previous_capacity_age_observed_cycles'] = good.observed_cycle_number-good.groupby('cell_id').observed_cycle_number.shift()
    age_start = cycles.groupby('cell_id').start_timestamp.transform('min')
    cycles['elapsed_days'] = (cycles.start_timestamp-age_start).dt.total_seconds()/86400
    good['elapsed_days'] = cycles.loc[good.index, 'elapsed_days']
    features = ['cell_id', 'split', 'observed_cycle_number', 'elapsed_days', 'nominal_capacity_ah',
                'discharge_c_rate', 'reference_capacity_ah', 'previous_capacity_ah',
                'previous_soh_reference_pct', 'previous_capacity_age_observed_cycles', 'charge_voltage_mean_v', 'charge_voltage_max_v',
                'charge_current_mean_a', 'charge_current_max_a', 'charge_duration_approx_s']
    soh = good.loc[good.previous_capacity_ah.notna(), features + ['soh_reference_pct']].rename(columns={'soh_reference_pct': 'target_soh_reference_pct'})
    rul = good[features + ['soh_reference_pct', 'threshold_80_observed', 'remaining_observed_cycles_to_80pct']].copy()
    assert cycles.split.notna().all()
    assert soh.groupby('cell_id').split.nunique().eq(1).all()
    assert rul.remaining_observed_cycles_to_80pct.dropna().ge(0).all()
    return cycles, pd.DataFrame(cells), soh, rul

def read_pl(content, cell_id, archive_name, member):
    from calce_mat import load_calce_mat
    data = load_calce_mat(content)[cell_id]
    data = np.asarray(data, dtype=object)
    if data.ndim != 2 or data.shape[1] != 3:
        raise ValueError(f'Unexpected CALCE operation table in {member}: {data.shape}')
    parts, operations = [], []
    for i, row in enumerate(data[1:], start=1):
        operation, start_date, table = row
        operation = str(np.asarray(operation).squeeze().item())
        start_date = str(np.asarray(start_date).squeeze().item())
        missing = 'missing' in operation.lower()
        if getattr(table, 'classname', '') == 'table':
            # Older CALCE tables omit version metadata required by mat-io's automatic conversion.
            props = table.properties
            names = [str(np.asarray(x).squeeze().item()) for x in props['varnames'].flat]
            expected = ['Time_sec', 'Date_Time', 'Step', 'Cycle', 'Current_Amp', 'Voltage_Volt', 'Charge_Ah', 'Discharge_Ah']
            if names != expected:
                raise ValueError(f'Unexpected MATLAB column order: {member}, {names}')
            table = pd.DataFrame({name: np.asarray(values).reshape(-1) for name, values in zip(names, props['data'].flat)})
            assert len(table) == int(np.asarray(props['nrows']).item())
        if isinstance(table, pd.DataFrame):
            if table.shape[1] != 8:
                raise ValueError(f'Expected eight measurement columns: {member}, {operation}')
            frame = table.copy()
            original_columns = [str(c) for c in frame.columns]
            frame.columns = ['test_time_s', 'timestamp', 'step_index', 'source_cycle_index',
                             'current_a', 'voltage_v', 'charge_counter_ah', 'discharge_counter_ah']
            # MATLAB datenum 719529 denotes 1970-01-01; retain source wall-clock time.
            frame['timestamp'] = pd.to_datetime(pd.to_numeric(frame.timestamp, errors='coerce')-719529, unit='D', origin='unix', errors='coerce')
            frame['source_row'] = np.arange(1, len(frame)+1)
            frame['source_file'], frame['source_archive'], frame['source_sheet'] = member, archive_name, 'MATLAB table'
            frame['operation_index'], frame['operation'] = i, operation
            parts.append(frame)
            nrows = len(frame)
        elif missing or np.asarray(table).size == 0:
            original_columns, nrows = [], 0
        else:
            raise ValueError(f'Undecoded MATLAB table: {member}, {operation}, {type(table)}')
        operations.append({'cell_id': cell_id, 'operation_index': i, 'operation': operation,
                           'start_date_source': str(start_date), 'missing_data_declared': missing,
                           'measurement_rows': nrows, 'original_columns': json.dumps(original_columns)})
    if not parts:
        raise ValueError(f'No decoded measurements in {member}')
    return pd.concat(parts, ignore_index=True), operations

def main():
    organize_archives()
    manifest, quality, life, pl_cycles, operations, driving = [], [], [], [], [], []
    # This reader owns the ten original CALCE archives; supplementary datasets have separate readers.
    paths=[path for group in ('cs2_aging','pl_soc_windows','nmc_driving') for path in (RAW/group).rglob('*.zip')]
    for path in sorted(paths):
        group_name = group_for(path.name)
        hasher = hashlib.sha256()
        with path.open('rb') as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                hasher.update(chunk)
        digest = hasher.hexdigest()
        with zipfile.ZipFile(path) as archive:
            assert archive.testzip() is None, path.name
            members = [n for n in archive.namelist() if not n.endswith('/')]
            manifest.append({'archive': path.name, 'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size,
                             'sha256': digest, 'crc_verified': True, 'members': members})
            if group_name == 'cs2_aging':
                cell_id = path.stem
                parts = [read_workbook(archive.read(n), n, path.name) for n in members if n.endswith('.xlsx')]
                frame, q = clean_measurements(pd.concat(parts, ignore_index=True), cell_id, 'LCO')
                summary = cycle_summaries(frame)
                life.append(summary)
                save_csv(frame, PROCESSED / 'life_prediction/measurements' / (cell_id+'.csv.gz'))
                quality.append(q)
                print(f'{cell_id}: {len(frame):,} measurements, {len(summary):,} observed cycles', flush=True)
            elif group_name == 'pl_soc_windows':
                for member in members:
                    if member.endswith('.txt'):
                        folder = RAW / group_name / path.stem
                        folder.mkdir(parents=True, exist_ok=True)
                        (folder / 'README_source.txt').write_bytes(archive.read(member))
                    elif member.endswith('.mat'):
                        cell_id = Path(member).stem
                        raw_frame, ops = read_pl(archive.read(member), cell_id, path.name, member)
                        frame, q = clean_measurements(raw_frame, cell_id, 'LCO', separate_operations=True)
                        summary = cycle_summaries(frame)
                        summary['assigned_soc_min_pct'] = 20 if '20-80' in path.name else 0
                        summary['assigned_soc_max_pct'] = 80 if '20-80' in path.name else 100
                        summary['ambient_temperature_c'] = 25
                        summary['discharge_c_rate'] = 0.5
                        pl_cycles.append(summary)
                        operations.extend(ops)
                        quality.append(q)
                        save_csv(frame, PROCESSED / 'soc_window_comparison/measurements' / (cell_id+'.csv.gz'))
                        print(f'{cell_id}: {len(frame):,} measurements, {len(ops)} operations', flush=True)
            else:
                for member in members:
                    frame, q = clean_measurements(read_workbook(archive.read(member), member, path.name), 'SP20-2', 'NMC')
                    session = 'initial_capacity' if 'Initial' in path.name else ('fuds_80soc' if '80SOC' in member else 'fuds_50soc')
                    summary = cycle_summaries(frame)
                    summary['session_id'] = session
                    summary['ambient_temperature_c'] = 25
                    summary['initial_soc_pct'] = 80 if '80SOC' in member else (50 if '50SOC' in member else np.nan)
                    driving.append(summary)
                    q['session_id'] = session
                    quality.append(q)
                    save_csv(frame, PROCESSED / 'driving_profiles' / (session+'.csv.gz'))
                    print(f'{session}: {len(frame):,} measurements', flush=True)
    cycles, cells, soh, rul = make_life_tables(pd.concat(life, ignore_index=True))
    save_csv(cycles, PROCESSED / 'life_prediction/cycles.csv')
    save_csv(cells, PROCESSED / 'life_prediction/cells.csv')
    save_csv(soh, PROCESSED / 'life_prediction/soh_examples.csv')
    save_csv(rul, PROCESSED / 'life_prediction/rul_examples.csv')
    save_csv(cells[['cell_id', 'split']], PROCESSED / 'life_prediction/splits.csv')
    pl = pd.concat(pl_cycles, ignore_index=True)
    save_csv(pl, PROCESSED / 'soc_window_comparison/cycles.csv')
    save_csv(pd.DataFrame(operations), PROCESSED / 'soc_window_comparison/operations.csv')
    save_csv(pd.concat(driving, ignore_index=True), PROCESSED / 'driving_profiles/sessions.csv')
    assert len(manifest) == 10, f'Expected your ten input archives, found {len(manifest)}'
    assert set(cells.cell_id) == set(SPLITS)
    assert set(pl.cell_id) == {'PL11', 'PL13', 'PL21', 'PL23'}
    report = {'source': 'https://calce.umd.edu/data', 'processing_date': '2026-10-12',
              'archives': manifest, 'quality': quality,
              'totals': {'input_rows': sum(q['input_rows'] for q in quality),
                         'cleaned_rows': sum(q['output_rows'] for q in quality),
                         'exact_duplicates_removed': sum(q['exact_duplicates_removed'] for q in quality),
                         'invalid_rows_retained': sum(q['invalid_rows_retained'] for q in quality),
                         'life_prediction_cycles': len(cycles), 'soh_examples': len(soh),
                         'rul_examples_with_observed_target': int(rul.remaining_observed_cycles_to_80pct.notna().sum())},
              'life_prediction_cells': cells.astype(object).where(cells.notna(), None).to_dict(orient='records')}
    (REPORTS / 'data_quality.json').write_text(json.dumps(report, indent=2, default=str, allow_nan=False), encoding='utf-8')
    save_csv(pd.DataFrame(quality).drop(columns=['numeric_values_coerced_to_missing', 'missing_values']), REPORTS / 'data_quality.csv')
    write_quality_summary(report)
    print(json.dumps(report['totals'], indent=2), flush=True)

if __name__ == '__main__':
    main()
