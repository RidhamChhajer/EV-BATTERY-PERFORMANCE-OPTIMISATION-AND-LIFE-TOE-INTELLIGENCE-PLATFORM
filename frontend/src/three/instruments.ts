import * as THREE from 'three'

/** Ground ruler for the Range lens: the bar is the distance a full charge covers now, the tick is what the route plus reserve needs.
 *  If the bar stops short, the gap is drawn in warm amber right there on the ground. */
export function buildRuler(k: number) {
  const group = new THREE.Group()
  const L = 12 * k
  const track = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 0.1), new THREE.MeshBasicMaterial({ color: 0x27272a, transparent: true, opacity: 0.9 }))
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.16), new THREE.MeshBasicMaterial({ color: 0xfacc15, toneMapped: false }))
  const gap = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.16), new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.75, toneMapped: false }))
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }))
  group.add(track, bar, gap, tick)
  group.position.set(0, 0.03, 2.35); group.visible = false
  group.traverse((o) => { o.raycast = () => {} })
  return { group, track, bar, gap, tick, L, x0: -6 * k }
}
export type Ruler = ReturnType<typeof buildRuler>

/** Returns the x positions (scene units, bus-local) of the bar end and tick, so labels can sit on them. */
export function updateRuler(r: Ruler, o: { rangeKm: number; needKm: number | null; maxKm: number }) {
  const per = r.L / Math.max(o.maxKm, 1)
  const bw = Math.max(0.01, o.rangeKm * per), nx = o.needKm == null ? null : o.needKm * per
  r.track.scale.x = r.L; r.track.position.x = r.x0 + r.L / 2
  r.bar.scale.x = bw; r.bar.position.x = r.x0 + bw / 2
  const short = nx != null && nx > bw + 0.02
  r.gap.visible = short; if (short) { r.gap.scale.x = nx! - bw; r.gap.position.x = r.x0 + bw + (nx! - bw) / 2 }
  r.tick.visible = nx != null; if (nx != null) r.tick.position.set(r.x0 + nx, 0.25, 0)
  ;(r.bar.material as THREE.MeshBasicMaterial).color.setHex(short ? 0xfde68a : 0xfacc15)
  return { barX: r.x0 + bw, tickX: nx == null ? null : r.x0 + nx, short }
}

/** Heat shimmer over the packs: faint motes that rise faster and thicker the hotter the cells run. */
export function buildShimmer(k: number) {
  const N = 70, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
  const seed = new Float32Array(N * 3).map(() => Math.random())
  const m = new THREE.PointsMaterial({ color: 0xffb454, size: 0.1, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; pts.raycast = () => {}
  return { pts, g, m, N, seed, k }
}
export type Shimmer = ReturnType<typeof buildShimmer>
export function updateShimmer(s: Shimmer, o: { t: number; strength: number; visible: boolean }) {
  s.pts.visible = o.visible && o.strength > 0.02
  if (!s.pts.visible) return
  const a = s.g.attributes.position.array as Float32Array
  for (let i = 0; i < s.N; i++) {
    const u = (o.t * (0.1 + 0.25 * o.strength) + s.seed[i * 3]) % 1
    a[i * 3] = (s.seed[i * 3 + 1] * 2 - 1) * 5.6 * s.k + Math.sin(o.t + i) * 0.08
    a[i * 3 + 1] = 3.5 + u * 1.6
    a[i * 3 + 2] = (s.seed[i * 3 + 2] * 2 - 1) * 0.8
  }
  s.g.attributes.position.needsUpdate = true
  s.m.opacity = Math.min(0.85, 0.15 + o.strength * 0.7)
}

/** Dashed lane marking beside the bus. It slides backwards while the bus drives in the day animation, so a still scene never fakes motion. */
export function buildLane(k: number) {
  const group = new THREE.Group(), step = 2, n = 16
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, toneMapped: false })
  const g = new THREE.BoxGeometry(0.9, 0.004, 0.07)
  for (let i = -n; i <= n; i++) { const b = new THREE.Mesh(g, m); b.position.set(i * step, 0.006, -2.55); group.add(b) }
  group.visible = false
  group.traverse((o) => { o.raycast = () => {} })
  return { group, step, m, k }
}
export type Lane = ReturnType<typeof buildLane>
