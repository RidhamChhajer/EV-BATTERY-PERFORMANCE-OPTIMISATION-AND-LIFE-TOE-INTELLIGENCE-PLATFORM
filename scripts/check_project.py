"""Verify final artifact/data consistency and save a reproducible completion manifest."""
import hashlib
import json
import sys
from datetime import datetime,timezone
from pathlib import Path
import joblib
import sklearn
import pandas as pd
from charging_model import optimise_charging,PROTOCOL
from train_rul import build_examples

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    expected={'soh':('models/reliable/soh_guarded.joblib','data/processed/soh_reliable/training_examples.csv','dataset_sha256'),
              'rul':('models/final/rul.joblib','data/processed/rul_reliable/examples.csv','dataset_sha256'),
              'charging':('models/final/charging.joblib','data/raw/charging_attia2020/final_results.csv','source_sha256')}
    expected.update({'soc_calce':('models/final/soc_calce.joblib','data/processed/soc_calce/examples.csv','data_file_sha256'),
                     'soc_vehicle':('models/final/soc_vehicle.joblib','data/processed/vehicle_tum/examples.csv','data_file_sha256'),
                     'soc_tracking':('models/final/soc_tracking.joblib','data/processed/vehicle_tum/examples.csv','data_file_sha256'),
                     'driving':('models/final/driving.joblib','data/processed/vehicle_tum/examples.csv','data_file_sha256')})
    models={};artifacts=[]
    for name,(model_path,data_path,key) in expected.items():
        path=ROOT/model_path;bundle=joblib.load(path)
        assert bundle[key]==digest(ROOT/data_path),f'{name}: data checksum differs from fitted artifact'
        assert bundle['sklearn_version']==sklearn.__version__
        if name=='driving':
            for item in bundle['models'].values():assert list(item['model'].feature_names_in_)==bundle['features']
        else:assert list(bundle['model'].feature_names_in_)==bundle['features']
        if 'trained_groups' in bundle:assert not set(bundle['trained_groups'])&set(bundle['test_groups'])
        models[name]=bundle
        artifacts.append({'component':name,'model_file':model_path,'model_sha256':digest(path),'data_file':data_path,'data_sha256':bundle[key]})
    rebuilt=build_examples(pd.read_csv(ROOT/'data/processed/life_prediction/cycles.csv'),pd.read_csv(ROOT/'data/processed/life_prediction/cells.csv'))
    saved=pd.read_csv(ROOT/'data/processed/rul_reliable/examples.csv')
    assert len(rebuilt)==len(saved)==3081
    for column in ['cell_id','observed_cycle_number','remaining_observed_cycles']:
        assert rebuilt[column].tolist()==saved[column].tolist()
    recommendation=optimise_charging(models['charging'],PROTOCOL,6)
    assert recommendation['recommendation']['protocol_id']=='protocol_04'
    (ROOT/'reports/charging/example_recommendation.json').write_text(json.dumps(recommendation,indent=2,allow_nan=False),encoding='utf-8')
    sources=json.loads((ROOT/'data/raw/charging_attia2020/provenance.json').read_text())
    for source in sources['files']:
        assert digest(ROOT/'data/raw/charging_attia2020'/source['local_file'])==source['sha256']
    dynamic_sources=json.loads((ROOT/'reports/dynamics/source_manifest.json').read_text())
    for source in dynamic_sources['sources']:assert digest(ROOT/source['path'])==source['sha256']
    splits=pd.read_csv(ROOT/'reports/vehicle_data/splits.csv')
    assert len(splits)==70 and splits.groupby('recording_day').split.nunique().max()==1
    day_lookup=splits.set_index('trip_id').recording_day.to_dict()
    for item in models['driving']['models'].values():
        assert not {day_lookup[s] for s in item['trained_sessions']}&{day_lookup[s] for s in item['test_sessions']}
    from backend.server import dispatch
    requests={'soh':'soh_request.json','rul':'rul_request.json','charging':'charging_request.json','assess':'assess_request.json',
              'soc':'soc_tracking_request.json','driving':'driving_request.json','vehicle':'vehicle_request.json'}
    demos={name:dispatch(models,'/api/'+name,json.loads((ROOT/'examples'/file).read_text())) for name,file in requests.items()}
    assert demos['vehicle']['soc']['status']=='ok' and demos['vehicle']['range']['status']=='ok'
    (ROOT/'reports/backend/demo_results.json').write_text(json.dumps(demos,indent=2,allow_nan=False),encoding='utf-8')
    manifest={'status':'complete_research_backend','verified_at_utc':datetime.now(timezone.utc).isoformat(),
              'checks':['Seven fitted artifact/source hashes match','Feature orders and sklearn versions match','RUL threshold labels match source history','All additional source hashes match','Feasible tested protocol selection matches','No SOC/vehicle test-group overlap','All component demos and SOC-to-energy-to-range pipeline succeed'],
              'artifacts':artifacts,'frontend':'Available in frontend/; verify separately with npm test and npm run test:e2e',
              'limits':['SOH/RUL/charging development evaluation; SOC/driving held profiles/days within the same source cell/vehicle',
                        'RUL counts recorded groups, not EV years/km','Charging ranks nine tested LFP protocols under fixed study conditions; not personalised EV control',
                        'SOC tracking requires a correct starting SOC; sensor-only SOC is less accurate','Range is conditional on predicted consumption and supplied capacity/SOC window; zero-error performance is not established']}
    (ROOT/'reports/backend/completion.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print('Final artifact, data, event-label and charging-source checks passed.')

if __name__=='__main__':main()
