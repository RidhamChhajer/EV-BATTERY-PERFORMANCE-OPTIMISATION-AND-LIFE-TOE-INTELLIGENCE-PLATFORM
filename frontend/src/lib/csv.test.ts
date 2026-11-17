import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Scenario } from '../api/types'
import { deriveFromCsv, parseCsv } from './csv'
import { FIX } from '../test/utils'

const base = { ...(FIX.presets.presets[0].scenario as unknown as Scenario), battery_cost_per_kwh_inr: 12000 }
const sample = readFileSync(resolve(process.cwd(), 'public/samples/sample-fleet-duty-ILLUSTRATIVE.csv'), 'utf8')
const get = (r: ReturnType<typeof deriveFromCsv>, k: string) => r.derived.find((d) => d.key === k)?.value

describe('csv import', () => {
  it('parses quoted cells and both line endings', () => {
    expect(parseCsv('a,b\r\n"x,1","y ""q"""\n')).toEqual([['a', 'b'], ['x,1', 'y "q"']])
  })
  it('derives believable values from the illustrative sample file', () => {
    const r = deriveFromCsv(sample, base)
    expect(r.errors).toEqual([])
    expect(r.rows).toBeGreaterThan(60)
    expect(get(r, 'km_per_day')).toBeGreaterThan(170); expect(get(r, 'km_per_day')).toBeLessThan(215)
    expect(get(r, 'soc_max_pct')).toBeGreaterThanOrEqual(97)
    expect(get(r, 'soc_min_pct')).toBeLessThan(40)
    expect(get(r, 'charge_start_hour')).toBeGreaterThanOrEqual(22)          // evenings, not wrapped to midday
    expect(get(r, 'departure_hour')).toBeGreaterThan(4); expect(get(r, 'departure_hour')).toBeLessThan(6.5)
    expect(get(r, 'charge_power_kw')).toBeGreaterThan(80); expect(get(r, 'charge_power_kw')).toBeLessThan(140)
    expect(get(r, 'kwh_per_km')).toBeGreaterThan(1.0); expect(get(r, 'kwh_per_km')).toBeLessThan(1.5)
    expect(get(r, 'operating_days_per_year')).toBeGreaterThan(250); expect(get(r, 'operating_days_per_year')).toBeLessThanOrEqual(366)
  })
  it('only needs a km column and fills what it can', () => {
    const r = deriveFromCsv('km\n200\n180\n220\n', base)
    expect(r.errors).toEqual([]); expect(r.derived.map((d) => d.key)).toEqual(['km_per_day']); expect(get(r, 'km_per_day')).toBe(200)
  })
  it('averages clock times across midnight, not noon', () => {
    const r = deriveFromCsv('km,charge_start\n200,23:30\n200,00:30\n', base)
    expect(get(r, 'charge_start_hour')).toBeCloseTo(0, 0)
  })
  it('refuses a file without km, an empty file and an oversized one', () => {
    expect(deriveFromCsv('date,x\n2025-01-01,1\n', base).errors[0]).toMatch(/km/)
    expect(deriveFromCsv('', base).errors[0]).toMatch(/header/)
    expect(deriveFromCsv('km\n' + '1\n'.repeat(600000), base).errors[0]).toMatch(/1 MB/)
  })
  it('skips derived values the model would reject, and says why', () => {
    const r = deriveFromCsv('km,end_soc_pct,arrival_soc_pct\n200,30,25\n', base)
    expect(r.derived.find((d) => d.key === 'soc_max_pct')).toBeUndefined()
    expect(r.skipped.join(' ')).toMatch(/Charge cap/)
  })
  it('ignores junk rows without crashing', () => {
    const r = deriveFromCsv('km,charge_start\nabc,xx\n200,22:00\n-5,99:99\n', base)
    expect(get(r, 'km_per_day')).toBe(200)
  })
})
