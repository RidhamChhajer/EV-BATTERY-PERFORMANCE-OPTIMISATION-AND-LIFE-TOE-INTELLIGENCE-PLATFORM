import { Component, useEffect, useMemo, useRef, useState, type ElementRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { buildBus, disposeRig, easePaint, paintHealth, setShellOpacity, updateFlow, updateMods, type PackId } from './bus'
import { updateDepot, buildFloor } from './depot'
import { updateRuler, updateShimmer } from './instruments'
import { dayClock } from './dayClock'
import { healthRGB, tempRGB } from '../lib/colors'
import { phaseAt } from '../lib/dayCycle'
import type { SceneParams } from '../lib/sceneParams'
import { CAMS, type ViewState } from './viewState'

export type DeltaBadge = { text: string; tone: 'up' | 'down' | 'none' }
/** `rgb` overrides the health colour (used by the difference view). `pulseKey` changing makes the packs flash once. `badges` float above the bus.
 *  `scene` carries the model numbers the lenses draw; `changed` lists the levers this bus changes (so hovering a change chip can echo it in the scene); `attention` puts a small amber dot on the label. */
export type BusSpec = {
  key: string; label: string; healthPct: number; offsetZ: number; packLabels?: boolean; rgb?: [number, number, number]; badges?: DeltaBadge[]; pulseKey?: string
  scene?: SceneParams; changed?: string[]; attention?: boolean; clock?: { years: number; frac: number } | null
}
type Props = { buses: BusSpec[]; lengthM: 12 | 9; linePct: number; view: ViewState; insetLeft: number; hovered: PackId | null; onHover: (id: PackId | null) => void; onSelect: (id: PackId | null) => void; ariaLabel: string }

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion:reduce)').matches
const PACK_NAMES: Record<PackId, string> = { roof: 'Roof packs', under: 'Underfloor packs', rear: 'Rear pack' }
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 25)
const VOLT: [number, number, number] = [250, 204, 21]
/** Which part of the scene answers when a lever is hovered in the change bar. */
const ECHO: Record<string, 'depot' | 'packs' | 'heat'> = { charge_power_kw: 'depot', charge_start_hour: 'depot', soc_max_pct: 'packs', kwh_per_km: 'packs', heat_rise_c: 'heat' }

function Bus({ spec, lengthM, linePct, view, hovered, onHover, onSelect }: { spec: BusSpec } & Pick<Props, 'lengthM' | 'linePct' | 'view' | 'hovered' | 'onHover' | 'onSelect'>) {
  const rig = useMemo(() => buildBus(lengthM), [lengthM])
  const gl = useThree((s) => s.gl)
  const [here, setHere] = useState<PackId | null>(null)
  useEffect(() => () => disposeRig(rig), [rig])
  const lens = view.lens, sc = spec.scene
  // Colour eases toward its target, and a change of pulseKey (the user moved a slider) adds one short flash, so the eye is drawn to what just changed.
  const target = useMemo(() => new THREE.Color(), [])
  const painted = useRef<typeof rig | null>(null)
  const flash = useRef(0)
  const reveal = useRef(reducedMotion() ? 1 : 0)
  const tempC = sc ? mean(sc.cellTempC) : 25
  const rgb: [number, number, number] = lens === 'charge' ? VOLT : lens === 'heat' ? tempRGB(tempC) : spec.rgb ?? healthRGB(spec.healthPct, linePct)
  useEffect(() => {
    target.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    if (painted.current !== rig || reducedMotion()) { paintHealth(rig, spec.healthPct, linePct, rgb); painted.current = rig }
  }, [rig, target, rgb[0], rgb[1], rgb[2], spec.healthPct, linePct]) // eslint-disable-line react-hooks/exhaustive-deps
  const lastKey = useRef(spec.pulseKey)
  useEffect(() => {
    if (lastKey.current !== spec.pulseKey && !reducedMotion()) flash.current = 1
    lastKey.current = spec.pulseKey
  }, [spec.pulseKey])
  useEffect(() => { setShellOpacity(rig, view.shell) }, [rig, view.shell])
  useEffect(() => {
    rig.shellG.visible = view.layers.shell; rig.chassisG.visible = view.layers.chassis; rig.packG.visible = view.layers.packs
    rig.dim.visible = view.layers.dims; rig.flow.visible = view.layers.flow
  }, [rig, view.layers])
  // lens-independent model numbers go straight into the shared cell uniforms
  useEffect(() => {
    const U = rig.U, h = sc?.health
    const mid = h ? h.mid : clamp(spec.healthPct / 100)
    U.lo.value = h ? h.lo : mid; U.mid.value = mid; U.hi.value = h ? h.hi : mid
    U.line.value = linePct / 100; U.cal.value = sc?.calendarShare ?? 0.5
    U.mode.value = lens === 'charge' ? 1 : lens === 'heat' ? 2 : 0
    U.glow.value = lens === 'health' || lens === 'range' ? 0.9 + 0.6 * mid : 1.3
    U.wear.value = lens === 'health' ? 1 : 0
    if (sc) { U.socMin.value = sc.day.socMin / 100; U.socMax.value = sc.day.socMax / 100 }
  }, [rig, sc, spec.healthPct, linePct, lens])

  const echo = spec.changed && view.hoverLever && spec.changed.includes(view.hoverLever) ? ECHO[view.hoverLever] ?? 'packs' : null
  const spin = useRef(0), road = useRef(0)
  useFrame(({ clock }, dt) => {
    const rm = reducedMotion(), t = rm ? 0 : clock.elapsedTime
    easePaint(rig, target, rm ? 1 : 1 - Math.exp(-dt * 7))
    flash.current = Math.max(0, flash.current - dt * 1.3)
    reveal.current = Math.min(1, reveal.current + dt * 1.6)
    const e = 1 - (1 - reveal.current) ** 3
    rig.group.scale.setScalar(0.94 + 0.06 * e); rig.group.position.y = (1 - e) * -0.25
    rig.U.time.value = t
    if (view.layers.flow) updateFlow(rig, t)
    const scanX = view.layers.scan && !rm ? -7 + ((t * 3) % 16) : null
    const pulse = Math.max(flash.current * flash.current, echo === 'packs' ? 0.35 + 0.2 * Math.sin(t * 5) : 0)
    // the model's pack energy sets module thickness a little, so a bigger pack looks bigger
    const thick = sc ? 1 + (sc.packTier - 1) * 1.4 : 1
    updateMods(rig, { explode: view.explode, selected: view.selected, hovered, isolate: view.isolate, scanX, scanOffsetX: 0, pulse, thick, dim: lens === 'range' ? 0.5 : 1 })

    const day = dayClock.get(), ph = sc ? phaseAt(day.hour, sc.day) : null
    if (lens === 'charge' && ph) rig.U.soc.value = ph.soc
    // charger and cable: power sets the pulses; in the Charge lens they run only while the bus is plugged in
    const charging = lens === 'charge' ? ph?.phase === 'charge' : true
    updateDepot(rig.depot, { t, kw: sc?.chargeKw ?? 100, energised: charging, idleGlow: 0.18, boost: echo === 'depot' ? 0.9 + 0.5 * Math.sin(t * 6) : 0, calm: lens === 'charge' ? 1 : 0.55 })
    // driving: wheels turn and the lane marks slide back, only in the Charge lens while the day clock is playing
    const driving = lens === 'charge' && ph?.phase === 'drive' && day.playing && !rm
    spin.current = driving ? spin.current + dt * 6 : spin.current
    road.current = driving ? road.current + dt * 5 : road.current
    rig.wheels.forEach((w) => { w.rotation.z = -spin.current })
    rig.lane.group.visible = lens === 'charge'
    rig.lane.group.position.x = road.current % rig.lane.step
    // heat: faint rising motes, scaled by the pack's warmth
    const hot = sc ? clamp((sc.heatRiseC / 10) * 0.55 + ((tempC - 25) / 20) * 0.6) : 0
    updateShimmer(rig.shimmer, { t, strength: echo === 'heat' ? Math.max(hot, 0.6) : hot, visible: lens === 'heat' || echo === 'heat' })
    // range: the ruler on the ground
    rig.ruler.group.visible = lens === 'range' && !!sc
    if (lens === 'range' && sc) {
      const newKm = sc.health.mid > 0 ? sc.rangeKm / sc.health.mid : sc.rangeKm
      updateRuler(rig.ruler, { rangeKm: sc.rangeKm, needKm: sc.routeNeedKm, maxKm: Math.max(newKm, sc.routeNeedKm ?? 0, 1) * 1.05 })
    }
  })

  const idOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.object.userData.id as PackId | undefined) ?? null
  const hint = here && lens === 'health' && sc ? `${PACK_NAMES[here]} · ${Math.round(sc.health.mid * 100)} % left · lost ${Math.round(sc.calendarShare * 100)} % to calendar, ${Math.round((1 - sc.calendarShare) * 100)} % to cycling` : here ? PACK_NAMES[here] : null
  return (
    <group position={[0, 0, spec.offsetZ]}>
      <primitive
        object={rig.group}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); const id = idOf(e); if (id) { onHover(id); setHere(id); gl.domElement.style.cursor = 'pointer' } }}
        onPointerOut={() => { onHover(null); setHere(null); gl.domElement.style.cursor = '' }}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); const id = idOf(e); if (id) onSelect(view.selected === id ? null : id) }}
      />
      {view.layers.labels && (
        <>
          <Html position={[-3.6 * rig.k, 3.95, 0]} center className="lbl3d bus" zIndexRange={[5, 0]}>{spec.attention && <i className="attn" aria-hidden="true" />}{spec.label} · {Math.round(spec.healthPct)}%{spec.clock && <span className="clk" title={`Reaches the replacement line at about ${spec.clock.years.toFixed(1)} years`}><i style={{ width: `${Math.round(spec.clock.frac * 100)}%` }} /></span>}</Html>
          {spec.badges && spec.badges.length > 0 && (
            <Html position={[3.4 * rig.k, 3.95, 0]} center className="lbl3d-group" zIndexRange={[6, 0]}>
              {spec.badges.map((b) => <span key={b.text} className={`lbl3d delta ${b.tone}`}>{b.text}</span>)}
            </Html>
          )}
        </>
      )}
      {hint && <Html position={[0, 4.6, 0]} center className="lbl3d tip" zIndexRange={[7, 0]}>{hint}</Html>}
      {view.layers.dims && <Html position={[0, -0.05, 2.1]} center className="lbl3d" zIndexRange={[4, 0]}>{lengthM} m</Html>}
      {lens === 'range' && sc && <RangeLabels sc={sc} rig={rig} />}
    </group>
  )
}

/** The only text in the Range lens: what a charge covers now, and what the route needs. */
function RangeLabels({ sc, rig }: { sc: SceneParams; rig: ReturnType<typeof buildBus> }) {
  const newKm = sc.health.mid > 0 ? sc.rangeKm / sc.health.mid : sc.rangeKm
  const per = rig.ruler.L / (Math.max(newKm, sc.routeNeedKm ?? 0, 1) * 1.05)
  const barX = rig.ruler.x0 + Math.max(0.01, sc.rangeKm * per), tickX = sc.routeNeedKm == null ? null : rig.ruler.x0 + sc.routeNeedKm * per
  const short = tickX != null && tickX > barX + 0.02
  return (
    <>
      <Html position={[barX, 0.5, 2.35]} center className={`lbl3d${short ? ' warn' : ''}`} zIndexRange={[5, 0]}>{Math.round(sc.rangeKm)} km on a full charge</Html>
      {tickX != null && sc.routeNeedKm != null && <Html position={[tickX, 1.15, 2.35]} center className="lbl3d" zIndexRange={[5, 0]}>route + reserve {Math.round(sc.routeNeedKm)} km</Html>}
    </>
  )
}

function CameraRig({ cam, nonce, insetLeft }: { cam: ViewState['cam']; nonce: number; insetLeft: number }) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera)
  // Canvas keeps a fixed vertical field of view, so on a narrow screen the sides get cropped: back the camera off to compensate.
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const size = useThree((s) => s.size)
  const shift = useRef(insetLeft / 2)
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  useEffect(() => {
    const c = CAMS[cam]
    const target = new THREE.Vector3(...c.target), k = Math.min(cam === 'cmp' ? 1.7 : 1.9, Math.max(1, 1.4 / aspect))
    goal.current = { pos: new THREE.Vector3(...c.pos).sub(target).multiplyScalar(k).add(target), target }
    if (reducedMotion() && controls.current) { camera.position.copy(goal.current.pos); controls.current.target.copy(goal.current.target); controls.current.update(); goal.current = null }
  }, [cam, nonce, camera, aspect])
  useFrame((_, dt) => {
    // Slide the picture sideways by half the width a drawer covers, so the bus stays centred in the free space.
    const want = insetLeft / 2, cam = camera as THREE.PerspectiveCamera
    shift.current = reducedMotion() ? want : shift.current + (want - shift.current) * (1 - Math.exp(-dt * 7))
    if (Math.abs(shift.current - want) < 0.4) shift.current = want
    if (shift.current === 0) { if (cam.view?.enabled) cam.clearViewOffset() }
    else cam.setViewOffset(size.width, size.height, -shift.current, 0, size.width, size.height)
    const g = goal.current, ct = controls.current
    if (!g || !ct) return
    const k = 1 - Math.exp(-dt * 5)
    camera.position.lerp(g.pos, k); ct.target.lerp(g.target, k); ct.update()
    if (camera.position.distanceTo(g.pos) < 0.03) goal.current = null
  })
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} minDistance={4} maxDistance={60} maxPolarAngle={Math.PI * 0.52} onStart={() => { goal.current = null }} />
}

/** If WebGL fails after the canvas starts (lost context, driver bug), show the fallback instead of a blank page. */
export class StageBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function Floor() {
  const floor = useMemo(() => buildFloor(), [])
  useEffect(() => () => { floor.geometry.dispose(); (floor.material as THREE.MeshBasicMaterial).map?.dispose(); (floor.material as THREE.Material).dispose() }, [floor])
  return <primitive object={floor} />
}

export default function BusStage({ buses, lengthM, linePct, view, insetLeft, hovered, onHover, onSelect, ariaLabel }: Props) {
  const c = CAMS[view.cam]
  const [lowPower, setLowPower] = useState(false)
  // Bloom softens the glowing cells and cable. If the frame rate drops, it is the first thing to go.
  const post = !lowPower
  return (
    <Canvas flat dpr={lowPower ? 1 : [1, 1.5]} camera={{ position: c.pos, fov: 36, near: 0.1, far: 120 }} gl={{ antialias: !post, alpha: false, powerPreference: 'high-performance' }} onPointerMissed={() => onSelect(null)} role="img" aria-label={ariaLabel}>
      <color attach="background" args={['#09090b']} />
      <PerformanceMonitor onDecline={() => setLowPower(true)} />
      <ambientLight intensity={0.62} />
      <hemisphereLight args={['#c9d4ff', '#1a1305', 0.35]} />
      <directionalLight position={[6, 10, 8]} intensity={1.5} />
      <pointLight position={[-8, 4, -6]} intensity={30} color="#FACC15" distance={30} />
      <Floor />
      {buses.map((b) => <Bus key={b.key} spec={b} lengthM={lengthM} linePct={linePct} view={view} hovered={hovered} onHover={onHover} onSelect={onSelect} />)}
      <CameraRig cam={view.cam} nonce={view.camNonce} insetLeft={insetLeft} />
      {post && (
        <EffectComposer multisampling={2}>
          <Bloom intensity={0.7} luminanceThreshold={0.9} luminanceSmoothing={0.25} mipmapBlur radius={0.7} />
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
