import { dayClock, useDayClock } from '../three/dayClock'
import { dayShape, phaseAt, segments, type DayParams } from '../lib/dayCycle'
import { hhmm } from '../lib/scenario'

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion:reduce)').matches
const PH = { drive: 'Driving', charge: 'Charging', idle: 'Full, resting' } as const
type Props = { day: DayParams; other?: DayParams }

/** The 24-hour day shared by both buses: drive, charge, rest. One bar per bus; the hatched tail means charging runs past departure. */
export function DayScrubber({ day, other }: Props) {
  const { hour, playing } = useDayClock()
  const ph = phaseAt(hour, day)
  const bars = [{ label: other ? 'A' : '', p: day }, ...(other ? [{ label: 'B', p: other }] : [])]
  return (
    <div className="tl glass dayscrub">
      <span className="yrl">{hhmm(Math.floor(hour * 2) / 2)} <b>{PH[ph.phase]}</b></span>
      <button className="play" aria-label={playing ? 'Pause the day' : 'Play the day'} aria-pressed={playing} onClick={() => { if (reduced()) { dayClock.set(hour + 1); return } dayClock.toggle() }}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d={playing ? 'M3 2h3.4v12H3zM9.6 2H13v12H9.6z' : 'M4 2v12l10-6z'} fill="#09090B" /></svg>
      </button>
      <div className="trk day">
        {bars.map((b) => <Bar key={b.label || 'a'} label={b.label} p={b.p} />)}
        <div className="dhead" style={{ left: `${(hour / 24) * 100}%` }} aria-hidden="true" />
        <input type="range" min={0} max={24} step={0.1} value={hour} aria-label="Hour of the day" aria-valuetext={hhmm(Math.floor(hour * 2) / 2)} onChange={(e) => { dayClock.pause(); dayClock.set(+e.target.value) }} />
      </div>
      <div className="axis" style={{ gridColumn: 2 }}>{[0, 6, 12, 18, 24].map((t) => <span key={t}>{t === 24 ? '24' : t}</span>)}<span>hours</span></div>
    </div>
  )
}

function Bar({ label, p }: { label: string; p: DayParams }) {
  const sh = dayShape(p)
  return (
    <div className="dbar" role="img" aria-label={`${label ? `Bus ${label}: ` : ''}drives ${sh.dutyH.toFixed(1)} h, charges ${p.chargeHours.toFixed(1)} h${sh.unfinished ? ', which does not finish before departure' : ''}`}>
      {label && <em>{label}</em>}
      {segments(p).map((s) => {
        const from = ((s.from % 24) + 24) % 24, w = s.to - s.from
        const wraps = from + w > 24
        const mk = (left: number, width: number, key: string) => <i key={key} className={`dseg ${s.phase}${s.phase === 'charge' && sh.unfinished ? ' hatch' : ''}`} style={{ left: `${(left / 24) * 100}%`, width: `${(width / 24) * 100}%` }} />
        return wraps ? [mk(from, 24 - from, 'a'), mk(0, from + w - 24, 'b')] : mk(from, w, 'a')
      })}
    </div>
  )
}
