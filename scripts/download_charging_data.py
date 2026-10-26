"""Download the authors' small numeric validation tables; never execute upstream code."""
import hashlib
import json
from urllib.request import Request,urlopen
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE='https://raw.githubusercontent.com/chueh-ermon/battery-fast-charging-optimization/master/'
FILES=['figures/fig4/final_results.csv','figures/fig4/predictions.csv','data/policies_all.csv','README.md','figures/fig4/fig4_v5pt5.py','policies.py']

def main():
    out=ROOT/'data/raw/charging_attia2020'
    out.mkdir(parents=True,exist_ok=True)
    sources=[]
    for name in FILES:
        request=Request(BASE+name,headers={'User-Agent':'EV-battery-research-prototype'})
        with urlopen(request,timeout=30) as response:
            content=response.read(2_000_001)
        if len(content)>2_000_000:
            raise ValueError('Unexpectedly large file; refusing download.')
        path=out/Path(name).name
        path.write_bytes(content)
        sources.append({'source_url':BASE+name,'local_file':path.name,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
        print(f'{path.name}: {len(content)} bytes',flush=True)
    (out/'provenance.json').write_text(json.dumps({'study':'Attia et al. Nature 2020; doi:10.1038/s41586-020-1994-5','repository':'https://github.com/chueh-ermon/battery-fast-charging-optimization','files':sources},indent=2),encoding='utf-8')

if __name__=='__main__':main()
