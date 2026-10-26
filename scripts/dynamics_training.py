"""Train-only preprocessing and grouped selection for telemetry regressions."""
import json
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor,RandomForestRegressor,ExtraTreesRegressor

CANDIDATES=[{'family':'ridge','parameters':{'alpha':10.}},
            {'family':'hist_gradient_boosting','parameters':{'max_iter':250,'max_leaf_nodes':15,'min_samples_leaf':30,'learning_rate':.05,'l2_regularization':1.}},
            {'family':'hist_gradient_boosting','parameters':{'max_iter':350,'max_leaf_nodes':31,'min_samples_leaf':30,'learning_rate':.05,'l2_regularization':5.}},
            {'family':'random_forest','parameters':{'n_estimators':150,'max_depth':14,'min_samples_leaf':10}},
            {'family':'extra_trees','parameters':{'n_estimators':150,'max_depth':18,'min_samples_leaf':10}}]

def balanced_weights(frame):
    counts=frame.session_id.value_counts()
    return len(frame)/(len(counts)*frame.session_id.map(counts).to_numpy())

def fit_candidate(candidate,features,frame,target):
    weights=balanced_weights(frame);params=candidate['parameters'];name=candidate['family']
    if name=='ridge':
        model=Pipeline([('scale',StandardScaler()),('regressor',Ridge(**params))])
        model.fit(frame[features],frame[target],scale__sample_weight=weights,regressor__sample_weight=weights)
        return model
    if name=='hist_gradient_boosting':model=HistGradientBoostingRegressor(**params,random_state=42,early_stopping=False)
    elif name=='random_forest':model=RandomForestRegressor(**params,random_state=42,n_jobs=1)
    elif name=='extra_trees':model=ExtraTreesRegressor(**params,random_state=42,n_jobs=1)
    else:raise ValueError(f'Unknown estimator family: {name}')
    model.fit(frame[features],frame[target],sample_weight=weights)
    return model

def metrics(frame,target,predicted):
    errors=np.asarray(predicted,dtype=float)-frame[target].to_numpy()
    if not len(errors) or not np.isfinite(errors).all():raise ValueError('Empty or nonfinite regression outcomes.')
    groups=pd.DataFrame({'session':frame.session_id.to_numpy(),'absolute_error':np.abs(errors)}).groupby('session').absolute_error.mean()
    return {'n':len(frame),'sessions':int(frame.session_id.nunique()),'mae':float(np.abs(errors).mean()),'macro_session_mae':float(groups.mean()),
            'rmse':float(np.sqrt(np.mean(errors**2))),'bias':float(errors.mean()),'p95_absolute_error':float(np.quantile(np.abs(errors),.95)),'max_absolute_error':float(np.abs(errors).max())}

def select(train,validation,features,target,out,bounded_soc=False):
    path=out/'selection.json'
    if path.exists():
        saved=json.loads(path.read_text())
        if saved['features']!=features or saved['target']!=target:raise ValueError('Frozen feature/target contract changed; do not silently reuse test data.')
        return saved['selected'],saved['ranking']
    groups=sorted(train.group_id.unique())
    fold_count=min(3,len(groups))
    if fold_count<2:raise ValueError('At least two independent training groups are required for CV.')
    group_to_fold={group:i%fold_count for i,group in enumerate(groups)}
    ranking=[]
    for candidate in CANDIDATES:
        cv=[]
        for fold in range(fold_count):
            fit=train.loc[train.group_id.map(group_to_fold)!=fold];check=train.loc[train.group_id.map(group_to_fold)==fold]
            assert not set(fit.group_id)&set(check.group_id)
            model=fit_candidate(candidate,features,fit,target)
            p=model.predict(check[features]);p=np.clip(p,0,100) if bounded_soc else p
            cv.append(metrics(check,target,p)['macro_session_mae'])
        model=fit_candidate(candidate,features,train,target)
        p=model.predict(validation[features]);p=np.clip(p,0,100) if bounded_soc else p
        score=metrics(validation,target,p)
        ranking.append({**candidate,'training_group_cv_macro_mae':float(np.mean(cv)),'validation':score})
        print(f'{target} {candidate["family"]}: grouped CV {np.mean(cv):.3f}; validation macro MAE {score["macro_session_mae"]:.3f}',flush=True)
    selected=min(ranking,key=lambda r:r['validation']['macro_session_mae'])
    lock={'selected':{'family':selected['family'],'parameters':selected['parameters']},'ranking':ranking,'features':features,'target':target,
          'selection_rule':'Minimum validation macro-session MAE; training-only grouped CV reported alongside; no test outcomes used',
          'training_groups':sorted(train.group_id.unique()),'validation_groups':sorted(validation.group_id.unique())}
    path.write_text(json.dumps(lock,indent=2,allow_nan=False),encoding='utf-8')
    return lock['selected'],ranking

def feature_bounds(frame,features):return {f:[float(frame[f].min()),float(frame[f].max())] for f in features}

def eligible(frame,features,target,warmup,stride=1):
    valid=frame[warmup]&frame[target].notna()&np.isfinite(frame[features].to_numpy()).all(axis=1)
    if target in ('target_soc_pct','soc_reference_pct'):valid&=frame[target].between(0,100)
    indices=frame.groupby('session_id').cumcount()
    return frame.loc[valid&(indices%stride==0)].copy()
