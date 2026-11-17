import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { yearLabel, type Series } from '../../lib/fleet/forecast'
import { filterText, inFilter, type RangeFilter } from '../../lib/fleet/range'
import { editBuses, type BusPatch } from '../../lib/fleet/roster'
import { BAND_LABEL, GROUP_LABEL, groupRows, type Band, type GroupBy, type Row } from '../../lib/fleet/segments'
import { UNASSIGNED, type Bus, type Fleet, type FleetForecast } from '../../lib/fleet/types'
import { useScenario } from '../../state/ScenarioContext'
import { useFleet } from '../../state/FleetContext'
import { toast } from '../Toast'
import { useOpenBus } from './useOpenBus'

const PAGE = 100
const FIRST = 10
const monthLabel = (m?: string) => m ?? ''

/** A value that edits where it sits. Enter or leaving the cell saves, Escape cancels; an invalid value shows its reason and stays open. */
function EditCell({ value, label, placeholder, onCommit }: { value: string; label: string; placeholder?: string; onCommit: (v: string) => string | null }) {
  const [on, setOn] = useState(false)
  const [text, setText] = useState(value)
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (on) ref.current?.select() }, [on])
  const done = () => {
    if (text.trim() === value.trim()) { setOn(false); setErr(null); return }
    const e = onCommit(text)
    if (e) setErr(e); else { setOn(false); setErr(null) }
  }
  if (!on) return <button className="cell-b" aria-label={`${label}: ${value || 'not set'}. Edit`} onClick={() => { setText(value); setOn(true) }}>{value || <span className="dim">{placeholder ?? '—'}</span>}</button>
  return (
    <span className="cell-e">
      <input ref={ref} value={text} aria-label={label} aria-invalid={err != null} onChange={(e) => setText(e.target.value)} onBlur={done}
        onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { setOn(false); setErr(null) } }} />
      {err && <span className="err" role="alert">{err}</span>}
    </span>
  )
}

const FLAG_SHORT: Record<string, string> = { past_median_life: 'past median life', past_all_runs: 'past every model run', one_model_only: 'one model only', outside_lab_range: 'outside lab range' }
const GROUPS = Object.keys(GROUP_LABEL) as GroupBy[]
type SortKey = 'bus' | 'months' | 'cost' | 'range'
const sortMonths = (r: Row) => (r.band === 'past_median' ? -1 : r.p50)
const sortRange = (r: Row) => (r.range ? (r.range.band === 'covered' ? 1e9 : r.range.band === 'unknown' ? null : r.range.months) : null)

const flagsOf = (b: Bus, dutySource: string | undefined) => {
  const t: string[] = []
  if (!b.inServiceMonth) t.push('age unknown')
  if (dutySource === 'assumed') t.push('duty assumed')
  if (dutySource === 'inherited') t.push('duty from route')
  if (b.depot === UNASSIGNED) t.push('no depot')
  if (b.route === UNASSIGNED) t.push('no route')
  return t
}

type Props = { fleet: Fleet; rows: Row[]; forecast: FleetForecast | null; series: Series | null; stale: boolean; loading: boolean; band: Band | null; onBand: (b: Band | null) => void; rangeFilter: RangeFilter | null; onRangeFilter: (f: RangeFilter | null) => void }

export function RosterTable({ fleet, rows: all, forecast, series, stale, loading, band, onBand, rangeFilter, onRangeFilter }: Props) {
  const { setFleet, groupBy, setGroupBy } = useFleet()
  const { scenario } = useScenario()
  const open = useOpenBus()
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(FIRST)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState({ depot: '', route: '', month: '', duty: 'keep' })
  const [err, setErr] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>({ key: 'months', dir: 1 })
  const [grouped, setGrouped] = useState(false)
  const [openG, setOpenG] = useState<Set<string>>(new Set())
  const [more, setMore] = useState<Record<string, number>>({})
  const now = () => Date.now()
  const cls = useMemo(() => new Map(fleet.classes.map((c) => [c.id, c])), [fleet])
  const cost = useMemo(() => {
    const m = new Map<string, { v: number; battery: boolean }>()
    for (const c of forecast?.classes ?? []) {
      const t = c.total_cost_per_km_p50, b = c.battery_cost_per_km_p50
      if (t && !Array.isArray(t.value)) m.set(c.id, { v: t.value, battery: false })
      else if (b && !Array.isArray(b.value)) m.set(c.id, { v: b.value, battery: true })
    }
    return m
  }, [forecast])
  const batteryOnly = [...cost.values()].some((c) => c.battery)
  const costOf = (r: Row) => cost.get(r.bus.classId)?.v ?? null

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    let out = t ? all.filter((r) => `${r.bus.id} ${r.bus.depot} ${r.bus.route}`.toLowerCase().includes(t)) : all
    if (band) out = out.filter((r) => r.band === band)
    if (rangeFilter) out = out.filter((r) => inFilter(r.range?.band, rangeFilter, r.bus.classId))
    if (sort) {
      const val = (r: Row) => (sort.key === 'bus' ? r.bus.id : sort.key === 'months' ? sortMonths(r) : sort.key === 'range' ? sortRange(r) : costOf(r))
      out = [...out].sort((x, y) => {
        const a = val(x), b = val(y)
        if (a == null && b == null) return 0
        if (a == null) return 1                      // missing values go last in both directions
        if (b == null) return -1
        return (typeof a === 'string' ? a.localeCompare(b as string, undefined, { numeric: true }) : (a as number) - (b as number)) * sort.dir
      })
    }
    return out
  }, [all, q, band, rangeFilter, sort, cost]) // eslint-disable-line react-hooks/exhaustive-deps
  const grouping = grouped ? groupRows(rows, groupBy, forecast?.as_of ?? null) : null
  const shown = rows.slice(0, limit)
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.bus.id))
  const sid = useId()
  // a bus that is no longer in the fleet cannot stay selected
  useEffect(() => { setSel((s) => { const ids = new Set(fleet.buses.map((b) => b.id)); const n = new Set([...s].filter((x) => ids.has(x))); return n.size === s.size ? s : n }) }, [fleet])

  const apply = (ids: string[], patch: BusPatch): string | null => {
    const r = editBuses(fleet, ids, patch, now())
    if (!r.ok) return r.message ?? 'That change could not be made.'
    setFleet(r.fleet)
    return null
  }
  const applyBulk = () => {
    const patch: BusPatch = {}
    if (bulk.depot.trim()) patch.depot = bulk.depot
    if (bulk.route.trim()) patch.route = bulk.route
    if (bulk.month.trim()) patch.inServiceMonth = bulk.month
    if (bulk.duty === 'screen') patch.duty = { scenario, source: 'entered' }
    else if (bulk.duty.startsWith('class:')) { const c = cls.get(bulk.duty.slice(6)); if (c) patch.duty = { scenario: c.scenario, source: 'entered' } }
    if (!Object.keys(patch).length) { setErr('Choose something to change first.'); return }
    const e = apply([...sel], patch)
    if (e) { setErr(e); return }
    toast(`Updated ${sel.size} ${sel.size === 1 ? 'bus' : 'buses'}`)
    setErr(null); setSel(new Set()); setBulk({ depot: '', route: '', month: '', duty: 'keep' })
  }
  const sortBy = (key: SortKey) => setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))
  const aria = (key: SortKey) => (sort?.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none')
  // a plain function, not a component: a component defined here would be a new type on every render and would drop keyboard focus from the header button after each sort
  const sortTh = (k: SortKey, text: string, title?: string) => <th scope="col" aria-sort={aria(k)} title={title}><button className="th-b" onClick={() => sortBy(k)}>{text}<span aria-hidden="true">{sort?.key === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</span></button></th>

  const monthsCell = (r: Row) => {
    if (!r.cohort) return loading ? <span className="skel" style={{ display: 'inline-block', width: 40, height: 12 }} /> : <span className="dim">–</span>
    if (r.band === 'past_median') return <span title="The model’s median pack has already reached the line at this age">past median</span>
    if (r.p50 == null) return <span className="dim">{r.band === 'unknown' ? '–' : 'beyond 20 y'}</span>
    return <span title={r.p10 != null && r.p90 != null ? `10th to 90th percentile: ${Math.round(r.p10)} to ${Math.round(r.p90)} months` : r.p10 != null ? `10th percentile: ${Math.round(r.p10)} months` : undefined}>{Math.round(r.p50)}</span>
  }
  const rangeCell = (r: Row) => {
    const g = r.range
    if (!g) return <span className="dim">–</span>
    const tip = `Route needs ${Math.round(g.needKm)} km${g.nowKm != null ? `; a full charge gives about ${Math.round(g.nowKm)} km today` : ''}${g.early != null && g.band !== 'never' ? `. One pack in ten is short ${g.early <= 0 ? 'already' : `by ${yearLabel(series, g.early)}`}` : ''}`
    const txt = g.band === 'never' ? 'short even new' : g.band === 'now' ? 'now' : g.band === 'covered' ? 'covered' : g.band === 'unknown' ? <span className="dim">age unknown</span> : yearLabel(series, g.months).replace(/^FY/, 'FY ')
    return <span title={tip} style={{ color: g.band === 'never' || g.band === 'now' ? '#F87171' : g.band === 'within_12' ? '#FB923C' : undefined }}>{txt}</span>
  }
  const rowOf = (r: Row) => {
    const b = r.bus, c = cls.get(b.classId), k = costOf(r)
    return (
      <tr key={b.id} aria-selected={sel.has(b.id)} className={sel.has(b.id) ? 'on' : undefined}>
        <td className="ck"><input type="checkbox" aria-label={`Select ${b.id}`} checked={sel.has(b.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n })} /></td>
        <th scope="row">{b.id}</th>
        <td><EditCell label={`Depot of ${b.id}`} value={b.depot === UNASSIGNED ? '' : b.depot} placeholder="Unassigned" onCommit={(v) => (v.trim() ? apply([b.id], { depot: v }) : 'Enter a name.')} /></td>
        <td><EditCell label={`Route of ${b.id}`} value={b.route === UNASSIGNED ? '' : b.route} placeholder="Unassigned" onCommit={(v) => (v.trim() ? apply([b.id], { route: v }) : 'Enter a name.')} /></td>
        <td>{c ? (c.scenario.archetype === '12m' ? '12 m' : '9 m') : ''}</td>
        <td><EditCell label={`In-service month of ${b.id}`} value={monthLabel(b.inServiceMonth)} placeholder="Unknown" onCommit={(v) => (v.trim() ? apply([b.id], { inServiceMonth: v }) : 'Enter a month like 2023-07.')} /></td>
        <td className="cls" title={c ? `Up to about ${c.spreadMonths.toFixed(1)} months apart in battery life within this class` : undefined}>{c?.name ?? ''}</td>
        <td className="num">{monthsCell(r)}</td>
        <td className="num yr">{r.band === 'past_median' ? 'now' : yearLabel(series, r.p50).replace(/^FY/, 'FY ')}</td>
        <td className="num">{rangeCell(r)}</td>
        <td className="num">{k == null ? <span className="dim">–</span> : `₹${k.toFixed(2)}`}</td>
        <td>{flagsOf(b, b.sources.duty).map((t) => <span key={t} className="tag assumption">{t}</span>)}{r.flags.filter((f) => f !== 'age_unknown').map((f) => <span key={f} className="tag assumption" title={f === 'outside_lab_range' ? 'The class’s conditions are outside what the laboratory cells were tested at' : undefined}>{FLAG_SHORT[f]}</span>)}</td>
        <td><button className="btn sm" aria-label={`Open ${b.id} in the analysis pages`} onClick={() => open(b.id, `/health${window.location.search}`)}>Open</button></td>
      </tr>
    )
  }
  const COLS = 13
  const head = (
    <thead><tr>
      <th scope="col" className="ck"><input type="checkbox" aria-label={`Select all ${rows.length} matching buses`} checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.bus.id)))} /></th>
      {sortTh('bus', 'Bus')}<th scope="col">Depot</th><th scope="col">Route</th><th scope="col">Type</th><th scope="col">In service</th><th scope="col">Duty class</th>
      {sortTh('months', 'Months to the line', 'Months until the median pack reaches the replacement line, given the bus is still in service. Sort to see which buses come first.')}
      <th scope="col">Lands in</th>
      {sortTh('range', 'Range short from', 'When a full charge no longer covers the route (km per day plus a 20 % reserve), by the model’s median health. Hover a row for the one-in-ten earlier year.')}
      {sortTh('cost', batteryOnly ? 'Battery cost per km' : 'Cost per km', 'A figure for the bus’s duty class, not for the bus')}
      <th scope="col">Worth knowing</th><th scope="col"><span className="sr">Open in the analysis pages</span></th>
    </tr></thead>
  )
  const byId = new Map(rows.map((r) => [r.bus.id, r]))

  return (
    <section id="roster" className="card" aria-labelledby={`${sid}-h`} aria-busy={stale}>
      <div className="hd roster-hd">
        <div><h2 id={`${sid}-h`}>Which buses first</h2><div className="sub" style={{ marginBottom: 0 }}>Nearest to the line first. Click a depot, route or month to change it.</div></div>
        <div className="roster-tools">
          <div className="lsel"><label htmlFor={`${sid}-g`}>Group by</label>
            <select id={`${sid}-g`} className="sel" value={grouped ? groupBy : ''} onChange={(e) => { const v = e.target.value as GroupBy | ''; if (!v) setGrouped(false); else { setGrouped(true); setGroupBy(v); setOpenG(new Set()) } }}>
              <option value="">No grouping</option>
              {GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
            </select>
          </div>
          <div className="inp roster-q"><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(FIRST) }} placeholder="Find a bus, depot or route" aria-label="Find a bus, depot or route" /></div>
        </div>
      </div>

      {band && <p className="tnote" role="status">Showing buses {BAND_LABEL[band].charAt(0).toLowerCase() + BAND_LABEL[band].slice(1)}: {rows.length}. <button className="lnk" onClick={() => onBand(null)}>Show all {all.length}</button></p>}

      {rangeFilter && <p className="tnote" role="status">Showing buses whose range is {filterText(rangeFilter, rangeFilter.includes('@') ? cls.get(rangeFilter.split('@')[1])?.name : undefined)}: {rows.length}. <button className="lnk" onClick={() => onRangeFilter(null)}>Show all {all.length}</button></p>}

      {sel.size > 0 && (
        <div className="bulk" role="group" aria-label={`Change ${sel.size} selected buses`}>
          <b>{sel.size} selected</b>
          <label>Depot<input value={bulk.depot} onChange={(e) => setBulk({ ...bulk, depot: e.target.value })} /></label>
          <label>Route<input value={bulk.route} onChange={(e) => setBulk({ ...bulk, route: e.target.value })} /></label>
          <label>In service<input value={bulk.month} placeholder="YYYY-MM" onChange={(e) => setBulk({ ...bulk, month: e.target.value })} /></label>
          <label>Duty
            <select className="sel" value={bulk.duty} onChange={(e) => setBulk({ ...bulk, duty: e.target.value })}>
              <option value="keep">Keep as is</option>
              <option value="screen">The bus on screen</option>
              {fleet.classes.map((c) => <option key={c.id} value={`class:${c.id}`}>Same as {c.name}</option>)}
            </select>
          </label>
          <span className="bulk-act"><button className="btn sm primary" onClick={applyBulk}>Apply to {sel.size}</button><button className="btn sm" onClick={() => { setSel(new Set()); setErr(null) }}>Clear selection</button></span>
          {err && <span className="err" role="alert">{err}</span>}
        </div>
      )}

      {grouped && grouping?.pending && <p className="tnote" role="status">{GROUP_LABEL[groupBy]} grouping needs the forecast.{loading ? ' It is being worked out.' : ' It is not available right now.'}</p>}
      {grouped && grouping && !grouping.pending && grouping.overlapping && <p className="tnote">A bus with several flags is listed under each, so these groups add up to more than the fleet.</p>}

      <div className="scrollx">
        <table className="tbl roster">
          {head}
          {grouping && !grouping.pending ? grouping.groups.map((g) => {
            const on = openG.has(g.key), lim = more[g.key] ?? 50
            const list = on ? g.busIds.map((id) => byId.get(id)).filter((r): r is Row => !!r) : []
            return (
              <tbody key={g.key}>
                <tr className="rgrp"><th scope="rowgroup" colSpan={COLS}>
                  <button className="grp-b" aria-expanded={on} onClick={() => setOpenG((o) => { const n = new Set(o); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n })}>
                    <span aria-hidden="true">{on ? '▾' : '▸'}</span> <b>{g.label}</b> <span className="dim">{g.n} {g.n === 1 ? 'bus' : 'buses'}{g.due12 != null ? ` · about ${g.due12 < 10 ? g.due12.toFixed(1) : Math.round(g.due12)} reaching the line in the next 12 months` : ''}{g.earliest != null ? ` · earliest median ${Math.round(g.earliest)} months` : ''}</span>
                  </button>
                </th></tr>
                {list.slice(0, lim).map(rowOf)}
                {on && list.length > lim && <tr><td colSpan={COLS}><button className="btn sm" onClick={() => setMore((m) => ({ ...m, [g.key]: lim + 50 }))}>Show {Math.min(50, list.length - lim)} more ({lim} of {list.length})</button></td></tr>}
              </tbody>
            )
          }) : (
            <tbody>
              {shown.map(rowOf)}
              {rows.length === 0 && <tr><td colSpan={COLS} className="dim">{q.trim() ? `No bus matches “${q}”.` : 'No bus is in this group.'}</td></tr>}
            </tbody>
          )}
        </table>
      </div>
      {!grouping && rows.length > shown.length && <div style={{ marginTop: 12 }}><button className="btn sm" onClick={() => setLimit((l) => (l <= FIRST ? Math.min(PAGE, rows.length) : l + PAGE))}>{limit <= FIRST ? `Show all ${rows.length.toLocaleString('en-IN')}` : `Show ${Math.min(PAGE, rows.length - shown.length)} more (${shown.length} of ${rows.length.toLocaleString('en-IN')} shown)`}</button></div>}
      <p className="note">Months to the line is the model’s median for a bus of this class and age, given it is still in service; it is about the model’s line, not how the bus is used or what its battery reports. Cost per km is the class’s figure.</p>
    </section>
  )
}
