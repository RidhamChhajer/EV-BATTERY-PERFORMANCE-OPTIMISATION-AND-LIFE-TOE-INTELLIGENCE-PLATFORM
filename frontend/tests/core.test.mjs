import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, number, escape, validatePayload, pathData, statusText } from '../src/core.js';
import { guideView } from '../src/explain.js';

test('CSV quoted delimiters, escaped quotes and CRLF preserve measurements', () => {
  assert.deepEqual(parseCSV('\uFEFFtime_s,current_a,note\r\n0,-3,"one, two"\r\n1,2,"a ""quote"""\r\n'), [{ time_s: 0, current_a: -3, note: 'one, two' }, { time_s: 1, current_a: 2, note: 'a "quote"' }]);
});
test('CSV refuses malformed dimensions, duplicate headers and unclosed quotes', () => {
  for (const input of ['a,a\n1,2', 'a,b\n1', 'a,b\n1,"open', 'a,b\n']) assert.throws(() => parseCSV(input));
});
test('blank values remain missing and zero is retained', () => {
  assert.deepEqual(parseCSV('time_s,current_a\n0,\n1,0'), [{ time_s: 0, current_a: null }, { time_s: 1, current_a: 0 }]);
  assert.equal(number(0), '0.0'); assert.equal(number(null), '—'); assert.equal(number(Infinity), '—');
});
test('untrusted file content is escaped for markup', () => {
  assert.equal(escape('<img src=x onerror="bad">'), '&lt;img src=x onerror=&quot;bad&quot;&gt;');
});
test('request validation rejects nonfinite values and invalid row counts', () => {
  assert.throws(() => validatePayload({ observations: [] }));
  assert.throws(() => validatePayload({ observations: [{ voltage_v: Infinity }] }));
  assert.throws(() => validatePayload([]));
  assert.throws(() => validatePayload({ observations: Array(20001).fill({}) }));
});
test('trace represents the measured source and supports flat and signed signals', () => {
  const records = [{ time_s: 0, current_a: -2 }, { time_s: 10, current_a: -2 }];
  const plot = pathData(records, 'current_a');
  assert.equal(plot.min, -2); assert.equal(plot.last, -2); assert.equal(plot.end, 10);
  assert(!plot.path.includes('NaN')); assert.equal(pathData([], 'current_a'), null);
});
test('chart downsampling preserves the actual endpoint', () => {
  const plot = pathData(Array.from({ length: 20000 }, (_, i) => ({ time_s: i, voltage_v: i })), 'voltage_v');
  assert.equal(plot.last, 19999); assert.match(plot.path, /L635\.00,[\d.]+$/);
});
test('all example requests are valid JSON objects', () => {
  for (const name of ['vehicle', 'assess', 'soh', 'rul', 'charging', 'soc_calce', 'soc_vehicle', 'soc_tracking']) validatePayload(JSON.parse(readFileSync(new URL(`../../examples/${name}_request.json`, import.meta.url))));
});
test('runtime colors match the maintained design context', () => {
  const design = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');
  for (const match of design.matchAll(/^  ([a-z]+): "(#[a-f0-9]+)"$/gm)) assert(css.includes(`--${match[1]}: ${match[2]};`));
});
test('unavailable model statuses explain the boundary', () => {
  assert.match(statusText('outside_training_range'), /training range/);
  assert.match(statusText('nonpositive_consumption'), /cannot be estimated/);
});

test('the guide keeps source claims separate and labels PL data as comparison only', () => {
  assert.match(guideView('charging', 2), /nine tested policies/);
  assert.match(guideView('health', 3), /not a fresh independent test/);
  assert.match(guideView(), /PL11/);
});
