import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { Skeleton } from './components/Async'
import { Toaster } from './components/Toast'
import { TopNav } from './components/TopNav'
import { ScopeBar } from './components/ScopeBar'
import { usePresets } from './api/hooks'
import { ErrorState } from './components/Async'
import { ScenarioProvider } from './state/ScenarioContext'
import { YearProvider } from './state/YearContext'
import { WhatIfProvider } from './state/WhatIfContext'
import { FleetProvider } from './state/FleetContext'
import Login from './pages/Login'
import Health from './pages/Health'
import Replacement from './pages/Replacement'
import Range from './pages/Range'
import Cost from './pages/Cost'
import Evidence from './pages/Evidence'

// The 3D bundle is large, so those two pages load on demand; so does Fleet (the roster, input methods and forecast blocks are only needed there).
const Overview = lazy(() => import('./pages/Overview'))
const Optimise = lazy(() => import('./pages/Optimise'))
const Fleet = lazy(() => import('./pages/Fleet'))

function Protected() {
  const { user, checking } = useAuth()
  const loc = useLocation()
  const presets = usePresets()
  if (checking) return <div className="login"><Skeleton h={120} /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (presets.error) return <div className="page"><ErrorState error={presets.error} onRetry={() => presets.refetch()} /></div>
  if (!presets.data) return <div className="page"><Skeleton h={500} /></div>
  return (
    <ScenarioProvider presets={presets.data.presets}>
      <YearProvider>
        <WhatIfProvider>
          <FleetProvider>
            <TopNav />
            <ScopeBar />
            <Suspense fallback={<div className="page"><Skeleton h={560} /></div>}><Outlet /></Suspense>
            <Toaster />
          </FleetProvider>
        </WhatIfProvider>
      </YearProvider>
    </ScenarioProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Overview />} />
        <Route path="health" element={<Health />} />
        <Route path="replacement" element={<Replacement />} />
        <Route path="range" element={<Range />} />
        <Route path="cost" element={<Cost />} />
        <Route path="optimise" element={<Optimise />} />
        <Route path="fleet" element={<Fleet />} />
        <Route path="evidence" element={<Evidence />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
