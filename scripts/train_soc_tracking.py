"""Select physically initialised SOC observers without using held-out recording days."""
import argparse
import hashlib
import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import Ridge
from soc_tracking import tracking_features
from dynamics_training import balanced_weights,metrics

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/soc_tracking'
SETTINGS=[(['net_charge_ah'],.01),(['net_charge_ah','charge_temperature_interaction'],.1),
          (['net_charge_ah','charge_temperature_interaction','charge_initial_soc_interaction'],1.)]

def examples(include_test=False):
    splits=pd.read_csv(ROOT/'reports/vehicle_data/splits.csv');rows=[]
    for r in splits.itertuples():
        if r.split=='test' and not include_test:continue
        path=ROOT/f'data/processed/vehicle_tum/{r.trip_id}_observations.csv'
        if not path.exists():continue
        frame=pd.read_csv(path)
        # Gaps start a newly initialised segment; do not carry a state through unknown current.
        groups=(frame.time_s.diff().fillna(0)>5).cumsum()
        for segment,g in frame.groupby(groups):
            if len(g)<31:continue
            initial=float(g.soc_reference_pct.iloc[0])
            features,temp=tracking_features(g.to_dict('records'),initial)
            features['delta_soc_pct']=g.soc_reference_pct.to_numpy()-initial
            features['initial_soc_pct']=initial;features['initial_temperature_c']=temp
            features['actual_soc_pct']=g.soc_reference_pct.to_numpy();features['session_id']=r.trip_id;features['split']=r.split;features['group_id']=r.recording_day
            features['time_s']=g.time_s.to_numpy();rows.append(features.iloc[30::5])
    return pd.concat(rows,ignore_index=True)

def fit(frame,features,alpha):
    model=Ridge(alpha=alpha,fit_intercept=False)
    model.fit(frame[features],frame.delta_soc_pct,sample_weight=balanced_weights(frame))
    return model

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--select-only',action='store_true');args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    lock=OUT/'selection.json'
    if not args.select_only and not lock.exists():raise ValueError('Run --select-only before opening held-out recording days.')
    frame=examples(include_test=not args.select_only);train=frame.loc[frame.split=='train'];val=frame.loc[frame.split=='validation']
    if lock.exists():chosen=json.loads(lock.read_text())['selected']
    else:
        scores=[]
        for features,alpha in SETTINGS:
            model=fit(train,features,alpha)
            estimate=np.clip(val.initial_soc_pct+model.predict(val[features]),0,100)
            score=metrics(val,'actual_soc_pct',estimate)
            scores.append({'features':features,'alpha':alpha,'validation':score})
            print(f'SOC tracking {features}: validation macro MAE {score["macro_session_mae"]:.3f}',flush=True)
        chosen=min(scores,key=lambda r:r['validation']['macro_session_mae'])
        lock.write_text(json.dumps({'selected':chosen,'ranking':scores,'test_not_used':True,'assumption':'Known first-observation SOC; this is a different input scenario from voltage/current-only estimation'},indent=2),encoding='utf-8')
    if args.select_only:return
    if not (ROOT/'reports/vehicle_data/manifest.json').exists() or not json.loads((ROOT/'reports/vehicle_data/manifest.json').read_text())['test_opened']:
        raise ValueError('Freeze the other vehicle selections and prepare the held-out recording days first.')
    development=frame.loc[frame.split!='test'];test=frame.loc[frame.split=='test']
    model=fit(development,chosen['features'],chosen['alpha'])
    output=[];scores=[]
    for split,g in frame.groupby('split'):
        predicted=np.clip(g.initial_soc_pct+model.predict(g[chosen['features']]),0,100)
        nominal=np.clip(g.initial_soc_pct+g.net_charge_ah*100/60,0,100)
        for recipe,p in [('calibrated_tracking',predicted),('nominal_60ah_coulomb_baseline',nominal)]:scores.append({'split':split,'recipe':recipe,**metrics(g,'actual_soc_pct',p)})
        output.extend({'session_id':r.session_id,'time_s':r.time_s,'split':split,'actual_soc_pct':r.actual_soc_pct,'predicted_soc_pct':float(p),'baseline_soc_pct':float(b)} for r,p,b in zip(g.itertuples(),predicted,nominal))
    bundle={'model':model,'features':chosen['features'],'configuration':chosen,'protocol':'TUM_BMW_I3',
            'initial_temperature_bounds':[float(development.initial_temperature_c.min()),float(development.initial_temperature_c.max())],
            'trained_groups':sorted(development.group_id.unique()),'test_groups':sorted(test.group_id.unique()),
            'sklearn_version':sklearn.__version__,'data_file_sha256':hashlib.sha256((ROOT/'data/processed/vehicle_tum/examples.csv').read_bytes()).hexdigest(),
            'requires_known_initial_soc':True}
    joblib.dump(bundle,ROOT/'models/final/soc_tracking.joblib')
    loaded=joblib.load(ROOT/'models/final/soc_tracking.joblib');assert np.allclose(model.predict(test[chosen['features']].head()),loaded['model'].predict(test[chosen['features']].head()))
    pd.DataFrame(output).to_csv(OUT/'predictions.csv',index=False);pd.DataFrame(scores).to_csv(OUT/'metrics.csv',index=False)
    (OUT/'summary.json').write_text(json.dumps({'status':'complete','selected':chosen,'test_recording_days':len(bundle['test_groups']),
                                             'initialisation':'Uses one known SOC at the beginning of each uninterrupted observation history; no later SOC labels are predictors'},indent=2),encoding='utf-8')
    print(pd.DataFrame(scores).loc[lambda d:d.split=='test'].to_string(index=False),flush=True)

if __name__=='__main__':main()
