import * as THREE from 'three'
import { healthRGB } from '../lib/colors'
import { scatter } from '../lib/ageCells'
import { buildCells, makeCellMaterial, makeCellUniforms, type CellUniforms } from './cells'
import { buildDepot } from './depot'
import { buildLane, buildRuler, buildShimmer } from './instruments'

export type PackId = 'roof' | 'under' | 'rear'
export type BusRig = ReturnType<typeof buildBus>

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80
  const g = c.getContext('2d')!, r = g.createRadialGradient(128, 40, 4, 128, 40, 128)
  r.addColorStop(0, 'rgba(0,0,0,0.75)'); r.addColorStop(0.6, 'rgba(0,0,0,0.32)'); r.addColorStop(1, 'rgba(0,0,0,0)')
  g.setTransform(1, 0, 0, 80 / 256, 0, 0); g.fillStyle = r; g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

/** Procedural bus. Everything is boxes, cylinders and lines: no model files, so no licensing and no loading. `lengthM` is 12 or 9 (x positions scale; wheels and doors keep their size). */
export function buildBus(lengthM: 12 | 9) {
  const k = lengthM / 12
  const group = new THREE.Group(), shellG = new THREE.Group(), chassisG = new THREE.Group(), packG = new THREE.Group()
  group.add(shellG, chassisG, packG)
  const mods: Record<PackId, THREE.Mesh[]> = { roof: [], under: [], rear: [] }
  const glass: THREE.MeshBasicMaterial[] = [], lines: THREE.LineBasicMaterial[] = []

  // body: side profile extruded across the width, with rounded roof and nose
  const sh = new THREE.Shape()
  sh.moveTo(-5.85 * k, 0.42); sh.lineTo(5.7 * k, 0.42); sh.quadraticCurveTo(6 * k, 0.42, 6 * k, 0.75); sh.lineTo(6 * k, 2.75)
  sh.quadraticCurveTo(6 * k, 3.15, 5.6 * k, 3.15); sh.lineTo(-4.9 * k, 3.15); sh.quadraticCurveTo(-5.7 * k, 3.1, -5.95 * k, 2.3); sh.lineTo(-6 * k, 0.8); sh.quadraticCurveTo(-6 * k, 0.42, -5.85 * k, 0.42)
  const sg = new THREE.ExtrudeGeometry(sh, { depth: 2.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 })
  sg.translate(0, 0, -1.25)
  const fres = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uC: { value: new THREE.Color(0xfacc15) }, uO: { value: 1 } },
    vertexShader: 'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform vec3 uC;uniform float uO;varying vec3 vN;varying vec3 vV;void main(){float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.4);gl_FragColor=vec4(mix(vec3(.85),uC,.55),(f*.5+.035)*uO);}',
  })
  shellG.add(new THREE.Mesh(sg, fres))
  const edgeM = new THREE.LineBasicMaterial({ color: 0xd4d4d8, transparent: true, opacity: 0.5 })
  shellG.add(new THREE.LineSegments(new THREE.EdgesGeometry(sg, 28), edgeM))

  const gm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }); glass.push(gm)
  const frame = new THREE.LineBasicMaterial({ color: 0xa1a1aa, transparent: true, opacity: 0.55 }); lines.push(frame)
  const doorM = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.7 }); lines.push(doorM)
  const panel = (w: number, h: number, x: number, y: number, z: number, ry: number, fr: THREE.LineBasicMaterial) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gm); p.position.set(x, y, z); p.rotation.y = ry
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(p.geometry), fr); l.position.copy(p.position); l.rotation.copy(p.rotation)
    shellG.add(p, l)
  }
  const winX = [-3.0, -1.85, 1.35, 2.5, 3.65, 4.8].map((x) => x * k)
  winX.forEach((x) => [-1, 1].forEach((s) => panel(1 * Math.max(k, 0.8), 0.95, x, 2.3, s * 1.32, s < 0 ? Math.PI : 0, frame)))
  ;[-5.0 * k, 0].forEach((x, i) => [-1, 1].forEach((s) => panel(i ? 1.3 : 1.0, 2.05, x, 1.48, s * 1.32, s < 0 ? Math.PI : 0, doorM)))
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.15), gm); ws.position.set(-5.88 * k, 2.45, 0); ws.rotation.y = -Math.PI / 2 + 0.12; shellG.add(ws)

  // lights, mirrors, destination sign
  const basic = (c: number) => new THREE.MeshBasicMaterial({ color: c })
  ;[-1, 1].forEach((s) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.55), basic(0xffffff)); h.position.set(-6.03 * k, 0.9, s * 0.85); chassisG.add(h)
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.4), basic(0xef4444)); t.position.set(6.05 * k, 0.95, s * 0.9); chassisG.add(t)
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.1), new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.6 })); m.position.set(-5.5 * k, 2.65, s * 1.52); chassisG.add(m)
  })
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 1.7), basic(0xfacc15)); sign.position.set(-5.86 * k, 2.95, 0); sign.rotation.z = 0.12; chassisG.add(sign)

  // wheels and axles
  const tyre = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.9 }), rim = new THREE.MeshStandardMaterial({ color: 0x71717a, metalness: 0.8, roughness: 0.3 }), spoke = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, metalness: 0.8, roughness: 0.35 })
  const axles = [-3.7 * k, 2.2 * k]
  const wheels: THREE.Group[] = []
  axles.forEach((ax) => [-1, 1].forEach((s) => {
    const w = new THREE.Group(); w.position.set(ax, 0.52, s * 1.2); wheels.push(w)
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.34, 32), tyre); t.rotation.x = Math.PI / 2; w.add(t)
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.36, 24), rim); r.rotation.x = Math.PI / 2; w.add(r)
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), spoke); b.rotation.z = (i * Math.PI * 2) / 5; b.position.z = s * 0.19; w.add(b) }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 12), basic(0xfacc15)); cap.rotation.x = Math.PI / 2; w.add(cap)
    chassisG.add(w)
  }))
  const axleM = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.6 })
  axles.forEach((x) => { const a = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.4), axleM); a.position.set(x, 0.52, 0); chassisG.add(a) })

  // battery packs: roof x4, underfloor x2, rear x1 (the layout is a typical arrangement, shown as a schematic)
  const U: CellUniforms = makeCellUniforms()
  let seed = 0
  const mod = (id: PackId, w: number, h: number, d: number, x: number, y: number, z: number, ex: [number, number, number]) => {
    // dark module body; the cells on its top face carry the health colour as capacity rings (see cells.ts)
    const mat = new THREE.MeshStandardMaterial({ color: 0x17171b, emissive: 0xfacc15, emissiveIntensity: 0.07, roughness: 0.5, metalness: 0.4, transparent: true })
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z)
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x52525b, transparent: true, opacity: 0.9 })); m.add(edge)
    const cmat = makeCellMaterial(U)
    const cols = Math.max(2, Math.round(w / 0.3)), rows = Math.max(2, Math.round(d / 0.3))
    const cells = buildCells(w, d, h / 2 + 0.008, cols, rows, seed, scatter, cmat); seed += cols * rows; m.add(cells)
    m.userData = { id, base: new THREE.Vector3(x, y, z), ex: new THREE.Vector3(...ex), edge, cmat }
    packG.add(m); mods[id].push(m)
  }
  ;[-4.05, -1.9, 2.85, 4.9].forEach((x, i) => mod('roof', 1.8 * k, 0.3, 1.55, x * k, 3.37, 0, [(i - 1.5) * 0.5, 2.2, 0]))
  mod('under', 2.9 * k, 0.32, 1.6, -1.5 * k, 0.62, 0, [-0.8, -1.4, 0]); mod('under', 2.9 * k, 0.32, 1.6, 1.5 * k, 0.62, 0, [0.8, -1.4, 0])
  mod('rear', 0.95, 0.95, 1.65, 5.1 * k, 1.4, 0, [2.2, 0.4, 0])

  // roof air-conditioning unit (context only; the model has no air-conditioning data)
  const hvac = new THREE.Mesh(new THREE.BoxGeometry(2.2 * k, 0.34, 1.6), new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.7, metalness: 0.2 })); hvac.position.set(0.45 * k, 3.39, 0); packG.add(hvac)
  for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x52525b, metalness: 0.7 })); f.position.set((-0.35 + (i % 3) * 0.8 + 0.2) * k, 3.57, i < 3 ? -0.35 : 0.35); packG.add(f) }

  // charge port and high-voltage cable routes (flow overlay)
  const port = new THREE.Vector3(-4.55 * k, 1.05, 1.33)
  const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 20), basic(0xfacc15)); pm.rotation.x = Math.PI / 2; pm.position.copy(port); chassisG.add(pm)
  const pr = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.19, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); pr.position.set(port.x, port.y, port.z + 0.04); chassisG.add(pr)
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x * k, y, z)
  const routes = [
    [port, V(-3.4, 0.95, 0.9), V(-1.5, 0.62, 0), V(1.5, 0.62, 0)],
    [port, V(-4.6, 2.2, 0.8), V(-4.05, 3.37, 0), V(-1.9, 3.37, 0), V(2.85, 3.37, 0), V(4.9, 3.37, 0)],
    [port, V(-2.6, 1.5, 1.1), V(3.5, 1.4, 0.9), V(5.1, 1.4, 0)],
  ]
  const flow = new THREE.Group()
  const curves = routes.map((p) => { const c = new THREE.CatmullRomCurve3(p); flow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(60)), new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.28 }))); return c })
  const N = 48
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3 * 3), 3))
  flow.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffe066, size: 0.16, transparent: true, opacity: 0.95, depthWrite: false })))
  flow.visible = false; group.add(flow)

  // dimension line
  const dim = new THREE.Group(), dmat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
  ;[[[-6 * k, -0.05, 2.1], [6 * k, -0.05, 2.1]], [[-6 * k, -0.05, 1.9], [-6 * k, -0.05, 2.3]], [[6 * k, -0.05, 1.9], [6 * k, -0.05, 2.3]]].forEach((p) => dim.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p.map((a) => new THREE.Vector3(a[0], a[1], a[2]))), dmat)))
  dim.visible = false; group.add(dim)

  // depot charger and cable, range ruler, heat shimmer, moving lane marks and a soft ground shadow
  const depot = buildDepot(k); group.add(depot.group)
  const ruler = buildRuler(k); group.add(ruler.group)
  const shimmer = buildShimmer(k); group.add(shimmer.pts)
  const lane = buildLane(k); group.add(lane.group)
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(15 * k, 4.6), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }))
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.004; group.add(shadow)

  // only the battery modules are pickable; the transparent shell must never swallow a click meant for a pack
  group.traverse((o) => { if (!o.userData.id) o.raycast = () => {} })

  return { group, shellG, chassisG, packG, mods, fres, edgeM, glass, lines, hvac, port, flow, curves, pg, N, dim, k, lengthM, U, wheels, depot, ruler, shimmer, lane, shadow }
}

export const allMods = (r: BusRig) => [...r.mods.roof, ...r.mods.under, ...r.mods.rear]

export function paintHealth(r: BusRig, healthPct: number, linePct = 80, rgb?: [number, number, number]) {
  const [R, G, B] = rgb ?? healthRGB(healthPct, linePct)
  const c = new THREE.Color(R / 255, G / 255, B / 255)
  allMods(r).forEach((m) => (m.material as THREE.MeshStandardMaterial).emissive.copy(c))
  r.U.color.value.setRGB(R / 255, G / 255, B / 255)
}

/** Move the pack glow toward a target colour. Returns nothing; call every frame. `k` is the easing for this frame (0..1). */
export function easePaint(r: BusRig, target: THREE.Color, k: number) {
  allMods(r).forEach((m) => (m.material as THREE.MeshStandardMaterial).emissive.lerp(target, k))
  r.U.color.value.lerp(target, k)
}

export function setShellOpacity(r: BusRig, o: number) {
  r.fres.uniforms.uO.value = o; r.edgeM.opacity = 0.5 * o
  r.glass.forEach((g) => (g.opacity = 0.07 * o)); r.lines.forEach((l, i) => (l.opacity = (i === 0 ? 0.55 : 0.7) * o))
}

export function updateFlow(r: BusRig, t: number) {
  const a = r.pg.attributes.position.array as Float32Array, n = r.N
  for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) { const p = r.curves[c].getPoint((t * 0.18 + i / n) % 1), o = (c * n + i) * 3; a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.z }
  r.pg.attributes.position.needsUpdate = true
}

export function updateMods(r: BusRig, o: { explode: number; selected: PackId | null; hovered: PackId | null; isolate: boolean; scanX: number | null; scanOffsetX: number; pulse?: number; thick?: number; dim?: number }) {
  allMods(r).forEach((m) => {
    m.position.copy(m.userData.base).addScaledVector(m.userData.ex, o.explode)
    m.scale.y = o.thick ?? 1
    const id = m.userData.id as PackId, mat = m.material as THREE.MeshStandardMaterial
    const sel = o.selected === id
    let b = 1.0
    if (sel) b = 1.7; else if (o.hovered === id) b = 1.4
    if (o.scanX != null) b += clamp(1 - Math.abs(m.position.x + o.scanOffsetX - o.scanX) / 1.3, 0, 1) * 1.6
    mat.emissiveIntensity = 0.07 * b + (o.pulse ?? 0) * 0.3
    const cm = m.userData.cmat as THREE.ShaderMaterial
    cm.uniforms.uBoost.value = (0.85 + 0.15 * b + (o.pulse ?? 0) * 0.9) * (o.dim ?? 1) + (o.scanX != null ? clamp(1 - Math.abs(m.position.x + o.scanOffsetX - o.scanX) / 1.3, 0, 1) * 0.8 : 0)
    mat.opacity = o.isolate && o.selected && !sel ? 0.18 : 1
    cm.uniforms.uOpacity.value = mat.opacity
    ;(m.userData.edge as THREE.LineSegments).material = (m.userData.edge as THREE.LineSegments).material
    ;((m.userData.edge as THREE.LineSegments).material as THREE.LineBasicMaterial).color.setHex(sel ? 0xfacc15 : 0x52525b)
  })
}

export function disposeRig(r: BusRig) {
  r.group.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose?.()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    ;(Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose?.(); x.dispose() })
  })
}
