import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from charging_model import fourth_rate,optimise_charging,PROTOCOL

class ChargingChecks(unittest.TestCase):
    def test_time_budget_and_infeasibility(self):
        fourth=fourth_rate(5.2,5.2,4.8)
        self.assertAlmostEqual(sum(60*.2/r for r in [5.2,5.2,4.8,fourth]),10)
        with self.assertRaises(ValueError):fourth_rate(1,1,1)
        with self.assertRaises(ValueError):fourth_rate(float('nan'),5,5)

    def test_ranking_is_constrained_and_protocol_specific(self):
        protocols=[{'protocol_id':'a','c1':5.2,'c2':5.2,'c3':4.8,'c4':fourth_rate(5.2,5.2,4.8),'observed_mean_life_cycles':900},
                   {'protocol_id':'b','c1':8,'c2':6,'c3':4.8,'c4':fourth_rate(8,6,4.8),'observed_mean_life_cycles':950}]
        bundle={'tested_protocols':protocols}
        self.assertEqual(optimise_charging(bundle,PROTOCOL,6)['recommendation']['protocol_id'],'a')
        self.assertEqual(optimise_charging(bundle,PROTOCOL,4)['status'],'no_tested_feasible_protocol')
        self.assertEqual(optimise_charging(bundle,'CALCE_CS2',8)['status'],'unsupported_protocol')
        with self.assertRaises(ValueError):optimise_charging(bundle,PROTOCOL,9)

if __name__=='__main__':unittest.main()
