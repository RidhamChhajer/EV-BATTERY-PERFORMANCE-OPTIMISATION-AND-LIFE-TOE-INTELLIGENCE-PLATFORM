import { Suspense, useRef, useState } from 'react'
import BusStage, { StageBoundary, type BusSpec } from './BusStage'
import { hasWebGL } from './webgl'
import { useViewShortcuts, type ViewApi, type ViewState } from './viewState'
import type { PackId } from './bus'

type Props = { buses: BusSpec[]; lengthM: 12 | 9; linePct: number; view: ViewState; api: ViewApi; insetLeft: number; ariaLabel: string }

function Fallback({ buses }: { buses: BusSpec[] }) {
  return (
    <div className="v-fallback glass" role="status">
      <b>3D view is not available here</b>
      <p>Your browser could not start WebGL, so the bus drawing is switched off. Every number on this page is still shown in the cards and tables.</p>
      {buses.map((b) => <div className="row" key={b.key}><span>{b.label}</span><b>{b.healthPct.toFixed(1)}% health</b></div>)}
    </div>
  )
}

/** The 3D scene only. It fills whatever container it is put in; all controls are overlays drawn by the page. */
export function BusViewer({ buses, lengthM, linePct, view, api, insetLeft, ariaLabel }: Props) {
  const [hovered, setHovered] = useState<PackId | null>(null)
  const explode = useRef(view.explode)
  explode.current = view.explode
  useViewShortcuts(api, () => explode.current)
  if (!hasWebGL()) return <Fallback buses={buses} />
  return (
    <StageBoundary fallback={<Fallback buses={buses} />}>
      <Suspense fallback={<div className="skel full" aria-busy="true" aria-label="Loading 3D view" />}>
        <BusStage buses={buses} lengthM={lengthM} linePct={linePct} view={view} hovered={hovered} onHover={setHovered} onSelect={api.select} insetLeft={insetLeft} ariaLabel={ariaLabel} />
      </Suspense>
    </StageBoundary>
  )
}
