import { MAX_BYTES, number, escape as e, parseCSV, validatePayload, statusText, pathData } from './core.js';
import { guideView } from './explain.js';

const API = 'http://127.0.0.1:8000';
const pages = {
  guide: { title: 'Battery models, explained.', label: 'Project guide', icon: 'layers', eyebrow: 'EV BATTERY PROJECT · GUIDED DEMONSTRATION', description: 'Follow a recording from source data to prediction. Open an example and explain each decision along the way.' },
  vehicle: { title: 'Vehicle analysis', label: 'Vehicle', icon: 'dashboard', eyebrow: 'DRIVING & STORED ENERGY', description: 'Inspect a recording. Estimate the charge and energy available for your next drive.', endpoint: 'vehicle', example: 'vehicle', domain: 'TUM_BMW_I3' },
  health: { title: 'Battery health & life', label: 'Health & remaining life', icon: 'heart', eyebrow: 'DEGRADATION ANALYSIS', description: 'Understand recorded battery health and the cycles that may remain.', endpoint: 'assess', example: 'assess', domain: 'CALCE_CS2' },
  soc: { title: 'State of charge', label: 'State of charge', icon: 'battery', eyebrow: 'CHARGE ESTIMATION', description: 'Estimate charge from sensor history, with the right reference.', endpoint: 'soc', example: 'soc_tracking', domain: 'TUM_BMW_I3' },
  charging: { title: 'Charging study', label: 'Charging optimisation', icon: 'bolt', eyebrow: 'LFP CHARGING POLICIES', description: 'Compare tested charging policies under a peak-current limit.', endpoint: 'charging', example: 'charging', domain: 'ATTIA2020_LFP_10MIN' },
  models: { title: 'Model evidence', label: 'Model evidence', icon: 'layers', eyebrow: 'EVALUATION & SCOPE', description: 'Know the evidence behind each estimate—and where it ends.' }
};
const icons = { dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="m5 12 3-1 3 4 3-7 2 4h4"/>', battery: '<rect x="2" y="6" width="18" height="12" rx="3"/><path d="M22 10v4M7 10v4m6-4v4"/>', bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>', layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 18l9 5 9-5"/>', arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>', download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>' };
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.battery}</svg>`;
const states = Object.fromEntries(Object.keys(pages).map(key => [key, { payload: null, result: null, busy: false, error: '', source: '', example: pages[key].example, controller: null, revision: 0 }]));
let active = '', online = false, healthController;
const main = document.getElementById('workspace');
const announce = message => { document.getElementById('announcement').textContent = message; };

async function request(path, options = {}, timeout = 20000) {
  const controller = options.controller || new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${API}${path}`, { ...options, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request was cancelled or timed out. You can try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach the backend. Start backend/server.py, then retry.');
    throw error;
  } finally { clearTimeout(timer); }
}
async function checkConnection() {
  healthController?.abort(); healthController = new AbortController();
  const current = healthController;
  try {
    const health = await request('/health', { controller: healthController }, 6000); online = health.status === 'ok';
    if (current !== healthController) return;
    document.getElementById('connection-label').textContent = online ? 'Backend connected' : 'Backend unavailable';
    document.getElementById('connection-detail').textContent = `${health.models_loaded?.length || 0} model artifacts loaded`;
  } catch {
    if (current !== healthController) return;
    online = false; document.getElementById('connection-label').textContent = 'Backend unavailable';
    document.getElementById('connection-detail').textContent = 'Start the Python API and retry';
  }
  document.getElementById('connection-dot').classList.toggle('connected', online);
}
function heading(page) {
  return `<div class="page-heading ${active === 'guide' ? 'guide-heading' : ''}"><div><span class="eyebrow">${page.eyebrow}</span><h1>${page.title}</h1><p>${page.description}</p></div><div class="heading-actions">${!['guide', 'models'].includes(active) ? `<button class="button secondary" id="load-example" disabled>${icon('layers')} Run example</button><button class="button primary" id="analyse" disabled>${icon('bolt')} <span>Run analysis</span></button>` : '<span class="badge">7 artifacts · 8 estimators</span>'}</div></div>`;
}
function numericField(id, label, value, help, min, max, step = '.1') {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" data-field="${id}" type="number" step="${step}" min="${min}" max="${max}" value="${e(value ?? '')}" aria-describedby="${id}-help ${id}-error"><small id="${id}-help">${help}</small><span id="${id}-error" class="field-error"></span></div>`;
}
function inputs() {
  const state = states[active], p = state.payload || {}, page = pages[active];
  const records = p.observations || p.measurements || [];
  let fields = '';
  if (active === 'vehicle') fields = numericField('usable_capacity_kwh', 'Usable capacity (kWh)', p.usable_capacity_kwh, 'Capacity matching the SOC window below', .01, 100) + numericField('soc_min_pct', 'SOC window minimum (%)', p.soc_min_pct, 'Physical BMS SOC at the usable lower limit', 0, 99) + numericField('soc_max_pct', 'SOC window maximum (%)', p.soc_max_pct, 'Physical BMS SOC at the usable upper limit', 1, 100) + numericField('reserve_usable_soc_pct', 'Usable-energy reserve (%)', p.reserve_usable_soc_pct ?? 10, 'Reserve after normalising the physical SOC window', 0, 99) + numericField('initial_soc_pct', 'Known starting SOC (%)', p.initial_soc_pct, 'Optional; refers to the first supplied observation', 0, 100);
  if (active === 'health') fields = `<div class="field"><label for="health-mode">Analysis mode</label><select id="health-mode"><option value="assess" ${state.endpoint === 'assess' || !state.endpoint ? 'selected' : ''}>Health + remaining life</option><option value="soh" ${state.endpoint === 'soh' ? 'selected' : ''}>Health from charging</option><option value="rul" ${state.endpoint === 'rul' ? 'selected' : ''}>Life from health history</option></select><small>Use a complete request for the selected mode</small></div>` + numericField('observed_cycle_number', 'Current recorded cycle', p.observed_cycle_number, 'Current charging session, after the reference', 1, 100000, '1') + numericField('elapsed_days', 'Elapsed days', p.elapsed_days, 'Age since the recorded experiment began', 0, 100000) + `<div class="field"><label for="discharge_c_rate">Discharge rate</label><select id="discharge_c_rate" data-field="discharge_c_rate"><option value="0.5" ${p.discharge_c_rate === .5 ? 'selected' : ''}>0.5 C</option><option value="1" ${p.discharge_c_rate === 1 ? 'selected' : ''}>1 C</option></select><small>Source-study conditions only</small></div>`;
  if (active === 'soc') fields = `<div class="field"><label for="soc-mode">Reference & method</label><select id="soc-mode"><option value="soc_tracking" ${state.example === 'soc_tracking' ? 'selected' : ''}>BMW i3 · known starting SOC</option><option value="soc_vehicle" ${state.example === 'soc_vehicle' ? 'selected' : ''}>BMW i3 · sensors only</option><option value="soc_calce" ${state.example === 'soc_calce' ? 'selected' : ''}>CALCE NMC · 25°C laboratory</option></select><small>Changing method clears incompatible input</small></div>` + (state.example === 'soc_tracking' ? numericField('initial_soc_pct', 'Known starting SOC (%)', p.initial_soc_pct, 'Required; refers to the first supplied observation', 0, 100) : '');
  if (active === 'charging') fields = numericField('max_c_rate', 'Peak current limit (C)', p.max_c_rate ?? 6, 'Each stage must stay at or below this limit', .01, 8) + `<div class="field"><label for="selection">Rank policies by</label><select id="selection" data-field="selection"><option value="observed_mean" ${p.selection !== 'model_prediction' ? 'selected' : ''}>Measured replicate mean</option><option value="model_prediction" ${p.selection === 'model_prediction' ? 'selected' : ''}>Fitted model prediction</option></select><small>Measured means are the default evidence</small></div>`;
  return `<section class="card inputs-panel" aria-labelledby="inputs-title"><div class="section-heading"><div><span class="eyebrow">ANALYSIS INPUTS</span><h2 id="inputs-title">${active === 'charging' ? 'Policy constraints' : 'Recording & parameters'}</h2></div><span class="domain-tag">${e(p.protocol || page.domain)}</span></div>
    <form id="input-form" novalidate><div class="fields-grid">${fields}</div></form>
    ${active !== 'charging' ? `<div class="upload-area"><div>${icon('upload')}<strong>Bring your own measurements</strong><p>${active === 'health' ? 'JSON request · includes the initial charge and health history' : 'JSON request or CSV observations · use the documented field names'} · up to 5 MB</p></div><label class="button secondary file-label" for="data-file">Choose file</label><input type="file" id="data-file" accept="${active === 'health' ? '.json' : '.json,.csv'}" class="sr-only" aria-describedby="file-help"><span id="file-help" class="sr-only">Files are read locally and sent to the local API only when you run analysis.</span></div>` : '<p class="input-note">A123 LFP/graphite cells · 30°C ambient · fixed ten-minute 0–80% charge. These are laboratory policies, not charger controls.</p>'}
    <div class="source-line"><span><span class="source-dot"></span>${e(state.source || 'No measurements loaded')}${records.length ? ` · ${number(records.length, 0)} records` : ''}</span><div>${state.payload ? '<button class="text-button" id="clear-data">Clear input</button>' : ''}<button class="text-button" id="download-template">Download example request ↓</button></div></div>
    <details class="input-guide"><summary>Input requirements & data handling</summary><p>${active === 'health' ? 'For health: a completed CS2 charge covering 4.0–4.1 V, an earlier reference charge from the same cell, and age. For life: at least five chronological health observations. Upload the complete JSON request for the selected analysis mode.' : active === 'charging' ? 'Only the nine tested LFP policies are ranked. A low current limit can have no feasible tested policy. No recommendation is transferred to BMW or CALCE cells.' : 'Numeric fields: time_s, voltage_v, current_a, temperature_c. Vehicle driving also needs speed_kmh, ambient_temperature_c, heating_power_kw, elevation_m. Time must increase; positive current means charging. Do not bridge unknown sensor gaps.'}</p><p>No files or measurements are saved in browser storage. Keep source domains separate. Example inputs are demonstration cases, not unseen tests.</p></details>
  </section>`;
}
const valueFor = (result, key, field) => result?.[key]?.status === 'ok' ? result[key][field] : null;
function metric(label, value, unit, hint, symbol) {
  return `<article class="metric"><div class="metric-top"><span>${label}</span><span class="metric-symbol">${symbol}</span></div><div class="metric-value">${number(value)}<span>${unit}</span></div><p>${hint}</p></article>`;
}
function chargeGraphic(soc) {
  const segments = Array.from({ length: 24 }, (_, i) => `<rect x="${i % 8 * 36}" y="${Math.floor(i / 8) * 36}" width="29" height="29" rx="2" class="pack-cell ${soc !== null && i < Math.round(soc / 100 * 24) ? 'charged' : ''}"/>`).join('');
  return `<div class="charge-instrument" role="img" aria-label="${soc === null ? 'State of charge unavailable' : `Estimated state of charge ${number(soc)} percent`}. The diagram is a charge scale, not individual cell telemetry."><div class="instrument-top"><span>STATE OF CHARGE</span><span>${soc === null ? 'AWAITING INPUT' : 'ESTIMATED'}</span></div><div class="instrument-body"><div class="instrument-reading">${number(soc)}<span>%</span><small>physical SOC</small></div><svg class="pack-diagram" viewBox="0 0 460 270" aria-hidden="true"><path d="M30 205 175 266 448 151" class="dimension-line"/><path d="m30 198 0 14m145 48v12m273-128v14" class="dimension-line"/><g transform="matrix(1 .42 -1 .42 151 57)"><rect class="pack-floor" x="-14" y="-14" width="315" height="135" rx="5"/><path class="pack-edge" d="M-14 121v17h315v-17M301-14v152"/><rect class="pack-terminal" x="45" y="-28" width="22" height="14"/><rect class="pack-terminal" x="220" y="-28" width="22" height="14"/>${segments}<path d="M-6-6v10m0-10h10M293-6h-10m10 0v10M-6 113v-10m0 10h10M293 113h-10m10 0v-10" class="pack-screws"/></g></svg></div><div class="instrument-bottom"><span>0% <span class="charge-scale" aria-hidden="true"><span style="width:${soc === null ? 0 : Math.max(0, Math.min(100, soc))}%"></span></span> 100%</span><span>Illustrative charge scale</span></div></div>`;
}
function telemetryChart(records) {
  const key = states[active].chartKey || 'voltage_v'; const plot = pathData(records, key);
  const labels = { voltage_v: ['Voltage', 'V'], current_a: ['Current', 'A'], speed_kmh: ['Speed', 'km/h'] };
  const [label, unit] = labels[key];
  return `<section class="card chart-panel"><div class="section-heading"><div><span class="eyebrow">RECORDED TELEMETRY</span><h2>${label} trace</h2></div><select id="chart-signal" aria-label="Telemetry signal"><option value="voltage_v" ${key === 'voltage_v' ? 'selected' : ''}>Voltage</option><option value="current_a" ${key === 'current_a' ? 'selected' : ''}>Current</option>${records.some(r => Number.isFinite(r.speed_kmh)) ? `<option value="speed_kmh" ${key === 'speed_kmh' ? 'selected' : ''}>Speed</option>` : ''}</select></div>
    ${plot ? `<div class="chart-meta"><span><span class="legend-dot"></span>${label} <small>(${unit})</small></span><strong>${number(plot.last)} <small>${unit}</small></strong></div><svg class="telemetry-chart" viewBox="0 0 650 190" role="img" aria-label="${label} history from ${number(plot.start, 0)} to ${number(plot.end, 0)} seconds; minimum ${number(plot.min)}, maximum ${number(plot.max)} ${unit}"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--primary)" stop-opacity=".16"/><stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>${[30, 80, 130, 175].map(y => `<line x1="30" x2="635" y1="${y}" y2="${y}" class="grid-line"/>`).join('')}<path d="${plot.path} L635,175 L30,175Z" fill="url(#area)"/><path d="${plot.path}" class="chart-path"/></svg><div class="chart-axis"><span>${number(plot.start, 0)} s</span><span>Recorded time</span><span>${number(plot.end, 0)} s</span></div><p class="chart-note">Measured input, not a forecast. Min ${number(plot.min)} ${unit} · max ${number(plot.max)} ${unit}.</p>` : '<div class="empty-chart"><span>⌁</span><strong>Your readings will appear here.</strong><p>Load an example or upload measurements to see the trace.</p></div>'}</section>`;
}
function results() {
  const state = states[active], r = state.result, p = state.payload || {};
  if (active === 'vehicle') {
    const soc = valueFor(r, 'soc', 'soc_pct'), range = valueFor(r, 'range', 'estimated_range_km');
    const driving = r?.driving?.predictions;
    return `<div class="vehicle-board"><div class="overview-hero">${chargeGraphic(soc)}<div class="recording-label"><span>${e(state.source || 'No recording loaded')}</span><span>${p.initial_soc_pct !== undefined ? 'Calibrated current tracking' : 'Sensor-only estimate'}</span></div></div>
      <div class="metrics-grid">${metric('Conditional range', range, 'km', 'Assumes recent driving conditions continue', '↗')}${metric('Next-km consumption', driving?.next_km?.status === 'ok' ? driving.next_km.value : null, 'Wh/km', 'Forecast from the previous 60 seconds', '⌁')}${metric('Next-minute energy', driving?.next_60s?.status === 'ok' ? driving.next_60s.value : null, 'Wh', 'Net energy · recovery can be negative', 'ϟ')}${metric('Available energy', valueFor(r, 'range', 'available_energy_above_reserve_kwh'), 'kWh', 'After the configured usable-energy reserve', '▱')}</div>
      </div>${r ? '<div class="result-status">' + ['soc', 'driving', 'range'].filter(key => r[key]?.status !== 'ok').map(key => `<p class="notice">${e(key)}: ${e(statusText(r[key]?.status))}</p>`).join('') + Object.entries(driving || {}).filter(([, forecast]) => forecast.status !== 'ok').map(([key, forecast]) => `<p class="notice">${key === 'next_60s' ? 'Next-minute energy' : 'Next-km consumption'}: ${e(statusText(forecast.status))}</p>`).join('') + '</div>' : ''}
      <div class="analysis-grid">${telemetryChart(p.observations || [])}<section class="card context-panel"><span class="eyebrow">ESTIMATE REFERENCE</span><h2>Range assumptions</h2><p>Range depends on capacity, the physical SOC window and future driving conditions.</p><dl><div><dt>Source domain</dt><dd>BMW i3</dd></div><div><dt>SOC reference</dt><dd>Reported BMS</dd></div><div><dt>Reserve</dt><dd>${number(p.reserve_usable_soc_pct ?? 10, 0)}% usable energy</dd></div><div><dt>Data source</dt><dd>${state.source.startsWith('Example') ? 'Demonstration case' : p.observations ? 'Uploaded input' : 'Not loaded'}</dd></div></dl><a class="text-link" href="#models">Understand the models <span>→</span></a></section></div>`;
  }
  if (active === 'health') {
    const soh = r?.soh || (state.endpoint === 'soh' ? r : null), rul = r?.rul || (state.endpoint === 'rul' ? r : null);
    const life = ['ok', 'threshold_already_confirmed', 'estimated_threshold_crossing'].includes(rul?.status) ? rul.remaining_observed_cycles : null;
    const history = p.health_history || [];
    return `<div class="metrics-grid health-metrics">${metric('Reference battery health', soh?.status === 'ok' ? soh.soh_reference_pct : null, '%', 'Relative to first recorded valid capacity', '♡')}${metric('Remaining recorded life', life, 'cycles', 'Recorded groups to the confirmed 80% threshold', '↗')}${metric('Current recorded cycle', p.observed_cycle_number ?? history.at(-1)?.observed_cycle_number, '', 'Chronological experiment cycle group', '⌁')}</div><div class="analysis-grid">${telemetryChart(p.measurements || [])}<section class="card context-panel"><span class="eyebrow">CALCE LCO STUDY</span><h2>Experiment reference</h2><p>Initial reference charge and prior health observations matter. Life is expressed in recorded cycles, not years or kilometres.</p><dl><div><dt>Reference charge</dt><dd>${number(p.reference_measurements?.length, 0)} readings</dd></div><div><dt>Health history</dt><dd>${number(history.length, 0)} observations</dd></div><div><dt>SOH result</dt><dd>${e(soh?.status === 'ok' ? 'Estimated' : statusText(soh?.status))}</dd></div><div><dt>Life result</dt><dd>${e(rul?.status === 'ok' ? 'Estimated' : statusText(rul?.status))}</dd></div></dl><p class="input-note">Rare large health errors remain; the life model’s development MAE is about 37 recorded cycles.</p></section></div>`;
  }
  if (active === 'soc') return `<div class="soc-layout">${chargeGraphic(r?.status === 'ok' ? r.soc_pct : null)}<section class="card soc-explainer"><span class="eyebrow">ESTIMATION METHOD</span><h2>SOC reference & method</h2><p>Known-starting-SOC tracking and sensor-only estimation are different tasks, with different input requirements.</p><div class="method-note"><strong>${e(p.protocol === 'CALCE_NMC_25C' ? 'CALCE lab · coulomb-derived reference' : p.initial_soc_pct !== undefined ? 'BMW i3 · calibrated current tracking' : 'BMW i3 · sensor-only estimate')}</strong><p>${e(r?.status === 'ok' ? r.reference : statusText(r?.status))}</p></div><p class="input-note">Tracking needs uninterrupted current history. Sensor estimates need 30 seconds of recent history. Results use source-specific SOC references.</p></section></div>${telemetryChart(p.observations || [])}`;
  if (active === 'charging') {
    const rec = r?.status === 'ok' ? r.recommendation : null, policies = r?.feasible_protocols || [];
    return `<div class="charging-hero"><div><span class="eyebrow">TESTED POLICY RECOMMENDATION</span><h2>${rec ? e(rec.protocol_id.replace('protocol_', 'Policy ')) : 'Find a tested policy.'}</h2><p>${rec ? `Ranked by ${p.selection === 'model_prediction' ? 'fitted prediction' : 'measured replicate mean'}. ${policies.length} tested policies fit your limit.` : 'Choose a peak current limit and run the study comparison.'}</p></div><div><strong>${number(rec?.observed_mean_life_cycles, 0)}</strong><span>measured mean study cycles</span><small>${rec ? `5 replicate cells · standard deviation ${number(rec.observed_std_life_cycles, 0)} cycles` : 'Source measurements, not a guarantee'}</small></div></div>
    ${r && r.status !== 'ok' ? `<div class="notice">${e(statusText(r.status))}. Try a higher limit; the optimiser cannot invent an untested policy.</div>` : ''}
    <section class="card"><div class="section-heading"><div><span class="eyebrow">0–80% SOC · TEN MINUTES</span><h2>Charge sequence</h2></div><span class="badge">LFP research domain</span></div><div class="stage-grid">${[1, 2, 3, 4].map((n, i) => `<div class="charge-stage"><span>STAGE ${n}</span><strong>${number(rec?.['c' + n], 2)} <small>C</small></strong><p>${i * 20}–${n * 20}% SOC</p><div class="stage-track"><span style="width:${rec ? rec['c' + n] / 8 * 100 : 0}%"></span></div></div>`).join('')}</div><p class="input-note">The source study then used a fixed 80–100% tail: 1C CC–CV at 3.6 V, ending at C/20. No hardware control or personalised EV charging gain is implied.</p></section>
    <section class="card policy-table"><div class="section-heading"><div><span class="eyebrow">ELIGIBLE STUDY POLICIES</span><h2>Eligible policies</h2></div><span class="domain-tag">${policies.length} of 9 tested policies</span></div><div class="table-scroll"><table><caption class="sr-only">All feasible tested policies and their measured lifetime variation</caption><thead><tr><th scope="col">Policy</th><th scope="col">Measured mean</th><th scope="col">Measured min–max</th><th scope="col">Model estimate</th><th scope="col">Stage rates (C)</th></tr></thead><tbody>${policies.length ? policies.map((v, i) => `<tr><th scope="row">${e(v.protocol_id.replace('protocol_', 'Policy '))}${i === 0 ? '<span class="tiny-badge">Selected</span>' : ''}</th><td>${number(v.observed_mean_life_cycles, 0)} cycles</td><td>${number(v.observed_min_life_cycles, 0)}–${number(v.observed_max_life_cycles, 0)}</td><td>${number(v.predicted_life_cycles, 0)}</td><td>${[1, 2, 3, 4].map(n => number(v['c' + n], 2)).join(' / ')}</td></tr>`).join('') : '<tr><td colspan="5" class="table-empty">Run an analysis to see feasible tested policies.</td></tr>'}</tbody></table></div></section>`;
  }
  return '';
}
function evidence() {
  const list = [['Battery health', 'CALCE LCO · six cells', '1.017 pp', 'Development battery CV · accepted runtime cohort. Rare errors up to 33.86 pp.'], ['Remaining life', 'CALCE LCO · six cells', '37.23 cycles', 'Development battery CV · recorded cycle groups to the confirmed threshold.'], ['Charging policy', 'A123 LFP · nine protocols', '112.77 cycles', 'Held-protocol development CV · five replicates per policy.'], ['Lab SOC', 'SP20-2 NMC · 25°C', '0.667 pp', 'Held BJDST profile · coulomb-derived reference for one laboratory cell.'], ['Vehicle sensor SOC', 'BMW i3 · unknown initial SOC', '4.271 pp', 'Held recording days · source BMS reference. Larger errors near 20 pp remain.'], ['Vehicle SOC tracking', 'BMW i3 · known initial SOC', '0.098 pp', 'Held recording days · correct starting SOC and continuous current required.'], ['Next-minute energy', 'BMW i3 · driving telemetry', '66.77 Wh', 'Held recording days · recent-rate baseline 72.05 Wh.'], ['Next-km consumption', 'BMW i3 · driving telemetry', '50.35 Wh/km', 'Held recording days · recent-rate baseline 93.61 Wh/km.']];
  return `<div class="evidence-intro"><span class="note-symbol">↗</span><div><h2>Evaluation record</h2><p>The models use different source cells and conditions. A low mean error is not a guarantee for every prediction. Percentage points (pp) describe SOC and SOH error.</p></div></div><div class="evidence-grid">${list.map(([title, domain, error, detail]) => `<article class="card evidence-card"><span class="eyebrow">${domain}</span><h2>${title}</h2><strong>${error}</strong><small>mean absolute error</small><p>${detail}</p></article>`).join('')}</div><section class="card"><h2>What these results support</h2><p>Vehicle splits keep entire recording days together: 48 trips train, 7 validate, 15 test. Lab SOC uses FUDS/DST for training, US06 for validation and BJDST for testing. SOH/RUL/charging are development evaluations. The original battery holdout has already been consumed.</p><p>Range combines SOC, predicted consumption and configured usable energy. It has no independent full-depletion range labels, so no kilometre-range MAE is claimed. Unsupported inputs receive no estimate. Charging policies are not transferred between chemistries.</p><p class="input-note">Python 3.10 migration retained telemetry selections and splits. This workspace uses the rebuilt active models. These example inputs are demonstrations, not unseen tests.</p><button class="button secondary" id="load-models">Read live model requirements ${icon('arrow')}</button><pre id="model-requirements" class="response-code" hidden></pre></section>`;
}
function render({ focus = false } = {}) {
  const focusedId = document.activeElement?.id;
  const state = states[active], page = pages[active];
  document.title = `${page.title} · Cellwise`;
  document.getElementById('crumb').textContent = page.title;
  document.getElementById('navigation').innerHTML = Object.entries(pages).map(([key, item]) => `<a href="#${key}" ${active === key ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${item.label}</span>${active === key ? '<span class="nav-active-dot"></span>' : ''}</a>`).join('');
  main.innerHTML = heading(page) + (active === 'guide' ? guideView(state.study, state.stage) : active === 'models' ? evidence() : `<div id="feedback" role="status" aria-live="polite"></div><div id="results">${results()}</div>${inputs()}<div class="response-tools"><button class="button secondary" id="export-result" ${state.result ? '' : 'disabled'}>${icon('download')} Export analysis</button><details class="response-details"><summary>View complete API response</summary><pre id="raw-response" class="response-code">${state.result ? e(JSON.stringify(state.result, null, 2)) : 'Run an analysis to see the response.'}</pre></details></div>`);
  bind(); updateFeedback();
  if (focus) main.focus({ preventScroll: true });
  else if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
}
function updateFeedback() {
  if (['models', 'guide'].includes(active)) return;
  const state = states[active], feedback = document.getElementById('feedback');
  feedback.innerHTML = state.busy ? '<div class="notice pending"><span class="spinner" aria-hidden="true"></span> Analysing your inputs… <button id="cancel-analysis" class="text-button">Cancel</button></div>' : state.error ? `<div class="notice error">${e(state.error)} <button id="retry-analysis" class="text-button">Retry analysis</button></div>` : '';
  const run = document.getElementById('analyse');
  if (run) { run.disabled = state.busy || !state.payload; run.setAttribute('aria-busy', String(state.busy)); run.querySelector('span').textContent = state.busy ? 'Analysing…' : 'Run analysis'; }
  document.getElementById('load-example').disabled = state.busy;
  const cancel = document.getElementById('cancel-analysis'); if (cancel) cancel.onclick = () => { state.revision++; state.controller?.abort(); state.busy = false; state.error = ''; updateFeedback(); announce('Analysis cancelled. Inputs retained.'); };
  const retry = document.getElementById('retry-analysis'); if (retry) retry.onclick = analyse;
}
function invalidate() {
  const state = states[active]; state.revision++; state.controller?.abort(); state.busy = false; state.result = null; state.error = '';
  document.getElementById('results').innerHTML = results();
  document.getElementById('raw-response').textContent = 'Inputs changed. Run analysis to obtain a matching result.';
  document.getElementById('export-result').disabled = true;
  bindChart(); updateFeedback();
}
async function loadExample(run = true) {
  const key = active, state = states[key]; const revision = ++state.revision;
  state.controller?.abort(); state.busy = true; state.error = ''; updateFeedback();
  try {
    const response = await fetch(`examples/${state.example}_request.json`);
    if (!response.ok) throw new Error('The example file is missing. Use the frontend server from the project folder.');
    const payload = validatePayload(await response.json());
    if (revision !== state.revision) return;
    state.payload = payload; state.result = null; state.source = `Example · ${state.example === 'vehicle' ? 'BMW i3 / TripA01' : state.example === 'assess' || ['soh', 'rul'].includes(state.example) ? 'CALCE CS2_35' : state.example === 'charging' ? 'Attia LFP study' : state.example === 'soc_calce' ? 'CALCE FUDS' : 'BMW i3 / TripA01'}`;
    state.busy = false; if (active === key) render();
    if (run && active === key) await analyse();
  } catch (error) { if (revision === state.revision) { state.busy = false; state.error = error.message; if (active === key) updateFeedback(); } }
}
function fieldErrors(payload) {
  const errors = {};
  const finite = (key, min, max, required = true) => { const v = payload[key]; if ((v === undefined && required) || (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max))) errors[key] = `Enter a number from ${min} to ${max}.`; };
  if (active === 'vehicle') { finite('usable_capacity_kwh', .01, 100); finite('soc_min_pct', 0, 99); finite('soc_max_pct', 1, 100); finite('reserve_usable_soc_pct', 0, 99); if (payload.soc_min_pct >= payload.soc_max_pct) errors.soc_max_pct = 'The maximum must exceed the minimum SOC.'; }
  if (active === 'charging') finite('max_c_rate', .01, 8);
  if (active === 'soc' || active === 'vehicle') finite('initial_soc_pct', 0, 100, active === 'soc' && states.soc.example === 'soc_tracking');
  return errors;
}
async function analyse() {
  const key = active, state = states[key]; if (!state.payload || state.busy) return;
  for (const field of document.querySelectorAll('[data-field]')) { field.removeAttribute('aria-invalid'); const err = document.getElementById(`${field.id}-error`); if (err) err.textContent = ''; }
  const errors = fieldErrors(state.payload);
  if (Object.keys(errors).length) {
    for (const [key, message] of Object.entries(errors)) { const field = document.getElementById(key); field?.setAttribute('aria-invalid', 'true'); document.getElementById(`${key}-error`).textContent = message; }
    document.getElementById(Object.keys(errors)[0])?.focus(); announce('Correct the highlighted input before running analysis.'); return;
  }
  const revision = ++state.revision; state.controller = new AbortController(); state.busy = true; state.error = ''; state.result = null;
  document.getElementById('results').innerHTML = results(); bindChart(); document.getElementById('export-result').disabled = true; document.getElementById('raw-response').textContent = 'Analysis pending.'; updateFeedback();
  try {
    const body = JSON.stringify(validatePayload(state.payload));
    const result = await request(`/api/${state.endpoint || pages[key].endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, controller: state.controller });
    if (revision !== state.revision) return;
    state.result = result; state.busy = false; if (active === key) { render(); announce('Analysis complete. Results updated.'); }
    await checkConnection();
  } catch (error) {
    if (revision !== state.revision) return;
    state.busy = false; state.error = error.message; if (active === key) { updateFeedback(); announce(error.message); }
  }
}
async function importFile(file) {
  if (!file) return; const key = active, state = states[key];
  const revision = ++state.revision; state.controller?.abort(); state.busy = false;
  try {
    if (!file.size || file.size > MAX_BYTES) throw new Error('Choose a nonempty JSON or CSV file up to 5 MB.');
    const extension = file.name.split('.').at(-1).toLowerCase();
    if (!['json', 'csv'].includes(extension) || (key === 'health' && extension !== 'json')) throw new Error('This analysis requires a complete JSON request file.');
    const text = await file.text();
    let payload;
    if (extension === 'json') payload = JSON.parse(text);
    else {
      payload = { ...(state.payload || {}), protocol: state.example === 'soc_calce' ? 'CALCE_NMC_25C' : 'TUM_BMW_I3', observations: parseCSV(text) };
      // A seed from the example cannot initialise a different uploaded recording.
      delete payload.initial_soc_pct;
    }
    validatePayload(payload);
    const expectedDomain = key === 'soc' ? state.example === 'soc_calce' ? 'CALCE_NMC_25C' : 'TUM_BMW_I3' : pages[key].domain;
    if (payload.protocol !== expectedDomain) throw new Error(`Use ${expectedDomain} inputs for this analysis. Choose the matching SOC method if needed.`);
    if (key === 'soc' && state.example === 'soc_vehicle' && payload.initial_soc_pct !== undefined) throw new Error('This request includes a starting SOC. Select the known-starting-SOC method, or remove initial_soc_pct for sensors-only estimation.');
    if (revision !== state.revision) return;
    state.payload = payload; state.result = null; state.error = ''; state.source = file.name;
    if (active === key) { render(); announce(`Loaded ${file.name}. Check the settings, then run analysis.`); }
  } catch (error) { if (revision === state.revision) { state.error = error instanceof SyntaxError ? 'The JSON is invalid. Upload a complete, valid request object.' : error.message; if (active === key) updateFeedback(); } }
}
function download(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function bindChart() {
  const control = document.getElementById('chart-signal'); if (control) control.onchange = () => { states[active].chartKey = control.value; document.getElementById('results').innerHTML = results(); bindChart(); document.getElementById('chart-signal')?.focus(); };
}
async function openStudy(key) {
  const state = states[key];
  state.revision++; state.controller?.abort();
  Object.assign(state, { payload: null, result: null, error: '', source: '', busy: false, example: pages[key].example });
  if (key === 'health') state.endpoint = 'assess';
  location.hash = key; navigate();
  await loadExample(false);
  if (active === key && state.payload) {
    document.getElementById('analyse').focus({ preventScroll: true });
    announce('Recorded example loaded. Inspect its inputs, then run analysis.');
  }
}
function bind() {
  if (active === 'guide') {
    const state = states.guide;
    document.querySelectorAll('[data-study], [data-guide-step]').forEach(button => {
      button.disabled = false;
      button.onclick = () => {
        const study = button.dataset.study, stage = button.dataset.guideStep;
        if (study) { state.study = study; state.stage = 0; }
        else state.stage = Number(stage);
        render();
        document.querySelector(study ? `[data-study="${study}"]` : `[data-guide-step="${stage}"]`).focus();
      };
    });
    const open = document.getElementById('open-study');
    open.disabled = false;
    open.onclick = () => openStudy(state.study || 'vehicle');
    return;
  }
  if (active === 'models') {
    document.getElementById('load-models').onclick = async () => {
      const button = document.getElementById('load-models'), panel = document.getElementById('model-requirements'); button.disabled = true;
      panel.hidden = false; panel.textContent = 'Loading model requirements…';
      try { panel.textContent = JSON.stringify(await request('/api/models'), null, 2); } catch (err) { panel.textContent = err.message; } finally { button.disabled = false; }
    }; return;
  }
  const state = states[active];
  document.getElementById('load-example').onclick = () => loadExample();
  document.getElementById('analyse').onclick = analyse;
  document.getElementById('input-form').onsubmit = event => { event.preventDefault(); analyse(); };
  document.querySelectorAll('[data-field]').forEach(field => { field.oninput = () => { if (!state.payload && active === 'charging') state.payload = { protocol: pages.charging.domain, max_c_rate: 6, selection: 'observed_mean' }; if (!state.payload) return; if (field.value === '') delete state.payload[field.dataset.field]; else state.payload[field.dataset.field] = field.id === 'selection' ? field.value : Number(field.value); invalidate(); }; });
  const file = document.getElementById('data-file'); if (file) file.onchange = () => importFile(file.files[0]);
  const clear = document.getElementById('clear-data'); if (clear) clear.onclick = () => { state.revision++; state.controller?.abort(); Object.assign(state, { payload: null, result: null, source: '', error: '', busy: false }); render(); document.getElementById('load-example')?.focus(); announce('Inputs cleared.'); };
  document.getElementById('download-template').onclick = async () => { try { const response = await fetch(`examples/${state.example}_request.json`); if (!response.ok) throw new Error('The example file is unavailable.'); download(await response.json(), `${state.example}_request.json`); } catch (error) { state.error = error.message; updateFeedback(); } };
  document.getElementById('export-result').onclick = () => { if (state.result) download({ analysis: pages[active].title, source: state.source, protocol: state.payload.protocol, settings: Object.fromEntries(Object.entries(state.payload).filter(([, value]) => !Array.isArray(value))), generated_at: new Date().toISOString(), result: state.result }, 'cellwise-analysis.json'); };
  const mode = document.getElementById('soc-mode') || document.getElementById('health-mode');
  if (mode) mode.onchange = () => { state.revision++; state.controller?.abort(); state.example = mode.value; if (active === 'health') state.endpoint = mode.value; state.payload = null; state.result = null; state.source = ''; state.error = ''; state.busy = false; render(); document.getElementById(mode.id)?.focus(); announce('Analysis method changed. Load matching example data or a request file.'); };
  bindChart();
}
function navigate() {
  const key = location.hash.slice(1) || 'guide';
  if (!pages[key]) { location.replace('#guide'); return; }
  if (active && active !== key) { const old = states[active]; old.revision++; old.controller?.abort(); old.busy = false; }
  const changed = active !== key; active = key; render({ focus: changed && Boolean(location.hash) });
}
document.getElementById('reconnect').onclick = checkConnection;
document.getElementById('reconnect').disabled = false;
window.addEventListener('hashchange', navigate);
window.addEventListener('online', checkConnection);
window.addEventListener('offline', checkConnection);
navigate(); checkConnection();
if (active === 'vehicle') loadExample();
