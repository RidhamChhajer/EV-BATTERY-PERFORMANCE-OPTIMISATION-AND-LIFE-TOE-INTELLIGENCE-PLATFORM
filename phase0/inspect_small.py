import sys, zipfile, json, os
import pandas as pd
nau, stz = sys.argv[1], sys.argv[2]
print("=== NAUMANN (LFP calendar) ===")
for f in sorted(os.listdir(nau)):
    xl = pd.ExcelFile(os.path.join(nau, f))
    for sh in xl.sheet_names:
        df = xl.parse(sh, header=None)
        print(f"{f} | sheet={sh} | shape={df.shape}")
        print(df.iloc[:6, :8].to_string()); print()
print("=== STANFORD summary zip ===")
z = zipfile.ZipFile(stz)
names = z.namelist()
print(len(names), "entries; first 8:", names[:8])
js = [n for n in names if n.endswith(".json")]
print(len(js), "json files")
n0 = js[0]
d = json.loads(z.read(n0))
print(n0, "top keys:", list(d.keys()))
for k in d:
    v = d[k]
    print(k, type(v).__name__, (list(v.keys())[:40] if isinstance(v, dict) else str(v)[:200]))
