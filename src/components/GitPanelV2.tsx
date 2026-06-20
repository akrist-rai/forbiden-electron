// @ts-nocheck
import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { api } from '../lib/api'

// ── VS Code Source Control color palette ──────────────────────
const STATUS_COLOR: Record<string, string> = {
  M: '#e2c08d', // modified  → warm yellow
  A: '#73c991', // added     → green
  D: '#f14c4c', // deleted   → red
  R: '#73c991', // renamed   → green
  C: '#73c991', // copied    → green
  U: '#73c991', // untracked → green
  '?': '#73c991',
  '!': '#4a4a5a',
}

const STATUS_LABEL: Record<string, string> = {
  M: 'M', A: 'A', D: 'D', R: 'R', C: 'C', U: 'U', '?': 'U', '!': '!',
}

// ─────────────────────────────────────────────────────────────
//  DiffView
// ─────────────────────────────────────────────────────────────
function DiffView({ diff }: { diff: string }) {
  if (!diff) {
    return (
      <div style={{ padding: '6px 10px', fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#5a5a7a' }}>
        No diff available.
      </div>
    )
  }
  const lines = diff.split('\n')
  return (
    <div style={{ maxHeight: 200, overflowY: 'auto', overflowX: 'auto', background: '#03030a', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      {lines.map((line, i) => {
        let bg = 'transparent', color = '#c0c8d8', opacity = 1
        if (line.startsWith('+') && !line.startsWith('+++'))      { bg = 'rgba(115,201,145,0.1)'; color = '#73c991' }
        else if (line.startsWith('-') && !line.startsWith('---')) { bg = 'rgba(241,76,76,0.1)';   color = '#f14c4c' }
        else if (line.startsWith('@@'))                            { bg = 'rgba(40,241,195,0.06)'; color = '#28f1c3' }
        else if (line.startsWith('+++') || line.startsWith('---')){ color = '#6a6a8a'; opacity = 0.7 }
        else if (line.startsWith('diff ') || line.startsWith('index ')) { color = '#6a6a8a'; opacity = 0.5 }
        return (
          <div key={i} style={{ display: 'flex', background: bg, minHeight: 16 }}>
            <span style={{ width: 28, flexShrink: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', color: '#3e3e5a', textAlign: 'right', paddingRight: 6, paddingTop: 1, userSelect: 'none' }}>{i + 1}</span>
            <pre style={{ margin: 0, flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color, opacity, whiteSpace: 'pre', padding: '1px 6px', lineHeight: '14px' }}>{line}</pre>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Spinner
// ─────────────────────────────────────────────────────────────
function Spinner() {
  const [frame, setFrame] = useState(0)
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % frames.length), 80)
    return () => clearInterval(id)
  }, [])
  return <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#10b981' }}>{frames[frame]}</span>
}

// ─────────────────────────────────────────────────────────────
//  CollapsibleSection  (VS Code Source Control section header)
// ─────────────────────────────────────────────────────────────
function CollapsibleSection({ title, count, open, onToggle, actionLabel, onAction, children }: any) {
  const [actHov, setActHov] = useState(false)
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', cursor: 'pointer', userSelect: 'none',
          background: 'transparent', minHeight: 22,
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
      >
        <span style={{ fontSize: '8px', color: '#6a6a8a', flexShrink: 0, width: 10, textAlign: 'center' }}>
          {open ? '▼' : '▶'}
        </span>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: '10px', letterSpacing: '.1em', color: '#8a8aa0', textTransform: 'uppercase', flex: 1 }}>
          {title}
        </span>
        {count > 0 && (
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', color: '#6a6a8a', flexShrink: 0 }}>
            {count}
          </span>
        )}
        {onAction && count > 0 && (
          <button
            title={actionLabel === '+all' ? 'Stage all' : 'Unstage all'}
            onClick={e => { e.stopPropagation(); onAction() }}
            onMouseEnter={() => setActHov(true)}
            onMouseLeave={() => setActHov(false)}
            style={{
              background: actHov ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: 'none', color: actHov ? '#c0c8d8' : '#6a6a8a',
              fontFamily: "'JetBrains Mono',monospace", fontSize: '10px',
              cursor: 'pointer', padding: '1px 4px', borderRadius: 2, outline: 'none',
              flexShrink: 0, marginLeft: 2,
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
      {open && <div>{children}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  FileRow  (VS Code-style, 22px height)
// ─────────────────────────────────────────────────────────────
function FileRow({ file, cwd, isStaged, onOpenFile, brutal }: any) {
  const [hovered, setHovered] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [diff, setDiff]         = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [opLoading, setOpLoading]     = useState(false)

  const git        = api?.git
  const statusChar = file.state?.[0]?.toUpperCase() ?? '?'
  const color      = STATUS_COLOR[statusChar] ?? '#6a6a8a'
  const name       = file.path?.split('/').pop() ?? file.path
  const dirPart    = file.path?.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : ''

  const handleToggleDiff = async () => {
    if (showDiff) { setShowDiff(false); return }
    setShowDiff(true)
    if (diff !== null) return
    setDiffLoading(true)
    try {
      const r = await git?.diff(cwd, file.path)
      setDiff(typeof r === 'string' ? r : (r?.diff ?? ''))
    } catch { setDiff('') }
    finally { setDiffLoading(false) }
  }

  const handleStage   = async () => { setOpLoading(true); try { await git?.stage(cwd,   [file.path]) } catch {} setOpLoading(false) }
  const handleUnstage = async () => { setOpLoading(true); try { await git?.unstage(cwd, [file.path]) } catch {} setOpLoading(false) }
  const handleDiscard = async () => {
    if (!confirm(`Discard changes to "${file.path}"?`)) return
    setOpLoading(true)
    try { await git?.discard(cwd, file.path) } catch {}
    setOpLoading(false)
  }

  return (
    <div>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 0,
          padding: '0 4px 0 22px', minHeight: 22,
          background: hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
          cursor: 'default',
        }}
      >
        {/* Status letter */}
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700,
          color, width: 12, flexShrink: 0, textAlign: 'center',
        }}>
          {opLoading ? <Spinner /> : (STATUS_LABEL[statusChar] ?? statusChar)}
        </span>

        {/* File name */}
        <span
          onClick={() => onOpenFile?.(file.path)}
          title={file.path}
          style={{
            flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: '12px',
            color: '#c0c8d8', overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', marginLeft: 6, cursor: 'pointer',
          }}
        >
          {name}
          {dirPart && (
            <span style={{ color: '#5a5a7a', fontSize: '10px', marginLeft: 5 }}>{dirPart.replace(/\/$/, '')}</span>
          )}
        </span>

        {/* Action buttons — visible on hover */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, opacity: hovered ? 1 : 0, transition: 'opacity .1s', flexShrink: 0 }}>
          {!isStaged && (
            <ActionBtn title="Stage file" onClick={handleStage}>
              {/* plus */}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="5" y1="1" x2="5" y2="9"/><line x1="1" y1="5" x2="9" y2="5"/>
              </svg>
            </ActionBtn>
          )}
          {isStaged && (
            <ActionBtn title="Unstage file" onClick={handleUnstage}>
              {/* minus */}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="1" y1="5" x2="9" y2="5"/>
              </svg>
            </ActionBtn>
          )}
          <ActionBtn title="Discard changes" onClick={handleDiscard} danger>
            {/* undo/discard */}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 3 1 7 5 7"/>
              <path d="M1 7a5 5 0 1 1 1.4 3.5"/>
            </svg>
          </ActionBtn>
          <ActionBtn title="Show diff" onClick={handleToggleDiff} active={showDiff}>
            {/* diff/lines */}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="3" x2="8" y2="3"/>
              <line x1="2" y1="5" x2="6" y2="5"/>
              <line x1="2" y1="7" x2="8" y2="7"/>
            </svg>
          </ActionBtn>
        </div>
      </div>

      {showDiff && (
        <div>
          {diffLoading
            ? <div style={{ padding: '4px 10px', fontFamily: 'monospace', fontSize: '10px', color: '#6a6a8a' }}><Spinner /> loading…</div>
            : <DiffView diff={diff ?? ''} />
          }
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  ActionBtn
// ─────────────────────────────────────────────────────────────
function ActionBtn({ children, onClick, title, danger = false, active = false }: any) {
  const [hov, setHov] = useState(false)
  return (
    <button
      title={title}
      onClick={e => { e.stopPropagation(); onClick?.() }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: active ? 'rgba(40,241,195,0.15)' : hov ? (danger ? 'rgba(255,67,90,0.18)' : 'rgba(255,255,255,0.1)') : 'transparent',
        border: 'none', cursor: 'pointer', borderRadius: 2, outline: 'none',
        color: danger ? '#ff435a' : active ? '#28f1c3' : '#9494b0',
        fontFamily: "'JetBrains Mono',monospace", fontSize: '11px',
        width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'background .1s, color .1s', lineHeight: 1, padding: 0,
      }}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
//  HeaderBtn
// ─────────────────────────────────────────────────────────────
function HeaderBtn({ children, onClick, title, loading = false }: any) {
  const [hov, setHov] = useState(false)
  return (
    <button
      title={title} onClick={onClick} disabled={loading}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'rgba(255,255,255,0.08)' : 'transparent',
        border: 'none', color: hov ? '#c0c8d8' : '#6a6a8a',
        width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', borderRadius: 3, fontSize: '13px', outline: 'none',
        transition: 'all .1s', padding: 0, flexShrink: 0,
      }}
    >
      {loading ? <Spinner /> : children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
//  BranchDropdown
// ─────────────────────────────────────────────────────────────
function BranchDropdown({ cwd, currentBranch, onClose, brutal }: any) {
  const [branches, setBranches]   = useState<string[]>([])
  const [loading, setLoading]     = useState(true)
  const [newBranch, setNewBranch] = useState('')
  const [opLoading, setOpLoading] = useState<string | null>(null)
  const [error, setError]         = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    git?.branches(cwd)
      .then((r: any) => setBranches(Array.isArray(r) ? r : []))
      .catch(() => setBranches([]))
      .finally(() => setLoading(false))
  }, [cwd])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onClose])

  const handleCheckout = async (branch: string) => {
    if (branch === currentBranch) return
    setOpLoading(branch); setError('')
    try {
      const r = await git?.checkout(cwd, branch)
      if (!r?.success) setError(r?.error ?? 'Checkout failed')
      else onClose()
    } catch (e: any) { setError(e?.message ?? 'Checkout failed') }
    finally { setOpLoading(null) }
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 28, left: 0, zIndex: 9999,
      background: '#0d0d18', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 4, padding: '4px 0', minWidth: 200, maxWidth: 320,
      boxShadow: '0 12px 40px rgba(0,0,0,0.9)',
    }}>
      <div style={{ padding: '4px 8px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          placeholder="Filter or create branch…"
          value={newBranch}
          onChange={e => setNewBranch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newBranch.trim()) handleCheckout(newBranch.trim())
            if (e.key === 'Escape') onClose()
          }}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', color: '#c0c8d8',
            fontFamily: "'JetBrains Mono',monospace", fontSize: '11px',
            padding: '4px 8px', borderRadius: 2, outline: 'none', boxSizing: 'border-box',
          }}
          autoFocus
        />
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {loading
          ? <div style={{ padding: '8px 10px', fontSize: '10px', color: '#6a6a8a' }}><Spinner /> loading…</div>
          : branches
              .filter(b => !newBranch || b.toLowerCase().includes(newBranch.toLowerCase()))
              .map(branch => {
                const isCurrent = branch === currentBranch
                return (
                  <div
                    key={branch}
                    onClick={() => handleCheckout(branch)}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '4px 10px', cursor: 'pointer',
                      background: isCurrent ? 'rgba(16,185,129,0.1)' : 'transparent', gap: 6,
                    }}
                    onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isCurrent ? 'rgba(16,185,129,0.1)' : 'transparent' }}
                  >
                    {isCurrent && <span style={{ color: '#10b981', fontSize: '10px' }}>✓</span>}
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: isCurrent ? '#10b981' : '#c0c8d8', flex: 1 }}>
                      {opLoading === branch ? <Spinner /> : branch}
                    </span>
                  </div>
                )
              })
        }
      </div>
      {error && <div style={{ padding: '4px 10px', fontSize: '10px', color: '#ff435a', fontFamily: 'monospace' }}>{error}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  CommitRow
// ─────────────────────────────────────────────────────────────
function CommitRow({ entry }: any) {
  const [hov, setHov] = useState(false)
  const hash = (entry.hash ?? '').slice(0, 7)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={entry.message}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 2px 22px',
        background: hov ? 'rgba(255,255,255,0.04)' : 'transparent', cursor: 'default', minHeight: 22,
      }}
    >
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', color: '#bb9af7', flexShrink: 0 }}>{hash}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: '#8a8aa0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {entry.message}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  CommitGraph (visual git log)
// ─────────────────────────────────────────────────────────────
const LANE_COLORS = [
  '#10b981','#4285f4','#bb9af7','#ffc410','#ff8080',
  '#28f1c3','#5ccfe6','#e5c07b','#c792ea','#ff1650',
  '#72f1b8','#89ddff','#ffbd5e','#4ec9b0','#ff435a','#98bb6c',
]
const ROW_H = 26
const LANE_W = 14

function computeLanes(commits: any[]) {
  const laneMap: Record<string, number> = {}
  const slots: (string | null)[] = []
  return commits.map(commit => {
    let myLane = laneMap[commit.hash]
    if (myLane === undefined) { const free = slots.indexOf(null); myLane = free === -1 ? slots.length : free }
    slots[myLane] = null; delete laneMap[commit.hash]
    const parentLanes: { hash: string; lane: number }[] = []
    commit.parents.forEach((p: string, pi: number) => {
      if (laneMap[p] !== undefined) {
        parentLanes.push({ hash: p, lane: laneMap[p] })
      } else if (pi === 0) {
        slots[myLane] = p; laneMap[p] = myLane; parentLanes.push({ hash: p, lane: myLane })
      } else {
        const free = slots.indexOf(null); const newLane = free === -1 ? slots.length : free
        slots[newLane] = p; laneMap[p] = newLane; parentLanes.push({ hash: p, lane: newLane })
      }
    })
    const activeLanes = slots.map((h, i) => h !== null ? i : -1).filter(i => i >= 0)
    return { ...commit, lane: myLane, parentLanes, activeLanes }
  })
}

function CommitGraph({ cwd }: { cwd: string }) {
  const [commits, setCommits]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!git?.logGraph || !cwd) return
    setLoading(true)
    git.logGraph(cwd, 80).then((r: any) => {
      if (r?.success) setCommits(computeLanes(r.commits))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [cwd])

  if (loading) return (
    <div style={{ padding: '12px', textAlign: 'center' }}>
      <Spinner /><span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '9px', color: '#5a5a7a', marginLeft: 6 }}>LOADING…</span>
    </div>
  )
  if (!commits.length) return (
    <div style={{ padding: '12px', textAlign: 'center', fontFamily: "'Share Tech Mono',monospace", fontSize: '10px', color: '#3e3e5a' }}>NO COMMITS</div>
  )

  const maxLane    = commits.reduce((m, c) => Math.max(m, c.lane, ...c.parentLanes.map((p: any) => p.lane)), 0)
  const svgW       = (maxLane + 1) * LANE_W + 8
  const totalH     = commits.length * ROW_H
  const hashToIdx: Record<string, number> = {}
  commits.forEach((c, i) => { hashToIdx[c.hash] = i })
  const selCommit = commits.find(c => c.hash === selected)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 300, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', minHeight: totalH }}>
          <div style={{ flexShrink: 0, width: svgW, position: 'relative' }}>
            <svg width={svgW} height={totalH} style={{ display: 'block', overflow: 'visible' }}>
              {commits.map((commit, idx) => {
                const cy = idx * ROW_H + ROW_H / 2
                const cx = commit.lane * LANE_W + LANE_W / 2
                const color = LANE_COLORS[commit.lane % LANE_COLORS.length]
                return (
                  <g key={commit.hash}>
                    {commit.parentLanes.map((pl: any) => {
                      const parentIdx = hashToIdx[pl.hash]
                      if (parentIdx === undefined) return null
                      const pcy = parentIdx * ROW_H + ROW_H / 2
                      const pcx = pl.lane * LANE_W + LANE_W / 2
                      const pColor = LANE_COLORS[pl.lane % LANE_COLORS.length]
                      if (cx === pcx) return <line key={pl.hash} x1={cx} y1={cy} x2={pcx} y2={pcy} stroke={pColor} strokeWidth={1.5} opacity={0.55} />
                      const mid = (cy + pcy) / 2
                      return <path key={pl.hash} d={`M ${cx} ${cy} C ${cx} ${mid+6}, ${pcx} ${mid-6}, ${pcx} ${pcy}`} stroke={pColor} strokeWidth={1.5} fill="none" opacity={0.55} />
                    })}
                    <circle cx={cx} cy={cy} r={selected === commit.hash ? 5 : 3.5} fill={color} stroke={selected === commit.hash ? '#fff' : 'none'} strokeWidth={1.5} style={{ cursor: 'pointer' }} onClick={() => setSelected(s => s === commit.hash ? null : commit.hash)} />
                    {commit.refs.length > 0 && <circle cx={cx} cy={cy} r={7} fill="none" stroke={color} strokeWidth={1} opacity={0.4} />}
                  </g>
                )
              })}
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {commits.map((commit, idx) => {
              const isSel = selected === commit.hash
              const branchRef = commit.refs.find((r: string) => !r.includes('HEAD') && !r.includes('tag:'))
              return (
                <div
                  key={commit.hash}
                  onClick={() => setSelected(s => s === commit.hash ? null : commit.hash)}
                  style={{
                    height: ROW_H, display: 'flex', alignItems: 'center', gap: 4,
                    padding: '0 8px 0 4px', cursor: 'pointer', overflow: 'hidden',
                    background: isSel ? 'rgba(255,255,255,0.06)' : 'transparent',
                    borderLeft: isSel ? `2px solid ${LANE_COLORS[commit.lane % LANE_COLORS.length]}` : '2px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', color: '#bb9af7', flexShrink: 0 }}>{commit.hash.slice(0, 7)}</span>
                  {branchRef && <span style={{ fontSize: '8px', padding: '0 3px', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: 2, flexShrink: 0, fontFamily: "'Oswald',sans-serif", fontWeight: 700 }}>{branchRef.replace('HEAD -> ', '')}</span>}
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#8a8aa0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{commit.subject}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '8px', color: '#5a5a7a', flexShrink: 0 }}>{commit.reltime}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {selCommit && (
        <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', fontFamily: "'JetBrains Mono',monospace", fontSize: '10px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
            <span style={{ color: '#bb9af7' }}>{selCommit.hash.slice(0, 12)}</span>
            <span style={{ color: '#ffc410', opacity: 0.7 }}>{selCommit.author}</span>
            <span style={{ color: '#5a5a7a' }}>{selCommit.reltime}</span>
          </div>
          <div style={{ color: '#c0c8d8', opacity: 0.85, lineHeight: 1.4 }}>{selCommit.subject}</div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  GitPanelV2  —  VS Code Source Control
// ─────────────────────────────────────────────────────────────
interface GitPanelV2Props {
  cwd: string
  brutal?: boolean
  onOpenFile?: (filepath: string) => void
  aiProvider?: string
  aiKeys?: Record<string, string>
  aiModels?: Record<string, string>
  onOpenAiSettings?: () => void
}

const AI_DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001', openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash', openrouter: 'openai/gpt-4o-mini', ollama: 'llama3',
}

function GitPanelV2({
  cwd, brutal = false, onOpenFile, aiProvider = 'anthropic',
  aiKeys = {}, aiModels = {}, onOpenAiSettings,
}: GitPanelV2Props) {
  const [status,   setStatus]   = useState<{ branch: string; files: any[]; error?: string } | null>(null)
  const [log,      setLog]      = useState<Array<{ hash: string; message: string }>>([])
  const [commitMsg, setCommitMsg] = useState('')
  const [aiLoading,    setAiLoading]    = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [refreshing,   setRefreshing]   = useState(false)
  const [commitLoading,setCommitLoading]= useState(false)
  const [pushLoading,  setPushLoading]  = useState(false)
  const [pullLoading,  setPullLoading]  = useState(false)
  const [stashLoading, setStashLoading] = useState(false)
  const [pushResult,   setPushResult]   = useState<{ ok?: boolean; msg?: string } | null>(null)
  const [pullResult,   setPullResult]   = useState<{ ok?: boolean; msg?: string } | null>(null)
  const [commitError,  setCommitError]  = useState('')
  const [showBranch,   setShowBranch]   = useState(false)
  const [initLoading,  setInitLoading]  = useState(false)
  const [openSections, setOpenSections] = useState({ staged: true, changes: true, commits: false, graph: false })

  const git      = api?.git
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Data loading ──────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    if (!git || !cwd) return
    try { setStatus(await git.status(cwd)) }
    catch { setStatus({ branch: '', files: [], error: 'git status failed' }) }
  }, [git, cwd])

  const loadLog = useCallback(async () => {
    if (!git || !cwd) return
    try { const l = await git.log(cwd); setLog(Array.isArray(l) ? l.slice(0, 30) : []) }
    catch { setLog([]) }
  }, [git, cwd])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadStatus(), loadLog()])
    setRefreshing(false)
  }, [loadStatus, loadLog])

  useEffect(() => {
    if (!cwd) return
    setLoading(true)
    Promise.all([loadStatus(), loadLog()]).finally(() => setLoading(false))
    timerRef.current = setInterval(() => { loadStatus(); loadLog() }, 5000)
    const onFocus = () => { loadStatus(); loadLog() }
    window.addEventListener('focus', onFocus)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      window.removeEventListener('focus', onFocus)
    }
  }, [cwd, loadStatus, loadLog])

  // ── File categorization ───────────────────────────────────
  const allFiles = status?.files ?? []
  const stagedFiles = allFiles.filter(f => {
    const s = f.state ?? ''
    return s.length >= 1 && s[0] !== ' ' && s[0] !== '?' && s[0] !== '!'
  })
  const changedFiles = allFiles.filter(f => {
    const s = f.state ?? ''
    if (s === '??' || s === '!!') return true
    return s.length >= 2 && s[1] !== ' '
  }).filter(f => !stagedFiles.includes(f))

  // ── Actions ───────────────────────────────────────────────
  const handleStageAll   = async () => { if (!git?.stage)   return; await git.stage(cwd,   changedFiles.map(f => f.path)); loadStatus() }
  const handleUnstageAll = async () => { if (!git?.unstage) return; await git.unstage(cwd, stagedFiles.map(f => f.path));  loadStatus() }

  const handleAiCommit = async () => {
    const key = aiProvider === 'ollama' ? (aiKeys['ollama'] || 'http://localhost:11434') : (aiKeys[aiProvider] || '')
    if (aiProvider !== 'ollama' && !key) { onOpenAiSettings?.(); return }
    setAiLoading(true)
    try {
      const [diffRes, statusRes] = await Promise.all([
        git?.diff(cwd, '').catch(() => ({ diff: '' })),
        git?.status(cwd).catch(() => ({ files: [] })),
      ])
      const diff  = (diffRes?.diff || '').slice(0, 6000)
      const files = (statusRes?.files || []).map((f: any) => f.file || f.path || '').filter(Boolean).join(', ')
      const model = aiModels[aiProvider] || AI_DEFAULT_MODELS[aiProvider] || ''
      const result = await api?.ai?.chat?.(
        [{ role: 'user', content: `Write a concise git commit message for these changes:\n\nChanged files: ${files}\n\nDiff:\n\`\`\`\n${diff}\n\`\`\`` }],
        key, model,
        'You are a git commit message writer. Output ONLY the commit message, no explanation, no quotes. Follow conventional commits (feat/fix/refactor/docs/chore/etc).',
        aiProvider,
      )
      if (result?.success && result.content) setCommitMsg(result.content.trim())
    } catch {}
    setAiLoading(false)
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) { setCommitError('Enter a commit message'); return }
    setCommitError(''); setCommitLoading(true)
    try {
      const r = await git?.commit(cwd, commitMsg.trim())
      if (r?.success) { setCommitMsg(''); await refresh() }
      else setCommitError(r?.error ?? 'Commit failed')
    } catch (e: any) { setCommitError(e?.message ?? 'Commit failed') }
    finally { setCommitLoading(false) }
  }

  const handlePush = async () => {
    setPushLoading(true); setPushResult(null)
    try {
      const r = await git?.push(cwd)
      setPushResult({ ok: r?.success, msg: r?.output ?? r?.error ?? '' })
      if (r?.success) await refresh()
    } catch (e: any) { setPushResult({ ok: false, msg: e?.message ?? 'Push failed' }) }
    finally { setPushLoading(false); setTimeout(() => setPushResult(null), 4000) }
  }

  const handlePull = async () => {
    setPullLoading(true); setPullResult(null)
    try {
      const r = await git?.pull(cwd)
      setPullResult({ ok: r?.success, msg: r?.output ?? r?.error ?? '' })
      if (r?.success) await refresh()
    } catch (e: any) { setPullResult({ ok: false, msg: e?.message ?? 'Pull failed' }) }
    finally { setPullLoading(false); setTimeout(() => setPullResult(null), 4000) }
  }

  const handleStash    = async () => { setStashLoading(true); try { await git?.stash(cwd);    loadStatus() } catch {} setStashLoading(false) }
  const handleStashPop = async () => { setStashLoading(true); try { await git?.stashPop(cwd); loadStatus() } catch {} setStashLoading(false) }
  const handleGitInit  = async () => { setInitLoading(true);  try { await git?.init(cwd);     refresh()   } catch {} setInitLoading(false) }

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections(s => ({ ...s, [key]: !s[key] }))

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06060e' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Spinner />
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '10px', color: '#5a5a7a', letterSpacing: '.08em' }}>LOADING…</span>
        </div>
      </div>
    )
  }

  // ── No repo ───────────────────────────────────────────────
  if (status?.error && status.files.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '24px 16px', background: '#06060e' }}>
        <div style={{ fontSize: '28px', opacity: 0.2 }}>◈</div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '10px', opacity: 0.35, textAlign: 'center', letterSpacing: '.08em', lineHeight: 1.8, color: '#c0c8d8' }}>
          NOT A GIT REPO<br /><span style={{ fontSize: '9px', opacity: 0.7 }}>{cwd}</span>
        </div>
        <button
          onClick={handleGitInit} disabled={initLoading}
          style={{ background: 'transparent', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', padding: '5px 14px', cursor: 'pointer', letterSpacing: '.08em' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {initLoading ? <Spinner /> : 'git init'}
        </button>
      </div>
    )
  }

  const branch  = status?.branch ?? '—'
  const totalChanges = allFiles.length

  // ─────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#06060e', overflow: 'hidden', color: '#c0c8d8', position: 'relative' }}>

      {/* ── Action header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, padding: '3px 6px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <HeaderBtn title="Refresh" onClick={refresh} loading={refreshing}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="10.5 2 10.5 5.5 7 5.5"/>
            <path d="M10.5 5.5A5 5 0 1 1 8.2 2"/>
          </svg>
        </HeaderBtn>
        <HeaderBtn title="Push" onClick={handlePush} loading={pushLoading}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="9" x2="6" y2="2"/>
            <polyline points="3 5 6 2 9 5"/>
            <line x1="3" y1="10.5" x2="9" y2="10.5"/>
          </svg>
        </HeaderBtn>
        <HeaderBtn title="Pull" onClick={handlePull} loading={pullLoading}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="2" x2="6" y2="9"/>
            <polyline points="3 6 6 9 9 6"/>
            <line x1="3" y1="10.5" x2="9" y2="10.5"/>
          </svg>
        </HeaderBtn>
        <HeaderBtn title="Stash" onClick={handleStash} loading={stashLoading}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="8" height="6" rx="1"/>
            <path d="M4 5V3.5a2 2 0 0 1 4 0V5"/>
          </svg>
        </HeaderBtn>
        <HeaderBtn title="Stash Pop" onClick={handleStashPop}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="8" height="6" rx="1"/>
            <line x1="6" y1="3" x2="6" y2="1"/><polyline points="4 2.5 6 1 8 2.5"/>
          </svg>
        </HeaderBtn>
        <div style={{ flex: 1 }} />
        {totalChanges > 0 && (
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', color: '#5a5a7a', marginRight: 4 }}>
            {totalChanges} change{totalChanges !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Push / pull result ── */}
      {(pushResult || pullResult) && (
        <div style={{
          padding: '4px 10px', fontSize: '10px', fontFamily: 'monospace', flexShrink: 0,
          color: (pushResult?.ok ?? pullResult?.ok) ? '#10b981' : '#ff435a',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          maxHeight: 52, overflowY: 'auto', lineHeight: 1.4,
        }}>
          {pushResult?.msg || pullResult?.msg || ((pushResult?.ok ?? pullResult?.ok) ? 'Success' : 'Failed')}
        </div>
      )}

      {/* ── Branch row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5a5a7a" strokeWidth="2">
          <line x1="6" y1="3" x2="6" y2="15"/>
          <circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>
          <path d="M18 9a9 9 0 01-9 9"/>
        </svg>
        <button
          type="button"
          onClick={() => setShowBranch(v => !v)}
          style={{ background: 'transparent', border: 'none', color: '#10b981', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', cursor: 'pointer', padding: '1px 2px', outline: 'none', display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{branch}</span>
          <span style={{ fontSize: '7px', opacity: 0.5 }}>▾</span>
        </button>
        {showBranch && <BranchDropdown cwd={cwd} currentBranch={branch} onClose={() => { setShowBranch(false); refresh() }} brutal={brutal} />}
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* ── Commit message area ── */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
            <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: '9px', letterSpacing: '.12em', color: '#5a5a7a', textTransform: 'uppercase', flex: 1 }}>
              Message
            </span>
            <button
              type="button" onClick={handleAiCommit} disabled={aiLoading}
              title="Generate commit message with AI"
              style={{
                background: aiLoading ? 'transparent' : 'rgba(187,154,247,.12)',
                border: '1px solid rgba(187,154,247,.3)',
                color: aiLoading ? 'rgba(187,154,247,.4)' : '#bb9af7',
                fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: '8px',
                letterSpacing: '.08em', padding: '1px 5px', cursor: aiLoading ? 'default' : 'pointer',
              }}
            >
              {aiLoading ? '…' : '✦ AI'}
            </button>
          </div>
          <textarea
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleCommit() } }}
            placeholder="Message (Ctrl+Enter to commit)…"
            rows={3}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)', color: '#c0c8d8',
              fontFamily: "'JetBrains Mono',monospace", fontSize: '11px',
              padding: '5px 7px', resize: 'vertical', outline: 'none',
              borderRadius: 2, boxSizing: 'border-box', lineHeight: 1.5, minHeight: 50,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
            onBlur={e  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
          />
          {commitError && <div style={{ color: '#ff435a', fontSize: '10px', fontFamily: 'monospace', marginTop: 3 }}>{commitError}</div>}
          <button
            type="button"
            onClick={handleCommit}
            disabled={commitLoading || !commitMsg.trim()}
            style={{
              width: '100%', marginTop: 6, background: commitMsg.trim() ? '#ff2a38' : 'rgba(255,42,56,0.15)',
              border: 'none', color: commitMsg.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
              fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: '10px',
              letterSpacing: '.08em', padding: '5px 0', cursor: commitMsg.trim() ? 'pointer' : 'default',
              borderRadius: 2, outline: 'none', transition: 'background .15s, color .15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
            onMouseEnter={e => { if (commitMsg.trim()) e.currentTarget.style.background = '#ff1030' }}
            onMouseLeave={e => { if (commitMsg.trim()) e.currentTarget.style.background = '#ff2a38' }}
          >
            {commitLoading ? <><Spinner /> COMMITTING…</> : '✓ COMMIT'}
          </button>
        </div>

        {/* ── STAGED CHANGES ── */}
        <CollapsibleSection
          title="Staged Changes"
          count={stagedFiles.length}
          open={openSections.staged}
          onToggle={() => toggleSection('staged')}
          actionLabel="−all"
          onAction={stagedFiles.length > 0 ? handleUnstageAll : undefined}
        >
          {stagedFiles.length === 0
            ? <div style={{ padding: '4px 22px', fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#3e3e5a', fontStyle: 'italic' }}>No staged files</div>
            : stagedFiles.map(file => (
                <FileRow key={file.path + '-s'} file={file} cwd={cwd} isStaged onOpenFile={onOpenFile} brutal={brutal} />
              ))
          }
        </CollapsibleSection>

        {/* ── CHANGES ── */}
        <CollapsibleSection
          title="Changes"
          count={changedFiles.length}
          open={openSections.changes}
          onToggle={() => toggleSection('changes')}
          actionLabel="+all"
          onAction={changedFiles.length > 0 ? handleStageAll : undefined}
        >
          {changedFiles.length === 0
            ? <div style={{ padding: '4px 22px', fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#3e3e5a', fontStyle: 'italic' }}>No unstaged changes</div>
            : changedFiles.map(file => (
                <FileRow key={file.path} file={file} cwd={cwd} isStaged={false} onOpenFile={onOpenFile} brutal={brutal} />
              ))
          }
        </CollapsibleSection>

        {/* ── Clean working tree ── */}
        {stagedFiles.length === 0 && changedFiles.length === 0 && (
          <div style={{ padding: '20px 16px', textAlign: 'center', fontFamily: "'Share Tech Mono',monospace", fontSize: '10px', color: '#3e3e5a', letterSpacing: '.06em', lineHeight: 2 }}>
            NO CHANGES<br /><span style={{ fontSize: '9px' }}>working tree clean</span>
          </div>
        )}

        {/* ── COMMITS ── */}
        {log.length > 0 && (
          <CollapsibleSection
            title="Commits"
            count={log.length}
            open={openSections.commits}
            onToggle={() => toggleSection('commits')}
          >
            {log.slice(0, 20).map(entry => (
              <CommitRow key={entry.hash} entry={entry} />
            ))}
          </CollapsibleSection>
        )}

        {/* ── COMMIT GRAPH ── */}
        {cwd && (
          <CollapsibleSection
            title="Commit Graph"
            count={0}
            open={openSections.graph}
            onToggle={() => toggleSection('graph')}
          >
            <CommitGraph cwd={cwd} />
          </CollapsibleSection>
        )}

        <div style={{ flex: 1 }} />
      </div>
    </div>
  )
}

export default memo(GitPanelV2)
