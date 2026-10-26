"""Sequential, reproducible model rebuild or verification; the frontend remains separate."""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def run(script,*arguments):
    print(f'Running {script} {" ".join(arguments)}',flush=True)
    subprocess.run([sys.executable,str(ROOT/'scripts'/script),*arguments],cwd=ROOT,check=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rebuild',action='store_true',help='Rebuild derived models using saved data and frozen telemetry selections; takes several minutes.')
    args=parser.parse_args()
    if args.rebuild:
        for script in ['improve_soh.py','report_reliability.py','train_rul.py','train_charging.py','prepare_soc.py']:
            run(script)
        run('train_soc.py','calce')
        run('prepare_vehicle.py')
        run('train_soc.py','vehicle','--select-only')
        run('train_soc_tracking.py','--select-only')
        run('train_driving.py')
        run('train_soc.py','vehicle')
        run('train_soc_tracking.py')
        run('make_examples.py');run('report_project.py');run('report_dynamics.py')
    run('check_project.py')
    run('check_dynamic_models.py')
    subprocess.run([sys.executable,'-m','unittest','discover','-s','tests'],cwd=ROOT,check=True)
    print('All model artifacts, source/split checks and API tests passed. Frontend is not built by this command.',flush=True)

if __name__=='__main__':main()
