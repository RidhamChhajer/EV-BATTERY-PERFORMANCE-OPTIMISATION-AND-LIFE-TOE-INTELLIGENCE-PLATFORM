import sys, glob, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hust_load, numpy as np, pandas as pd
from multiprocessing import Pool
GRID=np.linspace(3.3,2.0,60)
def qv(df):
    # discharge capacity vs voltage over all discharge steps, mAh, monotone-ised
    x=df[df.Status.str.contains('discharge')]
    if len(x)<10: return None
    v=x['Voltage (V)'].values; q=np.cumsum(np.abs(np.diff(x['Capacity (mAh)'].values,prepend=x['Capacity (mAh)'].values[0])))
    idx=np.argsort(-v); v,q=v[idx],q[idx]
    return np.interp(GRID,v[::-1],q[::-1])
def one(p):
    try:
        k=os.path.basename(p)[:-4]; d=hust_load.load(p)[k]
        dq=pd.Series(d['dq']).sort_index(); n=len(dq)
        r=dict(cell=k,life=n,q1=dq.iloc[0],q10=dq.iloc[9],q100=dq.iloc[min(99,n-1)],
               dq100_10=dq.iloc[99]-dq.iloc[9],slope=np.polyfit(np.arange(10,100),dq.iloc[9:99].values,1)[0],
               eol_ratio=dq.iloc[-1]/dq.iloc[0],q_min_100=dq.iloc[:100].min())
        a,b=qv(d['data'][10]),qv(d['data'][100])
        if a is not None and b is not None:
            dd=b-a; r.update(dQ_var=np.log10(np.var(dd)+1e-9),dQ_min=np.log10(abs(dd.min())+1e-9),dQ_mean=np.mean(dd),dQ_skew=float(pd.Series(dd).skew()))
        return r
    except Exception as e: return dict(cell=p,err=str(e)[:80])
if __name__=='__main__':
    fs=sorted(glob.glob('data/hust/ex/our_data/*.pkl'))
    with Pool(6) as p: r=p.map(one,fs,chunksize=1)
    df=pd.DataFrame(r); df.to_csv('phase0/hust_feats.csv',index=False); print(df.shape); print(df.head()); print(df.get('err',pd.Series()).dropna().head())
