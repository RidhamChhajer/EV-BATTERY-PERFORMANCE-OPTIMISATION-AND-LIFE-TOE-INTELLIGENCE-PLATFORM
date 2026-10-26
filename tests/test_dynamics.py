import sys
import unittest
from pathlib import Path
import numpy as np
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from dynamic_features import sensor_features,live_features,SOC_FEATURES,DRIVE_FEATURES
from prepare_vehicle import labelled_segment,trip_splits
from prepare_soc import label_dynamic
from predict_dynamics import range_scenario,coulomb_soc
from soc_tracking import tracking_features

def observations(n=181,current=-10):
    return pd.DataFrame({'time_s':np.arange(n,dtype=float),'voltage_v':400.,'current_a':current,'temperature_c':20.,
                         'speed_kmh':36.,'ambient_temperature_c':15.,'heating_power_kw':1.,'elevation_m':500.,'soc_reference_pct':50.})

class DynamicChecks(unittest.TestCase):
    def test_causal_features_and_exact_live_path(self):
        frame=observations();features=sensor_features(frame,True)
        altered=frame.copy();altered.loc[121:,'voltage_v']=410
        pd.testing.assert_frame_equal(features.iloc[:121],sensor_features(altered,True).iloc[:121])
        live=live_features(frame.iloc[60:121].to_dict('records'),True)
        for feature in DRIVE_FEATURES:self.assertAlmostEqual(live[feature],features.loc[120,feature])
        self.assertFalse(set(SOC_FEATURES+DRIVE_FEATURES)&{'soc_reference_pct','time_s','target_next_60s_wh','target_next_km_wh_per_km'})

    def test_forecast_labels_and_regeneration(self):
        frame=observations();features,_=labelled_segment(frame)
        self.assertAlmostEqual(features.loc[60,'target_next_60s_wh'],4000/60)
        self.assertAlmostEqual(features.loc[60,'target_next_km_wh_per_km'],4000/36)
        regen,_=labelled_segment(observations(current=10))
        self.assertLess(regen.loc[60,'target_next_60s_wh'],0)
        self.assertTrue(pd.isna(features.loc[150,'target_next_60s_wh']))

    def test_recording_days_are_not_split(self):
        overview=pd.DataFrame({'Trip':[f'Trip{season}{i:02d}' for season in ['A','B'] for i in range(1,11)],
                               'Date':[f'2020-{month:02d}-{(i+1)//2:02d}_10-00-00' for month in [6,12] for i in range(1,11)]})
        split=trip_splits(overview)
        self.assertEqual(split.groupby('recording_day').split.nunique().max(),1)
        self.assertEqual(set(split.split),{'train','validation','test'})

    def test_full_charge_anchor_and_regenerative_label(self):
        frame=pd.DataFrame({'test_time_s':[0.,1.,2.],'voltage_v':[4.2,3.9,3.95],'current_a':[.02,-1.,1.],
                            'charge_counter_ah':[2.,2.,2.1],'discharge_counter_ah':[0.,.4,.4],'step_index':[3,7,7],'row_valid':True})
        labelled=label_dynamic(frame,2.)
        np.testing.assert_allclose(labelled.soc_reference_pct,[80,85])

    def test_physical_range_window_and_bad_inputs(self):
        self.assertAlmostEqual(range_scenario(200,49,20,8,90,10)['estimated_range_km'],40)
        self.assertIsNone(range_scenario(-20,49,20,8,90)['estimated_range_km'])
        with self.assertRaises(ValueError):range_scenario(200,float('nan'),20,8,90)
        with self.assertRaises(ValueError):range_scenario(200,50,20,90,8)
        with self.assertRaises(ValueError):live_features(observations().iloc[::-1].to_dict('records'))
        self.assertIsNone(live_features(observations(20).to_dict('records')))
        value=coulomb_soc(observations(61,current=-60).to_dict('records'),50,60)
        self.assertAlmostEqual(value['soc_pct'],50-100/60)

    def test_tracking_state_requires_one_known_seed_and_no_gaps(self):
        frame=observations(61,current=-60);features,_=tracking_features(frame.to_dict('records'),50)
        self.assertAlmostEqual(features.net_charge_ah.iloc[-1],-1)
        changed=frame.copy();changed['soc_reference_pct']=1
        pd.testing.assert_frame_equal(features,tracking_features(changed.to_dict('records'),50)[0])
        frame.loc[60,'time_s']=70
        with self.assertRaises(ValueError):tracking_features(frame.to_dict('records'),50)

if __name__=='__main__':unittest.main()
