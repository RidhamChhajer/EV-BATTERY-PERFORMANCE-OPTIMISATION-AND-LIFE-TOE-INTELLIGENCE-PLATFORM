import type { CSSProperties } from 'react'
import type { PackId } from './bus'
import { CAMS, CAM_ORDER, LAYER_LABELS, type ViewApi, type ViewState } from './viewState'

const PACKS: { id: PackId; label: string }[] = [{ id: 'roof', label: 'Roof' }, { id: 'under', label: 'Underfloor' }, { id: 'rear', label: 'Rear' }]
const fill = (v: number) => ({ '--p': `${v * 100}%` }) as CSSProperties

/** Everything that changes how the bus is drawn. It lives in a drawer so the scene stays clear until it is needed. */
export function ViewPanel({ view, api, compare }: { view: ViewState; api: ViewApi; compare?: boolean }) {
  return (
    <div className="vp">
      <section aria-labelledby="vp-cam"><h3 id="vp-cam">Camera</h3>
        <div className="chips">{CAM_ORDER.filter((c) => compare || c !== 'cmp').map((c, i) => (
          <button key={c} className="vbtn" aria-pressed={view.cam === c} onClick={() => api.setCam(c)} title={`${CAMS[c].label} (${i + 1})`}>{CAMS[c].label}</button>))}</div>
      </section>
      <section aria-labelledby="vp-pack"><h3 id="vp-pack">Battery pack details</h3>
        <div className="chips">{PACKS.map((p) => (
          <button key={p.id} className="vbtn" aria-pressed={view.selected === p.id} onClick={() => api.select(view.selected === p.id ? null : p.id)}>{p.label}</button>))}</div>
      </section>
      <section aria-labelledby="vp-show"><h3 id="vp-show">Show</h3>
        <div className="chips">{LAYER_LABELS.map((l) => (
          <button key={l.key} className="vbtn" aria-pressed={view.layers[l.key]} onClick={() => api.toggle(l.key)} title={`${l.label} (${l.hotkey})`}>{l.label}</button>))}</div>
      </section>
      <section aria-labelledby="vp-fx"><h3 id="vp-fx">Look</h3>
        <label className="vslide">Pull apart
          <input className="rng" style={fill(view.explode)} type="range" min={0} max={1} step={0.01} value={view.explode} onChange={(e) => api.setExplode(+e.target.value)} aria-valuetext={`${Math.round(view.explode * 100)} percent`} />
        </label>
        <label className="vslide">Body see-through
          <input className="rng" style={fill(1 - view.shell)} type="range" min={0} max={1} step={0.01} value={1 - view.shell} onChange={(e) => api.setShell(1 - +e.target.value)} aria-valuetext={`${Math.round((1 - view.shell) * 100)} percent`} />
        </label>
      </section>
      <details className="keys"><summary>Keyboard shortcuts</summary>
        <p>A ageing · G charge · T heat · R range · 1–5 camera · S body · C wheels · P packs · L labels · D length · F charging flow · X scan · E pull apart · I isolate · Esc clear</p>
      </details>
    </div>
  )
}
