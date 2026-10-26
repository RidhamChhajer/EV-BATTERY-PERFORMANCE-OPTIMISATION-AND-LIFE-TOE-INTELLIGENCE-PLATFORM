"""Validated telemetry-to-SOC/energy inference and an explicitly configured range scenario."""
import math
import numpy as np
import pandas as pd
from dynamic_features import live_features,SOC_FEATURES,DRIVE_FEATURES
from predict_soh import in_bounds

def predict_soc(bundle,observations,protocol):
    if protocol!=bundle['protocol']:return {'status':'unsupported_protocol','soc_pct':None}
    values=live_features(observations)
    if values is None:return {'status':'insufficient_history','soc_pct':None,'required_history_s':30}
    if not in_bounds(values,bundle['feature_bounds']):return {'status':'outside_training_range','soc_pct':None}
    raw=float(bundle['model'].predict(pd.DataFrame([values])[SOC_FEATURES])[0])
    if not math.isfinite(raw):return {'status':'invalid_model_output','soc_pct':None}
    return {'status':'ok','soc_pct':float(np.clip(raw,0,100)),'raw_soc_pct':raw,'physical_bounds_applied':not 0<=raw<=100,
            'protocol':protocol,'reference':bundle['target_description'],'unit':'percentage points of the specified SOC reference'}

def coulomb_soc(observations,initial_soc_pct,capacity_ah):
    initial=float(initial_soc_pct);capacity=float(capacity_ah)
    if not math.isfinite(initial) or not 0<=initial<=100 or not math.isfinite(capacity) or capacity<=0:raise ValueError('Initial SOC and capacity must be finite and physically valid.')
    frame=pd.DataFrame(observations)
    from dynamic_features import sensor_features
    sensor_features(frame)
    times=frame.time_s.to_numpy(dtype=float);current=frame.current_a.to_numpy(dtype=float)
    charge=float(np.sum((current[:-1]+current[1:])*.5*np.diff(times)/3600))
    raw=initial+100*charge/capacity
    return {'soc_pct':float(np.clip(raw,0,100)),'raw_soc_pct':raw,'physical_bounds_applied':not 0<=raw<=100,
            'method':'Initialised coulomb counting; requires the supplied SOC to refer to the first observation and a valid capacity calibration'}

def range_scenario(consumption_wh_km,soc_pct,usable_capacity_kwh,soc_min_pct,soc_max_pct,reserve_usable_soc_pct=10):
    values=[float(x) for x in [consumption_wh_km,soc_pct,usable_capacity_kwh,soc_min_pct,soc_max_pct,reserve_usable_soc_pct]]
    if not all(math.isfinite(x) for x in values):raise ValueError('Range inputs must be finite.')
    consumption,soc,capacity,low,high,reserve=values
    if not 0<=soc<=100 or capacity<=0 or capacity>100 or not 0<=low<high<=100 or not 0<=reserve<100:
        raise ValueError('Invalid usable capacity, SOC limits or reserve.')
    if consumption<=0:return {'status':'nonpositive_consumption','estimated_range_km':None}
    usable_fraction=float(np.clip((soc-low)/(high-low),0,1))
    energy_kwh=capacity*max(0,usable_fraction-reserve/100)
    return {'status':'ok','estimated_range_km':energy_kwh*1000/consumption,'available_energy_above_reserve_kwh':energy_kwh,
            'usable_soc_pct':100*usable_fraction,'assumption':'Recent driving conditions and predicted per-km consumption continue; configured usable capacity and SOC window are correct.'}

def predict_driving(bundle,observations,protocol,range_inputs=None):
    if protocol!=bundle['protocol']:return {'status':'unsupported_protocol','predictions':None}
    values=live_features(observations,driving=True)
    if values is None:return {'status':'insufficient_history','predictions':None,'required_history_s':60}
    recent=[r for r in observations if float(r['time_s'])>=float(observations[-1]['time_s'])-60]
    if all(float(r['speed_kmh'])<1 for r in recent) and np.mean([float(r['current_a']) for r in recent])>10:
        return {'status':'stationary_charging_detected','predictions':None}
    result={}
    for name,model in bundle['models'].items():
        if not in_bounds(values,model['feature_bounds']):
            result[name]={'status':'outside_training_range','value':None};continue
        if model['strategy']=='persistence':
            raw=values['power_mean_60s_kw']*1000/60 if name=='next_60s' else values['recent_wh_per_km'] if values['low_speed_history']==0 else model['fallback']
        else:raw=float(model['model'].predict(pd.DataFrame([values])[DRIVE_FEATURES])[0])
        if not math.isfinite(raw):result[name]={'status':'invalid_model_output','value':None}
        else:result[name]={'status':'ok','value':raw,'unit':model['unit'],'method':model['strategy'],'regenerative_energy_retained':True}
    response={'status':'ok' if all(p['status']=='ok' for p in result.values()) else 'partial','predictions':result,
              'scope':'BMW i3 source-vehicle telemetry; positive energy = net consumption, negative energy = net recovery'}
    if range_inputs is not None:
        required=['soc_pct','usable_capacity_kwh','soc_min_pct','soc_max_pct']
        if not isinstance(range_inputs,dict) or not all(k in range_inputs for k in required):raise ValueError('range_inputs requires current SOC, usable capacity and operational SOC min/max.')
        consumption=result['next_km']
        response['range']=range_scenario(consumption['value'],*[range_inputs[k] for k in required],range_inputs.get('reserve_usable_soc_pct',10)) if consumption['status']=='ok' else {'status':'consumption_unavailable','estimated_range_km':None}
    return response
