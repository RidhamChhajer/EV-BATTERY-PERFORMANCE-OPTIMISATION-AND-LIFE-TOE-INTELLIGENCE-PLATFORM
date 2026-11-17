# Reproducibility

```bash
bash scripts/setup_env.sh && source .venv/bin/activate
bash scripts/fetch_data.sh      # downloads about 2.6 GB, verifies byte sizes
bash scripts/extract_data.sh    # about 13 GB on disk
pytest -q                       # data tests are skipped if data is missing
```

Phase 0 numbers asserted by `tests/test_phase0_reproduction.py` (own splits, not comparable to published benchmarks):

| Check | Expected |
|---|---|
| HUST leave-one-cell-out cycle-life error, early capacity features | 12.4 to 13.0 % (reported 12.7 %) |
| Naumann 25 C / 100 % SOC retention after 885 days | 88.9 to 89.1 % |
| EVBattery vehicle-grouped capacity error, segment features | 2.1 to 2.45 % (reported 2.29 %) |

The EVBattery test reads `engine/data/processed/evb_segments.parquet`, built by `scripts/build_data.sh`. It is skipped if absent.

Dataset files are untrusted pickles: they are only read through `engine/data/safe_unpickle.py`, which blocks every class outside an exact numpy/pandas allow-list.

## The NREL reference engine
The port in `engine/reference/` is tested against stored package outputs without needing the package: `pytest tests/test_reference_blast.py tests/test_crosscheck_blast.py`. `engine/artifacts/crosscheck_blast.json` (package outputs) and `engine/artifacts/reference_port_check.json` (how closely the port matches) are committed. To regenerate the package outputs, install BLAST-Lite in a separate Python 3.9 to 3.12 environment (it is not an app dependency; Python 3.13.x is excluded by its pin), then refresh the port check:

```bash
python3.11 -m venv /tmp/blast-venv && /tmp/blast-venv/bin/pip install blast-lite
.venv/bin/python scripts/crosscheck_blast.py --blast-python /tmp/blast-venv/bin/python
.venv/bin/python scripts/check_reference_port.py
```

`EV_ENGINE=lab` runs our own laboratory-fitted model instead (history; the phase 0 reproduction numbers above belong to it).
