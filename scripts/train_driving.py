"""Select minute-energy and next-kilometre models, then evaluate held recording days."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import sklearn
from dynamic_features import DRIVE_FEATURES
from dynamics_training import fit_candidate,select,eligible,metrics,feature_bounds
from predict_soh import in_bounds

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/driving'
DATA=ROOT/'data/processed/vehicle_tum/examples.csv'
TARGETS={'next_60s':'target_next_60s_wh','next_km':'target_next_km_wh_per_km'}

def persistence(frame,target,fallback):
    if target=='target_next_60s_wh':return frame.power_mean_60s_kw.to_numpy()*1000/60
    return np.where(frame.low_speed_history==0,frame.recent_wh_per_km,fallback)

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    frame=pd.read_csv(DATA);choices={}
    for name,target in TARGETS.items():
        directory=OUT/name;directory.mkdir(exist_ok=True)
        train=eligible(frame.loc[frame.split=='train'],DRIVE_FEATURES,target,'history_supported',stride=10)
        val=eligible(frame.loc[frame.split=='validation'],DRIVE_FEATURES,target,'history_supported',stride=10)
        best,ranking=select(train,val,DRIVE_FEATURES,target,directory)
        fallback=float(train[target].median())
        baseline_score=metrics(val,target,persistence(val,target,fallback))
        ml_score=min(ranking,key=lambda r:r['validation']['macro_session_mae'])['validation']
        strategy='persistence' if baseline_score['macro_session_mae']<ml_score['macro_session_mae'] else 'ml'
        choices[name]={'candidate':best,'strategy':strategy,'validation_persistence':baseline_score,'training_fallback':fallback}
    (OUT/'selection.json').write_text(json.dumps({'choices':choices,'features':DRIVE_FEATURES,'test_not_used_for_selection':True},indent=2),encoding='utf-8')
    if not (ROOT/'reports/soc_vehicle/selection.json').exists():raise ValueError('Select the vehicle SOC model before opening joint held-out trips.')
    subprocess.run([sys.executable,str(ROOT/'scripts/prepare_vehicle.py'),'--include-test'],check=True)
    frame=pd.read_csv(DATA);models={};results=[];scores=[]
    for name,target in TARGETS.items():
        development=eligible(frame.loc[frame.split!='test'],DRIVE_FEATURES,target,'history_supported',stride=10)
        test=eligible(frame.loc[frame.split=='test'],DRIVE_FEATURES,target,'history_supported',stride=10)
        assert not set(development.group_id)&set(test.group_id)
        choice=choices[name];final=fit_candidate(choice['candidate'],DRIVE_FEATURES,development,target)
        fallback=float(development[target].median());bounds=feature_bounds(development,DRIVE_FEATURES)
        for split in ['train','validation','test']:
            check=eligible(frame.loc[frame.split==split],DRIVE_FEATURES,target,'history_supported',stride=10)
            ml=final.predict(check[DRIVE_FEATURES]);base=persistence(check,target,fallback)
            chosen=base if choice['strategy']=='persistence' else ml
            supported=np.array([in_bounds(r,bounds) for r in check[DRIVE_FEATURES].to_dict('records')])
            for recipe,p in [('selected_strategy',chosen),('ml_candidate',ml),('recent_rate_baseline',base),('training_median_baseline',np.full(len(check),fallback))]:
                scores.append({'target':name,'split':split,'recipe':recipe,'cohort':'all eligible',**metrics(check,target,p)})
                if supported.any():scores.append({'target':name,'split':split,'recipe':recipe,'cohort':'runtime supported',**metrics(check.loc[supported],target,p[supported])})
            results.extend({'target':name,'session_id':r.session_id,'time_s':float(r.time_s),'split':split,'actual':float(getattr(r,target)),
                            'predicted':float(p),'ml_predicted':float(m),'baseline_predicted':float(b),'runtime_supported':bool(s)}
                           for r,p,m,b,s in zip(check.itertuples(index=False),chosen,ml,base,supported))
        models[name]={'model':final,'strategy':choice['strategy'],'configuration':choice['candidate'],'feature_bounds':bounds,'fallback':fallback,
                      'target':target,'unit':'Wh' if name=='next_60s' else 'Wh/km','trained_sessions':sorted(development.session_id.unique()),
                      'test_sessions':sorted(test.session_id.unique()),'training_data_sha256':hashlib.sha256(development.to_csv(index=False).encode()).hexdigest()}
    bundle={'models':models,'features':DRIVE_FEATURES,'protocol':'TUM_BMW_I3','minimum_history_s':60,'current_sign':'positive charging; negative discharge',
            'data_file_sha256':hashlib.sha256(DATA.read_bytes()).hexdigest(),'sklearn_version':sklearn.__version__,
            'range_method':'Scenario calculation from predicted next-km consumption, supplied usable pack capacity, current SOC and reserve; not a independently labelled depletion-range model'}
    joblib.dump(bundle,ROOT/'models/final/driving.joblib')
    loaded=joblib.load(ROOT/'models/final/driving.joblib')
    for name,target in TARGETS.items():
        check=eligible(frame.loc[frame.split=='test'],DRIVE_FEATURES,target,'history_supported',stride=10).head(10)
        assert np.allclose(models[name]['model'].predict(check[DRIVE_FEATURES]),loaded['models'][name]['model'].predict(check[DRIVE_FEATURES]))
    pd.DataFrame(results).to_csv(OUT/'predictions.csv',index=False);pd.DataFrame(scores).to_csv(OUT/'metrics.csv',index=False)
    (OUT/'summary.json').write_text(json.dumps({'status':'complete','choices':choices,'test_selection_frozen':True,'protocol':'TUM_BMW_I3',
        'evaluation':'Held recording days from the same real BMW i3; no same-day overlap','range_method':bundle['range_method']},indent=2),encoding='utf-8')
    print(pd.DataFrame(scores).loc[lambda d:(d.split=='test')&(d.cohort=='all eligible')].to_string(index=False),flush=True)

if __name__=='__main__':main()
