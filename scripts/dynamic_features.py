"""Causal sensor features shared by training and live SOC/driving inference."""
import numpy as np
import pandas as pd

SOC_FEATURES=['voltage_v','current_a','temperature_c','voltage_mean_5s','voltage_mean_30s','current_mean_5s','current_mean_30s','current_std_30s','voltage_change_30s']
DRIVE_FEATURES=['speed_kmh','speed_mean_30s','speed_std_30s','speed_mean_60s','stopped_fraction_60s','acceleration_mean_30s',
                'power_mean_30s_kw','power_mean_60s_kw','power_std_60s_kw','temperature_c','ambient_temperature_c','heating_power_kw','elevation_change_60s',
                'recent_wh_per_km','low_speed_history']

def sensor_features(frame,driving=False):
    required=['time_s','voltage_v','current_a','temperature_c']
    if driving:required+=['speed_kmh','ambient_temperature_c','heating_power_kw','elevation_m']
    if not set(required).issubset(frame.columns):raise ValueError(f'Missing sensor columns: {set(required)-set(frame.columns)}')
    values=frame[required].astype(float)
    if values.empty or not np.isfinite(values.to_numpy()).all():raise ValueError('Sensor values must be finite.')
    if (values.time_s<0).any() or (values.time_s.diff().iloc[1:]<=0).any():raise ValueError('Sensor times must be nonnegative and strictly increasing.')
    if (values.voltage_v<=0).any() or (values.temperature_c.between(-40,85)==False).any():raise ValueError('Invalid voltage or temperature.')
    if driving and ((values.speed_kmh<0).any() or (values.speed_kmh>200).any()):raise ValueError('Speed must be within 0–200 km/h.')
    index=pd.to_timedelta(values.time_s.to_numpy(),unit='s')
    result=values.copy();result.index=index
    v=result.voltage_v;i=result.current_a;t=result.time_s
    for window in [5,30]:
        result[f'voltage_mean_{window}s']=v.rolling(f'{window}s').mean()
        result[f'current_mean_{window}s']=i.rolling(f'{window}s').mean()
    result['current_std_30s']=i.rolling('30s').std(ddof=0)
    # Backward as-of lookup uses no future samples, including on uneven time grids.
    positions=np.searchsorted(t.to_numpy(),t.to_numpy()-30,side='right')-1
    result['voltage_change_30s']=v.to_numpy()-v.to_numpy()[np.maximum(positions,0)]
    gap=t.diff().fillna(0)
    result['history_supported']=(t-t.iloc[0]>=30)&(gap.rolling('30s').max()<=5)
    if driving:
        speed=result.speed_kmh;power=-v*i/1000
        for window in [30,60]:
            result[f'speed_mean_{window}s']=speed.rolling(f'{window}s').mean()
            result[f'power_mean_{window}s_kw']=power.rolling(f'{window}s').mean()
        result['speed_std_30s']=speed.rolling('30s').std(ddof=0)
        result['power_std_60s_kw']=power.rolling('60s').std(ddof=0)
        result['stopped_fraction_60s']=(speed<1).astype(float).rolling('60s').mean()
        acceleration=speed.diff().div(gap.replace(0,np.nan)).fillna(0)/3.6
        result['acceleration_mean_30s']=acceleration.rolling('30s').mean()
        positions=np.searchsorted(t.to_numpy(),t.to_numpy()-60,side='right')-1
        altitude=result.elevation_m.to_numpy()
        result['elevation_change_60s']=altitude-altitude[np.maximum(positions,0)]
        result['low_speed_history']=(result.speed_mean_60s<3).astype(float)
        result['recent_wh_per_km']=np.where(result.speed_mean_60s>=3,result.power_mean_60s_kw*1000/result.speed_mean_60s.clip(lower=3),0)
        result['history_supported']=(t-t.iloc[0]>=60)&(gap.rolling('60s').max()<=5)
    result.index=frame.index
    return result

def live_features(records,driving=False):
    if not isinstance(records,list) or not records or len(records)>20000 or not all(isinstance(r,dict) for r in records):
        raise ValueError('observations must be a nonempty list of at most 20,000 records.')
    frame=pd.DataFrame(records)
    features=sensor_features(frame,driving)
    if not bool(features.history_supported.iloc[-1]):return None
    columns=DRIVE_FEATURES if driving else SOC_FEATURES
    return {f:float(features[f].iloc[-1]) for f in columns}
