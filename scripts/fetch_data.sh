#!/usr/bin/env bash
# Downloads all public datasets into data/ (resumable) and checks byte sizes.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
get() { # dir name url expected_size
  mkdir -p "$1"
  curl -sL -C - --retry 3 -o "$1/$2" "$3"
  got=$(stat -f%z "$1/$2" 2>/dev/null || stat -c%s "$1/$2")
  if [ "$got" = "$4" ]; then echo "OK       $1/$2 ($got)"; else echo "MISMATCH $1/$2 expected=$4 got=$got"; fail=1; fi
}
M=https://data.mendeley.com/public-files/datasets
get data/naumann_lfp_calendar DifferentialVoltageAnalysis.xlsx "$M/kxh42bfgtj/files/d5b58a9f-cdb0-470a-981c-fc2e258ce5db/file_downloaded" 11984
get data/naumann_lfp_calendar DischargeCapacity.xlsx "$M/kxh42bfgtj/files/2992b741-ef45-47b7-a134-fad4401df54c/file_downloaded" 18248
get data/naumann_lfp_calendar ElectrochemicalImpedanceSpectroscopy.xlsx "$M/kxh42bfgtj/files/970f1edc-4462-4d04-985a-645f3f0fc3c6/file_downloaded" 18714
get data/naumann_lfp_calendar ResistanceR_DC10s.xlsx "$M/kxh42bfgtj/files/93525836-1687-4a4a-acee-423eb35b962d/file_downloaded" 18541
get data/stanford_calendar joule_declass_sum.zip "https://osf.io/download/4txrk/" 2269469
mkdir -p data/stanford_calendar
curl -sL -o data/stanford_calendar/Joule_cell_id.csv https://raw.githubusercontent.com/viveklam/Joule-Decade-Calendar-Aging/main/Joule_cell_id.csv
get data/evbattery battery_dataset3.tar.gz "https://ndownloader.figshare.com/files/41076458" 177847087
get data/evbattery battery_dataset2.tar.gz "https://ndownloader.figshare.com/files/41076506" 418251471
get data/evbattery battery_dataset1.tar.gz "https://ndownloader.figshare.com/files/41076449" 812110847
get data/hust our_data.zip "$M/nsc7hnsg4s/files/5ca0ac3e-d598-4d07-8dcb-879aa047e98b/file_downloaded" 1188136932
if [ "$fail" = 0 ]; then
  echo "Extract with: scripts/extract_data.sh"
else echo "Some downloads failed; rerun to resume." >&2; exit 1; fi
