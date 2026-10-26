export const MAX_BYTES = 5_000_000;
export const number = (value, digits = 1) => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value) : '—';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell === '') quoted = !quoted;
      else throw new Error('A CSV quote must begin at the start of a field.');
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (c === '\n') { if (row.some(v => v !== '')) rows.push(row); row = []; }
    } else cell += c;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  row.push(cell.replace(/\r$/, '')); if (row.some(v => v !== '')) rows.push(row);
  if (rows.length < 2) throw new Error('Include column names and at least one data row.');
  const headers = rows.shift().map(v => v.trim());
  if (headers.some(v => !v) || new Set(headers).size !== headers.length) throw new Error('CSV column names must be nonempty and unique.');
  if (rows.length > 20000) throw new Error('Use at most 20,000 measurement rows.');
  return rows.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${i + 2} has a different number of columns.`);
    return Object.fromEntries(headers.map((name, j) => {
      const raw = values[j].trim(); const value = raw === '' ? null : Number(raw);
      return [name, raw === '' ? null : Number.isFinite(value) ? value : raw];
    }));
  });
}
export function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Upload a JSON request object, not a list of records.');
  function finite(value) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Measurements must contain finite numbers.');
    if (value && typeof value === 'object') Object.values(value).forEach(finite);
  }
  finite(payload);
  if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_BYTES) throw new Error('The request exceeds the API limit of 5 MB.');
  for (const key of ['observations', 'measurements', 'reference_measurements', 'health_history']) {
    if (payload[key] !== undefined && (!Array.isArray(payload[key]) || !payload[key].length || payload[key].length > (key === 'health_history' ? 5000 : 20000))) throw new Error(`${key} must contain a nonempty, supported number of records.`);
  }
  return payload;
}
export function statusText(status) {
  const labels = { outside_training_range: 'Outside the supported training range', insufficient_history: 'More measurement history is needed', unsupported_protocol: 'This battery domain is not supported', voltage_window_not_observed: 'The charge does not cover the required voltage window', charge_not_completed: 'A completed charging session is needed', missing_initial_charge_reference: 'An initial reference charge is needed', soh_unavailable: 'Battery health is unavailable', consumption_unavailable: 'Consumption is unavailable', nonpositive_consumption: 'Net recovery: a finite range cannot be estimated', no_tested_feasible_protocol: 'No tested protocol fits this current limit', stationary_charging_detected: 'Driving estimates are unavailable during stationary charging', threshold_already_confirmed: 'The measured life threshold has been confirmed', estimated_threshold_crossing: 'Estimated health suggests the life threshold was crossed' };
  return labels[status] || String(status || 'No result yet').replaceAll('_', ' ');
}
export function pathData(records, key, width = 650, height = 190) {
  const valid = records.filter(r => Number.isFinite(r.time_s ?? r.test_time_s) && Number.isFinite(r[key]));
  if (valid.length < 2) return null;
  const step = Math.max(1, Math.ceil(valid.length / 350));
  const points = valid.filter((_, i) => i % step === 0 || i === valid.length - 1);
  const start = valid[0].time_s ?? valid[0].test_time_s, end = valid.at(-1).time_s ?? valid.at(-1).test_time_s;
  const min = Math.min(...valid.map(r => r[key])), max = Math.max(...valid.map(r => r[key]));
  const pad = Math.max((max - min) * .15, .1), low = min - pad, high = max + pad;
  return { path: points.map((r, i) => `${i ? 'L' : 'M'}${(30 + ((r.time_s ?? r.test_time_s) - start) / Math.max(end - start, 1) * (width - 45)).toFixed(2)},${(15 + (high - r[key]) / (high - low) * (height - 40)).toFixed(2)}`).join(' '), start, end, min, max, last: valid.at(-1)[key], low, high };
}
