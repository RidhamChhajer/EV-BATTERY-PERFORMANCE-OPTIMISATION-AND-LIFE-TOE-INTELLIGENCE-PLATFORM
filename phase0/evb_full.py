import sys, glob, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evb_load, numpy as np, pandas as pd
from multiprocessing import Pool
def one(f):
    try:
        a,m=evb_load.load(f)[3]
        return (int(f.split('/')[-3][-1]),os.path.basename(f),m.get('car'),m.get('label'),m.get('mileage'),float(m.get('capacity') or 0),
                a[0,2],a[-1,2],a[:,0].mean(),a[:,1].mean(),(a[:,3]-a[:,4]).mean(),(a[:,3]-a[:,4]).max(),a[:,5].mean(),a[:,6].mean(),a[-1,7]-a[0,7])
    except Exception as e: return None
if __name__=='__main__':
    fs=[]
    for i in (1,2,3): fs+=glob.glob(f'data/evbattery/ex{i}/battery_dataset{i}/data/*.pkl')
    with Pool(11) as p: r=p.map(one,fs,chunksize=500)
    cols='ds file car label mileage capacity soc0 soc1 vmean imean dv_mean dv_max tmax tmin dur'.split()
    df=pd.DataFrame([x for x in r if x],columns=cols); df.to_parquet('phase0/evb_full.parquet'); print(len(fs),len(df))
