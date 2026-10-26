"""Measured charge-window features for the supplied CS2 constant-current protocol."""
import math

WINDOW = (4.0,4.05,4.1)

def extract_charge_window(records):
    required = ('test_time_s','voltage_v','current_a','charge_counter_ah','step_index')
    if any(not all(math.isfinite(float(r[k])) for k in required) for r in records):
        return {'status':'invalid_measurements'}
    first_discharge = min((float(r['test_time_s']) for r in records if float(r['current_a']) < -.01),default=math.inf)
    # shortcut: CS2 step 2 is the CC charging stage; map stages before supporting other protocols.
    cc = [r for r in records if int(r['step_index'])==2 and float(r['current_a'])>.01 and float(r['test_time_s'])<first_discharge]
    if len(cc)<3:
        return {'status':'insufficient_cc_profile'}
    t = [float(r['test_time_s']) for r in cc]
    v = [float(r['voltage_v']) for r in cc]
    q = [float(r['charge_counter_ah']) for r in cc]
    if any(b<=a for a,b in zip(t,t[1:])) or any(b<a-1e-8 for a,b in zip(q,q[1:])):
        return {'status':'time_or_counter_reset'}
    if v[0]>WINDOW[0] or max(v)<WINDOW[-1]:
        return {'status':'voltage_window_not_observed'}
    crossings = []
    for threshold in WINDOW:
        if v[0]==threshold:
            crossings.append((t[0],q[0],0.0))
            continue
        point = None
        for i in range(1,len(v)):
            if v[i-1]<=threshold<=v[i] and v[i]>v[i-1]:
                fraction = (threshold-v[i-1])/(v[i]-v[i-1])
                point = (t[i-1]+fraction*(t[i]-t[i-1]),q[i-1]+fraction*(q[i]-q[i-1]),t[i]-t[i-1])
                break
        if point is None:
            return {'status':'voltage_window_not_observed'}
        crossings.append(point)
    start,middle,end = crossings
    intervals = [b-a for a,b in zip(t,t[1:]) if a<=end[0] and b>=start[0]]
    max_interval = max(intervals,default=math.inf)
    duration = end[0]-start[0]
    low,high = middle[1]-start[1],end[1]-middle[1]
    # Require two sampling intervals of support and at most 4x nominal 30-second CC spacing.
    if max_interval>120 or duration<2*max_interval or low<=0 or high<=0:
        return {'status':'insufficient_sampling_resolution'}
    return {'status':'ok','cc_start_voltage_v':v[0],'window_low_charge_ah':low,'window_high_charge_ah':high,
            'window_duration_s':duration,'window_max_interval_s':max_interval}

def normalize_window(profile,reference):
    if profile['status']!='ok':
        return {'status':profile['status']}
    if reference['status']!='ok':
        return {'status':'missing_initial_charge_reference'}
    low = profile['window_low_charge_ah']/reference['window_low_charge_ah']
    high = profile['window_high_charge_ah']/reference['window_high_charge_ah']
    if not all(math.isfinite(x) and x>0 for x in (low,high)):
        return {'status':'invalid_reference'}
    return {'status':'ok','window_low_charge_ratio':low,'window_high_charge_ratio':high}
