"""Measures how closely engine/reference reproduces NREL BLAST-Lite and writes engine/artifacts/reference_port_check.json.

Needs only the stored package outputs (engine/artifacts/crosscheck_blast.json), not the package. Run after changing engine/reference
or after regenerating the stored package outputs with scripts/crosscheck_blast.py."""
import json
import os
import sys

sys.path.insert(0, os.getcwd())
from engine.bus.scenario import Scenario
from engine.reference.checks import compare_with_package

sys.path.insert(0, "scripts")
import crosscheck_blast as X

art = json.load(open("engine/artifacts/crosscheck_blast.json"))
scen = {cid: Scenario.from_preset(preset, **ov) for cid, _, preset, ov in X.CASES}
res = compare_with_package(art, scen)
json.dump(res, open("engine/artifacts/reference_port_check.json", "w"), indent=1)
print(json.dumps(res, indent=1))
