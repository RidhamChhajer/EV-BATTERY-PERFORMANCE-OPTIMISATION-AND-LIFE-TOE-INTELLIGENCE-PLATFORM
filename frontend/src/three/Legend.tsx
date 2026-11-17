import { DIFF_SCALE, TEMP_HI, TEMP_LO, diffCss, healthCss, tempCss } from '../lib/colors'
import type { Lens } from './viewState'

export function Legend({ linePct, bare }: { linePct: number; bare?: boolean }) {
  const lo = linePct - 25, span = 100 - lo
  const stops = Array.from({ length: 11 }, (_, i) => `${healthCss(100 - (span * i) / 10, linePct)} ${i * 10}%`).join(',')
  return (
    <div className={`vlegend${bare ? ' bare' : ' glass'}`} role="img" aria-label={`Colour scale: yellow at 100 percent health, orange at the ${linePct} percent replacement line, red at ${lo} percent`}>
      <span>100%</span><i style={{ background: `linear-gradient(90deg,${stops})` }}><u style={{ left: `${((100 - linePct) / span) * 100}%` }} /></i><span>{lo}%</span>
      <em>White tick = replacement line ({linePct}%)</em>
    </div>
  )
}

export type CompareMode = 'health' | 'diff'

/** Legend for the comparison page: a switch between the two colourings, and the scale for whichever is on. */
export function CompareLegend({ mode, onMode, linePct, idle }: { mode: CompareMode; onMode: (m: CompareMode) => void; linePct: number; idle?: boolean }) {
  const stops = [-DIFF_SCALE, -DIFF_SCALE / 2, 0, DIFF_SCALE / 2, DIFF_SCALE].map((d, i) => `${diffCss(d)} ${i * 25}%`).join(',')
  return (
    <div className="cmpleg glass">
      <div className="cmpmode" role="group" aria-label="What the colours show">
        <button aria-pressed={mode === 'health'} onClick={() => onMode('health')}>Health</button>
        <button aria-pressed={mode === 'diff'} onClick={() => onMode('diff')}>Difference</button>
      </div>
      {mode === 'health'
        ? <Legend linePct={linePct} bare />
        : (
          <div className="dleg" role="img" aria-label={`Colour scale: red when Bus B is ${DIFF_SCALE} or more percentage points less healthy than Bus A, grey when the same, yellow when ${DIFF_SCALE} or more points healthier`}>
            <span>−{DIFF_SCALE} pts</span><i style={{ background: `linear-gradient(90deg,${stops})` }} /><span>+{DIFF_SCALE} pts</span>
            <em>{idle ? 'Change Bus B to see where it differs.' : 'Bus B health minus Bus A, at this year. Bus A is grey.'}</em>
          </div>
        )}
    </div>
  )
}

const TIPS = {
  health: 'Each ring is one cell: lit arc = capacity left, slate = lost to calendar ageing, umber = lost to cycling. Spread between cells is illustrative, inside the model’s range.',
} as const

/** Key for the active lens. Health keeps the colour scale; the other lenses show only what they need. */
export function LensLegend({ lens, linePct, tempRange }: { lens: Lens; linePct: number; tempRange?: [number, number] }) {
  if (lens === 'health') return <div className="lensleg"><Legend linePct={linePct} /><p className="lensnote">{TIPS.health}</p></div>
  if (lens === 'charge') return (
    <div className="vlegend glass" role="img" aria-label="Rings show state of charge. White ticks mark the charge cap and the minimum charge.">
      <span>Rings</span><i style={{ background: 'linear-gradient(90deg,#27303a,#FACC15)' }} /><span>state of charge</span>
      <em>White ticks = charge cap and minimum · cable pulses = charger power</em>
    </div>
  )
  if (lens === 'heat') {
    const [lo, hi] = tempRange ?? [TEMP_LO, TEMP_HI]
    const stops = Array.from({ length: 7 }, (_, i) => `${tempCss(TEMP_LO + ((TEMP_HI - TEMP_LO) * i) / 6)} ${(i / 6) * 100}%`).join(',')
    return (
      <div className="vlegend glass" role="img" aria-label={`Colour scale for cell temperature from ${TEMP_LO} to ${TEMP_HI} degrees Celsius. This bus's cells run ${Math.round(lo)} to ${Math.round(hi)} degrees over the year.`}>
        <span>{TEMP_LO}°</span><i style={{ background: `linear-gradient(90deg,${stops})` }}><u style={{ left: `${((((lo + hi) / 2) - TEMP_LO) / (TEMP_HI - TEMP_LO)) * 100}%` }} /></i><span>{TEMP_HI}°</span>
        <em>Yearly mean cell temperature · this bus runs {Math.round(lo)}–{Math.round(hi)} °C</em>
      </div>
    )
  }
  return (
    <div className="vlegend glass" role="img" aria-label="The bar on the ground is the distance a full charge covers now. The white tick is what the route plus a 20 percent reserve needs.">
      <span>Bar</span><i style={{ background: 'linear-gradient(90deg,#FACC15,#FACC15)' }}><u style={{ left: '100%' }} /></i><span>route + 20 %</span>
      <em>Amber gap = the pack no longer covers the route</em>
    </div>
  )
}
