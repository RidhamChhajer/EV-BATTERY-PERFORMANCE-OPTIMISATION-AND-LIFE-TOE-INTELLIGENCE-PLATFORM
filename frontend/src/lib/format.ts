import type { Labelled } from '../api/types'

export const num = (l: Labelled | null | undefined): number | null => (l == null ? null : Array.isArray(l.value) ? null : l.value)
export const arr = (l: Labelled): number[] => (Array.isArray(l.value) ? l.value : [l.value])
export const years = (months: number | null | undefined, d = 1) => (months == null ? null : +(months / 12).toFixed(d))
export const fmt = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(d))
export const inr = (v: number | null | undefined, d = 1) => (v == null ? '–' : `₹${v.toFixed(d)}`)
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

/** Interpolate a monthly series (index = month) at a fractional number of years. */
export function atYear(series: number[], year: number): number {
  const f = clamp(year * 12, 0, series.length - 1), i = Math.min(series.length - 2, Math.floor(f))
  return series[i] + (series[i + 1] - series[i]) * (f - i)
}
/** First year the series falls to or below `v`, or null if it never does. */
export function crossingYear(series: number[], v: number): number | null {
  for (let i = 1; i < series.length; i++) {
    if (series[i] <= v) return (i - 1 + (series[i - 1] - v) / (series[i - 1] - series[i])) / 12
  }
  return null
}
export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
