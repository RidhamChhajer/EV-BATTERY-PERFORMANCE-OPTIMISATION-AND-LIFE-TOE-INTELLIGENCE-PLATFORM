"""Research ranking of the tested Attia 2020 protocols; never control battery hardware."""
import math

FEATURES=['c1','c2','c3','c4']
PROTOCOL='ATTIA2020_LFP_10MIN'

def fourth_rate(c1,c2,c3):
    rates=[float(c) for c in (c1,c2,c3)]
    if not all(math.isfinite(c) and c>0 for c in rates):
        raise ValueError('C-rates must be finite and positive.')
    remaining=1/6-sum(.2/c for c in rates)
    if remaining<=0:
        raise ValueError('These rates cannot complete the first 80% SOC in ten minutes.')
    return .2/remaining

def optimise_charging(bundle,protocol,max_c_rate,selection='observed_mean'):
    if protocol!=PROTOCOL:
        return {'status':'unsupported_protocol','recommendation':None}
    if selection not in ('observed_mean','model_prediction'):
        raise ValueError('selection must be observed_mean or model_prediction.')
    limit=float(max_c_rate)
    if not math.isfinite(limit) or limit<=0 or limit>8:
        raise ValueError('max_c_rate must be positive and no larger than the study maximum of 8.')
    feasible=[dict(r) for r in bundle['tested_protocols'] if max(r[f] for f in FEATURES)<=limit+1e-8]
    if not feasible:
        return {'status':'no_tested_feasible_protocol','recommendation':None,'max_c_rate':limit}
    key='observed_mean_life_cycles' if selection=='observed_mean' else 'predicted_life_cycles'
    ranked=sorted(feasible,key=lambda r:r[key],reverse=True)
    best=ranked[0]
    durations=[60*.2/best[f] for f in FEATURES]
    assert abs(sum(durations)-10)<1e-6
    return {'status':'ok','selection':selection,'recommendation':best,'feasible_protocols':ranked,
            'stage_soc_windows_pct':[[0,20],[20,40],[40,60],[60,80]],'stage_minutes':durations,
            'study_conditions':{'cell':'A123 APR18650M1A LFP/graphite','nominal_capacity_ah':1.1,'ambient_temperature_c':30,'upper_voltage_v':3.6,
                                'fixed_tail':'After 0–80% and a five-second rest, 1C CC-CV to 100% at 3.6 V with C/20 cutoff; study discharge was 4C.'},
            'scope':'Attia 2020 study LFP cells and fixed 0–80% ten-minute protocol only; not CALCE LCO or an EV controller',
            'limitations':['All candidates share the same nominal ten-minute 0–80% charge; this does not optimise charging time.',
                           'Observed means are retrospective on five cells per protocol; their ranking is not a prospective guarantee.',
                           'No personalised lifetime gain, temperature prediction, voltage validation or pack-level safety claim.']}
