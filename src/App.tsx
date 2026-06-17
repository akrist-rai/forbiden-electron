import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy, Component, ReactNode } from 'react'

const IDE = lazy(() => import('@/pages/IDE/index'))

class ErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null }
  static getDerivedStateFromError(e: Error) { return { err: e.message } }
  render() {
    if (this.state.err) return (
      <div style={{ background: '#0a0e14', color: '#ff435a', fontFamily: "'JetBrains Mono',monospace", padding: 40, minHeight: '100vh' }}>
        <div style={{ fontSize: 18, marginBottom: 12 }}>RENDER ERROR</div>
        <pre style={{ fontSize: 12, color: '#c0c8d8', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.err}</pre>
        <button onClick={() => this.setState({ err: null })} style={{ marginTop: 20, padding: '8px 16px', background: '#10b981', color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>RETRY</button>
      </div>
    )
    return this.props.children
  }
}

export default function App() {
  return (
    <HashRouter>
      <ErrorBoundary>
        <Suspense fallback={<div style={{ background: '#0a0e14', minHeight: '100vh' }} />}>
          <Routes>
            <Route path="/" element={<IDE />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </HashRouter>
  )
}
