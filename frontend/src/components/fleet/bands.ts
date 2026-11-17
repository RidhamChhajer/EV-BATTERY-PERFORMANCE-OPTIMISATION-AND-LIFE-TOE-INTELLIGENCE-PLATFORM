import type { Band } from '../../lib/fleet/segments'

/** One risk scale for the whole Fleet page: red and amber are the buses to act on, blue and grey are not urgent. Depots use other colours so they never read as risk. */
export const BAND_COLOR: Record<Band, string> = {
  past_median: '#F87171', within_12: '#FB923C', y1_3: '#FACC15', y3_5: '#38BDF8', later: '#64748B', beyond: '#475569', unknown: '#E4E4E7',
}
