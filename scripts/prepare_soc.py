"""Separate CALCE dynamic loading from preparation; capacity calibration precedes trips."""
import argparse
import hashlib
import json
import zipfile
import numpy as np
import pandas as pd
from dynamic_features import sensor_features,SOC_FEATURES

from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/processed/soc_calce'

def label_dynamic(frame,capacity_ah):
    numeric=['test_time_s','voltage_v','current_a','charge_counter_ah','discharge_counter_ah','step_index']
    if not np.isfinite(frame[numeric]).all().all() or not frame.row_valid.all():raise ValueError('Invalid rows in dynamic session; inspect before labelling.')
    if (frame.test_time_s.diff().iloc[1:]<=0).any():raise ValueError('Dynamic session has duplicate/reset times.')
    end_charge=frame.loc[frame.step_index==3]
    if end_charge.empty or end_charge.voltage_v.iloc[-1]<4.15 or end_charge.current_a.iloc[-1]>.025:
        raise ValueError('Cannot establish a completed full-charge SOC anchor.')
    anchor=end_charge.iloc[-1]
    dynamic=frame.loc[frame.step_index.isin([7,8])].copy()
    if dynamic.empty:raise ValueError('Expected dynamic loading steps 7 and 8 were not found.')
    if (dynamic.charge_counter_ah.diff().dropna()<-1e-8).any() or (dynamic.discharge_counter_ah.diff().dropna()<-1e-8).any():raise ValueError('Counter reset in dynamic loading.')
    net=(dynamic.discharge_counter_ah-anchor.discharge_counter_ah)-(dynamic.charge_counter_ah-anchor.charge_counter_ah)
    dynamic['soc_reference_pct']=100-100*net/capacity_ah
    if not dynamic.soc_reference_pct.between(-2,102).all():raise ValueError('Calibrated SOC exceeds physical tolerance; no silent clipping.')
    dynamic['time_s']=dynamic.test_time_s-dynamic.test_time_s.iloc[0]
    dynamic['temperature_c']=25.
    return dynamic

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--include-test',action='store_true');args=parser.parse_args()
    if args.include_test and not (ROOT/'reports/soc_calce/selection.json').exists():raise ValueError('Freeze model selection before parsing BJDST test outcomes.')
    OUT.mkdir(parents=True,exist_ok=True)
    calibration=pd.read_csv(ROOT/'data/processed/driving_profiles/initial_capacity.csv.gz')
    discharge=calibration.loc[calibration.step_index==6]
    capacity=float(discharge.discharge_counter_ah.max()-calibration.loc[calibration.step_index==5,'discharge_counter_ah'].iloc[-1])
    assert 1.8<capacity<2.2 and discharge.voltage_v.iloc[-1]<2.6
    traces=[];audit=[]
    for initial in [50,80]:
        frame=pd.read_csv(ROOT/f'data/processed/driving_profiles/fuds_{initial}soc.csv.gz')
        traces.append((f'FUDS_{initial}','FUDS','train',initial,frame))
    # Additional workbook reader is reused; its environment has the existing openpyxl dependency.
    from prepare_data import read_workbook,clean_measurements,save_csv
    for profile,split in [('DST','train'),('US06','validation'),('BJDST','test')]:
        if split=='test' and not args.include_test:continue
        archive_name=f'SP2_25C_{profile}.zip'
        with zipfile.ZipFile(ROOT/'data/raw/soc_dynamic_extra'/archive_name) as archive:
            for member in sorted(archive.namelist()):
                initial=80 if '80SOC' in member.upper() else 50 if '50SOC' in member.upper() else None
                if initial is None:raise ValueError(f'Unknown initial-SOC filename: {member}')
                raw=read_workbook(archive.read(member),member,archive_name)
                frame,quality=clean_measurements(raw,'SP20-2','NMC')
                traces.append((f'{profile}_{initial}',profile,split,initial,frame))
    tables=[]
    for name,profile,split,initial,frame in traces:
        dynamic=label_dynamic(frame,capacity)
        # Keep actual observations at least one second apart; no interpolation creates signals.
        bins=np.floor(dynamic.time_s).astype(int)
        dynamic=dynamic.loc[~bins.duplicated()].copy().reset_index(drop=True)
        features=sensor_features(dynamic)
        example=features[SOC_FEATURES+['time_s','history_supported']].copy()
        example['target_soc_pct']=dynamic.soc_reference_pct.to_numpy()
        example['session_id']=name;example['profile']=profile;example['split']=split
        save_csv(example,OUT/f'{name}.csv')
        save_csv(dynamic[['time_s','voltage_v','current_a','temperature_c','soc_reference_pct']],OUT/f'{name}_observations.csv')
        tables.append(example)
        audit.append({'session_id':name,'profile':profile,'split':split,'declared_initial_soc_pct':initial,'reference_initial_soc_pct':float(dynamic.soc_reference_pct.iloc[0]),
                      'reference_final_soc_pct':float(dynamic.soc_reference_pct.iloc[-1]),'source_rows':len(frame),'dynamic_sampled_rows':len(dynamic),'warmup_rows':int((~features.history_supported).sum())})
        print(f'{name}: {len(dynamic):,} dynamic observations; SOC {dynamic.soc_reference_pct.iloc[0]:.2f} to {dynamic.soc_reference_pct.iloc[-1]:.2f}',flush=True)
    save_csv(pd.concat(tables,ignore_index=True),OUT/'examples.csv')
    report=ROOT/'reports/soc_calce';report.mkdir(parents=True,exist_ok=True)
    save_csv(pd.DataFrame(audit),report/'session_audit.csv')
    reference={'capacity_ah':capacity,'source':'Earlier SP20-2 initial-capacity discharge, independently measured before these dynamic sessions',
               'calibration_sha256':hashlib.sha256((ROOT/'data/processed/driving_profiles/initial_capacity.csv.gz').read_bytes()).hexdigest(),
               'soc_target':'Coulomb-counter reference anchored to completed full charge; includes regenerative charging; not a separately measured true-SOC sensor',
               'test_opened':args.include_test}
    (report/'reference.json').write_text(json.dumps(reference,indent=2),encoding='utf-8')

if __name__=='__main__':main()
