import importlib

import engine


def test_version():
    assert engine.__version__


def test_subpackages_import():
    for name in ("cell", "bus", "decide", "calibrate", "data", "train"):
        importlib.import_module(f"engine.{name}")
