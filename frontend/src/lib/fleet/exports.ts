import type { Series } from './forecast'
import { yearLabel } from './forecast'
import { BAND_LABEL, FLAG_LABEL, type Row } from './segments'
import { RANGE_LABEL } from './range'
import { UNASSIGNED } from './types'

/** Files out of the forecast. They are for reading in a spreadsheet, not for importing back (the roster CSV and the fleet file are the ways back in), so text that a spreadsheet
 *  would run as a formula is defused with a leading apostrophe. */
const cell = (v: string | number | null | undefined): string => {
  let t = v == null ? '' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : v
  if (/^[=+\-@\t\r]/.test(t) && typeof v === 'string') t = `'${t}`
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
const line = (a: (string | number | null | undefined)[]) => a.map(cell).join(',')
const r1 = (v: number | null) => (v == null ? '' : Math.round(v * 10) / 10)

/** One row per bus with the model's figures for its class and age. Months are from today, conditional on the bus still being in service. */
export function forecastCsv(rows: Row[], series: Series | null, asOf: string | null): string {
  const head = ['bus_id', 'depot', 'route', 'bus_type', 'in_service', 'duty_class', 'risk_band', 'months_to_line_p10', 'months_to_line_p50', 'months_to_line_p90', 'lands_in_financial_year', 'chance_due_next_12_months', 'range_status', 'range_short_from', 'route_needs_km', 'range_now_km', 'flags']
  const body = rows.map((r) => line([r.bus.id, r.bus.depot === UNASSIGNED ? '' : r.bus.depot, r.bus.route === UNASSIGNED ? '' : r.bus.route, r.cls.scenario.archetype, r.bus.inServiceMonth ?? '', r.cls.name,
    r.band ? BAND_LABEL[r.band] : '', r1(r.p10), r1(r.p50), r1(r.p90), r.band === 'past_median' ? 'now' : yearLabel(series, r.p50), r.due12 == null ? '' : Math.round(r.due12 * 1000) / 1000, r.range ? RANGE_LABEL[r.range.band] : '', r.range ? (r.range.band === 'covered' || r.range.band === 'unknown' ? '' : r.range.band === 'never' ? 'even when new' : r.range.months != null && r.range.months <= 0 ? 'now' : yearLabel(series, r.range.months)) : '', r.range ? Math.round(r.range.needKm) : '', r.range?.nowKm != null ? Math.round(r.range.nowKm) : '', r.flags.map((f) => FLAG_LABEL[f]).join('; ')]))
  return [`# Pack Horizon fleet forecast as of ${asOf ?? 'unknown'}. Prior mode, not yet validated on buses. Months are the model's median for the bus's class and age, given it is still in service.`, head.join(','), ...body].join('\n') + '\n'
}

/** Expected spend and buses by financial year, with the whole-fleet band. The running total has no band. */
export function budgetCsv(s: Series): string {
  const head = ['financial_year', 'months_in_period', 'expected_buses', 'buses_p10', 'buses_p90', ...(s.spend ? ['expected_spend_inr', 'spend_p10_inr', 'spend_p90_inr', 'running_total_inr_no_band'] : [])]
  let run = 0
  const body = s.labels.map((l, i) => line([l, Math.round((s.edges[i + 1] ?? 0) - (s.edges[i] ?? 0)), r1(s.buses[i]), s.busesP10[i], s.busesP90[i],
    ...(s.spend ? [Math.round(s.spend[i]), Math.round(s.spendP10?.[i] ?? 0), Math.round(s.spendP90?.[i] ?? 0), Math.round((run += s.spend[i]))] : [])]))
  return ['# Pack Horizon battery budget by financial year (April to March), first pack per bus, undiscounted. The band is for the whole fleet total. Prior mode, not yet validated on buses.', head.join(','), ...body].join('\n') + '\n'
}
