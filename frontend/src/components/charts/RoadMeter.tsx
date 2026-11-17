import type { CSSProperties } from 'react'
import { useFit } from '../../lib/useFit'

const BASE_W = 700, H = 120, L = 70, R = 20
type Props = { p50Km: number; p10Km: number; needKm: number; maxKm: number; onNeed: (km: number) => void }

/** A road in kilometres. The bar is how far a full charge goes now (solid = cautious, lighter = median), the flag is what the route needs with a 20 % reserve.
 *  Drag the flag to change the route length. */
export function RoadMeter({ p50Km, p10Km, needKm, maxKm, onNeed }: Props) {
  const { ref, W } = useFit(BASE_W, H)
  const x = (k: number) => L + ((W - L - R) * k) / maxKm
  const short = needKm > p50Km + 0.5
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect(), f = Math.min(1, Math.max(0, (((clientX - r.left) / r.width) * W - L) / (W - L - R)))
    onNeed(Math.round((f * maxKm) / 1.2 / 5) * 5)
  }
  const ticks = Array.from({ length: Math.floor(maxKm / 50) + 1 }, (_, i) => i * 50)
  return (
    <div className="road">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A full charge goes about ${Math.round(p50Km)} km now, ${Math.round(p10Km)} km on the cautious curve. The route needs ${Math.round(needKm)} km with reserve${short ? `, ${Math.round(needKm - p50Km)} km more than the pack gives` : ''}.`}
        onPointerDown={(e) => { (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId); at(e.clientX) }} onPointerMove={(e) => { if (e.buttons) at(e.clientX) }} style={{ touchAction: 'none', cursor: 'ew-resize', height: `clamp(90px, 11vh, ${Math.round(H * 1.15)}px)` }}>
        <defs>
          <pattern id="rm-h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(250,204,21,.28)" /><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(250,204,21,.9)" strokeWidth="2.2" /></pattern>
        </defs>
        {/* road */}
        <rect x={L} y="62" width={W - L - R} height="26" rx="13" fill="#1c1c20" stroke="rgba(255,255,255,.08)" />
        <line x1={L + 10} x2={W - R - 10} y1="75" y2="75" stroke="rgba(255,255,255,.14)" strokeDasharray="10 12" />
        {/* range */}
        <rect x={L} y="62" width={Math.max(2, x(p50Km) - L)} height="26" rx="13" fill="url(#rm-h)" />
        <rect x={L} y="62" width={Math.max(2, x(p10Km) - L)} height="26" rx="13" fill="#FACC15" style={{ filter: 'drop-shadow(0 0 8px rgba(250,204,21,.5))' }} />
        {short && <rect x={x(p50Km)} y="62" width={Math.max(0, x(needKm) - x(p50Km))} height="26" rx="6" fill="rgba(251,146,60,.35)" stroke="#fb923c" strokeDasharray="3 3" />}
        {/* bus */}
        <g transform="translate(6,52)"><rect width="52" height="30" rx="6" fill="#26262b" stroke="#FACC15" strokeWidth="1.5" /><rect x="6" y="6" width="9" height="9" rx="2" fill="#FACC15" opacity=".8" /><rect x="19" y="6" width="9" height="9" rx="2" fill="#FACC15" opacity=".8" /><rect x="32" y="6" width="9" height="9" rx="2" fill="#FACC15" opacity=".8" /><circle cx="14" cy="32" r="5" fill="#09090b" stroke="#a1a1aa" strokeWidth="2" /><circle cx="40" cy="32" r="5" fill="#09090b" stroke="#a1a1aa" strokeWidth="2" /></g>
        {/* ticks */}
        {ticks.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1="92" y2="98" stroke="rgba(255,255,255,.3)" /><text x={x(t)} y="112" textAnchor="middle" fontSize="14" fill="var(--t3)">{t}</text></g>)}
        <text x={W - R} y="12" textAnchor="end" fontSize="11" fill="var(--t3)">km</text>
        {/* flag */}
        <g transform={`translate(${x(needKm)},0)`} style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,.45))' }}>
          <line y1="30" y2="92" stroke="#fff" strokeWidth="2.2" /><path d="M0 30 L26 38 L0 46Z" fill="#fff" />
        </g>
      </svg>
      <div className="road-l"><span><i className="sw a" />cautious {Math.round(p10Km)} km</span><span><i className="sw b" />median {Math.round(p50Km)} km</span><span><i className="sw f" />route + 20 % {Math.round(needKm)} km</span></div>
      <input className="rng" type="range" min={20} max={Math.round(maxKm / 1.2)} step={5} value={Math.min(Math.round(maxKm / 1.2), Math.max(20, Math.round(needKm / 1.2)))} onChange={(e) => onNeed(+e.target.value)} aria-label="Route length, kilometres per day" aria-valuetext={`${Math.round(needKm / 1.2)} km per day`}
        style={{ '--p': `${(needKm / 1.2 / (maxKm / 1.2)) * 100}%` } as CSSProperties} />
    </div>
  )
}
