import { describe, expect, it } from 'vitest'
import { atYear, crossingYear } from './format'

const s = Array.from({ length: 121 }, (_, i) => 100 - i / 6)     // 100 % to 80 % over 10 years, monthly
describe('series helpers', () => {
  it('interpolates inside a month', () => expect(atYear(s, 5)).toBeCloseTo(90, 5))
  it('clamps outside the range', () => { expect(atYear(s, -1)).toBe(100); expect(atYear(s, 99)).toBeCloseTo(80, 5) })
  it('finds when a line is crossed, or null', () => { expect(crossingYear(s, 90)).toBeCloseTo(5, 5); expect(crossingYear(s, 50)).toBeNull() })
})
