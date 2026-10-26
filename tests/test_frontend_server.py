"""The frontend reuses canonical examples while keeping project files private."""
import unittest
from pathlib import Path
from frontend.serve import FrontendHandler

ROOT = Path(__file__).resolve().parents[1]


class FrontendPaths(unittest.TestCase):
    def setUp(self):
        self.handler = FrontendHandler.__new__(FrontendHandler)
        self.handler.directory = str(ROOT / 'frontend')

    def test_example_and_static_routes(self):
        for name in ['vehicle', 'assess', 'soh', 'rul', 'charging', 'soc_calce', 'soc_vehicle', 'soc_tracking']:
            target = Path(self.handler.translate_path(f'/examples/{name}_request.json'))
            self.assertEqual(target, ROOT / 'examples' / f'{name}_request.json')
            self.assertTrue(target.is_file())
        self.assertEqual(Path(self.handler.translate_path('/src/app.js')), ROOT / 'frontend/src/app.js')

    def test_other_project_paths_are_not_served(self):
        for path in ['/examples/../README.md', '/examples/%2e%2e/backend/server.py', '/examples/provenance.json', '/examples/nested/vehicle_request.json']:
            target = Path(self.handler.translate_path(path))
            self.assertTrue(target.is_relative_to(ROOT / 'frontend'), path)
