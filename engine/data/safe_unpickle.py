"""Allow-list unpickler for untrusted dataset files.

Dataset pickles come from third parties. Plain pickle.load can run arbitrary code, so only the
exact classes these datasets need (numpy arrays, pandas frames, ordered dicts) are permitted.
"""
from __future__ import annotations

import pickle
from typing import Any

ALLOWED: frozenset[tuple[str, str]] = frozenset({
    ("builtins", "slice"),
    ("collections", "OrderedDict"),
    ("_codecs", "encode"),
    ("numpy", "ndarray"),
    ("numpy._core.numeric", "_frombuffer"),
    ("numpy.core.numeric", "_frombuffer"),
    ("numpy", "dtype"),
    ("numpy.core.multiarray", "_reconstruct"),
    ("numpy.core.multiarray", "scalar"),
    ("numpy._core.multiarray", "_reconstruct"),
    ("numpy._core.multiarray", "scalar"),
    ("pandas.core.frame", "DataFrame"),
    ("pandas.core.indexes.base", "Index"),
    ("pandas.core.indexes.base", "_new_Index"),
    ("pandas.core.indexes.range", "RangeIndex"),
    ("pandas.core.internals.managers", "BlockManager"),
})


class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module: str, name: str) -> Any:
        if (module, name) in ALLOWED:
            return super().find_class(module, name)
        raise pickle.UnpicklingError(f"blocked class {module}.{name}")


def load_one(path: str) -> Any:
    """Load a single pickled object from a file."""
    with open(path, "rb") as f:
        return SafeUnpickler(f).load()


def load_all(path: str) -> list[Any]:
    """Load every pickled object in a file (legacy torch-style EVBattery files hold several)."""
    out: list[Any] = []
    with open(path, "rb") as f:
        while True:
            try:
                out.append(SafeUnpickler(f).load())
            except EOFError:
                return out
