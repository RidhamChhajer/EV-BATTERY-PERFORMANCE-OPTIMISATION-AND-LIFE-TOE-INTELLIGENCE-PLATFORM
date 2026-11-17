import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type Ctx = { year: number; setYear: (y: number) => void; hover: number | null; setHover: (y: number | null) => void }
const C = createContext<Ctx | null>(null)
export const useYear = () => {
  const c = useContext(C)
  if (!c) throw new Error('useYear must be used inside YearProvider')
  return c
}
/** The year chosen on the scrubber, and the year under the pointer on any chart: shared so every panel and the 3D bus agree. */
export function YearProvider({ children }: { children: ReactNode }) {
  const [year, setYear] = useState(4)
  const [hover, setHover] = useState<number | null>(null)
  const v = useMemo(() => ({ year, setYear, hover, setHover }), [year, hover])
  return <C.Provider value={v}>{children}</C.Provider>
}
