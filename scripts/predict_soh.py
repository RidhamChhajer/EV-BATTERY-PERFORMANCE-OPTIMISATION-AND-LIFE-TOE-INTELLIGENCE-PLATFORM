"""Apply the trained laboratory model only to a supported, completed CS2 charge."""
import argparse
import json
import math
from pathlib import Path

from charge_features import extract_charge_window, normalize_window

ROOT = Path(__file__).resolve().parents[1]

def charging_inputs(records, observed_cycle_number, elapsed_days, reference_records=None):
    try:
        cycle,age = float(observed_cycle_number),float(elapsed_days)
        if not math.isfinite(cycle) or cycle<1 or not cycle.is_integer() or not math.isfinite(age) or age<0:
            return {'status':'invalid_operating_age'}
        if any('observed_cycle_number' in r and float(r['observed_cycle_number'])!=cycle for r in records):
            return {'status':'mixed_or_wrong_cycle'}
        if reference_records is not None and any('observed_cycle_number' in r and float(r['observed_cycle_number'])>=cycle for r in reference_records):
            return {'status':'reference_must_precede_current_cycle'}
        current_ids={str(r['cell_id']) for r in records if 'cell_id' in r}
        reference_ids={str(r['cell_id']) for r in (reference_records or []) if 'cell_id' in r}
        if len(current_ids)>1 or len(reference_ids)>1 or (current_ids and reference_ids and current_ids!=reference_ids):
            return {'status':'mixed_or_wrong_reference_cell'}
        profile = extract_charge_window(records)
        if profile['status']!='ok':
            return profile
        end = min((float(r['test_time_s']) for r in records if float(r['current_a'])<-.01),default=math.inf)
        prior = [r for r in records if float(r['test_time_s'])<end]
        charge = [r for r in prior if float(r['current_a'])>.01]
        if not charge or float(charge[-1]['voltage_v'])<4.15 or float(charge[-1]['current_a'])>.055:
            return {'status':'charge_not_completed'}
        if any(float(r['voltage_v'])<=0 for r in prior):
            return {'status':'invalid_measurements'}
        times = [float(r['test_time_s']) for r in prior]
        if any(b<=a for a,b in zip(times,times[1:])):
            return {'status':'time_or_counter_reset'}
        duration = sum(times[i]-times[i-1] for i in range(1,len(prior)) if float(prior[i]['current_a'])>.01)
        values = {'observed_cycle_number':cycle,'elapsed_days':age,
                  'charge_voltage_mean_v':sum(float(r['voltage_v']) for r in charge)/len(charge),
                  'charge_current_mean_a':sum(float(r['current_a']) for r in charge)/len(charge),
                  'charge_duration_approx_s':duration,**profile}
        if reference_records is not None:
            values.update(normalize_window(profile,extract_charge_window(reference_records)))
        return values
    except (KeyError,TypeError,ValueError,OverflowError,ZeroDivisionError):
        return {'status':'invalid_measurements'}

def in_bounds(values,bounds):
    return all(key in values and math.isfinite(float(values[key])) and low<=float(values[key])<=high
               for key,(low,high) in bounds.items())

def predict_soh(bundle,records,observed_cycle_number,elapsed_days,protocol,reference_records=None):
    if protocol!='CALCE_CS2':
        return {'status':'unsupported_protocol','soh_reference_pct':None}
    values = charging_inputs(records,observed_cycle_number,elapsed_days,reference_records)
    status = values['status']
    if status=='ok' and bundle['requires_initial_charge_reference'] and reference_records is None:
        status = 'missing_initial_charge_reference'
    if status=='ok' and not in_bounds(values,bundle['feature_bounds']):
        status = 'outside_training_range'
    if status!='ok':
        return {'status':status,'soh_reference_pct':None}
    import pandas as pd
    prediction = float(bundle['model'].predict(pd.DataFrame([values])[bundle['features']])[0])
    if not math.isfinite(prediction) or prediction<0:
        return {'status':'invalid_model_output','soh_reference_pct':None}
    return {'status':'ok','soh_reference_pct':prediction,'scope':'CALCE LCO laboratory prototype; relative to first recorded capacity'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('measurements',type=Path,help='CSV of one chronological charge session, using processed sensor column names')
    parser.add_argument('--cycle',required=True,type=int)
    parser.add_argument('--elapsed-days',required=True,type=float)
    parser.add_argument('--protocol',required=True)
    parser.add_argument('--reference',type=Path,help='Initial charge CSV from the same cell; required if the selected model uses window ratios')
    args = parser.parse_args()
    import joblib
    import pandas as pd
    bundle = joblib.load(ROOT/'models/reliable/soh_guarded.joblib')
    records = pd.read_csv(args.measurements).to_dict('records')
    reference = pd.read_csv(args.reference).to_dict('records') if args.reference else None
    print(json.dumps(predict_soh(bundle,records,args.cycle,args.elapsed_days,args.protocol,reference),allow_nan=False))

if __name__=='__main__':
    main()
