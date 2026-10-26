"""Freeze SOC choices before opening held-out load profiles/vehicle recording days."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import sklearn
from dynamic_features import SOC_FEATURES
from dynamics_training import fit_candidate,select,eligible,metrics,feature_bounds
from predict_soh import in_bounds

ROOT=Path(__file__).resolve().parents[1]

def baseline_calibration():
    frame=pd.read_csv(ROOT/'data/processed/driving_profiles/initial_capacity.csv.gz')
    discharge=frame.loc[frame.step_index==6]
    rest=frame.loc[frame.step_index==5].iloc[-1]
    resistance=float((discharge.voltage_v.iloc[0]-rest.voltage_v)/discharge.current_a.iloc[0])
    capacity=float(discharge.discharge_counter_ah.iloc[-1]-rest.discharge_counter_ah)
    soc=100-100*(discharge.discharge_counter_ah-rest.discharge_counter_ah)/capacity
    ocv=discharge.voltage_v-discharge.current_a*resistance
    curve=pd.DataFrame({'v':ocv,'soc':soc}).groupby('v').soc.mean().sort_index()
    return {'resistance_ohm':resistance,'voltage':curve.index.tolist(),'soc_pct':curve.tolist(),'capacity_ah':capacity}

def train_domain(domain,open_test=True):
    lab=domain=='calce';name='soc_calce' if lab else 'soc_vehicle'
    data=ROOT/f'data/processed/{name if lab else "vehicle_tum"}/examples.csv';out=ROOT/f'reports/{name}'
    out.mkdir(parents=True,exist_ok=True)
    frame=pd.read_csv(data)
    if lab:frame['group_id']=frame.profile
    target='target_soc_pct' if lab else 'soc_reference_pct';warmup='history_supported' if lab else 'soc_history_supported'
    train=eligible(frame.loc[frame.split=='train'],SOC_FEATURES,target,warmup,stride=2)
    validation=eligible(frame.loc[frame.split=='validation'],SOC_FEATURES,target,warmup)
    assert not set(train.group_id)&set(validation.group_id)
    best,ranking=select(train,validation,SOC_FEATURES,target,out,bounded_soc=True)
    if not open_test:return
    script='prepare_soc.py' if lab else 'prepare_vehicle.py'
    subprocess.run([sys.executable,str(ROOT/'scripts'/script),'--include-test'],check=True)
    frame=pd.read_csv(data)
    if lab:frame['group_id']=frame.profile
    development=eligible(frame.loc[frame.split!='test'],SOC_FEATURES,target,warmup,stride=2)
    test=eligible(frame.loc[frame.split=='test'],SOC_FEATURES,target,warmup)
    assert not set(development.group_id)&set(test.group_id)
    final=fit_candidate(best,SOC_FEATURES,development,target)
    baseline=baseline_calibration() if lab else fit_candidate({'family':'ridge','parameters':{'alpha':10.}},['voltage_v','current_a','temperature_c'],development,target)
    bounds=feature_bounds(development,SOC_FEATURES)
    predictions=[];scores=[]
    for split in ['train','validation','test']:
        check=eligible(frame.loc[frame.split==split],SOC_FEATURES,target,warmup)
        raw=final.predict(check[SOC_FEATURES]);p=np.clip(raw,0,100)
        base=np.interp(check.voltage_v-check.current_a*baseline['resistance_ohm'],baseline['voltage'],baseline['soc_pct']) if lab else np.clip(baseline.predict(check[['voltage_v','current_a','temperature_c']]),0,100)
        supported=np.array([in_bounds(r,bounds) for r in check[SOC_FEATURES].to_dict('records')])
        for recipe,values in [('selected_soc',p),('raw_selected_soc',raw),('calibration_voltage_baseline' if lab else 'static_voltage_ridge_baseline',base)]:
            scores.append({'split':split,'recipe':recipe,'cohort':'all eligible',**metrics(check,target,values)})
            if supported.any():scores.append({'split':split,'recipe':recipe,'cohort':'runtime supported',**metrics(check.loc[supported],target,np.asarray(values)[supported])})
        predictions.extend({'session_id':r.session_id,'time_s':float(r.time_s),'split':split,'actual_soc_pct':float(getattr(r,target)),
                            'predicted_soc_pct':float(v),'raw_predicted_soc_pct':float(z),'baseline_soc_pct':float(b),'runtime_supported':bool(s)}
                           for r,v,z,b,s in zip(check.itertuples(index=False),p,raw,base,supported))
    pd.DataFrame(predictions).to_csv(out/'predictions.csv',index=False);pd.DataFrame(scores).to_csv(out/'metrics.csv',index=False)
    bundle={'model':final,'features':SOC_FEATURES,'configuration':best,'protocol':'CALCE_NMC_25C' if lab else 'TUM_BMW_I3',
            'feature_bounds':bounds,'minimum_history_s':30,'target_description':'Earlier-capacity, full-charge anchored coulomb reference' if lab else 'Vehicle-reported BMS SOC',
            'trained_sessions':sorted(development.session_id.unique()),'test_sessions':sorted(test.session_id.unique()),
            'trained_groups':sorted(development.group_id.unique()),'test_groups':sorted(test.group_id.unique()),
            'training_data_sha256':hashlib.sha256(development.to_csv(index=False).encode()).hexdigest(),
            'data_file_sha256':hashlib.sha256(data.read_bytes()).hexdigest(),'sklearn_version':sklearn.__version__,
            'baseline':baseline if lab else None,'current_sign':'positive charging; negative discharge','physical_output_bounds_pct':[0,100]}
    destination=ROOT/f'models/final/{name}.joblib';joblib.dump(bundle,destination)
    loaded=joblib.load(destination);assert np.allclose(final.predict(test[SOC_FEATURES].head(10)),loaded['model'].predict(test[SOC_FEATURES].head(10)))
    summary={'status':'complete','protocol':bundle['protocol'],'selected':best,'train_validation_sessions':len(bundle['trained_sessions']),
             'test_sessions':len(bundle['test_sessions']),'test_eligible_rows':len(test),'test_runtime_supported':int(pd.DataFrame(predictions).loc[lambda d:d.split=='test','runtime_supported'].sum()),
             'invalid_reference_labels_retained':int((~frame[target].between(0,100)).sum()),'target_description':bundle['target_description'],
             'test_selection_frozen':True,'evaluation':'Held complete load profile' if lab else 'Held recording days from the same BMW i3',
             'postprocessing':'Raw predictions preserved; output clipped to physical SOC bounds; both raw and bounded errors reported'}
    (out/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    print(pd.DataFrame(scores).loc[lambda d:(d.split=='test')&(d.cohort=='all eligible')].to_string(index=False),flush=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('domain',choices=['calce','vehicle']);parser.add_argument('--select-only',action='store_true');args=parser.parse_args()
    train_domain(args.domain,not args.select_only)

if __name__=='__main__':main()
