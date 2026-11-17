import type { PredictionResult } from '../api/types'
import { newWarnings, plainWarning } from './busB'

/** Everything the app wants to say "by the way" about a result, sorted by how much it matters, so it can live in one calm drawer
 *  instead of floating over the 3D scene. */
export type NoteGroup = 'attention' | 'range' | 'info'
export type Note = { group: NoteGroup; text: string; bus?: 'A' | 'B' }
export const GROUP_TITLE: Record<NoteGroup, string> = { attention: 'Needs attention', range: 'Outside the tested range', info: 'Good to know' }

const ATTENTION = [/^Charging is not finished before departure/, /^Duty exceeds the usable pack energy/]
const isAttention = (w: string) => ATTENTION.some((r) => r.test(w))

type Input = {
  a: PredictionResult
  b?: PredictionResult | null                       // Bus B's prediction, only when it differs from A
  routeTight?: string | null                        // "Bus A is already below the reserve on this route" sentence, if it applies
  bGivesUpRange?: string | null                     // "Bus B gives up too much range" sentence, if it applies
}

export function buildNotes({ a, b, routeTight, bGivesUpRange }: Input): Note[] {
  const out: Note[] = []
  const seen = new Set<string>()
  const add = (n: Note) => { const k = `${n.group}|${n.text}`; if (!seen.has(k) && n.text.trim()) { seen.add(k); out.push(n) } }
  if (routeTight) add({ group: 'attention', text: routeTight, bus: 'A' })
  if (bGivesUpRange) add({ group: 'attention', text: bGivesUpRange, bus: 'B' })
  a.conditions.warnings.filter(isAttention).forEach((w) => add({ group: 'attention', text: plainWarning(w), bus: b ? 'A' : undefined }))
  if (b) newWarnings(a.conditions.warnings, b.conditions.warnings).forEach((w) => add({ group: 'attention', text: w, bus: 'B' }))
  a.replacement.extrapolation_reasons.forEach((w) => add({ group: 'range', text: w, bus: b ? 'A' : undefined }))
  if (b) b.replacement.extrapolation_reasons.filter((w) => !a.replacement.extrapolation_reasons.includes(w)).forEach((w) => add({ group: 'range', text: w, bus: 'B' }))
  const attentionTexts = new Set(out.map((n) => n.text))
  ;[...a.warnings, ...a.replacement.warnings, ...a.range.warnings, ...a.cost.warnings]
    .filter((w) => !isAttention(w) && !attentionTexts.has(w))
    .forEach((w) => add({ group: 'info', text: w }))
  return out
}

export const countAttention = (n: Note[]) => n.filter((x) => x.group === 'attention').length
