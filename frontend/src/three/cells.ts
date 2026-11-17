import * as THREE from 'three'

/** Shared look-up values for every cell ring of one bus. They ease toward targets each frame, so scrubbing the year drains the rings smoothly. */
export type CellTargets = {
  color: THREE.Color
  lo: number; mid: number; hi: number      // retained capacity at the chosen year, as fractions (10th / 50th / 90th percentile)
  line: number                             // replacement line as a fraction
  cal: number                              // share of the loss that is calendar ageing
  mode: 0 | 1 | 2                          // 0 health (capacity left), 1 charge (state of charge), 2 heat (cell temperature)
  soc: number; socMin: number; socMax: number
  glow: number; wear: number
}
export type CellUniforms = { [K in keyof Omit<CellTargets, 'color'> | 'color' | 'time']: { value: K extends 'color' ? THREE.Color : number } }

export const makeCellUniforms = (): CellUniforms => ({
  color: { value: new THREE.Color(0xfacc15) }, lo: { value: 1 }, mid: { value: 1 }, hi: { value: 1 }, line: { value: 0.8 }, cal: { value: 0.5 }, mode: { value: 0 },
  soc: { value: 1 }, socMin: { value: 0.1 }, socMax: { value: 1 }, glow: { value: 1.6 }, wear: { value: 0 }, time: { value: 0 },
})

const VERT = `attribute float aS; varying vec2 vUv; varying float vS;
void main(){ vUv=uv; vS=aS; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`

/** Each cell is drawn from above as a ring gauge: the arc is the capacity it still holds (a full circle is a new cell).
 *  Health mode: the lit arc is what is left; the dim arcs are what was lost, calendar (cool slate) and cycling (warm umber) in proportion;
 *  a faint rim arc is the model's 10th-90th percentile range; a white tick is the replacement line. */
const FRAG = `uniform vec3 uColor; uniform float uLo,uMid,uHi,uLine,uCal,uMode,uSoc,uSocMin,uSocMax,uGlow,uWear,uTime,uBoost,uOpacity;
varying vec2 vUv; varying float vS;
float tick(float a,float at,float w){ return 1.-smoothstep(w*.5,w,abs(a-at)); }
void main(){
  vec2 p=vUv-.5; float r=length(p)*2.; float a=fract(atan(p.x,p.y)/6.2831853);
  float ring=smoothstep(.5,.56,r)*(1.-smoothstep(.88,.94,r));
  float disc=1.-smoothstep(.44,.5,r);
  float u=vS*.85; float lvl=u>=0.? uMid+(uHi-uMid)*u : uMid+(uMid-uLo)*u;
  vec3 col=vec3(.045,.045,.05); float alpha=disc*.85+ring*.5;
  if(uMode<.5){
    float lost=1.-lvl, calEnd=lvl+lost*uCal; vec3 c; float on;
    if(a<lvl){ c=uColor*uGlow; on=1.; } else if(a<calEnd){ c=vec3(.42,.55,.70); on=.85; } else { c=vec3(.62,.38,.20); on=.85; }
    float weak=step(lvl,uLine)*uWear*step(a,lvl);
    c=mix(c,vec3(1.,.42,.08)*1.1,weak*.8);   // steady: a time-based pulse here crossed the bloom threshold every ~3 s and read as screen flicker
    col=mix(col,c,ring*on); alpha=max(alpha,ring*(.4+.6*on));
    col+=uColor*uGlow*.3*lvl*disc; alpha=max(alpha,disc*.95);
    float rim=smoothstep(.95,.965,r)*(1.-smoothstep(.985,1.,r)); float inb=step(uLo,a)*step(a,uHi);
    col=mix(col,vec3(1.),rim*inb*.4); alpha=max(alpha,rim*inb*.55);
    float t=tick(a,uLine,.014)*smoothstep(.46,.5,r)*(1.-smoothstep(.97,1.,r)); col=mix(col,vec3(1.),t*.9); alpha=max(alpha,t);
  } else if(uMode<1.5){
    float on=step(a,uSoc); vec3 c=mix(vec3(.12,.16,.2),uColor*uGlow,on);
    col=mix(col,c,ring); alpha=max(alpha,ring*(.45+.55*on));
    col+=uColor*uGlow*.3*uSoc*disc;
    float t=max(tick(a,uSocMin,.016),tick(a,uSocMax,.016))*smoothstep(.46,.5,r)*(1.-smoothstep(.97,1.,r)); col=mix(col,vec3(1.),t*.9); alpha=max(alpha,t);
  } else {
    col=mix(col,uColor*uGlow,ring); alpha=max(alpha,ring*.95);
    col+=uColor*uGlow*.35*disc; alpha=max(alpha,disc*.95);
  }
  gl_FragColor=vec4(col*uBoost,alpha*uOpacity);
}`

/** One shader material per pack module; the numbers shared by the whole bus are the same objects, so changing one changes all. */
export function makeCellMaterial(U: CellUniforms) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uColor: U.color, uLo: U.lo, uMid: U.mid, uHi: U.hi, uLine: U.line, uCal: U.cal, uMode: U.mode, uSoc: U.soc, uSocMin: U.socMin, uSocMax: U.socMax, uGlow: U.glow, uWear: U.wear, uTime: U.time,
      uBoost: { value: 1 }, uOpacity: { value: 1 },
    },
  })
}

/** A grid of cell quads lying on the top face of a pack module (module-local coordinates, face at height `y`). `seed0` keeps scatter different between modules. */
export function buildCells(w: number, d: number, y: number, cols: number, rows: number, seed0: number, scatter: (i: number) => number, mat: THREE.ShaderMaterial) {
  const geo = new THREE.PlaneGeometry(1, 1), n = cols * rows
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(new Float32Array(n), 1))
  const mesh = new THREE.InstancedMesh(geo, mat, n)
  const cw = w / cols, cd = d / rows, s = Math.min(cw, cd) * 0.9
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), sc = new THREE.Vector3(s, s, s)
  const a = geo.getAttribute('aS') as THREE.InstancedBufferAttribute
  let i = 0
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++, i++) {
    m.compose(new THREE.Vector3(-w / 2 + cw * (c + 0.5), y, -d / 2 + cd * (r + 0.5)), q, sc)
    mesh.setMatrixAt(i, m); a.setX(i, scatter(seed0 + i))
  }
  mesh.instanceMatrix.needsUpdate = true; a.needsUpdate = true
  mesh.frustumCulled = false; mesh.renderOrder = 2
  mesh.raycast = () => {}
  return mesh
}
