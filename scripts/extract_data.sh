#!/usr/bin/env bash
# Extracts archives into data/*/ex* (about 13 GB). Untrusted data: never run code from these folders.
set -euo pipefail
cd "$(dirname "$0")/.."
for i in 1 2 3; do mkdir -p data/evbattery/ex$i; tar -xzf data/evbattery/battery_dataset$i.tar.gz -C data/evbattery/ex$i; done
mkdir -p data/hust/ex && unzip -q -o data/hust/our_data.zip -d data/hust/ex
echo done
