import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from predict_soh import charging_inputs,in_bounds,predict_soh
from test_charge_features import profile

class PredictionChecks(unittest.TestCase):
    def test_session_completion_and_future_discharge(self):
        rows=profile(range(0,901,30))
        self.assertEqual(charging_inputs(rows,2,1)['status'],'charge_not_completed')
        rows.append({'test_time_s':930,'voltage_v':4.2,'current_a':.05,'charge_counter_ah':10.2,'step_index':4})
        values=charging_inputs(rows,2,1)
        self.assertEqual(values['status'],'ok')
        self.assertEqual(values['charge_duration_approx_s'],930)
        rows.append({'test_time_s':960,'voltage_v':2.7,'current_a':-1,'charge_counter_ah':10.2,'step_index':7})
        self.assertEqual(charging_inputs(rows,2,1),values)

    def test_guards_do_not_call_model(self):
        self.assertEqual(predict_soh({},[],2,1,'NMC')['status'],'unsupported_protocol')
        self.assertIsNone(predict_soh({},profile(range(500,901,30)),2,1,'CALCE_CS2')['soh_reference_pct'])
        self.assertEqual(charging_inputs([],2,float('nan'))['status'],'invalid_operating_age')
        self.assertEqual(charging_inputs([{}],2,1)['status'],'invalid_measurements')
        self.assertFalse(in_bounds({'x':3},{'x':[1,2]}))
        self.assertFalse(in_bounds({'x':float('nan')},{'x':[1,2]}))
        rows=profile(range(0,901,30))
        rows[0]['observed_cycle_number']=3
        self.assertEqual(charging_inputs(rows,2,1)['status'],'mixed_or_wrong_cycle')
        self.assertEqual(charging_inputs(profile(range(0,901,30)),2,1,rows)['status'],'reference_must_precede_current_cycle')
        current=profile(range(0,901,30));reference=profile(range(0,901,30))
        current[0]['cell_id']='a';reference[0]['cell_id']='b'
        self.assertEqual(charging_inputs(current,2,1,reference)['status'],'mixed_or_wrong_reference_cell')

    def test_initial_reference_required(self):
        rows=profile(range(0,901,30))
        rows.append({'test_time_s':930,'voltage_v':4.2,'current_a':.05,'charge_counter_ah':10.2,'step_index':4})
        bundle={'requires_initial_charge_reference':True}
        self.assertEqual(predict_soh(bundle,rows,2,1,'CALCE_CS2')['status'],'missing_initial_charge_reference')

if __name__=='__main__':
    unittest.main()
