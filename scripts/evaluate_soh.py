"""Select on development data, freeze selection, then evaluate the reserved battery."""
import csv
import hashlib
import json
import math

import joblib
import pandas as pd
import sklearn
import train_soh as training

ROOT = training.ROOT
OUT = ROOT/'reports/evaluation'
FINAL = ROOT/'models/final'

def predict(model,features,rows):
    if model is None:
        return [r['previous_soh_reference_pct'] for r in rows]
    return [float(x) for x in model.predict(pd.DataFrame(rows)[features])]

def metrics(rows,predictions):
    return training.scores([r[training.TARGET] for r in rows],predictions)

def main():
    if (OUT/'selection.json').exists():
        raise SystemExit('Selection is already frozen. Use the saved evaluation; do not retune against this test battery.')
    OUT.mkdir(parents=True,exist_ok=True)
    FINAL.mkdir(parents=True,exist_ok=True)
    contract = json.loads((ROOT/'reports/pretraining/feature_contract.json').read_text())
    variants = training.feature_sets(contract)
    config = training.read_configuration(ROOT/'config/soh_training.json')
    data_path = ROOT/'data/processed/life_prediction/soh_examples.csv'
    train,validation,_ = training.load_development_data(data_path,data_path.with_name('splits.csv'),variants)
    data_hash = hashlib.sha256(data_path.read_bytes()).hexdigest()
    cells = sorted({r['cell_id'] for r in train})
    settings = [('ridge',{'alpha':alpha}) for alpha in (.1,1.,10.)] + [
        ('random_forest',config['random_forest']),
        ('random_forest',{'n_estimators':100,'max_depth':3,'min_samples_leaf':50})]
    folds,ranking,dev_metrics,dev_predictions = [],[],[],[]
    selected = {}
    for variant,features in variants.items():
        candidates = []
        for name,parameters in settings:
            errors = []
            for held_cell in cells:
                fit_rows = [r for r in train if r['cell_id']!=held_cell]
                held_rows = [r for r in train if r['cell_id']==held_cell]
                assert held_cell not in {r['cell_id'] for r in fit_rows}
                model = training.fit_model(name,parameters,features,fit_rows,config['random_state'])
                score = metrics(held_rows,predict(model,features,held_rows))
                errors.append(score['mae_pp'])
                folds.append({'feature_variant':variant,'model':name,'parameters':json.dumps(parameters,sort_keys=True),'held_out_cell':held_cell,**score})
            candidate = {'model':name,'parameters':parameters,'cv_macro_mae_pp':sum(errors)/len(errors)}
            candidates.append(candidate)
            ranking.append({'feature_variant':variant,'model':name,'parameters':json.dumps(parameters,sort_keys=True),
                            'cv_macro_mae_pp':candidate['cv_macro_mae_pp']})
            print(f'{variant} {name} {parameters}: leave-one-battery-out MAE {candidate["cv_macro_mae_pp"]:.3f} pp',flush=True)
        # Hyperparameters use training-only grouped CV; family selection uses validation MAE.
        finalists = [min([c for c in candidates if c['model']==name],key=lambda c:c['cv_macro_mae_pp']) for name in ('ridge','random_forest')]
        if variant=='with_history':
            finalists.append({'model':'persistence','parameters':{},'cv_macro_mae_pp':sum(
                metrics([r for r in train if r['cell_id']==cell],
                        [r['previous_soh_reference_pct'] for r in train if r['cell_id']==cell])['mae_pp'] for cell in cells)/len(cells)})
        fitted = []
        for finalist in finalists:
            model = None if finalist['model']=='persistence' else training.fit_model(finalist['model'],finalist['parameters'],features,train,config['random_state'])
            for split,rows in [('train',train),('validation',validation)]:
                predictions = predict(model,features,rows)
                score = metrics(rows,predictions)
                dev_metrics.append({'feature_variant':variant,'model':finalist['model'],'split':split,
                                    'parameters':json.dumps(finalist['parameters'],sort_keys=True),**score})
                dev_predictions.extend({'feature_variant':variant,'model':finalist['model'],'split':split,'cell_id':r['cell_id'],
                                        'observed_cycle_number':int(r['observed_cycle_number']),'actual_soh_pct':r[training.TARGET],
                                        'predicted_soh_pct':p,'error_pp':p-r[training.TARGET]} for r,p in zip(rows,predictions))
                if split=='validation':
                    finalist = {**finalist,'validation_metrics':score}
            fitted.append((finalist,model))
        winner,model = min(fitted,key=lambda pair:(pair[0]['validation_metrics']['mae_pp'],pair[0]['cv_macro_mae_pp']))
        selected[variant] = {'selection':winner,'model':model,'features':features}
    training.save_csv(folds,OUT/'grouped_cv_folds.csv')
    training.save_csv(ranking,OUT/'grouped_cv_ranking.csv')
    training.save_csv(dev_metrics,OUT/'development_metrics.csv')
    training.save_csv(dev_predictions,OUT/'development_predictions.csv')
    lock = {'selection_policy':'Hyperparameters: mean held-out-battery MAE in four training-only folds. Model family: validation MAE. No refitting on validation.',
            'dataset_sha256':data_hash,'training_cells':cells,'validation_cell':'CS2_34','test_cell':'CS2_38',
            'random_state':config['random_state'],'sklearn_version':sklearn.__version__,'selected':{}}
    for variant,result in selected.items():
        winner = result['selection']
        if result['model'] is None:
            filename = 'with_history_rule.json'
            (FINAL/filename).write_text(json.dumps({'model_name':'persistence','features':['previous_soh_reference_pct'],
                                                   'rule':'Return the previous measured reference SOH unchanged','target':training.TARGET},indent=2))
        else:
            filename = f'soh_{variant}.joblib'
            joblib.dump({'model':result['model'],'features':result['features'],'target':training.TARGET,
                         'model_name':winner['model'],'feature_variant':variant,'configuration':winner['parameters'],
                         'dataset_sha256':data_hash,'sklearn_version':sklearn.__version__,
                         'prediction_time':contract['prediction_time']},FINAL/filename)
        lock['selected'][variant] = {**winner,'features':result['features'] if result['model'] is not None else ['previous_soh_reference_pct'],
                                     'artifact':str((FINAL/filename).relative_to(ROOT))}
    # This file is the irreversible selection boundary: no test outcome has been read yet.
    (OUT/'selection.json').write_text(json.dumps(lock,indent=2,allow_nan=False),encoding='utf-8')
    print('Selections frozen. Opening reserved test outcomes for final evaluation...',flush=True)
    with data_path.open(newline='',encoding='utf-8') as handle:
        test = []
        required = set().union(*variants.values()) | {training.TARGET}
        for row in csv.DictReader(handle):
            if row['split']=='test':
                assert row['cell_id']=='CS2_38'
                parsed = {key:float(row[key]) for key in required}
                assert all(math.isfinite(v) for v in parsed.values())
                parsed.update(cell_id=row['cell_id'])
                test.append(parsed)
    assert test
    test_metrics,test_predictions,health_metrics = [],[],[]
    for variant,result in selected.items():
        predictions = predict(result['model'],result['features'],test)
        score = metrics(test,predictions)
        test_metrics.append({'feature_variant':variant,'model':result['selection']['model'],**score})
        test_predictions.extend({'feature_variant':variant,'model':result['selection']['model'],'cell_id':r['cell_id'],
                                 'observed_cycle_number':int(r['observed_cycle_number']),'actual_soh_pct':r[training.TARGET],
                                 'predicted_soh_pct':p,'error_pp':p-r[training.TARGET]} for r,p in zip(test,predictions))
        for label,low,high in training.HEALTH_RANGES:
            indices = [i for i,r in enumerate(test) if low<=r[training.TARGET]<high]
            health_metrics.append({'feature_variant':variant,'model':result['selection']['model'],'health_range':label,
                                   **training.scores([test[i][training.TARGET] for i in indices],[predictions[i] for i in indices])})
        print(f'Final test {variant}/{result["selection"]["model"]}: MAE {score["mae_pp"]:.3f} pp; RMSE {score["rmse_pp"]:.3f} pp',flush=True)
    training.save_csv(test_metrics,OUT/'test_metrics.csv')
    training.save_csv(test_predictions,OUT/'test_predictions.csv')
    training.save_csv(health_metrics,OUT/'test_health_ranges.csv')
    errors = sorted(test_predictions,key=lambda r:abs(r['error_pp']),reverse=True)[:30]
    training.save_csv(errors,OUT/'largest_test_errors.csv')
    validation_errors = sorted([r for r in dev_predictions if r['split']=='validation'],key=lambda r:abs(r['error_pp']),reverse=True)[:30]
    training.save_csv(validation_errors,OUT/'largest_validation_errors.csv')
    (OUT/'evaluation_complete.json').write_text(json.dumps({'status':'complete','test_evaluated':True,
                                                         'selection_changed_after_test':False,'test_examples':len(test)},indent=2))

if __name__=='__main__':
    main()
