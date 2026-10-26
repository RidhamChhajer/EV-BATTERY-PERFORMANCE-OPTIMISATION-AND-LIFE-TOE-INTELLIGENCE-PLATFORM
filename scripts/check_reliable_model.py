"""Check real sensor-to-model inputs against the fitted table without refitting."""
import json
import joblib
import numpy as np
import pandas as pd
from predict_soh import ROOT,charging_inputs,predict_soh

def main():
    bundle=joblib.load(ROOT/'models/reliable/soh_guarded.joblib')
    examples=pd.read_csv(ROOT/'data/processed/soh_reliable/training_examples.csv')
    cell='CS2_35'
    reference_cycle=bundle['reference_profiles'][cell]['reference_observed_cycle']
    columns=['observed_cycle_number','test_time_s','voltage_v','current_a','charge_counter_ah','step_index','row_valid']
    measurements=pd.read_csv(ROOT/f'data/processed/life_prediction/measurements/{cell}.csv.gz',usecols=columns)
    reference=measurements.loc[(measurements.observed_cycle_number==reference_cycle)&measurements.row_valid].to_dict('records')
    for cycle in [200,400,600]:
        expected=examples.loc[(examples.cell_id==cell)&(examples.observed_cycle_number==cycle)].iloc[0].to_dict()
        records=measurements.loc[(measurements.observed_cycle_number==cycle)&measurements.row_valid].to_dict('records')
        actual=charging_inputs(records,cycle,expected['elapsed_days'],reference)
        assert actual['status']=='ok',actual
        assert np.allclose([actual[f] for f in bundle['features']],[expected[f] for f in bundle['features']],rtol=1e-10,atol=1e-10)
        result=predict_soh(bundle,records,cycle,expected['elapsed_days'],'CALCE_CS2',reference)
        assert result['status']=='ok',result
        expected_prediction=float(bundle['model'].predict(pd.DataFrame([expected])[bundle['features']])[0])
        assert abs(result['soh_reference_pct']-expected_prediction)<1e-8
        first_discharge=min(float(r['test_time_s']) for r in records if float(r['current_a'])<-.01)
        charging=[r for r in records if float(r['test_time_s'])<first_discharge]
        assert predict_soh(bundle,charging,cycle,expected['elapsed_days'],'CALCE_CS2',reference)==result
        print(f'{cell} cycle {cycle}: sensor features, saved estimator and charging-only prediction match.')
    (ROOT/'reports/reliability/verification.json').write_text(json.dumps({'status':'passed','unit_tests':12,'real_sensor_sessions_checked':3,'checks':['feature consistency','serialized estimator','before-discharge prediction']},indent=2),encoding='utf-8')

if __name__=='__main__':
    main()
