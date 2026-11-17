import { useState } from 'react'
import { RANGE_COLOR } from './RangeCard'
import { SOON, type ClassRange } from '../../lib/fleet/range'
import type { Row } from '../../lib/fleet/segments'

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }

/** How many buses are short of range, year by year: a rising step of the whole fleet. A bus counts from the month its median pack falls below the route; a bus that is short
 *  even when new counts from today. Buses with no in-service month are left out, because their age (and so their month) is not known. */
export function ShortOverTime({ rows, years = 10 }: { rows: Row[]; years?: number }) {
  const [hov, setHov] = useState<number | null>(null)
  const known = rows.filter((r) => r.range && r.range.band !== 'unknown')
  const N = known.length
  const at = (m: number) => known.filter((r) => r.range!.band !== 'covered' && r.range!.months != null && r.range!.months <= m).length
  const W = 760, H = 190, L = 40, R = 20, T = 22, B = 28
  const top = Math.max(1, N)
  const x = (y: number) => L + ((W - L - R) * y) / years, yy = (v: number) => T + ((H - T - B) * (top - v)) / top
  const pts = Array.from({ length: years * 12 + 1 }, (_, m) => ({ m, v: at(m) }))
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.m / 12).toFixed(1)} ${yy(p.v).toFixed(1)}`).join('')
  const marks = [0, 1, 3, 5, years].filter((v, i, a) => a.indexOf(v) === i)
  const val = (y: number) => at(y * 12)
  return (
    <div className="so">
      <svg className="ch" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Buses short of range over the next ${years} years: ${marks.map((y) => `${val(y)} of ${N} ${y === 0 ? 'now' : `by year ${y}`}`).join(', ')}.`}
        onPointerLeave={() => setHov(null)}>
        {[0, N / 2, N].map((t) => <g key={t}><line x1={L} x2={W - R} y1={yy(t)} y2={yy(t)} stroke="rgba(255,255,255,.08)" /><text x={L - 8} y={yy(t) + 4} textAnchor="end">{Math.round(t)}</text></g>)}
        <path d={`${line}L${x(years)} ${yy(0)}L${x(0)} ${yy(0)}Z`} fill="rgba(248,113,113,.18)" />
        <path d={line} fill="none" stroke="#F87171" strokeWidth="2.4" />
        {Array.from({ length: years + 1 }, (_, y) => <text key={y} x={x(y)} y={H - 8} textAnchor="middle">{y === 0 ? 'now' : `${y}y`}</text>)}
        {marks.map((y) => (
          <g key={y}><circle cx={x(y)} cy={yy(val(y))} r="4.5" fill="#F87171" stroke="#101012" strokeWidth="2" />
            <text x={Math.min(x(y), W - R - 18)} y={yy(val(y)) - 10} textAnchor={y === 0 ? 'start' : 'middle'} style={{ fill: '#fff', fontWeight: 700 }}>{val(y)}</text></g>
        ))}
        {Array.from({ length: years * 4 + 1 }, (_, i) => i / 4).map((y) => <rect key={y} x={x(y) - (W - L - R) / years / 8} y={T} width={(W - L - R) / years / 4} height={H - T - B} fill="transparent" onPointerEnter={() => setHov(y)} />)}
        {hov != null && <g pointerEvents="none"><line x1={x(hov)} x2={x(hov)} y1={T} y2={H - B} stroke="rgba(255,255,255,.35)" /><text x={x(hov) + (hov > years * 0.7 ? -8 : 8)} y={T + 12} textAnchor={hov > years * 0.7 ? 'end' : 'start'} style={{ fill: '#fff', fontWeight: 700 }}>{val(hov)} of {N} short by {hov === 0 ? 'now' : `${hov} ${hov === 1 ? 'year' : 'years'}`}</text></g>}
      </svg>
    </div>
  )
}

/** One duty class: the median health curve turned into range (km) with the route's need as a line across it, and every bus of the class as a dot at its own age.
 *  A dot below the line is a bus that is short today; the curve shows when the rest will join it. */
export function ClassRangeChart({ cr, rows }: { cr: ClassRange; rows: Row[] }) {
  const W = 250, H = 170, L = 34, R = 10, T = 12, B = 24
  const xMax = Math.min(Math.max(8, Math.ceil(Math.max(0, ...rows.map((r) => (r.age ?? 0) / 12)) + 3)), cr.p50.length / 12, 16)
  const top = Math.ceil((cr.newKm * 1.04) / 10) * 10
  // The axis starts below the lowest thing drawn, not at zero, so the gap between the curve and the route's need is visible; the bottom tick says where it starts.
  const low = Math.min(cr.needKm, ...cr.p10.slice(0, Math.round(xMax * 12) + 1).map((p) => (cr.newKm * p) / 100))
  const lo = Math.max(0, Math.floor((low * 0.92) / 10) * 10)
  const x = (y: number) => L + ((W - L - R) * y) / xMax, yy = (v: number) => T + ((H - T - B) * (top - Math.max(v, lo))) / (top - lo)
  const curve = (a: number[]) => a.slice(0, Math.round(xMax * 12) + 1).map((p, i) => `${i ? 'L' : 'M'}${x(i / 12).toFixed(1)} ${yy((cr.newKm * p) / 100).toFixed(1)}`).join('')
  const dots = rows.filter((r) => r.range?.nowKm != null && r.age != null)
  const short = dots.filter((r) => SOON.includes(r.range!.band)).length
  return (
    <svg className="ch" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Range against route need for this duty class: a new pack gives ${Math.round(cr.newKm)} km and the route needs ${Math.round(cr.needKm)} km. ${short} of ${rows.length} buses are short within 3 years.`}>
      <rect x={L} y={yy(cr.needKm)} width={W - L - R} height={Math.max(0, yy(lo) - yy(cr.needKm))} fill="rgba(248,113,113,.10)" />
      {[lo, top].map((t) => <g key={t}><line x1={L} x2={W - R} y1={yy(t)} y2={yy(t)} stroke="rgba(255,255,255,.08)" /><text x={L - 5} y={yy(t) + 4} textAnchor="end">{t}</text></g>)}
      <path d={curve(cr.p10)} fill="none" stroke="#A1A1AA" strokeWidth="1.2" strokeDasharray="3 3" />
      <path d={curve(cr.p50)} fill="none" stroke="#FACC15" strokeWidth="2" />
      <line x1={L} x2={W - R} y1={yy(cr.needKm)} y2={yy(cr.needKm)} stroke="#F87171" strokeWidth="1.5" strokeDasharray="5 3" />
      <text x={W - R} y={yy(cr.needKm) - 5} textAnchor="end" style={{ fill: '#F87171', fontWeight: 700 }}>route needs {Math.round(cr.needKm)} km</text>
      {dots.map((r) => <circle key={r.bus.id} cx={x((r.age as number) / 12) + ((hash(r.bus.id) % 9) - 4) * 0.7} cy={yy(r.range!.nowKm as number)} r="3" fill={RANGE_COLOR[r.range!.band]} stroke="#101012" strokeWidth="0.8"><title>{r.bus.id}: about {Math.round(r.range!.nowKm as number)} km today</title></circle>)}
      {[0, Math.round(xMax / 2), Math.floor(xMax)].map((y) => <text key={y} x={x(y)} y={H - 7} textAnchor="middle">{y}{y === Math.floor(xMax) ? ' y' : ''}</text>)}
    </svg>
  )
}
