"""Local JSON API for the evaluated research models; no frontend or hardware control."""
import argparse
import json
import math
import sys
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import joblib
from predict_soh import predict_soh
from rul_features import predict_rul
from charging_model import optimise_charging
from predict_dynamics import predict_soc,predict_driving,coulomb_soc
from soc_tracking import predict_tracking

MAX_BODY=5_000_000
DEFAULT_ORIGINS={'http://localhost:5173','http://127.0.0.1:5173','http://localhost:3000','http://127.0.0.1:3000'}

def records(value,name,limit):
    if not isinstance(value,list) or not value or len(value)>limit or not all(isinstance(r,dict) for r in value):
        raise ValueError(f'{name} must be a nonempty list of at most {limit} records.')
    return value

def assess(models,payload):
    current=records(payload['measurements'],'measurements',20000)
    reference=records(payload['reference_measurements'],'reference_measurements',20000) if 'reference_measurements' in payload else None
    cycle=payload['observed_cycle_number'];days=payload['elapsed_days'];protocol=payload['protocol']
    soh=predict_soh(models['soh'],current,cycle,days,protocol,reference)
    result={'soh':soh,'rul':{'status':'soh_unavailable','remaining_observed_cycles':None}}
    if soh['status']=='ok':
        history=records(payload['health_history'],'health_history',5000)
        if any(float(r['observed_cycle_number'])>=float(cycle) for r in history):
            raise ValueError('health_history must end before the current charging cycle.')
        history=history+[{'observed_cycle_number':cycle,'elapsed_days':days,'soh_reference_pct':soh['soh_reference_pct']}]
        result['rul']=predict_rul(models['rul'],history,payload['discharge_c_rate'],protocol,'predicted')
    return result

def dispatch(models,path,payload):
    if not isinstance(payload,dict):raise ValueError('The JSON body must be an object.')
    if path=='/api/soh':
        current=records(payload['measurements'],'measurements',20000)
        reference=records(payload['reference_measurements'],'reference_measurements',20000) if 'reference_measurements' in payload else None
        return predict_soh(models['soh'],current,payload['observed_cycle_number'],payload['elapsed_days'],payload['protocol'],reference)
    if path=='/api/rul':
        return predict_rul(models['rul'],records(payload['health_history'],'health_history',5000),payload['discharge_c_rate'],payload['protocol'],payload.get('health_source','measured'))
    if path=='/api/charging':
        return optimise_charging(models['charging'],payload['protocol'],payload['max_c_rate'],payload.get('selection','observed_mean'))
    if path=='/api/assess':return assess(models,payload)
    if path=='/api/soc':
        observations=records(payload['observations'],'observations',20000);protocol=payload['protocol']
        if protocol=='TUM_BMW_I3' and 'initial_soc_pct' in payload:
            return predict_tracking(models['soc_tracking'],observations,payload['initial_soc_pct'],protocol)
        bundle=models['soc_calce'] if protocol=='CALCE_NMC_25C' else models['soc_vehicle']
        result=predict_soc(bundle,observations,protocol)
        if 'initial_soc_pct' in payload and 'capacity_ah' in payload and protocol=='CALCE_NMC_25C':
            result['initialised_coulomb_baseline']=coulomb_soc(observations,payload['initial_soc_pct'],payload['capacity_ah'])
        return result
    if path=='/api/driving':
        return predict_driving(models['driving'],records(payload['observations'],'observations',20000),payload['protocol'],payload.get('range_inputs'))
    if path in ('/api/range','/api/vehicle'):
        observations=records(payload['observations'],'observations',20000);protocol=payload['protocol']
        if protocol!='TUM_BMW_I3':return {'status':'unsupported_protocol','soc':None,'driving':None,'range':None}
        soc=predict_tracking(models['soc_tracking'],observations,payload['initial_soc_pct'],protocol) if 'initial_soc_pct' in payload else predict_soc(models['soc_vehicle'],observations,protocol)
        driving=predict_driving(models['driving'],observations,protocol)
        result={'soc':soc,'driving':driving,'range':{'status':'soc_unavailable','estimated_range_km':None}}
        if soc['status']=='ok':
            required=['usable_capacity_kwh','soc_min_pct','soc_max_pct']
            range_inputs={'soc_pct':soc['soc_pct'],**{k:payload[k] for k in required},'reserve_usable_soc_pct':payload.get('reserve_usable_soc_pct',10)}
            ranged=predict_driving(models['driving'],observations,protocol,range_inputs)
            result['range']=ranged.get('range',{'status':'consumption_unavailable','estimated_range_km':None})
        return result
    raise LookupError('Unknown endpoint.')

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def reply(self,status,body):
        content=json.dumps(body,allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(content)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        origin=self.headers.get('Origin')
        if origin in self.server.allowed_origins:
            self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Vary','Origin')
            self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.end_headers()
        self.wfile.write(content)

    def origin_allowed(self):
        origin=self.headers.get('Origin')
        if origin and origin not in self.server.allowed_origins:
            self.reply(403,{'error':'Frontend origin is not allowed.'});return False
        return True

    def do_OPTIONS(self):
        if self.origin_allowed():self.reply(200,{'status':'ok'})

    def do_GET(self):
        if not self.origin_allowed():return
        if self.path=='/health':
            self.reply(200,{'status':'ok','models_loaded':list(self.server.models),'mode':'local research prototype'})
        elif self.path=='/api/models':
            self.reply(200,{'soh':{'protocol':'CALCE_CS2','features':self.server.models['soh']['features'],'requires_initial_charge_reference':True},
                            'rul':{'protocol':'CALCE_CS2','unit':'remaining recorded cycle groups','minimum_health_observations':5},
                            'charging':{'protocol':self.server.models['charging']['protocol'],'tested_protocols':9,'chemistry':'LFP','fixed_charge_minutes':10,'soc_range_pct':[0,80]},
                            'soc':{'protocols':['CALCE_NMC_25C','TUM_BMW_I3'],'minimum_history_s':30,'tracking_option':'Known initial SOC at first observation uses the calibrated vehicle observer'},
                            'driving':{'protocol':'TUM_BMW_I3','minimum_history_s':60,'horizons':['next 60 seconds Wh','next kilometre Wh/km']},
                            'range':{'method':'Predicted consumption with supplied usable energy and operational SOC window; conditional on continued driving conditions'},
                            'limits':['Study-specific models; not an EV controller.','Charging study cells differ from CALCE and BMW vehicle cells.','Reported BMS SOC is a reference, not an independently measured true-SOC sensor.']})
        else:self.reply(404,{'error':'Unknown endpoint.'})

    def do_POST(self):
        if not self.origin_allowed():return
        if self.path not in ('/api/soh','/api/rul','/api/charging','/api/assess','/api/soc','/api/driving','/api/range','/api/vehicle'):
            self.reply(404,{'error':'Unknown endpoint.'});return
        if self.headers.get('Content-Type','').split(';')[0].strip()!='application/json':
            self.reply(415,{'error':'Use Content-Type: application/json.'});return
        try:
            length=int(self.headers.get('Content-Length','0'))
        except ValueError:
            self.reply(400,{'error':'Invalid Content-Length.'});return
        if not 0<length<=MAX_BODY:
            self.reply(413 if length>MAX_BODY else 400,{'error':'JSON body must be nonempty and at most 5 MB.'});return
        try:
            def invalid_constant(value):raise ValueError(f'Nonfinite JSON number: {value}')
            def finite_float(value):
                number=float(value)
                if not math.isfinite(number):raise ValueError('JSON number exceeds finite range.')
                return number
            payload=json.loads(self.rfile.read(length),parse_constant=invalid_constant,parse_float=finite_float)
            result=dispatch(self.server.models,self.path,payload)
        except (ValueError,TypeError,KeyError,OverflowError,RecursionError) as error:
            self.reply(400,{'error':str(error)});return
        except TimeoutError:
            self.reply(408,{'error':'Request body timed out.'});return
        self.reply(200,result)

    def log_message(self,format,*args):
        print(f'{self.address_string()} {format%args}',flush=True)

def create_server(port=8000,origins=None):
    paths={'soh':'models/reliable/soh_guarded.joblib','rul':'models/final/rul.joblib','charging':'models/final/charging.joblib',
           'soc_calce':'models/final/soc_calce.joblib','soc_vehicle':'models/final/soc_vehicle.joblib',
           'soc_tracking':'models/final/soc_tracking.joblib','driving':'models/final/driving.joblib'}
    models={name:joblib.load(ROOT/path) for name,path in paths.items()}
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    server.models=models
    server.allowed_origins=DEFAULT_ORIGINS if origins is None else set(origins)
    return server

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8000)
    parser.add_argument('--allow-origin',action='append',help='Allowed browser origin; repeated values replace the localhost defaults.')
    args=parser.parse_args()
    if not 1<=args.port<=65535:parser.error('port must be from 1 to 65535')
    with create_server(args.port,args.allow_origin) as server:
        print(f'Backend ready at http://127.0.0.1:{args.port}; Ctrl+C stops it.',flush=True)
        try:server.serve_forever()
        except KeyboardInterrupt:pass

if __name__=='__main__':main()
