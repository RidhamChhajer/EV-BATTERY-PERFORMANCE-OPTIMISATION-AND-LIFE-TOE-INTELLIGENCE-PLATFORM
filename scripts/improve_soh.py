"""Fix the charge representation, assess seen batteries with nested grouped CV, fit all data."""
import hashlib
import json

import joblib
import numpy as np
import pandas as pd
import sklearn
import train_soh as training
from charge_features import extract_charge_window,normalize_window

ROOT = training.ROOT
OUT = ROOT/'reports/reliability'
DATA = ROOT/'data/processed/soh_reliable'
MODELS = ROOT/'models/reliable'
FEATURES = ['window_low_charge_ratio','window_high_charge_ratio','elapsed_days','observed_cycle_number']
OLD_FEATURES = ['observed_cycle_number','elapsed_days','charge_voltage_mean_v','charge_current_mean_a','charge_duration_approx_s']
SETTINGS = [('ridge',{'alpha':1.}),('ridge',{'alpha':10.}),
            ('random_forest',{'n_estimators':100,'max_depth':4,'min_samples_leaf':20})]

def assess(rows,predicted):
    result = training.scores([r[training.TARGET] for r in rows],[float(v) for v in predicted])
    errors = np.abs(np.asarray(predicted)-np.asarray([r[training.TARGET] for r in rows]))
    result.update(p95_absolute_error_pp=float(np.quantile(errors,.95)),max_absolute_error_pp=float(errors.max()),errors_over_10pp=int((errors>10).sum()))
    return result

def predict(model,features,rows):
    return model.predict(pd.DataFrame(rows)[features])

def choose(rows):
    cells = sorted({r['cell_id'] for r in rows})
    ranking = []
    for feature_set,features,name,parameters in [(label,features,name,params) for label,features in [('session',OLD_FEATURES),('window',FEATURES),('combined',OLD_FEATURES+FEATURES[:2]+['cc_start_voltage_v'])] for name,params in SETTINGS]:
        scores = []
        for held in cells:
            fit = [r for r in rows if r['cell_id']!=held]
            check = [r for r in rows if r['cell_id']==held]
            model = training.fit_model(name,parameters,features,fit)
            scores.append(assess(check,predict(model,features,check))['mae_pp'])
        ranking.append({'model':name,'parameters':parameters,'feature_set':feature_set,'features':features,'macro_cell_mae_pp':sum(scores)/len(scores)})
    return min(ranking,key=lambda r:r['macro_cell_mae_pp']),ranking

def main():
    for path in (OUT,DATA,MODELS):
        path.mkdir(parents=True,exist_ok=True)
    old = pd.read_csv(ROOT/'data/processed/life_prediction/soh_examples.csv')
    cells = pd.read_csv(ROOT/'data/processed/life_prediction/cells.csv')
    profiles,references = [],{}
    # Extraction is deterministic; reuse the saved measurements when explicitly requested.
    import sys
    if '--reuse-profiles' in sys.argv:
        profiles = pd.read_csv(DATA/'profiles.csv').to_dict('records')
        references = json.loads((OUT/'summary.json').read_text(encoding='utf-8'))['references']
        cells = cells.iloc[:0]
    raw_cols = ['observed_cycle_number','test_time_s','voltage_v','current_a','charge_counter_ah','step_index','row_valid']
    for cell in cells.itertuples():
        frame = pd.read_csv(ROOT/f'data/processed/life_prediction/measurements/{cell.cell_id}.csv.gz',usecols=raw_cols)
        groups = frame.groupby('observed_cycle_number',sort=False)
        by_cycle = {}
        for cycle,g in groups:
            records = g.loc[g.row_valid].to_dict('records')
            by_cycle[int(cycle)] = extract_charge_window(records)
        reference = by_cycle[int(cell.reference_observed_cycle)]
        references[cell.cell_id] = {'reference_observed_cycle':int(cell.reference_observed_cycle),**reference}
        for row in old.loc[old.cell_id==cell.cell_id].to_dict('records'):
            profile = by_cycle[int(row['observed_cycle_number'])]
            normalized = normalize_window(profile,reference)
            profiles.append({**row,**profile,**normalized})
        print(f'{cell.cell_id}: reference {reference["status"]}; charge-window profiles extracted',flush=True)
    all_rows = pd.DataFrame(profiles)
    all_rows.to_csv(DATA/'profiles.csv',index=False)
    accepted = all_rows.loc[all_rows.status=='ok'].copy()
    accepted.to_csv(DATA/'training_examples.csv',index=False)
    assert set(accepted.cell_id)==set(old.cell_id)
    assert np.isfinite(accepted[FEATURES+[training.TARGET]].to_numpy()).all()
    coverage = all_rows.groupby(['cell_id','status']).size().rename('n').reset_index()
    coverage.to_csv(OUT/'coverage.csv',index=False)
    results,folds,inner_scores = [],[],[]
    data = accepted.to_dict('records')
    cell_ids = sorted(accepted.cell_id.unique())
    for held in cell_ids:
        fit = [r for r in data if r['cell_id']!=held]
        check = [r for r in data if r['cell_id']==held]
        winner,ranking = choose(fit)
        inner_scores.extend({'outer_held_cell':held,**r} for r in ranking)
        assert held not in {r['cell_id'] for r in fit}
        model = training.fit_model(winner['model'],winner['parameters'],winner['features'],fit)
        new_pred = predict(model,winner['features'],check)
        old_fit = old.loc[old.cell_id!=held].to_dict('records')
        old_check = old.loc[old.cell_id==held].to_dict('records')
        previous = training.fit_model('ridge',{'alpha':10.},OLD_FEATURES,old_fit)
        old_all_pred = predict(previous,OLD_FEATURES,old_check)
        old_supported_pred = predict(previous,OLD_FEATURES,check)
        for recipe,rows,predicted in [('old_all_profiles',old_check,old_all_pred),
                                      ('old_same_supported_profiles',check,old_supported_pred),
                                      ('guarded_selected_model',check,new_pred),
                                      ('previous_soh_baseline',check,[r['previous_soh_reference_pct'] for r in check])]:
            score = assess(rows,predicted)
            folds.append({'held_out_cell':held,'recipe':recipe,'selected_model':winner['model'] if recipe=='guarded_selected_model' else '', 'selected_features':winner['feature_set'] if recipe=='guarded_selected_model' else '',**score})
            results.extend({'cell_id':r['cell_id'],'observed_cycle_number':int(r['observed_cycle_number']),
                            'recipe':recipe,'actual_soh_pct':r[training.TARGET],'predicted_soh_pct':float(p),
                            'error_pp':float(p)-r[training.TARGET]} for r,p in zip(rows,predicted))
        print(f'{held}: nested CV {winner["model"]} {winner["parameters"]}: {assess(check,new_pred)}',flush=True)
    pd.DataFrame(folds).to_csv(OUT/'by_battery.csv',index=False)
    pd.DataFrame(inner_scores).to_json(OUT/'inner_cv_settings.json',orient='records',indent=2)
    oof = pd.DataFrame(results)
    oof.to_csv(OUT/'out_of_fold_predictions.csv',index=False)
    metrics = []
    for recipe,g in oof.groupby('recipe'):
        actual_rows = [{training.TARGET:y} for y in g.actual_soh_pct]
        metric = assess(actual_rows,g.predicted_soh_pct)
        metric['macro_cell_mae_pp'] = float(pd.DataFrame(folds).loc[lambda d:d.recipe==recipe,'mae_pp'].mean())
        metrics.append({'recipe':recipe,**metric})
    pd.DataFrame(metrics).to_csv(OUT/'metrics.csv',index=False)
    best,ranking = choose(data)
    final = training.fit_model(best['model'],best['parameters'],best['features'],data)
    joblib.dump({'model':final,'features':best['features'],'target':training.TARGET,'model_name':best['model'],
                 'configuration':best['parameters'],'trained_cells':cell_ids,'evaluation':'Nested leave-one-battery-out on six previously inspected cells; no new independent holdout',
                 'requires_initial_charge_reference':best['feature_set']!='session','requires_voltage_window':[4.0,4.1],
                 'feature_bounds':{f:[float(accepted[f].min()),float(accepted[f].max())] for f in best['features']},
                 'reference_profiles':references,'sklearn_version':sklearn.__version__,
                 'dataset_sha256':hashlib.sha256((DATA/'training_examples.csv').read_bytes()).hexdigest()},MODELS/'soh_guarded.joblib')
    # Verify serialization without inventing an additional evaluation set.
    loaded = joblib.load(MODELS/'soh_guarded.joblib')
    assert np.allclose(predict(final,best['features'],data[:10]),predict(loaded['model'],loaded['features'],data[:10]))
    metadata = {'status':'complete','original_examples':len(all_rows),'supported_examples':len(accepted),
                'coverage_pct':100*len(accepted)/len(all_rows),'selected':best,'candidate_ranking':ranking,
                'evaluation_status':'Development cross-validation: all six cells were previously inspected, so this is not an untouched test.',
                'final_training':'All supported examples from all six current batteries',
                'guard':'Abstain if the current charge does not cover the measured 4.0-4.1 V CC window or has inadequate sampling. Initial charge reference required only for window features. Runtime also rejects features outside fitted training ranges.',
                'references':references,'features':best['features']}
    (OUT/'summary.json').write_text(json.dumps(metadata,indent=2,allow_nan=False),encoding='utf-8')
    print(pd.DataFrame(metrics).to_string(index=False),flush=True)
    print(f'Final all-data model saved; {metadata["coverage_pct"]:.1f}% profile coverage. Unsupported sessions require an explicit no-prediction result.',flush=True)

if __name__=='__main__':
    main()
