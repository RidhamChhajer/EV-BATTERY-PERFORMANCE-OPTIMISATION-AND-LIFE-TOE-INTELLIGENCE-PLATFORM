/** One operating day of a bus: drain over the duty window, constant-power charge, then rest at the top of the charge window.
 *  Client-side twin of `day_profile` in engine/reference/simulate.py (same formulas), so the 3D day animation shows the same day the model ages. */
export type DayParams = { departure: number; chargeStart: number; chargeHours: number; socMin: number; socMax: number; energyKwh: number; packKwh: number }
export type Phase = 'drive' | 'charge' | 'idle'
export type Segment = { phase: Phase; from: number; to: number }

const mod24 = (h: number) => ((h % 24) + 24) % 24

/** Lowest state of charge reached (fraction): the top minus the day's energy, never below the minimum. */
export const endSoc = (p: DayParams) => Math.max(p.socMax - (100 * p.energyKwh) / p.packKwh, p.socMin) / 100

export function dayShape(p: DayParams) {
  const window = mod24(24 - p.chargeStart + p.departure)             // hours from the start of charging to the next departure
  const dutyH = mod24(p.chargeStart - p.departure)
  const chargeH = window > 0 ? Math.min(p.chargeHours, window) : p.chargeHours
  return { dutyH, chargeH, window, unfinished: window > 0 && p.chargeHours > window + 1e-9, idleH: Math.max(window - chargeH, 0) }
}

export function phaseAt(hour: number, p: DayParams): { phase: Phase; soc: number; progress: number } {
  const top = p.socMax / 100, end = endSoc(p), { dutyH, chargeH } = dayShape(p)
  const x = mod24(hour - p.departure), y = x - dutyH
  if (x <= dutyH) return { phase: 'drive', soc: top + (end - top) * (dutyH ? x / dutyH : 1), progress: dutyH ? x / dutyH : 1 }
  if (y <= chargeH) return { phase: 'charge', soc: end + (top - end) * (chargeH ? y / chargeH : 1), progress: chargeH ? y / chargeH : 1 }
  return { phase: 'idle', soc: top, progress: 1 }
}

/** The three stretches of the 24 h day, in clock hours starting at departure. `to` can exceed 24 (it wraps). */
export function segments(p: DayParams): Segment[] {
  const { dutyH, chargeH, idleH } = dayShape(p)
  const a = p.departure, b = a + dutyH, c = b + chargeH
  const all: Segment[] = [{ phase: 'drive', from: a, to: b }, { phase: 'charge', from: b, to: c }, { phase: 'idle', from: c, to: c + idleH }]
  return all.filter((s) => s.to - s.from > 1e-9)
}

/** How far charging could start later and still finish `buffer` hours before departure: the room a depot has to stagger its buses.
 *  Rounded down to the half hour. Charger counts are not modelled, so this says what is possible, not how many chargers are needed. */
export function staggerWindow(p: DayParams, buffer = 0.5) {
  const idleH = dayShape(p).idleH, room = Math.max(0, Math.floor((idleH - buffer) * 2) / 2)
  return { idleH, room, earliest: mod24(p.chargeStart), latest: mod24(p.chargeStart + room) }
}
