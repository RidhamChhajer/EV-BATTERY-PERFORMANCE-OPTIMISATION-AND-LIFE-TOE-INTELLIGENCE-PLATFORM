"""Calibrated SOC tracking requires a known SOC at the first supplied observation."""
import math
import numpy as np
import pandas as pd
from dynamic_features import sensor_features

def tracking_features(observations,initial_soc_pct):
    frame=pd.DataFrame(observations);sensor_features(frame)
    initial=float(initial_soc_pct)
    if not math.isfinite(initial) or not 0<=initial<=100:raise ValueError('Initial SOC must be a known finite value from 0 to 100.')
    t=frame.time_s.to_numpy(dtype=float);i=frame.current_a.to_numpy(dtype=float)
    if (np.diff(t)>5).any():raise ValueError('SOC tracking cannot integrate across recording gaps above five seconds.')
    q=np.r_[0,np.cumsum((i[:-1]+i[1:])*.5*np.diff(t)/3600)]
    temperature=float(frame.temperature_c.iloc[0])
    return pd.DataFrame({'net_charge_ah':q,'charge_temperature_interaction':q*(temperature-20)/20,'charge_initial_soc_interaction':q*(initial-50)/50}),temperature

def predict_tracking(bundle,observations,initial_soc_pct,protocol):
    if protocol!='TUM_BMW_I3':return {'status':'unsupported_protocol','soc_pct':None}
    features,temperature=tracking_features(observations,initial_soc_pct)
    if any(not 200<=float(r['voltage_v'])<=450 for r in observations):
        return {'status':'outside_training_range','soc_pct':None}
    low,high=bundle['initial_temperature_bounds']
    if not low<=temperature<=high:return {'status':'outside_training_range','soc_pct':None}
    increment=float(bundle['model'].predict(features[bundle['features']].tail(1))[0])
    raw=float(initial_soc_pct)+increment
    return {'status':'ok','soc_pct':float(np.clip(raw,0,100)),'raw_soc_pct':raw,'physical_bounds_applied':not 0<=raw<=100,
            'method':'calibrated_coulomb_tracking','reference':'Vehicle-reported BMS SOC; assumes a correct SOC seed at the first observation',
            'initial_soc_pct':float(initial_soc_pct),'protocol':protocol}
