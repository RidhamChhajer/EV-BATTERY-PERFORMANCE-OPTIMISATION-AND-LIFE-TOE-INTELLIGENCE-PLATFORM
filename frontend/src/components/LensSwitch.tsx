import { LENSES, type Lens, type ViewApi } from '../three/viewState'

/** One lens at a time: what the colours and instruments on the bus are showing. */
export function LensSwitch({ lens, api }: { lens: Lens; api: ViewApi }) {
  return (
    <div className="lens glass" role="group" aria-label="What the 3D view shows">
      {LENSES.map((l) => <button key={l.id} aria-pressed={lens === l.id} onClick={() => api.setLens(l.id)} title={`${l.label} (${l.hotkey})`}>{l.label}</button>)}
    </div>
  )
}
