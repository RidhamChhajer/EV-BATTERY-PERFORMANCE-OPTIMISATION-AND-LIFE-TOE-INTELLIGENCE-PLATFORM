import { useId, useState, type ReactNode } from 'react'
import { openAbout } from './AboutForecast'
import { EvidenceBadge } from '../EvidenceBadge'

type View = 'year' | 'class'

/** One card for "when": by financial year (the budget chart, stacked by depot) or by duty class (the grid). The switch replaces two blocks that each carried their own notes. */
export function WhenCard({ year, byClass, stale }: { year: ReactNode; byClass: ReactNode; stale: boolean }) {
  const id = useId()
  const [view, setView] = useState<View>('year')
  return (
    <section className="card c8" aria-labelledby={`${id}-h`} aria-busy={stale}>
      <div className="hd">
        <div><h2 id={`${id}-h`}>{view === 'year' ? 'Battery budget by financial year' : 'When each duty class reaches the line'}</h2><div className="sub">{view === 'year' ? 'First pack per bus, stacked by depot.' : 'Expected buses per financial year.'} <button className="lnk" onClick={openAbout}>How to read this</button></div></div>
        <div className="seg tabs" role="group" aria-label="View">
          {(['year', 'class'] as View[]).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'year' ? 'By year' : 'By duty class'}</button>)}
        </div>
        <EvidenceBadge level="derived" />
      </div>
      {view === 'year' ? year : byClass}
    </section>
  )
}
