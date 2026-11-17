import type { WKey } from './whatif'
import { NO_DATE } from './results'
import type { Coverage } from './routefit'

/** One plain sentence per analysis page, built from the numbers on the page. `action` offers a one-click lever to try (the page's what-if bar applies it). */
export type Insight = { text: string; action?: { label: string; key: WKey; value: number } }
const y1 = (y: number) => y.toFixed(1)

export function healthInsight(o: { calendarShare: number; idleH: number; capPct: number }): Insight {
  const cal = Math.round(o.calendarShare * 100)
  const rests = o.idleH >= 0.5 ? `, and the pack rests at its charge cap for about ${Number(o.idleH.toFixed(1))} h a day` : ''
  const lead = o.calendarShare >= 0.5 ? `Calendar ageing, the wear from time spent full and warm, is ${cal} % of the loss${rests}.` : `Cycling is ${100 - cal} % of the loss; calendar ageing is ${cal} %${rests}.`
  const tail = o.calendarShare >= 0.5 && o.capPct > 85 ? ' In this model a lower cap or a later start is where to look first.' : ''
  return { text: lead + tail, action: o.calendarShare >= 0.5 && o.capPct > 85 ? { label: 'Try an 80 % cap', key: 'soc_max_pct', value: 80 } : undefined }
}

export function replacementInsight(o: { p10: number | null; p50: number | null; p90: number | null; within: number }): Insight {
  if (o.p50 == null) return { text: `Fewer than half of the model's runs reach the replacement line within the forecast (${Math.round(o.within * 100)} % do), so there is no median date.` }
  const early = o.p10 == null ? '' : ` The earliest tenth are due by year ${y1(o.p10)}`
  const late = o.p90 == null ? ' and the latest tenth are still going after the forecast.' : ` and the latest by year ${y1(o.p90)}.`
  return { text: `Half of the runs reach the line by year ${y1(o.p50)}.${early || ' The earliest tenth are due soon'}${early ? late : '.'}` }
}

/** "One bus in ten is short by year 1.4, half by year 2.7, and nine in ten by year 6.8", from the years the 10th, 50th and 90th percentile runs drop below the route need. */
export function riskSentence(y: { tenth: number | null; half: number | null; most: number | null }): string {
  const marks: [string, string, number | null][] = [['one bus in ten is short', 'one in ten', y.tenth], ['half the buses are short', 'half', y.half], ['nine in ten buses are short', 'nine in ten', y.most]]
  const hit = marks.filter((m) => m[2] != null) as [string, string, number][]
  if (!hit.length) return 'Even the weakest runs stay long enough for it to the end of the forecast.'
  const when = (v: number) => (v < 0.05 ? 'from day one' : `by year ${y1(v)}`)
  const parts = hit.map(([full, short, v], i) => `${i === 0 ? full : short} ${when(v)}`)
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
  return `${text[0].toUpperCase()}${text.slice(1)}${hit.length < 3 ? '; the rest stay covered through the forecast' : ''}, on this route with its 20 % reserve.`
}

export function rangeInsight(o: { need: number; newKm: number; median: Coverage; cautious: Coverage; risk?: { tenth: number | null; half: number | null; most: number | null } }): Insight {
  if (o.median.kind === 'never') return { text: `Your route needs ${Math.round(o.need)} km with a 20 % reserve but a new pack gives ${Math.round(o.newKm)} km, so it falls short from day one.` }
  const med = o.median.kind === 'beyond' ? 'to the end of the forecast' : `until year ${y1(o.median.year ?? 0)}`
  const cau = o.risk ? riskSentence(o.risk) : o.cautious.kind === 'never' ? 'The cautious curve is already short.' : o.cautious.kind === 'beyond' ? 'The cautious curve covers it for the whole forecast too.' : `On the cautious curve: until year ${y1(o.cautious.year ?? 0)}.`
  return { text: `The median pack covers your route (${Math.round(o.need)} km with reserve) ${med}. ${cau}` }
}

export function costInsight(o: { perThousand: number; topInput: string | null; breakEven: number | null; target: number | null }): Insight {
  const base = `Each extra ₹1,000 per kWh adds ₹${o.perThousand.toFixed(2)} per km.`
  const top = o.topInput ? ` The input that moves cost most in the model's own test is ${o.topInput}.` : ''
  const be = o.breakEven != null && o.target != null ? ` To reach ₹${o.target.toFixed(2)} per km the pack would need to cost about ₹${Math.round(o.breakEven).toLocaleString('en-IN')} per kWh.` : ''
  return { text: base + top + be }
}
/** Cost against the replacement line. Cost per km only falls as the line is lowered, so the useful mark is the lowest line that still leaves enough range for the route. */
export function thresholdInsight(o: { curPct: number; optPct: number | null; hiPct: number; needKm: number; newKm: number; curCost: number; optCost: number | null }): Insight {
  const need = Math.round(o.needKm), at = (pct: number) => Math.round((o.newKm * pct) / 100)
  if (o.optPct == null) return { text: `Even at ${Math.round(o.hiPct)} % health this route is short of range (a new pack gives ${Math.round(o.newKm)} km, the route needs ${need} km with reserve), so a longer-range pack or a shorter route is the lever, not the replacement line.` }
  const opt = Math.round(o.optPct), cur = Math.round(o.curPct), diff = o.optCost == null ? null : Math.abs(o.optCost - o.curCost)
  const action = { label: `Try ${opt} %`, key: 'threshold' as WKey, value: o.optPct / 100 }
  if (opt === cur) return { text: `Replacing at ${cur} % is the lowest line that still covers your route: range at replacement is ${at(cur)} km against the ${need} km it needs.` }
  if (opt > cur) return { text: `At ${cur} % the pack would be down to ${at(cur)} km, short of the ${need} km your route needs.${diff != null ? ` Replacing at ${opt} % instead costs ₹${diff.toFixed(2)} more per km and keeps range at ${at(opt)} km.` : ''}`, action }
  return { text: `${cur} % is higher than your route needs. Replacing at ${opt} % instead saves ₹${(diff ?? 0).toFixed(2)} per km and still leaves ${at(opt)} km of range, above the ${need} km it needs.`, action }
}
export { NO_DATE }
