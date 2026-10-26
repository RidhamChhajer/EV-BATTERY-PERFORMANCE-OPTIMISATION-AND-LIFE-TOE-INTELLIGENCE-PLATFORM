"""Real telemetry must produce the same features and outputs offline and through the API."""
import json
import sys
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from dynamic_features import SOC_FEATURES,DRIVE_FEATURES,live_features

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.server import dispatch

def main():
    models={name:joblib.load(ROOT/f'models/final/{name}.joblib') for name in ['soc_calce','soc_vehicle','soc_tracking','driving']}
    for name,file,data,features in [
        ('soc_calce','soc_calce_request.json','soc_calce/FUDS_80.csv',SOC_FEATURES),
        ('soc_vehicle','soc_vehicle_request.json','vehicle_tum/TripA01_features.csv',SOC_FEATURES),
        ('driving','driving_request.json','vehicle_tum/TripA01_features.csv',DRIVE_FEATURES)]:
        payload=json.loads((ROOT/'examples'/file).read_text())
        frame=pd.read_csv(ROOT/'data/processed'/data)
        last=float(payload['observations'][-1]['time_s'])
        gold=frame.loc[np.isclose(frame.time_s,last,rtol=0,atol=1e-9)].iloc[0]
        live=live_features(payload['observations'],driving=name=='driving')
        assert np.allclose([live[f] for f in features],[gold[f] for f in features],rtol=1e-10,atol=1e-10),f'{name}: sensor feature mismatch'
        result=dispatch(models,'/api/driving' if name=='driving' else '/api/soc',payload)
        assert result['status']=='ok',result
        if name!='driving':
            expected=float(np.clip(models[name]['model'].predict(pd.DataFrame([{f:gold[f] for f in features}]))[0],0,100))
            assert abs(result['soc_pct']-expected)<1e-8
        else:
            for target,bundle in models['driving']['models'].items():
                if bundle['strategy']=='ml':
                    expected=float(bundle['model'].predict(pd.DataFrame([{f:gold[f] for f in features}]))[0])
                    assert abs(result['predictions'][target]['value']-expected)<1e-8
        print(f'{name}: real source features and API predictions match the offline path.',flush=True)
    (ROOT/'reports/dynamics/verification.json').write_text(json.dumps({'status':'passed','real_feature_paths_checked':3,'soc_and_both_energy_forecasts_match':True},indent=2),encoding='utf-8')

if __name__=='__main__':main()
