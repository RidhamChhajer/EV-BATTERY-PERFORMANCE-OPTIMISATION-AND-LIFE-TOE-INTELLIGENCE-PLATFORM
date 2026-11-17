import { Link, useLocation } from 'react-router-dom'
import type { Scenario } from '../api/types'
import { editBuses } from '../lib/fleet/roster'
import { useFleet } from '../state/FleetContext'
import { useScenario } from '../state/ScenarioContext'
import { useScope } from '../state/scope'
import { useWhatIf } from '../state/WhatIfContext'
import { useOpenBus } from './fleet/useOpenBus'
import { toast } from './Toast'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const since = (ym?: string) => (ym ? `in service ${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : 'age unknown')
const same = (a: Scenario, b: Scenario) => (Object.keys({ ...a, ...b }) as (keyof Scenario)[]).every((k) => a[k] === b[k])
const SWITCHER_MAX = 300

/** Where you are: the fleet and the bus the analysis pages are showing, with a way to move to the next bus and a way back. It is also where a change made on any page can
 *  be applied to the bus's whole duty class; until then a change is only a what-if, as it always was. */
export function ScopeBar() {
  const scope = useScope()
  const loc = useLocation()
  const { setFleet, select } = useFleet()
  const { busB } = useWhatIf()
  const { replace } = useScenario()
  const { reset } = useWhatIf()
  const open = useOpenBus()
  if (!scope || loc.pathname === '/fleet') return null
  const { fleet, bus, cls, classBuses, index } = scope
  const n = fleet.buses.length
  const dirty = !same(busB, cls.scenario)
  const go = (i: number) => open(fleet.buses[(i + n) % n].id)
  const apply = () => {
    const r = editBuses(fleet, fleet.buses.filter((b) => b.classId === cls.id).map((b) => b.id), { duty: { scenario: busB, source: 'entered' } }, Date.now())
    if (!r.ok) { toast(r.message ?? 'That change could not be applied.'); return }
    setFleet(r.fleet); replace(busB); reset()
    toast(`Applied to ${classBuses} ${classBuses === 1 ? 'bus' : 'buses'}. The Fleet page shows the new forecast.`)
  }
  return (
    <div className="scope" role="region" aria-label="Fleet scope">
      <nav aria-label="Where you are" className="scope-l">
        <Link to={`/fleet${window.location.search}`}>Fleet · {n.toLocaleString('en-IN')} {n === 1 ? 'bus' : 'buses'}</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page"><b>{bus.id}</b> · {bus.depot} · {bus.route} · {since(bus.inServiceMonth)}</span>
      </nav>
      <div className="scope-r">
        {n > 1 && (
          <span className="scope-sw" role="group" aria-label="Switch bus">
            <button className="btn sm" aria-label="Previous bus" onClick={() => go(index - 1)}>‹</button>
            {n <= SWITCHER_MAX && <select className="sel" aria-label="Bus" value={bus.id} onChange={(e) => open(e.target.value)}>{fleet.buses.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.depot}</option>)}</select>}
            <button className="btn sm" aria-label="Next bus" onClick={() => go(index + 1)}>›</button>
          </span>
        )}
        {dirty && <button className="btn sm primary" onClick={apply} title="Changes the duty of every bus in this class. Each bus keeps its own depot, route and in-service month.">Apply to this duty class ({classBuses} {classBuses === 1 ? 'bus' : 'buses'})</button>}
        <button className="btn sm" onClick={() => select(null)}>Leave the fleet</button>
      </div>
    </div>
  )
}
