"""Train a small protocol-life surrogate and assess by holding out whole protocols."""
import hashlib
import json
import joblib
import numpy as np
import pandas as pd
import sklearn
import train_soh as training
from charging_model import FEATURES,fourth_rate,optimise_charging,PROTOCOL

ROOT=training.ROOT
OUT=ROOT/'reports/charging'
DATA=ROOT/'data/processed/charging_attia2020'
MODEL=ROOT/'models/final/charging.joblib'
SETTINGS=[('ridge',{'alpha':1.}),('ridge',{'alpha':10.}),('random_forest',{'n_estimators':100,'max_depth':3,'min_samples_leaf':5,'n_jobs':1})]

def prepare(source):
    required=['C1','C2','C3','R1','R2','R3','R4','R5']
    if source.columns.tolist()!=required or not np.isfinite(source.to_numpy()).all() or (source.to_numpy()<=0).any():
        raise ValueError('Unexpected measured validation table schema or values.')
    rows=[]
    for index,r in source.iterrows():
        rates=dict(zip(FEATURES,[float(r.C1),float(r.C2),float(r.C3),fourth_rate(r.C1,r.C2,r.C3)]))
        if rates['c4']>4.81:
            raise ValueError('Fourth rate exceeds the source protocol domain.')
        for rep in range(1,6):
            rows.append({'protocol_id':f'protocol_{index+1:02d}','sample_id':f'protocol_{index+1:02d}_cell_{rep}',
                         'cell_id':f'protocol_{index+1:02d}',**rates,'measured_cycle_life':float(r[f'R{rep}']),training.TARGET:float(r[f'R{rep}'])})
    return rows

def predict(model,rows):return model.predict(pd.DataFrame(rows)[FEATURES])

def score(actual,predicted):return {k.replace('_pp','_cycles'):v for k,v in training.scores(list(actual),list(predicted)).items()}

def choose(rows):
    ranking=[]
    for name,params in SETTINGS:
        errors=[]
        for held in sorted({r['protocol_id'] for r in rows}):
            fit=[r for r in rows if r['protocol_id']!=held];check=[r for r in rows if r['protocol_id']==held]
            model=training.fit_model(name,params,FEATURES,fit)
            errors.append(score([r[training.TARGET] for r in check],predict(model,check))['mae_cycles'])
        ranking.append({'model':name,'parameters':params,'mean_protocol_mae_cycles':float(np.mean(errors))})
    return min(ranking,key=lambda r:r['mean_protocol_mae_cycles']),ranking

def main():
    OUT.mkdir(parents=True,exist_ok=True);DATA.mkdir(parents=True,exist_ok=True)
    path=ROOT/'data/raw/charging_attia2020/final_results.csv'
    rows=prepare(pd.read_csv(path))
    assert len(rows)==45 and len({r['protocol_id'] for r in rows})==9
    pd.DataFrame(rows).drop(columns=[training.TARGET,'cell_id']).to_csv(DATA/'measured_lifetimes.csv',index=False)
    results=[];inner=[]
    for held in sorted({r['protocol_id'] for r in rows}):
        fit=[r for r in rows if r['protocol_id']!=held];check=[r for r in rows if r['protocol_id']==held]
        winner,ranking=choose(fit);inner.extend({'held_protocol':held,**r} for r in ranking)
        model=training.fit_model(winner['model'],winner['parameters'],FEATURES,fit)
        prior=float(np.mean([r[training.TARGET] for r in fit]))
        predicted=predict(model,check)
        for recipe,values in [('mean_life_baseline',[prior]*len(check)),('selected_surrogate',predicted)]:
            results.extend({'held_protocol':held,'sample_id':r['sample_id'],'recipe':recipe,'actual_cycles':r[training.TARGET],'predicted_cycles':float(p)} for r,p in zip(check,values))
        print(f'{held}: {winner["model"]}; MAE {score([r[training.TARGET] for r in check],predicted)["mae_cycles"]:.1f} study cycles',flush=True)
    frame=pd.DataFrame(results);frame.to_csv(OUT/'out_of_protocol_predictions.csv',index=False)
    (OUT/'inner_cv_settings.json').write_text(json.dumps(inner,indent=2),encoding='utf-8')
    metrics=[{'recipe':recipe,**score(g.actual_cycles,g.predicted_cycles)} for recipe,g in frame.groupby('recipe')]
    pd.DataFrame(metrics).to_csv(OUT/'metrics.csv',index=False)
    best,ranking=choose(rows)
    model=training.fit_model(best['model'],best['parameters'],FEATURES,rows)
    protocols=[]
    for protocol in sorted({r['protocol_id'] for r in rows}):
        group=[r for r in rows if r['protocol_id']==protocol]
        values=[r['measured_cycle_life'] for r in group]
        protocols.append({'protocol_id':protocol,**{f:group[0][f] for f in FEATURES},'replicate_cells':5,
                          'observed_mean_life_cycles':float(np.mean(values)),'observed_std_life_cycles':float(np.std(values,ddof=1)),
                          'observed_min_life_cycles':float(min(values)),'observed_max_life_cycles':float(max(values)),
                          'predicted_life_cycles':float(predict(model,group[:1])[0])})
    pd.DataFrame(protocols).to_csv(DATA/'tested_protocols.csv',index=False)
    bundle={'model':model,'features':FEATURES,'configuration':best,'tested_protocols':protocols,'protocol':PROTOCOL,
            'chemistry':'LFP','target':'measured study cycle life','evaluation':'Nested leave-one-protocol-out development CV on nine protocols',
            'source':'Attia et al., Nature 2020, doi:10.1038/s41586-020-1994-5','source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sklearn_version':sklearn.__version__}
    joblib.dump(bundle,MODEL)
    assert np.allclose(predict(model,rows),predict(joblib.load(MODEL)['model'],rows))
    recommendation=optimise_charging(bundle,PROTOCOL,8)
    (OUT/'example_recommendation.json').write_text(json.dumps(recommendation,indent=2,allow_nan=False),encoding='utf-8')
    (OUT/'summary.json').write_text(json.dumps({'status':'complete','protocols':9,'replicate_cells':45,'selected':best,'candidate_ranking':ranking,
        'recommendation_default':'Rank measured protocol means under a C-rate limit; ML predictions optional','evaluation':bundle['evaluation'],'independent_ev_validation':False},indent=2),encoding='utf-8')
    print(pd.DataFrame(metrics).to_string(index=False),flush=True)

if __name__=='__main__':main()
