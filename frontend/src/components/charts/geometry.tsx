export const G = { L: 50, R: 16, T: 16, B: 30 }
export type Box = { w: number; h: number; xMax: number }

export const X = (b: Box, year: number) => G.L + ((b.w - G.L - G.R) * year) / b.xMax
export const Y = (b: Box, v: number, lo: number, hi: number) => G.T + ((b.h - G.T - G.B) * (hi - v)) / (hi - lo)

/** Monthly series (index = month) -> path. Values are floored at `lo` so curves stop at the chart edge instead of leaving it. */
export function path(b: Box, a: number[], lo: number, hi: number): string {
  let s = ''
  const n = Math.min(a.length, Math.round(b.xMax * 12) + 1)
  for (let i = 0; i < n; i++) s += `${i ? 'L' : 'M'}${X(b, i / 12).toFixed(1)} ${Y(b, Math.max(a[i], lo), lo, hi).toFixed(1)}`
  return s
}
export function band(b: Box, top: number[], bottom: number[], lo: number, hi: number): string {
  const n = Math.min(top.length, bottom.length, Math.round(b.xMax * 12) + 1)
  let s = path(b, top.slice(0, n), lo, hi)
  for (let i = n - 1; i >= 0; i--) s += `L${X(b, i / 12).toFixed(1)} ${Y(b, Math.max(bottom[i], lo), lo, hi).toFixed(1)}`
  return `${s}Z`
}
export const yearAt = (b: Box, clientX: number, rect: DOMRect): number => {
  const vx = ((clientX - rect.left) / rect.width) * b.w
  return Math.max(0, Math.min(b.xMax, ((vx - G.L) / (b.w - G.L - G.R)) * b.xMax))
}
export function XAxis({ b }: { b: Box }) {
  const step = b.xMax > 10 ? 3 : 2
  const ticks: number[] = []
  for (let y = 0; y <= b.xMax; y += step) ticks.push(y)
  return <>{ticks.map((y) => <text key={y} x={X(b, y)} y={b.h - 8} textAnchor="middle">{y}</text>)}<text x={G.L - 9} y={b.h - 8} textAnchor="end" style={{ fill: '#8E8E98' }}>years</text></>
}
export function Grid({ b, ticks, lo, hi, fmt }: { b: Box; ticks: number[]; lo: number; hi: number; fmt: (t: number) => string }) {
  return <>{ticks.map((t) => { const y = Y(b, t, lo, hi); return <g key={t}><line x1={G.L} x2={b.w - G.R} y1={y} y2={y} stroke="rgba(255,255,255,.08)" /><text x={G.L - 9} y={y + 4} textAnchor="end">{fmt(t)}</text></g> })}</>
}
export function Tip({ b, x, y, lines }: { b: Box; x: number; y: number; lines: [string, string?][] }) {
  const bw = 176, bh = 16 + lines.length * 18
  const bx = x + 14 > b.w - bw - 6 ? x - bw - 14 : x + 14, by = Math.max(6, Math.min(b.h - bh - 6, y - bh / 2))
  return <g pointerEvents="none"><rect x={bx} y={by} width={bw} height={bh} rx={11} fill="#101012" stroke="#3F3F46" />{lines.map((l, i) => <text key={i} x={bx + 12} y={by + 22 + i * 18} style={{ fill: l[1] ?? '#fff', fontWeight: 700 }}>{l[0]}</text>)}</g>
}
