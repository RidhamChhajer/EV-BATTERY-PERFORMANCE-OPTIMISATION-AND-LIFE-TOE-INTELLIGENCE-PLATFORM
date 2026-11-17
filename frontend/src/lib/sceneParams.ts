import type { PredictionResult, Scenario } from '../api/types'
import { arr, atYear, num } from './format'
import type { DayParams } from './dayCycle'

/** What the 3D scene needs from a scenario and its prediction, in plain numbers. Everything is a model input or model output. */
export type SceneParams = {
  day: DayParams
  chargeKw: number
  zone: Scenario['zone']
  heatRiseC: number
  cellTempC: number[]          // 12 months, mean cell temperature
  kmPerDay: number
  rangeKm: number              // usable range of a full charge at the chosen year
  routeNeedKm: number | null   // daily route plus the 20 % reserve rule the recommender uses
  health: { lo: number; mid: number; hi: number }     // fractions at the chosen year
  calendarShare: number
  packTier: number             // 0.8..1.3, pack energy relative to the 350 kWh reference
  unfinishedCharge: boolean
}

/** `replacement` lets a page pass the replacement block it already shows numbers from (Optimise uses the paired comparison's), so the cells and the label can never disagree. */
export function buildSceneParams(s: Scenario, p: PredictionResult, year: number, routeNeedKm: number | null = null, replacement?: PredictionResult['replacement']): SceneParams {
  const c = p.conditions, r = replacement ?? p.replacement
  const energy = num(c.energy_per_day_kwh) ?? s.km_per_day * s.kwh_per_km
  const day: DayParams = { departure: s.departure_hour, chargeStart: s.charge_start_hour, chargeHours: num(c.charge_hours) ?? 2, socMin: s.soc_min_pct, socMax: s.soc_max_pct, energyKwh: energy, packKwh: s.pack_kwh }
  const at = (l: { value: number | number[] }) => atYear(Array.isArray(l.value) ? l.value : [l.value], year)
  const mid = at(r.retention_p50)
  const needH = s.charge_power_kw > 0 ? Math.max(energy, 0) / s.charge_power_kw : 0
  const window = ((24 - s.charge_start_hour + s.departure_hour) % 24 + 24) % 24
  return {
    day, chargeKw: s.charge_power_kw, zone: s.zone, heatRiseC: s.heat_rise_c,
    cellTempC: arr(c.monthly_cell_temp_c), kmPerDay: s.km_per_day,
    rangeKm: (num(p.range.new_pack_range_km) ?? 0) * mid, routeNeedKm: routeNeedKm ?? s.km_per_day * 1.2,
    health: { lo: at(r.retention_p10), mid, hi: at(r.retention_p90) },
    calendarShare: num(p.driver_split.calendar_share) ?? 0.5,
    packTier: Math.min(1.3, Math.max(0.8, s.pack_kwh / 350)),
    unfinishedCharge: needH > window + 1e-9,
  }
}
