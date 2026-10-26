"""Day-grouped real vehicle telemetry; preserve measured SOC and future energy labels."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path
import numpy as np
import pandas as pd
from dynamic_features import sensor_features,SOC_FEATURES,DRIVE_FEATURES
from prepare_data import save_csv

ROOT=Path(__file__).resolve().parents[1]
ARCHIVE=ROOT/'data/raw/driving_tum/battery_heating_vehicle.zip'
OUT=ROOT/'data/processed/vehicle_tum'
REPORT=ROOT/'reports/vehicle_data'

def trip_splits(overview):
    metadata=overview[['Trip','Date']].dropna().copy()
    metadata['recording_day']=metadata.Date.str.slice(0,10)
    assignments={}
    for season in ['A','B']:
        days=sorted(metadata.loc[metadata.Trip.str.startswith('Trip'+season),'recording_day'].unique(),key=lambda day:hashlib.sha256(('42:'+day).encode()).hexdigest())
        n_train=int(len(days)*.7);n_val=max(1,int(len(days)*.15))
        for i,day in enumerate(days):assignments[day]='train' if i<n_train else 'validation' if i<n_train+n_val else 'test'
    metadata['split']=metadata.recording_day.map(assignments)
    if metadata.split.isna().any():raise ValueError('Some trips lack an assigned recording day.')
    return metadata.rename(columns={'Trip':'trip_id'})[['trip_id','recording_day','split']]

def read_trip(content):
    import io
    raw=pd.read_csv(io.BytesIO(content),sep=';',encoding='latin1')
    mapping={'Time [s]':'time_s','Velocity [km/h]':'speed_kmh','Elevation [m]':'elevation_m','Battery Voltage [V]':'voltage_v',
             'Battery Current [A]':'current_a','SoC [%]':'soc_reference_pct','Heating Power CAN [kW]':'heating_power_kw'}
    for column in raw.columns:
        if column.startswith('Velocity [km/h]'):
            mapping.pop('Velocity [km/h]',None);mapping[column]='speed_kmh'
        if column.startswith('Battery Temperature ['):mapping[column]='temperature_c'
        if column.startswith('Ambient Temperature ['):mapping[column]='ambient_temperature_c'
    frame=raw.rename(columns=mapping)[list(mapping.values())].apply(pd.to_numeric,errors='coerce')
    if frame.time_s.isna().any() or (frame.time_s.diff().iloc[1:]<=0).any():raise ValueError('Raw trip timestamps must be finite and strictly increasing.')
    finite=np.isfinite(frame.to_numpy()).all(axis=1)
    physical=frame.voltage_v.between(200,450)&frame.soc_reference_pct.between(0,100)&frame.speed_kmh.between(0,200)&frame.temperature_c.between(-40,85)
    valid=finite&physical
    # Never integrate energy across invalid rows or recording gaps: split into contiguous segments.
    segment=((~valid)|(~valid.shift(fill_value=False))|(frame.time_s.diff().fillna(0)>1)).cumsum()
    frame['segment_id']=segment;frame['row_valid']=valid
    return frame,{'source_rows':len(frame),'invalid_rows':int((~valid).sum())}

def labelled_segment(frame):
    t=frame.time_s.to_numpy();v=frame.voltage_v.to_numpy();i=frame.current_a.to_numpy();speed=frame.speed_kmh.to_numpy()
    dt=np.diff(t)
    power=-v*i/1000
    energy=np.r_[0,np.cumsum((power[:-1]+power[1:])*.5*dt/3.6)] # Wh, retaining regenerative energy
    distance=np.r_[0,np.cumsum((speed[:-1]+speed[1:])*.5*dt/3600)]
    bins=np.floor(t).astype(int);positions=np.flatnonzero(~pd.Series(bins).duplicated().to_numpy())
    sampled=frame.iloc[positions].copy()
    features=sensor_features(sampled,driving=True)
    clock=t[positions]
    future60=np.where(clock+60<=t[-1],np.interp(clock+60,t,energy)-energy[positions],np.nan)
    # First passage of the next kilometre; no future speed/distance is a predictor.
    future_position=np.searchsorted(distance,distance[positions]+1,side='left')
    exists=future_position<len(distance)
    future_time=np.full(len(positions),np.nan);future_energy=np.full(len(positions),np.nan)
    for j in np.flatnonzero(exists):
        k=future_position[j];lo=k-1
        fraction=(distance[positions[j]]+1-distance[lo])/(distance[k]-distance[lo])
        future_time[j]=t[lo]+fraction*(t[k]-t[lo])
        future_energy[j]=energy[lo]+fraction*(energy[k]-energy[lo])-energy[positions[j]]
    observed_charging=(frame.speed_kmh<1)&(frame.current_a>10)
    # A future driving target is not defined across a stationary external-charge interval.
    charge_seconds=np.r_[0,np.cumsum(observed_charging.iloc[1:].to_numpy()*dt)]
    c60=np.interp(np.minimum(clock+60,t[-1]),t,charge_seconds)-charge_seconds[positions]
    ckm=np.interp(np.nan_to_num(future_time,nan=t[-1]),t,charge_seconds)-charge_seconds[positions]
    future60=np.where(c60>20,np.nan,future60)
    future_energy=np.where((future_time-clock>600)|(ckm>20),np.nan,future_energy)
    result=features[SOC_FEATURES+list(dict.fromkeys(DRIVE_FEATURES))+['time_s','history_supported']].copy()
    result=result.loc[:,~result.columns.duplicated()]
    result['soc_reference_pct']=sampled.soc_reference_pct.to_numpy()
    result['soc_history_supported']=clock-clock[0]>=30
    result['soc_history_supported']&=sampled.time_s.diff().fillna(0).rolling(31,min_periods=1).max().to_numpy()<=5
    result['target_next_60s_wh']=future60;result['target_next_km_wh_per_km']=future_energy
    result['current_distance_km']=distance[positions]
    result['past_energy_60s_wh']=energy[positions]-np.interp(np.maximum(clock-60,t[0]),t,energy)
    result['past_distance_60s_km']=distance[positions]-np.interp(np.maximum(clock-60,t[0]),t,distance)
    return result,sampled

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--include-test',action='store_true');args=parser.parse_args()
    if args.include_test and not all((ROOT/f'reports/{name}/selection.json').exists() for name in ['soc_vehicle','soc_tracking','driving']):
        raise ValueError('Freeze both SOC and driving selections before reading held-out vehicle trips.')
    OUT.mkdir(parents=True,exist_ok=True);REPORT.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(ARCHIVE) as archive:
        overview=pd.read_excel(archive.open('Overview.xlsx'))
        splits=trip_splits(overview)
        save_csv(splits,REPORT/'splits.csv')
        all_examples=[];audit=[]
        for row in splits.itertuples(index=False):
            if row.split=='test' and not args.include_test:continue
            name=row.trip_id+'.csv'
            frame,quality=read_trip(archive.read(name))
            pieces=[];observations=[]
            for segment,g in frame.loc[frame.row_valid].groupby('segment_id',sort=False):
                if g.time_s.iloc[-1]-g.time_s.iloc[0]<31:continue
                features,sampled=labelled_segment(g)
                features['segment_id']=int(segment);pieces.append(features)
                observations.append(sampled[['time_s','voltage_v','current_a','temperature_c','speed_kmh','ambient_temperature_c','heating_power_kw','elevation_m','soc_reference_pct']])
            if not pieces:raise ValueError(f'{name}: no usable sensor segments.')
            examples=pd.concat(pieces,ignore_index=True)
            examples['session_id']=row.trip_id;examples['group_id']=row.recording_day;examples['split']=row.split
            save_csv(examples,OUT/f'{row.trip_id}_features.csv')
            save_csv(pd.concat(observations,ignore_index=True),OUT/f'{row.trip_id}_observations.csv')
            all_examples.append(examples)
            audit.append({'trip_id':row.trip_id,'recording_day':row.recording_day,'split':row.split,**quality,
                          'one_second_observations':len(examples),'soc_eligible':int(examples.soc_history_supported.sum()),
                          'next_minute_eligible':int((examples.history_supported&examples.target_next_60s_wh.notna()).sum()),
                          'next_km_eligible':int((examples.history_supported&examples.target_next_km_wh_per_km.notna()).sum())})
            print(f'{row.trip_id} {row.split}: {len(examples):,} sensor observations',flush=True)
    save_csv(pd.concat(all_examples,ignore_index=True),OUT/'examples.csv')
    save_csv(pd.DataFrame(audit),REPORT/'trip_audit.csv')
    (REPORT/'manifest.json').write_text(json.dumps({'archive_sha256':hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),'test_opened':args.include_test,
        'time_resolution_s':1,'soc_label':'Recorded BMS SoC [%], excluding displayed/min/max SOC from predictors',
        'energy_label':'Trapezoidal integration of -voltage*current; positive = net consumption; regeneration retained',
        'splitting':'Whole recording days, stratified by summer/winter and deterministic SHA-256 seed 42; never individual rows',
        'forecast_horizons':['next 60 seconds net Wh','next 1 km net Wh/km, requiring the km to occur within ten minutes']},indent=2),encoding='utf-8')

if __name__=='__main__':main()
