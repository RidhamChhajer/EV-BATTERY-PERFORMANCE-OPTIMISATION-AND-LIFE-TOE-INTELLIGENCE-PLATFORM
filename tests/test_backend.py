import http.client
import json
import sys
import threading
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.server import create_server,MAX_BODY

class BackendChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=create_server(0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=2)

    def request(self,path,body=None,headers=None,method=None):
        client=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=10)
        if isinstance(body,dict):body=json.dumps(body)
        headers={'Content-Type':'application/json',**(headers or {})}
        client.request(method or ('POST' if body is not None else 'GET'),path,body=body,headers=headers)
        response=client.getresponse();status=response.status;result=json.loads(response.read());returned=dict(response.getheaders());client.close()
        return status,result,returned

    def example(self,name):return json.loads((ROOT/'examples'/name).read_text())

    def test_health_and_cors(self):
        status,result,headers=self.request('/health',headers={'Origin':'http://localhost:5173'})
        self.assertEqual(status,200);self.assertEqual(set(result['models_loaded']),{'soh','rul','charging','soc_calce','soc_vehicle','soc_tracking','driving'})
        self.assertEqual(headers['Access-Control-Allow-Origin'],'http://localhost:5173')
        self.assertEqual(self.request('/health',headers={'Origin':'https://untrusted.example'})[0],403)
        self.assertEqual(self.request('/api/models')[0],200)

    def test_soh_and_abstention(self):
        status,result,_=self.request('/api/soh',self.example('soh_request.json'))
        self.assertEqual(status,200);self.assertEqual(result['status'],'ok')
        self.assertGreater(result['soh_reference_pct'],0)
        result=self.request('/api/soh',self.example('insufficient_charge_request.json'))[1]
        self.assertIsNone(result['soh_reference_pct'])

    def test_rul_and_combined_prediction(self):
        status,result,_=self.request('/api/rul',self.example('rul_request.json'))
        self.assertEqual(status,200);self.assertEqual(result['status'],'ok')
        self.assertGreaterEqual(result['remaining_observed_cycles'],0)
        status,result,_=self.request('/api/assess',self.example('assess_request.json'))
        self.assertEqual(status,200);self.assertEqual(result['rul']['status'],'ok')
        self.assertEqual(result['rul']['health_source'],'predicted')
        future=self.example('assess_request.json');future['health_history'][-1]['observed_cycle_number']=201
        self.assertEqual(self.request('/api/assess',future)[0],400)

    def test_charging_constraints(self):
        payload=self.example('charging_request.json')
        status,result,_=self.request('/api/charging',payload)
        self.assertEqual(status,200);self.assertEqual(result['status'],'ok')
        self.assertLessEqual(max(result['recommendation'][k] for k in ['c1','c2','c3','c4']),6)
        payload['protocol']='CALCE_CS2'
        self.assertEqual(self.request('/api/charging',payload)[1]['status'],'unsupported_protocol')

    def test_soc_modes_and_domain_checks(self):
        for name in ['soc_calce_request.json','soc_vehicle_request.json','soc_tracking_request.json']:
            status,result,_=self.request('/api/soc',self.example(name))
            self.assertEqual(status,200);self.assertEqual(result['status'],'ok')
            self.assertGreaterEqual(result['soc_pct'],0);self.assertLessEqual(result['soc_pct'],100)
        payload=self.example('soc_vehicle_request.json');payload['protocol']='CALCE_CS2'
        self.assertEqual(self.request('/api/soc',payload)[1]['status'],'unsupported_protocol')
        payload=self.example('soc_vehicle_request.json');payload['observations']=payload['observations'][:5]
        self.assertEqual(self.request('/api/soc',payload)[1]['status'],'insufficient_history')

    def test_energy_range_and_vehicle_pipeline(self):
        status,result,_=self.request('/api/driving',self.example('driving_request.json'))
        self.assertEqual(status,200);self.assertEqual(result['status'],'ok')
        self.assertEqual(result['predictions']['next_60s']['unit'],'Wh')
        self.assertEqual(result['predictions']['next_km']['unit'],'Wh/km')
        status,result,_=self.request('/api/vehicle',self.example('vehicle_request.json'))
        self.assertEqual(status,200);self.assertEqual(result['soc']['status'],'ok');self.assertEqual(result['range']['status'],'ok')
        self.assertGreaterEqual(result['range']['estimated_range_km'],0)
        payload=self.example('vehicle_request.json');payload['soc_min_pct']=95
        self.assertEqual(self.request('/api/range',payload)[0],400)

    def test_bad_requests_and_size_limit(self):
        self.assertEqual(self.request('/api/rul',{})[0],400)
        self.assertEqual(self.request('/api/rul','{"x":NaN}')[0],400)
        self.assertEqual(self.request('/api/rul','{"x":1e400}')[0],400)
        self.assertEqual(self.request('/api/rul','broken')[0],400)
        self.assertEqual(self.request('/api/rul','{}',{'Content-Type':'text/plain'})[0],415)
        self.assertEqual(self.request('/api/rul','{}',{'Content-Length':str(MAX_BODY+1)})[0],413)
        self.assertEqual(self.request('/missing',{})[0],404)

if __name__=='__main__':unittest.main()
