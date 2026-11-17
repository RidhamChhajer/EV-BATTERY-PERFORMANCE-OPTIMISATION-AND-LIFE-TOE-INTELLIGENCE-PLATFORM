import { useFit } from '../../lib/useFit'
import { priceCurve, scaleCost, type CostBand } from '../../lib/costcalc'

const BASE_W = 700, H = 240, L = 54, R = 18, T = 18, B = 36
const niceStep = (v: number) => { const m = 10 ** Math.floor(Math.log10(v)), f = v / m; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * m }
type Props = { band: CostBand; basePrice: number; price: number; onPrice: (p: number) => void; lo: number; hi: number; target: number | null; breakEven: number | null; ghost?: { price: number; p50: number } | null }
const STEP = 500

/** Cost per km against battery price. Cost is price / km driven, so the whole spread scales straight with price: the curve is exact, not a fit.
 *  Drag the marker (or use the slider under the chart) to set the price the whole app uses. */
export function PriceCurve({ band, basePrice, price, onPrice, lo, hi, target, breakEven, ghost }: Props) {
  const { ref, W } = useFit(BASE_W, H)
  const pts = priceCurve(band, basePrice, lo, hi, 24)
  const rawMax = Math.max(pts[pts.length - 1].p90, target ?? 0, 1) * 1.05
  const stepY = niceStep(rawMax / 4), yMax = stepY * Math.ceil(rawMax / stepY)
  const x = (p: number) => L + ((W - L - R) * (p - lo)) / (hi - lo)
  const y = (c: number) => T + ((H - T - B) * (yMax - c)) / yMax
  const line = (k: 'p10' | 'p50' | 'p90') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.price).toFixed(1)} ${y(p[k]).toFixed(1)}`).join('')
  const area = line('p90') + [...pts].reverse().map((p) => `L${x(p.price).toFixed(1)} ${y(p.p10).toFixed(1)}`).join('') + 'Z'
  const cur = scaleCost(band, price, basePrice)
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect(), f = Math.min(1, Math.max(0, ((clientX - r.left) / r.width * W - L) / (W - L - R)))
    onPrice(Math.round((lo + f * (hi - lo)) / STEP) * STEP)
  }
  const yTicks = Array.from({ length: Math.round(yMax / stepY) + 1 }, (_, i) => i * stepY)
  const xTicks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4)
  return (
    <div className="pcurve">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cost per kilometre against battery price. At ₹${Math.round(price).toLocaleString('en-IN')} per kWh the median is ₹${cur.p50.toFixed(2)} per km, from ₹${cur.p10.toFixed(2)} to ₹${cur.p90.toFixed(2)}.`}
        onPointerDown={(e) => { (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId); at(e.clientX) }} onPointerMove={(e) => { if (e.buttons) at(e.clientX) }} style={{ touchAction: 'none', cursor: 'ew-resize', height: `clamp(220px, calc(100vh - 450px), ${Math.round(H * 1.15)}px)` }}>
        {yTicks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.07)" /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11.5" fill="var(--t3)">₹{t}</text></g>)}
        {xTicks.map((t) => <text key={t} x={x(t)} y={H - 12} textAnchor="middle" fontSize="11.5" fill="var(--t3)">{(t / 1000).toFixed(0)}k</text>)}
        <text x={W - R} y={H - 1} textAnchor="end" fontSize="11" fill="var(--t3)">battery price, ₹ per kWh</text>
        <path d={area} fill="rgba(250,204,21,.16)" />
        <path d={line('p10')} fill="none" stroke="rgba(250,204,21,.45)" strokeDasharray="4 4" />
        <path d={line('p90')} fill="none" stroke="rgba(250,204,21,.45)" strokeDasharray="4 4" />
        <path d={line('p50')} fill="none" stroke="var(--volt)" strokeWidth="2.4" />
        {target != null && <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} stroke="#fff" strokeOpacity=".55" strokeDasharray="2 5" />}
        {breakEven != null && breakEven >= lo && breakEven <= hi && <g><line x1={x(breakEven)} x2={x(breakEven)} y1={T} y2={H - B} stroke="#fff" strokeOpacity=".4" strokeDasharray="2 5" /><circle cx={x(breakEven)} cy={y(target ?? 0)} r="5" fill="#09090b" stroke="#fff" strokeWidth="1.6" /></g>}
        {ghost && ghost.price >= lo && ghost.price <= hi && <circle cx={x(ghost.price)} cy={y(ghost.p50)} r="6" fill="none" stroke="#fff" strokeWidth="1.6" strokeDasharray="3 3" />}
        <line x1={x(price)} x2={x(price)} y1={T} y2={H - B} stroke="rgba(255,255,255,.35)" />
        <circle cx={x(price)} cy={y(cur.p50)} r="8" fill="var(--volt)" stroke="#09090b" strokeWidth="2.5" style={{ filter: 'drop-shadow(0 0 8px rgba(250,204,21,.7))' }} />
      </svg>
      <input className="rng" type="range" min={lo} max={hi} step={STEP} value={Math.min(hi, Math.max(lo, price))} onChange={(e) => onPrice(+e.target.value)} aria-label="Battery price per kWh" aria-valuetext={`₹${Math.round(price).toLocaleString('en-IN')} per kWh`}
        style={{ '--p': `${((price - lo) / (hi - lo)) * 100}%` } as React.CSSProperties} />
    </div>
  )
}
