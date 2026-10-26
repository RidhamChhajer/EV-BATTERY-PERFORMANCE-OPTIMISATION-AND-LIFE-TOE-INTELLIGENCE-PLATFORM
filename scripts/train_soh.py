"""Train SOH candidates on training cells; compare validation without opening test outcomes."""
import csv
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = 'target_soh_reference_pct'
APPROVED_FEATURES = {'observed_cycle_number', 'elapsed_days', 'previous_soh_reference_pct',
                     'previous_capacity_age_observed_cycles', 'charge_voltage_mean_v',
                     'charge_current_mean_a', 'charge_duration_approx_s'}
HISTORY_FEATURES = {'previous_soh_reference_pct', 'previous_capacity_age_observed_cycles'}
HEALTH_RANGES = [('<20', -math.inf, 20), ('20-40', 20, 40), ('40-60', 40, 60),
                 ('60-80', 60, 80), ('80-100', 80, 100), ('>=100', 100, math.inf)]

def read_configuration(path):
    config = json.loads(Path(path).read_text(encoding='utf-8'))
    if set(config) != {'random_state', 'ridge', 'random_forest'}:
        raise ValueError('Configuration must contain random_state, ridge, and random_forest only.')
    if set(config['ridge']) != {'alpha'} or set(config['random_forest']) != {'n_estimators','max_depth','min_samples_leaf'}:
        raise ValueError('Unexpected or missing model configuration keys.')
    alpha = config['ridge']['alpha']
    if isinstance(alpha, bool) or not isinstance(alpha, (int,float)) or not math.isfinite(alpha) or alpha <= 0:
        raise ValueError('ridge.alpha must be a finite positive number.')
    seed = config['random_state']
    if type(seed) is not int or not 0 <= seed < 2**32:
        raise ValueError('random_state must be an integer from 0 through 2**32-1.')
    for key,value in config['random_forest'].items():
        if type(value) is not int or value < 1:
            raise ValueError(f'random_forest.{key} must be a positive integer.')
    return config

def feature_sets(contract):
    variants = {'with_history':contract['primary_features'],
                'without_history':contract['without_historical_capacity_features']}
    for name,features in variants.items():
        if not isinstance(features,list) or not features or len(features) != len(set(features)):
            raise ValueError(f'Invalid feature list: {name}')
        if not set(features).issubset(APPROVED_FEATURES):
            raise ValueError(f'Unapproved predictors in {name}; target/identity/future information is forbidden.')
    if not HISTORY_FEATURES.issubset(variants['with_history']):
        raise ValueError('The historical model needs previous health and measurement age.')
    if set(variants['without_history']) != set(variants['with_history'])-HISTORY_FEATURES:
        raise ValueError('The no-history model must omit both historical-capacity inputs.')
    if contract['target'] != TARGET:
        raise ValueError('This script predicts reference SOH only.')
    return variants

def load_development_data(data_path, splits_path, variants):
    with Path(splits_path).open(newline='',encoding='utf-8') as handle:
        records = list(csv.DictReader(handle))
    registry = {r['cell_id']:r['split'] for r in records}
    if len(registry) != len(records) or Counter(registry.values()) != Counter({'train':4,'validation':1,'test':1}):
        raise ValueError('Expected the locked four-training/one-validation/one-test battery split.')
    if registry.get('CS2_38') != 'test':
        raise ValueError('CS2_38 must remain reserved for final test evaluation.')
    numeric = set().union(*variants.values()) | {TARGET, 'previous_soh_reference_pct', 'observed_cycle_number'}
    train,validation,seen = [],[],set()
    skipped = 0
    with Path(data_path).open(newline='',encoding='utf-8') as handle:
        reader = csv.DictReader(handle)
        if not (numeric | {'cell_id','split'}).issubset(reader.fieldnames or []):
            raise ValueError('The prepared SOH dataset lacks required columns; run preparation first.')
        for line,row in enumerate(reader,start=2):
            cell,split = row['cell_id'],row['split']
            if registry.get(cell) != split:
                raise ValueError(f'Battery split mismatch at CSV row {line}: {cell}')
            if split == 'test':
                skipped += 1
                continue  # Do not even parse test targets or numerical features.
            values = {col:float(row[col]) for col in numeric}
            if not all(math.isfinite(x) for x in values.values()):
                raise ValueError(f'Missing/nonfinite input at CSV row {line}; no automatic imputation.')
            if values[TARGET] <= 0 or values['observed_cycle_number'] < 1 or values['observed_cycle_number'] % 1:
                raise ValueError(f'Invalid target or recorded cycle index at CSV row {line}.')
            key = (cell,values['observed_cycle_number'])
            if key in seen:
                raise ValueError(f'Duplicate SOH example: {key}')
            seen.add(key)
            values.update(cell_id=cell,split=split)
            (train if split=='train' else validation).append(values)
    if {r['cell_id'] for r in train} != {c for c,s in registry.items() if s=='train'}:
        raise ValueError('Some training batteries have no usable examples.')
    if {r['cell_id'] for r in validation} != {c for c,s in registry.items() if s=='validation'}:
        raise ValueError('The validation battery has no usable examples.')
    return train,validation,skipped

def cell_weights(rows):
    counts = Counter(row['cell_id'] for row in rows)
    if not counts:
        raise ValueError('Cannot weight an empty training dataset.')
    return [len(rows)/(len(counts)*counts[row['cell_id']]) for row in rows]

def scores(actual,predicted):
    if len(actual) != len(predicted):
        raise ValueError('Prediction count does not match the target count.')
    if not actual:
        return {'n':0,'mae_pp':None,'rmse_pp':None,'bias_pp':None,'r2':None}
    if not all(math.isfinite(float(x)) for x in list(actual)+list(predicted)):
        raise ValueError('Nonfinite target or model prediction.')
    errors = [p-y for y,p in zip(actual,predicted)]
    n = len(actual)
    mean = sum(actual)/n
    total_variance = sum((y-mean)**2 for y in actual)
    squared_error = sum(e*e for e in errors)
    return {'n':n,'mae_pp':sum(abs(e) for e in errors)/n,'rmse_pp':math.sqrt(squared_error/n),
            'bias_pp':sum(errors)/n,'r2':1-squared_error/total_variance if total_variance>0 else None}

def save_csv(rows,path):
    temporary = path.with_name(path.name+'.partial')
    with temporary.open('w',newline='',encoding='utf-8') as handle:
        writer = csv.DictWriter(handle,fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    temporary.replace(path)

def fit_model(name,parameters,features,rows,random_state=42):
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    frame = pd.DataFrame(rows)
    weights = np.asarray(cell_weights(rows))
    if name=='ridge':
        model = Pipeline([('scale',StandardScaler()),('regressor',Ridge(**parameters))])
        model.fit(frame[features],frame[TARGET],scale__sample_weight=weights,regressor__sample_weight=weights)
    elif name=='random_forest':
        model = RandomForestRegressor(random_state=random_state,**{'n_jobs':-1,**parameters})
        model.fit(frame[features],frame[TARGET],sample_weight=weights)
    else:
        raise ValueError(f'Unsupported model: {name}')
    return model

def main():
    config = read_configuration(ROOT/'config/soh_training.json')
    contract_path = ROOT/'reports/pretraining/feature_contract.json'
    contract = json.loads(contract_path.read_text(encoding='utf-8'))
    variants = feature_sets(contract)
    data_path = ROOT/'data/processed/life_prediction/soh_examples.csv'
    train,validation,skipped = load_development_data(data_path, data_path.with_name('splits.csv'),variants)
    try:
        import numpy as np
        import pandas as pd
        import sklearn
        import joblib
    except ImportError as error:
        raise SystemExit('Install requirements.txt in the documented Python 3.10 environment first.') from error
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')
    model_folder = ROOT/'models/training_runs'/run_id
    report_folder = ROOT/'reports/training'/run_id
    model_folder.mkdir(parents=True,exist_ok=False)
    report_folder.mkdir(parents=True,exist_ok=False)
    train_frame,validation_frame = pd.DataFrame(train),pd.DataFrame(validation)
    datasets = {'train':train_frame,'validation':validation_frame}
    aggregate,by_cell,by_health,predictions,artifacts = [],[],[],[],[]

    def record(model_name,variant,split,frame,predicted):
        actual = frame[TARGET].tolist()
        predicted = [float(p) for p in predicted]
        result = scores(actual,predicted)
        groups = defaultdict(list)
        for i,row in enumerate(frame.to_dict('records')):
            groups[row['cell_id']].append(i)
            predictions.append({'model':model_name,'feature_variant':variant,'split':split,'cell_id':row['cell_id'],
                                'observed_cycle_number':int(row['observed_cycle_number']),
                                'actual_soh_pct':actual[i],'predicted_soh_pct':predicted[i],
                                'error_pp':predicted[i]-actual[i]})
        cell_mae = []
        for cell,indices in groups.items():
            metric = scores([actual[i] for i in indices],[predicted[i] for i in indices])
            cell_mae.append(metric['mae_pp'])
            by_cell.append({'model':model_name,'feature_variant':variant,'split':split,'cell_id':cell,**metric})
        aggregate.append({'model':model_name,'feature_variant':variant,'split':split,
                          'cells':len(groups),'macro_cell_mae_pp':sum(cell_mae)/len(cell_mae),**result})
        for name,low,high in HEALTH_RANGES:
            indices = [i for i,y in enumerate(actual) if low<=y<high]
            metric = scores([actual[i] for i in indices],[predicted[i] for i in indices])
            by_health.append({'model':model_name,'feature_variant':variant,'split':split,'health_range':name,**metric})
        print(f'{model_name}/{variant} {split}: MAE {result["mae_pp"]:.3f} pp; RMSE {result["rmse_pp"]:.3f} pp',flush=True)

    for split,frame in datasets.items():
        record('persistence','with_history',split,frame,frame.previous_soh_reference_pct.tolist())
    data_hash = hashlib.sha256(data_path.read_bytes()).hexdigest()
    for variant,features in variants.items():
        for name in ('ridge','random_forest'):
            print(f'Training {name}/{variant} on {len(train):,} rows from four batteries...',flush=True)
            model = fit_model(name,config[name],features,train,config['random_state'])
            for split,frame in datasets.items():
                record(name,variant,split,frame,model.predict(frame[features]))
            artifact = model_folder/f'{name}_{variant}.joblib'
            bundle = {'model':model,'features':features,'target':TARGET,'model_name':name,'feature_variant':variant,
                      'requires_previous_capacity':variant=='with_history','configuration':config,
                      'dataset_sha256':data_hash,'sklearn_version':sklearn.__version__,
                      'prediction_time':contract['prediction_time'],'run_id':run_id}
            temporary = artifact.with_suffix('.joblib.partial')
            joblib.dump(bundle,temporary)
            temporary.replace(artifact)
            artifacts.append(str(artifact.relative_to(ROOT)))
    save_csv(aggregate,report_folder/'metrics.csv')
    save_csv(by_cell,report_folder/'by_cell.csv')
    save_csv(by_health,report_folder/'by_health_range.csv')
    save_csv(predictions,report_folder/'predictions.csv')
    (report_folder/'configuration.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
    (report_folder/'feature_contract.json').write_text(json.dumps(contract,indent=2),encoding='utf-8')
    metadata = {'status':'complete','run_id':run_id,'dataset_sha256':data_hash,
                'training_cells':sorted({r['cell_id'] for r in train}),
                'validation_cells':sorted({r['cell_id'] for r in validation}),
                'test_rows_skipped_without_parsing':skipped,'test_evaluated':False,
                'training_cell_weights':'Each cell has equal total weight; mean sample weight is one',
                'versions':{'python':sys.version,'numpy':np.__version__,'pandas':pd.__version__,
                            'scikit-learn':sklearn.__version__,'joblib':joblib.__version__},'models':artifacts}
    lines = ['# SOH training candidates','', 'Training and validation results only. No final model has been selected and the test battery has not been evaluated.','',
             '| Model | Inputs | Split | MAE (pp) | RMSE (pp) | Equal-cell MAE (pp) |','|---|---|---|---:|---:|---:|']
    for r in aggregate:
        lines.append(f'| {r["model"]} | {r["feature_variant"]} | {r["split"]} | {r["mae_pp"]:.3f} | {r["rmse_pp"]:.3f} | {r["macro_cell_mae_pp"]:.3f} |')
    lines += ['', 'Inputs with history require a previous measured capacity/health value. The no-history models use recorded age and charging-session measurements. Compare models within the input scenario you can supply.',
              '', 'Inspect by_cell.csv and by_health_range.csv: validation contains one battery and no accepted SOH below 40%. Empty health strata have n=0 and blank metrics, not zero error.',
              '', 'Step 5 will review baseline performance, training/validation differences and any tuning before final model selection and reserved-test evaluation.']
    (report_folder/'summary.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    (report_folder/'run.json').write_text(json.dumps(metadata,indent=2,allow_nan=False),encoding='utf-8')
    print(f'Complete. Candidates: {model_folder}\nResults: {report_folder}\nReview summary.md in step 5; no final model or test results were produced.',flush=True)

if __name__=='__main__':
    main()
