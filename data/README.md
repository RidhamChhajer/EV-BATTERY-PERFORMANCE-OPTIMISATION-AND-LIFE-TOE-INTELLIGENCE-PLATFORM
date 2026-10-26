# Research datasets

The full raw archives and processed training tables are kept outside the GitHub distribution. Saved models and example requests are included, so the application and Python unit/API tests run without them.

## Sources

| Source | Required local files / role |
|---|---|
| [CALCE battery research data](https://calce.umd.edu/data) | CS2_33–CS2_38 ageing archives for SOH/RUL; SP20-2 NMC calibration, FUDS, DST, US06 and BJDST for lab SOC |
| [Attia et al. charging study](https://doi.org/10.1038/s41586-020-1994-5) and [source repository](https://github.com/chueh-ermon/battery-fast-charging-optimization) | Nine A123 LFP protocols and five lifetime replicates per protocol |
| [BMW i3 driving/heating dataset](https://doi.org/10.21227/6jr9-5235) | 70 recording trips; acquisition metadata identifies the downloaded public mirror |
| CALCE PL SOC-window experiments | Optional retained comparison data, including PL11; excluded from the active CS2 health model |

## Local layout

```text
data/raw/cs2_aging/
data/raw/nmc_driving/
data/raw/pl_soc_windows/
data/raw/charging_attia2020/
data/raw/soc_dynamic_extra/
data/raw/driving_tum/
data/processed/
```

See `scripts/prepare_data.py` and the preparation scripts for expected archive names and table contracts. `scripts/download_charging_data.py` retrieves the charging source, and `scripts/download_dynamics.py` retrieves additional dynamic profiles and the vehicle-data mirror. CALCE base archives must be supplied separately. Download availability and third-party usage terms are controlled by the source publishers.

For a full rebuild, restore the required original source files and prepared tables, then follow [TRAINING.md](../TRAINING.md). `scripts/build_project.py` performs dataset-dependent hash and split verification; it cannot run against an inference-only checkout. Evaluation reports retain provenance and recorded hashes. Do not substitute arbitrary datasets without rebuilding features, labels, splits and models.
