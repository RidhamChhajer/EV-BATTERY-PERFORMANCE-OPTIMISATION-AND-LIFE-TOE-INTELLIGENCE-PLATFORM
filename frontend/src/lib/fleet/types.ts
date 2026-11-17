import type { components } from '../../api/schema'
import type { Scenario } from '../../api/types'

export type FleetForecast = components['schemas']['FleetResponse']
export type Cohort = components['schemas']['CohortSummary']
export type ClassSummary = components['schemas']['ClassSummary']
export type FleetRequest = components['schemas']['FleetRequest']

/** Where a value came from. Shown next to every bus field, in the spirit of the evidence badges on the scenario form. */
export type Source = 'log' | 'entered' | 'inherited' | 'assumed' | 'sample'
export type SourceKey = 'duty' | 'age' | 'price' | 'depot' | 'route'

export const MAX_BUSES = 5000
export const MAX_CLASSES = 50
export const UNASSIGNED = 'Unassigned'

export type Bus = {
  id: string
  depot: string
  route: string
  /** YYYY-MM. Missing means age unknown: the bus is counted as new and flagged. */
  inServiceMonth?: string
  classId: string
  packPriceInr?: number
  /** Display only. Never used by the model and never treated as ground truth. */
  reportedSohPct?: number
  sources: Partial<Record<SourceKey, Source>>
}

export type DutyClass = {
  id: string
  name: string
  scenario: Scenario
  source: Source
  /** Largest gap in battery life, in months, between any bus in this class and the class's own scenario (an estimate from measured sensitivities, checked against the engine on sampled buses). */
  spreadMonths: number
}

/** Only the roster is stored. Segments, risk bands and batches are computed from it and the forecast, never saved, so an edit cannot leave one stale. */
export type Fleet = {
  id: string
  name: string
  kind: 'sample' | 'user'
  classes: DutyClass[]
  buses: Bus[]
  createdAt: string
}

/** A bus as it arrives from any input method, before it has a class. */
export type DraftBus = {
  id: string
  depot?: string
  route?: string
  inServiceMonth?: string
  scenario: Scenario
  packPriceInr?: number
  reportedSohPct?: number
  sources?: Bus['sources']
  /** The scenario fields this input actually stated (a roster's columns, a log's derived values). Undefined means the whole scenario is stated, as in the Add buses form. For a bus already in the fleet, only stated fields change; everything else keeps the value it has. */
  stated?: Partial<Scenario>
  /** Months of spread already carried from a class this bus was in before (a re-class after an edit or a merge), added to the new class's spread so it is never understated. */
  carryMonths?: number
}
