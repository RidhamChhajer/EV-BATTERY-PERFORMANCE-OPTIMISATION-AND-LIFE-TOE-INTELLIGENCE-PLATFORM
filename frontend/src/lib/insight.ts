import { dayShape, type DayParams } from './dayCycle'

const h1 = (x: number) => `${Number(x.toFixed(1))} h`

/** One sentence that says what Bus B's changes do, from numbers the page already has: the change in life, and how long each bus sits full before leaving.
 *  Returns null when there is nothing to say (Bus B equals Bus A). */
export function insightLine(o: { lifeHeadline: string | null; a: DayParams; b: DayParams; unfinishedB: boolean; money?: string | null }): string | null {
  const parts: string[] = []
  const idleA = dayShape(o.a).idleH, idleB = dayShape(o.b).idleH
  if (Math.abs(idleA - idleB) >= 0.25) parts.push(`rests at its charge cap for ${h1(idleB)} before leaving (Bus A: ${h1(idleA)})`)
  if (o.unfinishedB) parts.push('does not finish charging before it leaves')
  if (o.lifeHeadline && o.lifeHeadline !== 'No change') parts.push(`battery life ${o.lifeHeadline}${o.money ? ` · ${o.money}` : ''}`)
  if (!parts.length) return null
  const s = parts.join(' · ')
  return `Bus B ${s}.`
}
