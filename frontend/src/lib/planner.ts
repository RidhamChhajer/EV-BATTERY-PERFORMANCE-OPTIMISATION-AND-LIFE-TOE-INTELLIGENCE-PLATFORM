/** Turns the model's "share of runs that have reached the replacement line by month m" (a cumulative curve, 0..1 per month) into planning views.
 *  Every view assumes a fleet spreads like the model's runs: independent buses, no second pack, no discounting. */

/** One dot per 1/n of the runs, at the month it reached the line. `null` = had not reached it by the end of the forecast. */
export function quantileDots(cdf: number[], n = 50): (number | null)[] {
  return Array.from({ length: n }, (_, i) => {
    const q = (i + 0.5) / n
    const m = cdf.findIndex((p) => p >= q - 1e-9)
    return m < 0 ? null : m
  })
}

export type YearBar = { year: number; expected: number }
/** Expected number of buses (out of `fleet`) reaching the line in each year of the forecast, plus the expected number still going after it. */
export function annualSchedule(cdf: number[], fleet: number) {
  const last = cdf.length - 1, years = Math.floor(last / 12)
  const at = (m: number) => cdf[Math.min(m, last)]
  const bars: YearBar[] = Array.from({ length: years }, (_, y) => ({ year: y + 1, expected: fleet * Math.max(0, at((y + 1) * 12) - at(y * 12)) }))
  return { bars, after: fleet * Math.max(0, 1 - at(years * 12)) }
}

/** Running total of the first-pack spend after each year (undiscounted). */
export const cumulativeSpend = (bars: YearBar[], packCostInr: number) => {
  let s = 0
  return bars.map((b) => (s += b.expected * packCostInr))
}

/** Exact quantile of Binomial(n, p): the smallest k with P(X <= k) >= q. Log-space so a fleet of thousands does not overflow. */
export function binomialQuantile(n: number, p: number, q: number): number {
  if (p <= 0) return 0
  if (p >= 1) return n
  const lf = [0]
  for (let i = 1; i <= n; i++) lf.push(lf[i - 1] + Math.log(i))
  const lp = Math.log(p), lq = Math.log(1 - p)
  let cdf = 0
  for (let k = 0; k <= n; k++) {
    cdf += Math.exp(lf[n] - lf[k] - lf[n - k] + k * lp + (n - k) * lq)
    if (cdf >= q - 1e-12) return k
  }
  return n
}

/** The years in which most of the fleet reaches the line: from the first year the share reaches `lo` to the first year it reaches `hi`.
 *  `to` is null when `hi` is not reached within the forecast. `from` is null when even `lo` is not. */
export function bulkWindow(cdf: number[], lo = 0.1, hi = 0.9) {
  const last = cdf.length - 1, years = Math.floor(last / 12)
  const first = (t: number) => { for (let y = 1; y <= years; y++) if (cdf[Math.min(y * 12, last)] >= t - 1e-9) return y; return null }
  return { from: first(lo), to: first(hi) }
}

export type YearProvision = { year: number; expected: number; low: number; high: number; share: number }
/** Per year: expected number of buses reaching the line and the 10th to 90th percentile of that count for `fleet` independent buses. */
export function provision(cdf: number[], fleet: number): YearProvision[] {
  const last = cdf.length - 1, years = Math.floor(last / 12), at = (m: number) => cdf[Math.min(m, last)]
  return Array.from({ length: years }, (_, y) => {
    const share = Math.max(0, at((y + 1) * 12) - at(y * 12))
    // given the buses not yet replaced, the chance of this year is share / (1 - earlier share), but the unconditional count is Binomial(n, share)
    return { year: y + 1, expected: fleet * share, low: binomialQuantile(fleet, share, 0.1), high: binomialQuantile(fleet, share, 0.9), share }
  })
}
