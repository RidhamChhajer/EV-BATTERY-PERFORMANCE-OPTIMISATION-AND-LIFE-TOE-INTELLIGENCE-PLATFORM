import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from rul_features import history_features,predict_rul
import pandas as pd
from train_rul import build_examples

def history(n=10):
    return [{'observed_cycle_number':i,'elapsed_days':i/2,'soh_reference_pct':100-i*.1} for i in range(1,n+1)]

class RulChecks(unittest.TestCase):
    def test_slope_and_chronology(self):
        self.assertAlmostEqual(history_features(history(),.5)['soh_slope_pp_per_cycle'],-.1)
        with self.assertRaises(ValueError):history_features(history()[::-1],.5)
        with self.assertRaises(ValueError):history_features(history(4),.5)
        with self.assertRaises(ValueError):history_features(history(),3)

    def test_threshold_confirmation_and_unknown_protocol(self):
        rows=history()
        for r in rows[-3:]:r['soh_reference_pct']=79
        self.assertEqual(predict_rul({},rows,.5,'CALCE_CS2')['remaining_observed_cycles'],0)
        self.assertEqual(predict_rul({},rows,.5,'CALCE_CS2','predicted')['status'],'estimated_threshold_crossing')
        self.assertEqual(predict_rul({},rows,.5,'NMC')['status'],'unsupported_protocol')
        rows.append({'observed_cycle_number':11,'elapsed_days':6,'soh_reference_pct':85})
        self.assertEqual(predict_rul({},rows,.5,'CALCE_CS2')['remaining_observed_cycles'],0)

    def test_window_ignores_older_health_for_slope(self):
        rows=history(30);a=history_features(rows,.5)
        rows[0]['soh_reference_pct']=115
        self.assertEqual(a,history_features(rows,.5))

    def test_labels_exclude_censoring_future_rows_and_future_features(self):
        records=[]
        for cell in ['observed','censored']:
            for r in history(10):
                if cell=='observed' and 6<=r['observed_cycle_number']<=8:r['soh_reference_pct']=79
                records.append({'cell_id':cell,'full_cycle_candidate':True,'discharge_c_rate':.5,**r})
        cells=pd.DataFrame([{'cell_id':'observed','threshold_80_observed':True,'threshold_confirmation_observed_cycle':8},
                            {'cell_id':'censored','threshold_80_observed':False,'threshold_confirmation_observed_cycle':float('nan')}])
        before=build_examples(pd.DataFrame(records),cells)
        self.assertEqual(set(before.cell_id),{'observed'})
        self.assertEqual(before.observed_cycle_number.tolist(),[5,6,7,8])
        self.assertEqual(before.remaining_observed_cycles.tolist(),[3,2,1,0])
        for r in records:
            if r['observed_cycle_number']>8:r['soh_reference_pct']=1
        pd.testing.assert_frame_equal(before,build_examples(pd.DataFrame(records),cells))

if __name__=='__main__':unittest.main()
