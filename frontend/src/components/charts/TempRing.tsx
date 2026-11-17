import { tempCss } from '../../lib/colors'

const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const S = 224, C = S / 2, RO = 84, RI = 54

/** Twelve months of mean cell temperature around a ring (January at the top, clockwise). Colour and the printed numbers carry the same value. */
export function TempRing({ temps, effective }: { temps: number[]; effective: number | null }) {
  const hot = temps.indexOf(Math.max(...temps)), n = temps.length
  const desc = `Mean cell temperature by month, from ${Math.min(...temps).toFixed(0)} to ${Math.max(...temps).toFixed(0)} degrees. Hottest month ${M[hot]}.`
  const pt = (a: number, r: number) => `${(C + r * Math.sin(a)).toFixed(1)} ${(C - r * Math.cos(a)).toFixed(1)}`
  return (
    <svg className="tring" viewBox={`0 0 ${S} ${S}`} role="img" aria-label={desc}>
      {temps.map((t, i) => {
        const a0 = (i / n) * 2 * Math.PI + 0.02, a1 = ((i + 1) / n) * 2 * Math.PI - 0.02, am = (a0 + a1) / 2
        const d = `M${pt(a0, RO)}A${RO} ${RO} 0 0 1 ${pt(a1, RO)}L${pt(a1, RI)}A${RI} ${RI} 0 0 0 ${pt(a0, RI)}Z`
        return (
          <g key={i}>
            <path d={d} fill={tempCss(t)} stroke={i === hot ? '#fff' : 'none'} strokeWidth="1.6"><title>{`${M[i]}: ${t.toFixed(1)} °C`}</title></path>
            <text x={C + (RO + 15) * Math.sin(am)} y={C - (RO + 15) * Math.cos(am) + 3.5} textAnchor="middle" fontSize="10" fill={i === hot ? '#fff' : 'var(--t3)'}>{M[i]}</text>
          </g>
        )
      })}
      <text x={C} y={C - 2} textAnchor="middle" fontSize="24" fontWeight="600" fill="#fff" fontFamily="var(--head)">{effective != null ? effective.toFixed(0) : '–'}°</text>
      <text x={C} y={C + 16} textAnchor="middle" fontSize="11" fill="var(--t3)">cell, all year</text>
    </svg>
  )
}
