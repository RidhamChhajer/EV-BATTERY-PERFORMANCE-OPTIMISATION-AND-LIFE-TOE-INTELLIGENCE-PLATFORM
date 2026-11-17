import { useState } from 'react'
import type { ZoneMonth } from '../../api/types'
import { G, Grid, Tip, Y, type Box } from './geometry'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const H = { w: 700, h: 260 }
const STOPS: [number, number[]][] = [[8, [82, 82, 91]], [24, [161, 161, 170]], [32, [250, 204, 21]], [44, [249, 115, 22]]]
function colour(t: number) {
  if (t <= STOPS[0][0]) return STOPS[0][1]
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
    const k = (t - STOPS[i - 1][0]) / (STOPS[i][0] - STOPS[i - 1][0]), a = STOPS[i - 1][1], c = STOPS[i][1]
    return a.map((x, j) => Math.round(x + (c[j] - x) * k))
  }
  return STOPS[3][1]
}

export function SeasonChart({ months }: { months: ZoneMonth[] }) {
  const [hot, setHot] = useState<number | null>(null)
  const b: Box = { ...H, xMax: 12 }, bw = (H.w - G.L - G.R) / 12, lo = 0, hi = 50
  return (
    <svg className="ch" viewBox={`0 0 ${H.w} ${H.h}`} role="img" aria-label="Monthly mean air temperature with the average daily maximum and minimum" onPointerLeave={() => setHot(null)}>
      <Grid b={b} ticks={[0, 10, 20, 30, 40, 50]} lo={lo} hi={hi} fmt={(t) => `${t}°`} />
      {months.map((m, i) => {
        const x = G.L + i * bw + bw * 0.2, y = Y(b, m.tmean_c, lo, hi), cx = x + bw * 0.3, on = hot === i
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw * 0.6} height={Y(b, 0, lo, hi) - y} rx={6} fill={`rgb(${colour(m.tmean_c)})`} fillOpacity={on ? 1 : 0.72} />
            <line x1={cx} x2={cx} y1={Y(b, m.tmax_mean_c, lo, hi)} y2={Y(b, m.tmin_mean_c, lo, hi)} stroke="#fff" strokeOpacity=".85" strokeWidth="1.6" />
            <text x={cx} y={H.h - 8} textAnchor="middle">{MON[i]}</text>
            <rect x={G.L + i * bw} y={0} width={bw} height={H.h} fill="transparent" onPointerEnter={() => setHot(i)} />
            {on && <Tip b={b} x={cx} y={y} lines={[[MON[i]], [`mean ${m.tmean_c.toFixed(1)} °C`, '#FACC15'], [`day ${m.tmax_mean_c.toFixed(0)} · night ${m.tmin_mean_c.toFixed(0)} °C`, '#B4B4BC']]} />}
          </g>
        )
      })}
    </svg>
  )
}
