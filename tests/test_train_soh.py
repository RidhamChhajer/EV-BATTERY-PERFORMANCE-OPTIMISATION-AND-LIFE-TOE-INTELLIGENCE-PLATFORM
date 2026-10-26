"""Standard-library checks; never fit a model or read real test outcomes."""
import csv
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import train_soh as training
TEMP_ROOT = Path(__file__).resolve().parents[1]/'work/test_temp'
TEMP_ROOT.mkdir(parents=True,exist_ok=True)

class TrainingChecks(unittest.TestCase):
    def test_metrics_and_undefined_r2(self):
        metric = training.scores([1,2],[2,2])
        self.assertEqual(metric['mae_pp'],.5)
        self.assertAlmostEqual(metric['rmse_pp'],math.sqrt(.5))
        self.assertIsNone(training.scores([2,2],[2,3])['r2'])
        self.assertIsNone(training.scores([],[])['mae_pp'])
        with self.assertRaises(ValueError):
            training.scores([1],[math.nan])

    def test_equal_battery_weight(self):
        rows = [{'cell_id':'a'}]*3+[{'cell_id':'b'}]
        weights = training.cell_weights(rows)
        self.assertAlmostEqual(sum(weights[:3]),weights[3])
        self.assertAlmostEqual(sum(weights),len(rows))

    def test_feature_leakage_rejected(self):
        contract = {'target':training.TARGET,'primary_features':list(training.APPROVED_FEATURES),
                    'without_historical_capacity_features':list(training.APPROVED_FEATURES-training.HISTORY_FEATURES)}
        training.feature_sets(contract)
        contract['primary_features'].append(training.TARGET)
        with self.assertRaises(ValueError):
            training.feature_sets(contract)

    def test_invalid_configuration(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as folder:
            path = Path(folder)/'config.json'
            config = {'random_state':42,'ridge':{'alpha':1.0},'random_forest':{'n_estimators':100,'max_depth':6,'min_samples_leaf':20}}
            path.write_text(json.dumps(config))
            self.assertEqual(training.read_configuration(path),config)
            config['random_forest']['max_depth'] = True
            path.write_text(json.dumps(config))
            with self.assertRaises(ValueError):
                training.read_configuration(path)

    def test_reserved_test_targets_never_parsed(self):
        registry = {'CS2_33':'train','CS2_34':'validation','CS2_35':'train','CS2_36':'train','CS2_37':'train','CS2_38':'test'}
        variants = {'with_history':list(training.APPROVED_FEATURES),
                    'without_history':list(training.APPROVED_FEATURES-training.HISTORY_FEATURES)}
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as folder:
            data_path,splits_path = Path(folder)/'data.csv',Path(folder)/'splits.csv'
            with splits_path.open('w',newline='') as f:
                w=csv.DictWriter(f,fieldnames=['cell_id','split']);w.writeheader()
                w.writerows({'cell_id':cell,'split':split} for cell,split in registry.items())
            rows = []
            for cell,split in registry.items():
                row = {f:1 for f in training.APPROVED_FEATURES}
                row.update(cell_id=cell,split=split,**{training.TARGET:'do not parse' if split=='test' else 90})
                rows.append(row)
            def write():
                with data_path.open('w',newline='') as f:
                    w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
            write()
            train,validation,skipped = training.load_development_data(data_path,splits_path,variants)
            self.assertEqual((len(train),len(validation),skipped),(4,1,1))
            rows[-1]['split']='train'
            write()
            with self.assertRaises(ValueError):
                training.load_development_data(data_path,splits_path,variants)

if __name__=='__main__':
    unittest.main()
