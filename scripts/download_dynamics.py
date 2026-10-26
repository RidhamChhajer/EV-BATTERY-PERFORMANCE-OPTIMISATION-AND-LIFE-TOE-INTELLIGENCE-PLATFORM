"""Fetch public dynamic experiments and the published vehicle-data mirror, with hashes."""
import hashlib
import json
import zipfile
from pathlib import Path
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
SOURCES=[('soc_dynamic_extra',f'SP2_25C_{profile}.zip',f'https://web.calce.umd.edu/batteries/data/SP2_25C_{profile}.zip') for profile in ['DST','US06','BJDST']]
SOURCES.append(('driving_tum','battery_heating_vehicle.zip','https://www.kaggle.com/api/v1/datasets/download/atechnohazard/battery-and-heating-data-in-real-driving-cycles'))

def main():
    entries=[]
    for group,name,url in SOURCES:
        folder=ROOT/'data/raw'/group;folder.mkdir(parents=True,exist_ok=True)
        target=folder/name
        if not target.exists():
            partial=target.with_suffix('.download')
            with urlopen(Request(url,headers={'User-Agent':'EV-battery-research'}),timeout=60) as response,partial.open('wb') as out:
                total=0
                while chunk:=response.read(1_000_000):
                    total+=len(chunk)
                    if total>250_000_000:raise ValueError('Unexpectedly large source archive.')
                    out.write(chunk)
            with zipfile.ZipFile(partial) as archive:
                if archive.testzip() is not None:raise ValueError('Archive CRC verification failed.')
                if sum(m.file_size for m in archive.infolist())>1_000_000_000:raise ValueError('Unexpected expanded archive size.')
            partial.replace(target)
        with zipfile.ZipFile(target) as archive:
            if archive.testzip() is not None:raise ValueError('Saved source archive CRC failed.')
            members=archive.namelist()
        entry={'group':group,'path':str(target.relative_to(ROOT)),'url':url,'bytes':target.stat().st_size,
               'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'members':members}
        entries.append(entry)
        print(f'{name}: {entry["bytes"]:,} bytes; {len(members)} members verified',flush=True)
    report=ROOT/'reports/dynamics';report.mkdir(parents=True,exist_ok=True)
    (report/'source_manifest.json').write_text(json.dumps({'sources':entries,
        'vehicle_primary_citation':'Steinstraeter, Buberger, Trifonov (2020), Battery and Heating Data in Real Driving Cycles, doi:10.21227/6jr9-5235',
        'vehicle_primary_url':'https://ieee-dataport.org/open-access/battery-and-heating-data-real-driving-cycles',
        'vehicle_download_note':'Public Kaggle mirror; original IEEE page was inaccessible from this session. Mirror identity is documented, not presented as a publisher-verified checksum.'},indent=2),encoding='utf-8')

if __name__=='__main__':main()
