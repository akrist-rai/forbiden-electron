// src/pages/Login/index.tsx — LOCKED. Do not modify.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, SUPABASE_CONFIGURED } from '@/lib/supabase'
import './Login.css'

const FEATURES = [
  'Node-based code graph',
  'Real Git integration',
  'Live WebSocket collaboration',
  'Kanban task board',
]

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [pw, setPw]       = useState('')
  const [err, setErr]     = useState('')
  const [msg, setMsg]     = useState('')
  const [busy, setBusy]   = useState(false)
  const nav = useNavigate()

  // In dev bypass mode there's no login page — go straight to app
  if (!SUPABASE_CONFIGURED) { nav('/'); return null }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg(''); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw error
        nav('/')
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pw })
        if (error) throw error
        setMsg('Account created — sign in below.')
        setMode('login')
      }
    } catch (e: any) {
      setErr(e.message ?? 'Authentication error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-shell">
      {/* ── LEFT: brand panel ── */}
      <div className="login-left">
        <div className="login-bg-dots" />
        <div className="login-bg-glow" />
        <div className="login-content">
          <div className="login-eyebrow">GRAPH-BASED CODE IDE // OPERATOR PORTAL</div>
          <div className="login-wordmark">
            FOR<span className="g">BID</span><br />DEN
          </div>
          <div className="login-features">
            {FEATURES.map(f => (
              <div key={f} className="login-feat">
                <span className="login-feat-dot" />
                {f}
              </div>
            ))}
          </div>
        </div>
        <div className="login-footer">
          FORBINDEN // v1.0 ALPHA // GRAPH IDE 2026
        </div>
      </div>

      {/* ── RIGHT: form panel ── */}
      <div className="login-right">
        <div className="login-form-wrap">
          <div>
            <div className="login-form-eyebrow">OPERATOR AUTH</div>
            <div className="login-form-title">
              {mode === 'login'
                ? <>SIGN <span className="g">IN</span></>
                : <>JOIN <span className="g">US</span></>}
            </div>
          </div>

          <form onSubmit={submit} className="login-fields">
            <div>
              <label className="login-label">EMAIL ADDRESS</label>
              <input
                className="login-input"
                type="email"
                placeholder="operator@domain.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="login-label">PASSWORD</label>
              <input
                className="login-input"
                type="password"
                placeholder="••••••••"
                value={pw}
                onChange={e => setPw(e.target.value)}
                required
              />
            </div>
            {err && <div className="login-msg err">{err}</div>}
            {msg && <div className="login-msg ok">{msg}</div>}
            <button className="login-btn" type="submit" disabled={busy}>
              {busy ? 'AUTHENTICATING...' : mode === 'login' ? 'ENTER SYSTEM' : 'CREATE ACCOUNT'}
            </button>
          </form>

          <div className="login-divider" />

          <button
            className="login-switch"
            onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setErr(''); setMsg('') }}
          >
            {mode === 'login' ? '→ Create an account' : '← Back to sign in'}
          </button>

          <div className="login-caption">FORBIDDEN // GRAPH IDE</div>
        </div>
      </div>
    </div>
  )
}
