import { useState, type ReactNode } from 'react'
import { ScenarioPanel } from './ScenarioPanel'
import { Drawer, useWide } from './Overlay'
import { IconSliders } from './Icons'
import { useScenario } from '../state/ScenarioContext'
import { ZONE_LABELS } from '../lib/scenario'
import { ErrorState } from './Async'

const DRAWER_W = 380

export function Page({ title, intro, children, wide }: { title: string; intro: string; children: ReactNode; wide?: boolean }) {
  const { valid, errors, scenario } = useScenario()
  const isWide = useWide()
  const [open, setOpen] = useState(false)
  // The inputs stay out of the way until asked for. If they are invalid they open on their own, because the page cannot show results without them.
  const shown = !wide && (open || !valid)
  return (
    <div className={`page${shown && isWide ? ' pushed' : ''}`}>
      <div className="work wide">
        <main className="main" id="main">
          <div className="pagehead">
            <div><h1>{title}</h1><p>{intro}</p></div>
            {!wide && (
              <button className="scen-open" aria-expanded={shown} onClick={() => setOpen((o) => !o)}>
                <IconSliders />
                <span className="so-t"><b>Scenario</b><small>{scenario.archetype === '12m' ? '12 m' : '9 m'} · {ZONE_LABELS[scenario.zone]} · {scenario.km_per_day} km/day</small></span>
              </button>
            )}
          </div>
          {valid ? children : <ErrorState error={new Error(`Fix ${Object.keys(errors).length} scenario input${Object.keys(errors).length > 1 ? 's' : ''} to run the model: ${Object.keys(errors).join(', ')}.`)} />}
          <div className="foot"><span>Prior mode · published laboratory cell models · not yet validated on buses</span></div>
        </main>
      </div>
      {!wide && (
        <Drawer fixed open={shown} title="Scenario" width={DRAWER_W} onClose={() => setOpen(false)}>
          <ScenarioPanel drawer />
        </Drawer>
      )}
    </div>
  )
}
