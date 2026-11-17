import math


def find_bare_numbers(obj, path="", skip=("scenario", "scenarios", "months", "ages_years")):
    """Return paths of numbers that are not inside a Labelled-shaped dict. Also validates every label found."""
    out = []
    if isinstance(obj, dict):
        if {"value", "unit", "evidence_level", "validated_on_buses"} <= obj.keys():
            assert obj["validated_on_buses"] is False
            assert obj["evidence_level"] in ("assumption", "derived"), path
            vals = obj["value"] if isinstance(obj["value"], list) else [obj["value"]]
            assert all(math.isfinite(v) for v in vals), path
            return out
        for k, v in obj.items():
            if k not in skip:
                out += find_bare_numbers(v, f"{path}.{k}", skip)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out += find_bare_numbers(v, f"{path}[{i}]", skip)
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
        out.append(path)
    return out
