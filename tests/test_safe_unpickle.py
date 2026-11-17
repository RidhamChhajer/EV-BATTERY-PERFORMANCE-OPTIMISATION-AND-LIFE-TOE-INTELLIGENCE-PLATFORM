import os
import pickle

import pytest

from engine.data.safe_unpickle import load_all, load_one


class _Evil:
    def __reduce__(self):
        return (os.system, ("touch EVIL_RAN",))


def test_malicious_pickle_blocked(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    p = tmp_path / "evil.pkl"
    p.write_bytes(pickle.dumps(_Evil()))
    with pytest.raises(pickle.UnpicklingError):
        load_one(str(p))
    assert not (tmp_path / "EVIL_RAN").exists()


def test_plain_dict_and_numpy_ok(tmp_path):
    import numpy as np
    p = tmp_path / "ok.pkl"
    p.write_bytes(pickle.dumps({"a": np.arange(3)}))
    assert load_one(str(p))["a"].tolist() == [0, 1, 2]


def test_load_all_multi_object(tmp_path):
    p = tmp_path / "multi.pkl"
    with open(p, "wb") as f:
        pickle.dump(1, f)
        pickle.dump({"x": 2}, f)
    assert load_all(str(p)) == [1, {"x": 2}]
