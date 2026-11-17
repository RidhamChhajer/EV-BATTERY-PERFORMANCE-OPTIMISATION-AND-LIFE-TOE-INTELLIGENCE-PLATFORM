import type { Scenario } from '../../api/types'
import type { Missing, Rejected } from './roster'
import type { DraftBus, Fleet, Source } from './types'

/** What an input method hands to the gate: the same shape whichever door the buses came in by. */
export type Intake = {
  /** "roster.csv", "Pasted cells", "Add buses form", "Sample fleet". */
  label: string
  /** Short description of what was read, e.g. "Roster, 242 rows". */
  detail: string
  source: Source
  drafts: DraftBus[]
  /** A whole fleet (a fleet file or the sample): it replaces the current fleet instead of merging into it. */
  fleet?: Fleet
  rejected: Rejected[]
  header: string[]
  missing?: Missing
  notes: string[]
  ignoredColumns: string[]
  /** What the bus on screen supplies wherever the input says nothing, so the gate can name it. */
  assumedFrom?: { type: string; priceInr: number | null }
  /** The sample fleet and fleet files carry their own name. */
  name?: string
}

import type { ReadResult } from './roster'

export const intakeFromRead = (label: string, r: ReadResult, screen?: Scenario): Intake => ({
  assumedFrom: screen ? { type: screen.archetype === '12m' ? '12 m' : '9 m', priceInr: screen.battery_cost_per_kwh_inr ?? null } : undefined,
  label, detail: r.kind === 'log' ? `Duty log, ${r.rows.toLocaleString('en-IN')} rows for ${r.drafts.length + r.rejected.length} buses` : `Roster, ${r.rows.toLocaleString('en-IN')} rows`,
  source: r.kind === 'log' ? 'log' : 'entered', drafts: r.drafts, rejected: r.rejected, header: r.header, missing: r.missing, notes: r.notes, ignoredColumns: r.columns.ignored,
})
