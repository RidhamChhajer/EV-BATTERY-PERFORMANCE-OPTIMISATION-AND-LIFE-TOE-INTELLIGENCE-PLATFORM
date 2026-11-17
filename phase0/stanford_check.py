import zipfile, json, sys
import pandas as pd, numpy as np
ids=pd.read_csv('data/stanford_calendar/Joule_cell_id.csv')
lfp=ids[ids.Cell_chemistry.str.contains('LFP',case=False,na=False)]
print(ids.Cell_chemistry.value_counts().to_dict())
print(lfp.groupby(['Temperature','SOC']).size().unstack(fill_value=0))
z=zipfile.ZipFile('data/stanford_calendar/joule_declass_sum.zip')
rows=[]
for _,r in lfp.iterrows():
    n=f'joule_declass_sum/{r.Cell_id}_sum.json'
    try: d=json.loads(z.read(n))
    except KeyError: continue
    s=pd.DataFrame(json.loads(d['summary_data']))
    cap=s['RPT0.2C_2_D_capacity'] if 'RPT0.2C_2_D_capacity' in s else None
    t=s['Calendar_Time(date)'] if 'Calendar_Time(date)' in s else None
    if cap is None or t is None: continue
    t=pd.to_datetime(t,errors='coerce'); days=(t-t.iloc[0]).dt.days
    ok=cap.notna()&days.notna()
    if ok.sum()<3: continue
    c=cap[ok]/cap[ok].iloc[0]
    rows.append((r.Cell_id,r.Temperature,r.SOC,days[ok].iloc[-1],c.iloc[-1],ok.sum()))
df=pd.DataFrame(rows,columns=['cell','T','SOC','days','ret_last','n'])
print(len(df),'LFP cells with usable capacity series')
g=df.groupby(['T','SOC']).agg(cells=('cell','count'),days=('days','median'),ret=('ret_last','mean'),sd=('ret_last','std')).round(3)
print(g)
df.to_csv('phase0/stanford_lfp_summary.csv',index=False)
