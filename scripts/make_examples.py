"""Export real, compact requests for the local API; preserve source files."""
import json
import pandas as pd
from predict_soh import ROOT

def write(path,data):path.write_text(json.dumps(data,indent=2,allow_nan=False),encoding='utf-8')

def main():
    out=ROOT/'examples';out.mkdir(parents=True,exist_ok=True)
    cell='CS2_35';cycle=200
    cells=pd.read_csv(ROOT/'data/processed/life_prediction/cells.csv')
    reference_cycle=int(cells.loc[cells.cell_id==cell,'reference_observed_cycle'].iloc[0])
    cols=['observed_cycle_number','test_time_s','voltage_v','current_a','charge_counter_ah','step_index','row_valid']
    measurements=pd.read_csv(ROOT/f'data/processed/life_prediction/measurements/{cell}.csv.gz',usecols=cols)
    def charge(number):
        g=measurements.loc[(measurements.observed_cycle_number==number)&measurements.row_valid].drop(columns='row_valid')
        end=g.loc[g.current_a<-.01,'test_time_s'].min()
        return g.loc[g.test_time_s<end] if pd.notna(end) else g
    current=charge(cycle);reference=charge(reference_cycle)
    current.to_csv(out/'current_charge.csv',index=False);reference.to_csv(out/'initial_charge.csv',index=False)
    cycles=pd.read_csv(ROOT/'data/processed/life_prediction/cycles.csv')
    history=cycles.loc[(cycles.cell_id==cell)&cycles.full_cycle_candidate&(cycles.observed_cycle_number<=cycle)].tail(21)
    latest=history.iloc[-1]
    health=history[['observed_cycle_number','elapsed_days','soh_reference_pct']].to_dict('records')
    history[['observed_cycle_number','elapsed_days','soh_reference_pct']].to_csv(out/'health_history.csv',index=False)
    soh={'protocol':'CALCE_CS2','observed_cycle_number':cycle,'elapsed_days':float(latest.elapsed_days),
         'measurements':current.to_dict('records'),'reference_measurements':reference.to_dict('records')}
    write(out/'soh_request.json',soh)
    write(out/'rul_request.json',{'protocol':'CALCE_CS2','discharge_c_rate':1.,'health_source':'measured','health_history':health})
    write(out/'assess_request.json',{**soh,'discharge_c_rate':1.,'health_history':health[:-1]})
    write(out/'charging_request.json',{'protocol':'ATTIA2020_LFP_10MIN','max_c_rate':6,'selection':'observed_mean'})
    write(out/'insufficient_charge_request.json',{**soh,'measurements':current.loc[current.voltage_v>4.12].to_dict('records')})
    write(out/'provenance.json',{'cell_id':cell,'current_cycle':cycle,'initial_reference_cycle':reference_cycle,'source':'Existing CALCE processed measurements; examples are demonstration inputs, not new evaluation cases.'})
    lab=pd.read_csv(ROOT/'data/processed/soc_calce/FUDS_80_observations.csv')
    lab_history=lab.loc[lab.time_s<=300].tail(61).drop(columns='soc_reference_pct').to_dict('records')
    write(out/'soc_calce_request.json',{'protocol':'CALCE_NMC_25C','observations':lab_history})
    vehicle=pd.read_csv(ROOT/'data/processed/vehicle_tum/TripA01_observations.csv')
    recent=vehicle.loc[(vehicle.time_s>=240)&(vehicle.time_s<=300)].drop(columns='soc_reference_pct').to_dict('records')
    tracking=vehicle.loc[vehicle.time_s<=300].drop(columns='soc_reference_pct').to_dict('records')
    write(out/'soc_vehicle_request.json',{'protocol':'TUM_BMW_I3','observations':recent})
    write(out/'soc_tracking_request.json',{'protocol':'TUM_BMW_I3','observations':tracking,'initial_soc_pct':float(vehicle.soc_reference_pct.iloc[0])})
    write(out/'driving_request.json',{'protocol':'TUM_BMW_I3','observations':recent})
    write(out/'vehicle_request.json',{'protocol':'TUM_BMW_I3','observations':tracking,'initial_soc_pct':float(vehicle.soc_reference_pct.iloc[0]),
                                     'usable_capacity_kwh':18.8,'soc_min_pct':8,'soc_max_pct':90,'reserve_usable_soc_pct':10})
    vehicle.head(301).to_csv(out/'vehicle_observations.csv',index=False)
    print('Example CSVs and JSON requests saved in examples/.',flush=True)

if __name__=='__main__':main()
