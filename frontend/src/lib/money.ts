/** Life gained, in rupees. A pack's price spread over its life is a per-year cost; a longer life lowers it. Undiscounted, first pack only,
 *  straight-line, so it is always quoted as "about". Needs a battery price and a measurable median life on both sides. */
export function lifeValue(packCostInr: number | null, baseMonths: number | null, altMonths: number | null): number | null {
  if (packCostInr == null || packCostInr <= 0 || baseMonths == null || altMonths == null || baseMonths <= 0 || altMonths <= 0) return null
  return packCostInr / (baseMonths / 12) - packCostInr / (altMonths / 12)
}
export const fleetValue = (perBus: number, buses: number) => perBus * buses

/** Rupees in the units a fleet manager reads: lakh, crore, or plain with Indian digit grouping. */
export function rupees(v: number): string {
  const a = Math.abs(v), s = v < 0 ? '−' : ''
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(a >= 1e8 ? 1 : 2)} crore`
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)} lakh`
  return `${s}₹${Math.round(a).toLocaleString('en-IN')}`
}

/** "about ₹9,800 per bus per year (₹4.9 lakh a year for 50 buses)", or null when the value is not measurable. */
export function valueLine(perBus: number | null, buses: number): string | null {
  if (perBus == null || Math.abs(perBus) < 1) return null
  const word = perBus > 0 ? 'about' : 'costs about'
  return `${word} ${rupees(Math.abs(perBus))} per bus per year (${rupees(Math.abs(fleetValue(perBus, buses)))} a year for ${buses} bus${buses === 1 ? '' : 'es'})`
}
