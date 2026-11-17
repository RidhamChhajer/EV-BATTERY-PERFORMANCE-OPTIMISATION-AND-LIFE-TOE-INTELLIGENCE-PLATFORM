import sys, os, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evb_load, numpy as np, pandas as pd
from multiprocessing import Pool
def one(args):
    ds,f=args
    try:
        a,m=evb_load.load(f'data/evbattery/ex{ds}/battery_dataset{ds}/data/{f}')[3]
        t=a[:,7]; dt=np.diff(t,prepend=t[0]); ah=-(a[:,1]*dt).sum()/3600
        return dict(ds=ds,file=f,car=m['car'],mileage=m['mileage'],cap=float(m['capacity']),ah=ah,dsoc=a[-1,2]-a[0,2],soc0=a[0,2],
          vmean=a[:,0].mean(),v0=a[0,0],v1=a[-1,0],imean=a[:,1].mean(),dvm=(a[:,3]-a[:,4]).mean(),dvx=(a[:,3]-a[:,4]).max(),tmean=a[:,5:7].mean(),tspan=(a[:,5]-a[:,6]).mean())
    except Exception: return None
if __name__=='__main__':
    df=pd.read_parquet('phase0/evb_full.parquet'); c=df[(df.capacity>0)&((df.soc1-df.soc0)>=5)]
    print('usable labelled segs with dSOC>=5:',len(c),'cars',c.car.nunique())
    random.seed(0); c=c.sample(min(60000,len(c)),random_state=0)
    with Pool(11) as p: r=p.map(one,list(zip(c.ds,c.file)),chunksize=200)
    pd.DataFrame([x for x in r if x]).to_parquet('phase0/evb_cap.parquet'); print('done')
