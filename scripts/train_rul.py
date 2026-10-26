"""Nested battery CV for remaining recorded cycles; all six cells are development data."""
import hashlib
import json
import joblib
import numpy as np
import pandas as pd
import sklearn
import train_soh as training
from rul_features import FEATURES,history_features,threshold_crossed
from predict_soh import in_bounds

ROOT=training.ROOT
OUT=ROOT/'reports/rul'
DATA=ROOT/'data/processed/rul_reliable'
MODEL=ROOT/'models/final/rul.joblib'
SETTINGS=[('ridge',{'alpha':10.}),('ridge',{'alpha':100.}),('random_forest',{'n_estimators':120,'max_depth':6,'min_samples_leaf':15,'n_jobs':1})]

def build_examples(cycles,cells):
    rows=[]
    for cell,g in cycles.loc[cycles.full_cycle_candidate].groupby('cell_id'):
        g=g.sort_values('observed_cycle_number')
        event=cells.loc[cells.cell_id==cell].iloc[0]
        confirmations=(g.soh_reference_pct<=80).rolling(3,min_periods=3).sum().eq(3)
        if not bool(event.threshold_80_observed):
            if confirmations.any():raise ValueError(f'{cell}: censored flag contradicts observed threshold.')
            continue  # Censored cells retain unknown targets; ordinary regression cannot train them.
        eol=int(event.threshold_confirmation_observed_cycle)
        if not confirmations.any() or int(g.loc[confirmations,'observed_cycle_number'].iloc[0])!=eol:
            raise ValueError(f'{cell}: threshold label does not match three observed health measurements.')
        history=[]
        for r in g.to_dict('records'):
            history.append({k:r[k] for k in ('observed_cycle_number','elapsed_days','soh_reference_pct')})
            if len(history)<5 or r['observed_cycle_number']>eol:
                continue
            values=history_features(history,r['discharge_c_rate'])
            remaining=eol-r['observed_cycle_number']
            assert remaining>=0
            rows.append({'cell_id':cell,**values,'threshold_confirmed_current':all(h['soh_reference_pct']<=80 for h in history[-3:]),'remaining_observed_cycles':remaining,training.TARGET:remaining})
    return pd.DataFrame(rows)

def score(actual,predicted):
    result=training.scores(list(actual),list(predicted))
    return {k.replace('_pp','_cycles'):v for k,v in result.items()}

def predict(model,rows):
    raw=model.predict(pd.DataFrame(rows)[FEATURES])
    return raw,np.maximum(0,raw)

def choose(rows):
    ranking=[]
    for name,params in SETTINGS:
        errors=[]
        for held in sorted({r['cell_id'] for r in rows}):
            fit=[r for r in rows if r['cell_id']!=held];check=[r for r in rows if r['cell_id']==held]
            model=training.fit_model(name,params,FEATURES,fit)
            errors.append(score([r[training.TARGET] for r in check],predict(model,check)[1])['mae_cycles'])
        ranking.append({'model':name,'parameters':params,'macro_cell_mae_cycles':float(np.mean(errors))})
    return min(ranking,key=lambda r:r['macro_cell_mae_cycles']),ranking

def main():
    OUT.mkdir(parents=True,exist_ok=True);DATA.mkdir(parents=True,exist_ok=True);MODEL.parent.mkdir(parents=True,exist_ok=True)
    cycles=pd.read_csv(ROOT/'data/processed/life_prediction/cycles.csv')
    cells=pd.read_csv(ROOT/'data/processed/life_prediction/cells.csv')
    frame=build_examples(cycles,cells)
    frame.drop(columns=[training.TARGET]).to_csv(DATA/'examples.csv',index=False)
    assert len(frame.cell_id.unique())==6 and np.isfinite(frame[FEATURES+[training.TARGET]]).all().all()
    rows=frame.to_dict('records');results=[];folds=[];settings=[]
    oof_soh=pd.read_csv(ROOT/'reports/reliability/out_of_fold_predictions.csv')
    soh_status=pd.read_csv(ROOT/'reports/reliability/runtime_status_by_cycle.csv')
    valid_soh=set(map(tuple,soh_status.loc[soh_status.runtime_status=='ok',['cell_id','observed_cycle_number']].to_numpy()))
    oof_soh=oof_soh.loc[oof_soh.recipe=='guarded_selected_model'].set_index(['cell_id','observed_cycle_number']).predicted_soh_pct.to_dict()
    oof_soh={key:value for key,value in oof_soh.items() if key in valid_soh}
    for held in sorted(frame.cell_id.unique()):
        fit=[r for r in rows if r['cell_id']!=held];check=[r for r in rows if r['cell_id']==held]
        winner,ranking=choose(fit);settings.extend({'outer_held_cell':held,**r} for r in ranking)
        model=training.fit_model(winner['model'],winner['parameters'],FEATURES,fit)
        raw,new=predict(model,check)
        new=np.where([r['threshold_confirmed_current'] for r in check],0,new)
        bounds={f:[min(r[f] for r in fit),max(r[f] for r in fit)] for f in FEATURES}
        event_prior=float(cells.loc[cells.cell_id!=held,'threshold_confirmation_observed_cycle'].mean())
        prior=np.maximum(0,event_prior-np.array([r['observed_cycle_number'] for r in check]))
        trend=[max(0,(r['current_soh_pct']-80)/max(.001,-r['soh_slope_pp_per_cycle'])) for r in check]
        for recipe,predictions in [('age_prior',prior),('linear_health_trend',trend),('selected_model_measured_soh',new)]:
            metric=score([r[training.TARGET] for r in check],predictions)
            folds.append({'held_out_cell':held,'recipe':recipe,**metric})
            for r,p,z in zip(check,predictions,raw):
                results.append({'cell_id':held,'observed_cycle_number':int(r['observed_cycle_number']),'recipe':recipe,
                                'actual_remaining_cycles':r[training.TARGET],'predicted_remaining_cycles':float(p),
                                'runtime_supported':in_bounds(r,bounds) or r['threshold_confirmed_current'],'current_soh_pct':r['current_soh_pct'],
                                'raw_selected_prediction':float(z) if recipe=='selected_model_measured_soh' else None})
        # Each input SOH below is itself an outer held-battery prediction, never an all-data fitted value.
        predicted_history=[];measured_history=[]
        for r in cycles.loc[(cycles.cell_id==held)&cycles.full_cycle_candidate].sort_values('observed_cycle_number').to_dict('records'):
            measured_history.append({k:r[k] for k in ('observed_cycle_number','elapsed_days','soh_reference_pct')})
            key=(held,r['observed_cycle_number'])
            if key not in oof_soh:
                continue
            predicted_history.append({'observed_cycle_number':r['observed_cycle_number'],'elapsed_days':r['elapsed_days'],'soh_reference_pct':float(oof_soh[key])})
            if len(measured_history)>=5 and pd.notna(r['remaining_observed_cycles_to_80pct']):
                mixed=measured_history[:-1]+[predicted_history[-1]]
                mixed_values=history_features(mixed,r['discharge_c_rate'])
                m_raw,m_pred=predict(model,[mixed_values])
                m_confirmed=threshold_crossed(mixed)
                results.append({'cell_id':held,'observed_cycle_number':int(r['observed_cycle_number']),'recipe':'selected_model_mixed_soh',
                                'actual_remaining_cycles':r['remaining_observed_cycles_to_80pct'],'predicted_remaining_cycles':0. if m_confirmed else float(m_pred[0]),
                                'runtime_supported':in_bounds(mixed_values,bounds) or m_confirmed,'current_soh_pct':mixed_values['current_soh_pct'],'raw_selected_prediction':float(m_raw[0])})
            if len(predicted_history)<5 or pd.isna(r['remaining_observed_cycles_to_80pct']):
                continue
            values=history_features(predicted_history,r['discharge_c_rate'])
            p_raw,p=predict(model,[values])
            confirmed=threshold_crossed(predicted_history)
            if confirmed:p[0]=0
            results.append({'cell_id':held,'observed_cycle_number':int(r['observed_cycle_number']),'recipe':'selected_model_predicted_soh',
                            'actual_remaining_cycles':r['remaining_observed_cycles_to_80pct'],'predicted_remaining_cycles':float(p[0]),
                            'runtime_supported':in_bounds(values,bounds) or confirmed,'current_soh_pct':values['current_soh_pct'],'raw_selected_prediction':float(p_raw[0])})
        print(f'{held}: {winner["model"]}; measured-SOH MAE {score([r[training.TARGET] for r in check],new)["mae_cycles"]:.1f} recorded cycles',flush=True)
    output=pd.DataFrame(results)
    output.to_csv(OUT/'out_of_fold_predictions.csv',index=False)
    pd.DataFrame(folds).to_csv(OUT/'by_battery.csv',index=False)
    (OUT/'inner_cv_settings.json').write_text(json.dumps(settings,indent=2),encoding='utf-8')
    metrics=[]
    for recipe,g in output.groupby('recipe'):
        metrics.append({'recipe':recipe,'cohort':'all available',**score(g.actual_remaining_cycles,g.predicted_remaining_cycles)})
        supported=g.loc[g.runtime_supported]
        metrics.append({'recipe':recipe,'cohort':'runtime supported',**score(supported.actual_remaining_cycles,supported.predicted_remaining_cycles)})
    # Compare measured and predicted inputs only on identical runtime-supported cycle keys.
    measured=output.loc[(output.recipe=='selected_model_measured_soh')&output.runtime_supported]
    for chain_recipe in ['selected_model_predicted_soh','selected_model_mixed_soh']:
        chain=output.loc[(output.recipe==chain_recipe)&output.runtime_supported]
        shared=chain[['cell_id','observed_cycle_number']].merge(measured[['cell_id','observed_cycle_number']],on=['cell_id','observed_cycle_number'],validate='one_to_one')
        paired=output.merge(shared,on=['cell_id','observed_cycle_number'],validate='many_to_one')
        paired=paired.loc[paired.runtime_supported&paired.recipe.isin(['age_prior','linear_health_trend','selected_model_measured_soh',chain_recipe])]
        for recipe,g in paired.groupby('recipe'):
            metrics.append({'recipe':recipe,'cohort':'paired '+chain_recipe,**score(g.actual_remaining_cycles,g.predicted_remaining_cycles)})
    pd.DataFrame(metrics).to_csv(OUT/'metrics.csv',index=False)
    best,ranking=choose(rows)
    final=training.fit_model(best['model'],best['parameters'],FEATURES,rows)
    bundle={'model':final,'features':FEATURES,'configuration':best,'target':'remaining_observed_cycles',
            'feature_bounds':{f:[float(frame[f].min()),float(frame[f].max())] for f in FEATURES},
            'threshold_soh_pct':80.,'confirmation_observations':3,'minimum_history':5,'history_window':20,
            'trained_cells':sorted(frame.cell_id.unique()),'scope':'CALCE LCO development; recorded groups, not years/km',
            'evaluation':'Nested development CV; all six batteries previously inspected',
            'sklearn_version':sklearn.__version__,'dataset_sha256':hashlib.sha256((DATA/'examples.csv').read_bytes()).hexdigest()}
    joblib.dump(bundle,MODEL)
    assert np.allclose(predict(final,rows[:10])[0],predict(joblib.load(MODEL)['model'],rows[:10])[0])
    (OUT/'summary.json').write_text(json.dumps({'status':'complete','examples':len(frame),'batteries':6,'selected':best,'candidate_ranking':ranking,
        'censored_cells':int((~cells.threshold_80_observed).sum()),'negative_predictions_floored':int((output.loc[output.recipe=='selected_model_measured_soh','raw_selected_prediction']<0).sum()),
        'evaluation':bundle['evaluation'],'prediction_time':'After latest SOH observation; all rolling features past-only','target':bundle['target']},indent=2),encoding='utf-8')
    print(pd.DataFrame(metrics).to_string(index=False),flush=True)

if __name__=='__main__':
    main()
