import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'

const IDE = lazy(() => import('@/pages/IDE/index'))

export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<IDE />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
