"""Past-only health trajectory inputs; prediction occurs after the latest health observation."""
import math
import numpy as np

FEATURES=['current_soh_pct','observed_cycle_number','elapsed_days','soh_slope_pp_per_cycle','recent_soh_std_pp','history_span_cycles','discharge_c_rate']
WINDOW=20

def threshold_crossed(history):
    count=0
    for row in history:
        count=count+1 if float(row['soh_reference_pct'])<=80 else 0
        if count>=3:return True
    return False

def history_features(history,discharge_c_rate):
    if not isinstance(history,list) or len(history)<5:
        raise ValueError('At least five chronological SOH observations are required.')
    try:
        cycles=np.array([float(r['observed_cycle_number']) for r in history])
        days=np.array([float(r['elapsed_days']) for r in history])
        health=np.array([float(r['soh_reference_pct']) for r in history])
        rate=float(discharge_c_rate)
    except (KeyError,TypeError,ValueError) as error:
        raise ValueError('History requires cycle, elapsed_days and soh_reference_pct.') from error
    if not np.isfinite(np.r_[cycles,days,health,rate]).all() or (cycles<1).any() or (cycles%1!=0).any() or (days<0).any() or (health<=0).any() or (health>120).any():
        raise ValueError('Invalid health history or operating age.')
    if (np.diff(cycles)<=0).any() or (np.diff(days)<0).any() or rate not in (.5,1.):
        raise ValueError('History must be chronological; supported discharge C-rates are 0.5 and 1.0.')
    x=cycles[-WINDOW:];y=health[-WINDOW:]
    slope=float(np.dot(x-x.mean(),y-y.mean())/np.dot(x-x.mean(),x-x.mean()))
    return {'current_soh_pct':float(y[-1]),'observed_cycle_number':float(cycles[-1]),'elapsed_days':float(days[-1]),
            'soh_slope_pp_per_cycle':slope,'recent_soh_std_pp':float(y.std()),'history_span_cycles':float(x[-1]-x[0]),
            'discharge_c_rate':rate}

def predict_rul(bundle,history,discharge_c_rate,protocol,health_source='measured'):
    if protocol!='CALCE_CS2':
        return {'status':'unsupported_protocol','remaining_observed_cycles':None}
    if health_source not in ('measured','predicted'):
        raise ValueError('health_source must be measured or predicted.')
    values=history_features(history,discharge_c_rate)
    if threshold_crossed(history):
        return {'status':'threshold_already_confirmed' if health_source=='measured' else 'estimated_threshold_crossing','remaining_observed_cycles':0.,'health_source':health_source}
    from predict_soh import in_bounds
    if not in_bounds(values,bundle['feature_bounds']):
        return {'status':'outside_training_range','remaining_observed_cycles':None,'health_source':health_source}
    import pandas as pd
    raw=float(bundle['model'].predict(pd.DataFrame([values])[FEATURES])[0])
    if not math.isfinite(raw):
        return {'status':'invalid_model_output','remaining_observed_cycles':None}
    return {'status':'ok','remaining_observed_cycles':max(0.,raw),'raw_prediction':raw,'nonnegative_floor_applied':raw<0,
            'unit':'recorded cycle groups to three-observation confirmation of 80% reference SOH',
            'health_source':health_source,'scope':'CALCE LCO development prototype; excludes EV years/km'}
