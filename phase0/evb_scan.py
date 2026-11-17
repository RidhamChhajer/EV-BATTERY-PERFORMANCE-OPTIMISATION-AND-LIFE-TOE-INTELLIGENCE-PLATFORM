import sys, os, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evb_load, numpy as np, pandas as pd
rows=[]
for i in (1,2,3):
    base=f'data/evbattery/ex{i}/battery_dataset{i}'
    lab=pd.read_csv(f'{base}/label/label.csv')
    import random; random.seed(0); files=glob.glob(f'{base}/data/*.pkl'); random.shuffle(files); files=files[:int(os.environ.get('LIM','3000'))]
    print(i,len(files),'files; label rows',len(lab),'cars',lab.car.nunique(),'anomaly=1:',int((lab.label==1).sum()))
    for k,f in enumerate(files):
        pass
        try: o=evb_load.load(f)[3]
        except Exception as e: continue
        a,m=o
        rows.append(dict(ds=i,file=os.path.basename(f),car=m.get('car'),label=m.get('label'),mileage=m.get('mileage'),capacity=m.get('capacity'),seg=m.get('charge_segment'),n=len(a),vmean=a[:,0].mean(),imean=a[:,1].mean(),dv=(a[:,3]-a[:,4]).mean(),tmax=a[:,5].mean(),dur=a[-1,7]-a[0,7],soc0=a[0,2],soc1=a[-1,2]))
df=pd.DataFrame(rows); df.to_csv('phase0/evb_meta.csv',index=False)
print(df.groupby('ds').agg(n=('file','count'),cars=('car','nunique'),cap_lab=('capacity',lambda s:(s>0).sum())))
print(df.describe().T[['count','mean','min','max']].round(2))
