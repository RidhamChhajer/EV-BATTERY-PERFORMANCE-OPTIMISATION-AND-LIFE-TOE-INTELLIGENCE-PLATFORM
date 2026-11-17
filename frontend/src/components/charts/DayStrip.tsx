import { dayShape, segments, type DayParams } from '../../lib/dayCycle'
import { hhmm } from '../../lib/scenario'

const W = 360, H = 64
const COL = { drive: '#3f3f46', charge: '#FACC15', idle: 'rgba(250,204,21,.28)' } as const
const NAME = { drive: 'Driving', charge: 'Charging', idle: 'Full, resting' } as const

/** The 24 hours of one day: how long the pack drives, charges, and sits at the top of its charge window. Resting full is the part the calendar-ageing model punishes. */
export function DayStrip({ day }: { day: DayParams }) {
  const sh = dayShape(day), x = (h: number) => (h / 24) * W
  const rect = (from: number, to: number, ph: keyof typeof COL, k: string) => <rect key={k} x={x(from)} y="12" width={Math.max(0, x(to) - x(from))} height="26" fill={COL[ph]} stroke="#09090B" strokeWidth="1" />
  const desc = `Drives ${sh.dutyH.toFixed(1)} hours, charges ${sh.chargeH.toFixed(1)} hours, rests full ${sh.idleH.toFixed(1)} hours. Departs ${hhmm(day.departure)}, charging starts ${hhmm(day.chargeStart)}.`
  return (
    <figure className="daystrip" aria-label={desc}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc} className="ds">
        <clipPath id="ds-c"><rect x="0" y="12" width={W} height="26" rx="8" /></clipPath>
        <g clipPath="url(#ds-c)">
          {segments(day).flatMap((s) => {
            const from = ((s.from % 24) + 24) % 24, w = s.to - s.from
            return from + w > 24 ? [rect(from, 24, s.phase, `${s.phase}a`), rect(0, from + w - 24, s.phase, `${s.phase}b`)] : [rect(from, from + w, s.phase, s.phase)]
          })}
        </g>
        {[0, 6, 12, 18, 24].map((t) => <text key={t} x={x(t)} y="58" textAnchor={t === 0 ? 'start' : t === 24 ? 'end' : 'middle'} fontSize="11.5" fill="var(--t3)">{t}</text>)}
      </svg>
      <figcaption className="legd">{(['drive', 'charge', 'idle'] as const).map((k) => <span key={k}><i style={{ background: COL[k] }} />{NAME[k]}</span>)}</figcaption>
    </figure>
  )
}
