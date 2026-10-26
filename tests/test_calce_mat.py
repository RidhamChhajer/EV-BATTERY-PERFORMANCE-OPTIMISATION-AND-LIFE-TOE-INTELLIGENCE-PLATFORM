"""The SciPy field-name adapter must preserve object metadata and its source dtype."""
import sys
import unittest
from pathlib import Path
import numpy as np
from scipy.io.matlab._mio5_params import MatlabOpaque

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from calce_mat import normalise_opaque_fields


class MatlabCompatibilityChecks(unittest.TestCase):
    def test_legacy_opaque_metadata_in_nested_cell(self):
        legacy = np.array([(b'obj', b'MCOS', b'table', np.array([17, 23]))],
                          dtype=[('s0', 'O'), ('s1', 'O'), ('s2', 'O'), ('arr', 'O')]).view(MatlabOpaque)
        cell = np.empty((1, 1), dtype=object)
        cell[0, 0] = legacy
        converted = normalise_opaque_fields(cell)[0, 0]
        self.assertIsInstance(converted, MatlabOpaque)
        self.assertEqual(converted['_Class'].item(), 'table')
        np.testing.assert_array_equal(converted['_ObjectMetadata'].item(), [17, 23])
        self.assertEqual(legacy.dtype.names, ('s0', 's1', 's2', 'arr'))
        self.assertIs(normalise_opaque_fields(converted), converted)


if __name__ == '__main__':
    unittest.main()
