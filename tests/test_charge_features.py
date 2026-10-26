import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from charge_features import extract_charge_window,normalize_window

def profile(times):
    return [{'test_time_s':t,'voltage_v':3.9+t/3000,'current_a':.55,'charge_counter_ah':10+.55*t/3600,'step_index':2} for t in times]

class ChargeWindowChecks(unittest.TestCase):
    def test_sparse_and_dense_same_physical_feature(self):
        a=extract_charge_window(profile(range(0,901,30)))
        b=extract_charge_window(profile(range(0,901,60)))
        self.assertEqual(a['status'],'ok');self.assertEqual(b['status'],'ok')
        self.assertAlmostEqual(a['window_low_charge_ah'],b['window_low_charge_ah'])
        self.assertAlmostEqual(a['window_duration_s'],300)
        self.assertAlmostEqual(normalize_window(a,a)['window_low_charge_ratio'],1)

    def test_top_up_abstains(self):
        self.assertEqual(extract_charge_window(profile(range(500,901,30)))['status'],'voltage_window_not_observed')

    def test_no_extrapolation_or_coarse_sampling(self):
        self.assertNotEqual(extract_charge_window(profile([0,300,600,900]))['status'],'ok')
        self.assertNotEqual(extract_charge_window(profile(range(0,301,30)))['status'],'ok')

    def test_future_charge_and_reset_rejected(self):
        rows=profile(range(0,301,30))
        rows.append({'test_time_s':310,'voltage_v':4.2,'current_a':-1,'charge_counter_ah':10.1,'step_index':7})
        rows.extend(profile(range(320,901,30)))
        self.assertNotEqual(extract_charge_window(rows)['status'],'ok')
        rows=profile(range(0,901,30));rows[15]['charge_counter_ah']=0
        self.assertEqual(extract_charge_window(rows)['status'],'time_or_counter_reset')

if __name__=='__main__':
    unittest.main()
