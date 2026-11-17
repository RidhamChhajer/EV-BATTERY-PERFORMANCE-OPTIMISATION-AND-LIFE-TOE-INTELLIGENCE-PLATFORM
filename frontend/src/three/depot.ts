import * as THREE from 'three'

export type Depot = ReturnType<typeof buildDepot>

/** Depot charger beside the bus with a thin cable to its charge port. The cable and the light pulses on it are driven by charger power. */
export function buildDepot(k: number) {
  const group = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.5, metalness: 0.55 })
  const trim = new THREE.MeshStandardMaterial({ color: 0x2a2a31, roughness: 0.4, metalness: 0.7 })
  const X = -5.15 * k, Z = 2.8
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.45, 0.3), body); ped.position.set(X, 0.725, Z); group.add(ped)
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.55), trim); base.position.set(X, 0.04, Z); group.add(base)
  const head = new THREE.Group(); head.position.set(X, 1.62, Z)
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.36, 0.38), trim))
  const stripM = new THREE.MeshBasicMaterial({ color: 0xfacc15, toneMapped: false })
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.02), stripM); strip.position.set(0, 0.06, -0.2); head.add(strip)
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.02), stripM); rim.position.set(0, 0.06, 0.2); head.add(rim)
  group.add(head)
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.1, 0.02), stripM); spine.position.set(X, 0.8, Z + 0.16); group.add(spine)
  const ledM = new THREE.MeshBasicMaterial({ color: 0xfacc15, toneMapped: false })
  const led = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 8, 28), ledM); led.position.set(X, 1.3, Z - 0.17); group.add(led)

  // cable: charger socket -> hangs low -> charge port (-4.55k, 1.05, 1.33)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(X, 1.3, Z - 0.2), new THREE.Vector3(X, 0.42, Z - 0.5), new THREE.Vector3(X + 0.35 * k, 0.5, 2.0), new THREE.Vector3(-4.6 * k, 0.95, 1.5), new THREE.Vector3(-4.55 * k, 1.05, 1.36),
  ])
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141417, roughness: 0.8 })
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.022, 8), rubber))
  const coreM = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.3, toneMapped: false, depthWrite: false })
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.009, 6), coreM))
  const N = 16
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
  const pm = new THREE.PointsMaterial({ color: 0xfff0a0, size: 0.11, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })
  const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; group.add(pts)

  // parking bay outline
  const bay = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(12.8 * k, 0.001, 3.3)), new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.16 }))
  bay.position.set(0, 0.006, 0); group.add(bay)

  group.traverse((o) => { o.raycast = () => {} })
  return { group, head, curve, pts, pg, N, ledM, stripM, coreM, pm, X, Z }
}

/** `kw` sets pulse speed, count and brightness. `energised` false means the plug is out (bus away or full): the cable goes dark. `tier` scales the head. */
export function updateDepot(d: Depot, o: { t: number; kw: number; energised: boolean; idleGlow: number; boost?: number; calm?: number }) {
  const power = Math.min(Math.max(o.kw, 0), 400) / 400                  // 0..1 of a 400 kW scale
  const speed = 0.12 + 0.75 * power
  const shown = Math.max(2, Math.round(3 + power * (d.N - 3)))
  const a = d.pg.attributes.position.array as Float32Array
  for (let i = 0; i < d.N; i++) {
    const on = i < shown, p = d.curve.getPoint((o.t * speed + i / shown) % 1), j = i * 3
    a[j] = on ? p.x : 0; a[j + 1] = on ? p.y : -9; a[j + 2] = on ? p.z : 0
  }
  d.pg.attributes.position.needsUpdate = true
  const live = (o.energised ? 1 : o.idleGlow) * (o.calm ?? 1)
  d.pm.opacity = 0.95 * live; d.pm.size = 0.08 + 0.07 * power
  d.coreM.opacity = (0.12 + 0.5 * live) * (0.6 + 0.4 * power)
  const b = (o.boost ?? 0)
  d.ledM.color.setHex(o.energised ? 0xfacc15 : 0x6b7280).multiplyScalar(1 + b)
  d.stripM.color.setHex(o.energised ? 0xfacc15 : 0x4b5563).multiplyScalar(1 + b)
  const tier = 0.88 + power * 0.4
  d.head.scale.set(tier, tier, 1)
}

/** Soft depot floor: faint grid that fades into the page background. One canvas texture, no lights needed. */
export function buildFloor() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d')!
  const rad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  rad.addColorStop(0, 'rgba(26,26,31,0.95)'); rad.addColorStop(0.55, 'rgba(18,18,22,0.7)'); rad.addColorStop(1, 'rgba(9,9,11,0)')
  g.fillStyle = rad; g.fillRect(0, 0, S, S)
  g.strokeStyle = 'rgba(255,255,255,0.055)'; g.lineWidth = 1
  for (let i = 0; i <= 48; i++) { const p = (i / 48) * S; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke() }
  g.globalCompositeOperation = 'destination-in'
  const mask = g.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S / 2); mask.addColorStop(0, 'rgba(0,0,0,1)'); mask.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = mask; g.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  const m = new THREE.Mesh(new THREE.CircleGeometry(24, 64), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }))
  m.rotation.x = -Math.PI / 2; m.position.y = -0.02; m.raycast = () => {}
  return m
}
