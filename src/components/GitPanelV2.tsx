// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Constants ─────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  M: '#ffc410',
  A: '#10b981',
  D: '#ff435a',
  R: '#4285f4',
  U: '#9494b0',
  '?': '#9494b0',
  '!': '#3e3e5a',
}

const STATUS_LABEL: Record<string, string> = {
  M: 'M',
  A: 'A',
  D: 'D',
  R: 'R',
  U: 'U',
  '?': '?',
  '!': '!',
}

// ── Inline diff renderer ───────────────────────────────────────
function DiffView({ diff }: { diff: string }) {
  if (!diff) {
    return (
      <div style={{
        padding: '8px 10px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '10px',
        color: '#9494b0',
        opacity: 0.5,
      }}>
        No diff available.
      </div>
    )
  }

  const lines = diff.split('\n')

  return (
    <div style={{
      maxHeight: 200,
      overflowY: 'auto',
      overflowX: 'auto',
      background: '#03030a',
      borderTop: '1px solid rgba(255,255,255,0.06)',
    }}>
      {lines.map((line, i) => {
        let bg = 'transparent'
        let color = '#c0c8d8'
        let opacity = 1

        if (line.startsWith('+') && !line.startsWith('+++')) {
          bg = 'rgba(16,185,129,0.1)'
          color = '#10b981'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          bg = 'rgba(255,67,90,0.1)'
          color = '#ff435a'
        } else if (line.startsWith('@@')) {
          color = '#28f1c3'
          bg = 'rgba(40,241,195,0.06)'
        } else if (line.startsWith('+++') || line.startsWith('---')) {
          color = '#9494b0'
          opacity = 0.7
        } else if (line.startsWith('diff ') || line.startsWith('index ')) {
          color = '#9494b0'
          opacity = 0.5
        }

        return (
          <div key={i} style={{
            display: 'flex',
            background: bg,
            minHeight: 16,
          }}>
            <span style={{
              width: 32,
              flexShrink: 0,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              color: '#3e3e5a',
              textAlign: 'right',
              paddingRight: 6,
              paddingTop: 1,
              userSelect: 'none',
            }}>{i + 1}</span>
            <pre style={{
              margin: 0,
              flex: 1,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color,
              opacity,
              whiteSpace: 'pre',
              padding: '1px 6px',
              lineHeight: '14px',
            }}>{line}</pre>
          </div>
        )
      })}
    </div>
  )
}

// ── Spinner ────────────────────────────────────────────────────
function Spinner() {
  const [frame, setFrame] = useState(0)
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % frames.length), 80)
    return () => clearInterval(id)
  }, [])
  return <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#10b981' }}>{frames[frame]}</span>
}

// ── Section header ─────────────────────────────────────────────
function SectionHeader({ label, count, onStageAll, onUnstageAll, isStaged }: any) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '6px 10px 4px',
      gap: 6,
    }}>
      <span style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '9px',
        letterSpacing: '.1em',
        opacity: 0.5,
        color: '#c0c8d8',
        textTransform: 'uppercase',
        flex: 1,
      }}>
        {label} {count !== undefined && `(${count})`}
      </span>
      {!isStaged && onStageAll && (
        <button
          onClick={onStageAll}
          title="Stage all changes"
          style={smallBtnStyle}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
        >
          + all
        </button>
      )}
      {isStaged && onUnstageAll && (
        <button
          onClick={onUnstageAll}
          title="Unstage all"
          style={smallBtnStyle}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
        >
          − all
        </button>
      )}
    </div>
  )
}

// ── File row ───────────────────────────────────────────────────
function FileRow({ file, cwd, isStaged, onOpenFile, brutal }: any) {
  const [hovered, setHovered] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [diff, setDiff] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [opLoading, setOpLoading] = useState(false)

  const git = (window as any).electronAPI?.git
  const statusChar = file.state?.[0]?.toUpperCase() ?? '?'
  const color = STATUS_COLOR[statusChar] ?? '#9494b0'
  const name = file.path?.split('/').pop() ?? file.path
  const dirPart = file.path?.includes('/')
    ? file.path.substring(0, file.path.lastIndexOf('/') + 1)
    : ''

  const textColor = brutal ? '#0f0f0f' : '#c0c8d8'
  const dimColor  = brutal ? '#666'    : '#6a6a8a'

  const handleToggleDiff = async () => {
    if (showDiff) { setShowDiff(false); return }
    setShowDiff(true)
    if (diff !== null) return
    setDiffLoading(true)
    try {
      const result = await git?.diff(cwd, file.path)
      setDiff(typeof result === 'string' ? result : '')
    } catch {
      setDiff('')
    } finally {
      setDiffLoading(false)
    }
  }

  const handleStage = async () => {
    if (!git?.stage) return
    setOpLoading(true)
    try { await git.stage(cwd, [file.path]) } catch {}
    setOpLoading(false)
  }

  const handleUnstage = async () => {
    if (!git?.unstage) return
    setOpLoading(true)
    try { await git.unstage(cwd, [file.path]) } catch {}
    setOpLoading(false)
  }

  const handleDiscard = async () => {
    if (!git?.discard) return
    if (!confirm(`Discard changes to "${file.path}"? This cannot be undone.`)) return
    setOpLoading(true)
    try { await git.discard(cwd, file.path) } catch {}
    setOpLoading(false)
  }

  return (
    <div>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          padding: '2px 4px 2px 10px',
          background: hovered
            ? brutal ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'
            : 'transparent',
          cursor: 'default',
          minHeight: 22,
        }}
      >
        {/* Status letter */}
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          fontWeight: 700,
          color,
          width: 14,
          flexShrink: 0,
          textAlign: 'center',
        }}>
          {opLoading ? <Spinner /> : (STATUS_LABEL[statusChar] ?? statusChar)}
        </span>

        {/* Filename */}
        <span
          onClick={() => onOpenFile?.(file.path)}
          style={{
            flex: 1,
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '11px',
            color: textColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginLeft: 6,
            cursor: 'pointer',
          }}
          title={file.path}
        >
          {name}
          {dirPart && (
            <span style={{ color: dimColor, fontSize: '9px', marginLeft: 4 }}>
              {dirPart}
            </span>
          )}
        </span>

        {/* Action buttons — visible on hover */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          opacity: hovered ? 1 : 0,
          transition: 'opacity .1s',
          flexShrink: 0,
        }}>
          {!isStaged && (
            <>
              <ActionBtn title="Stage file" onClick={handleStage}>+</ActionBtn>
              <ActionBtn title="Discard changes" onClick={handleDiscard} danger>↺</ActionBtn>
            </>
          )}
          {isStaged && (
            <ActionBtn title="Unstage file" onClick={handleUnstage}>−</ActionBtn>
          )}
          <ActionBtn title="Show diff" onClick={handleToggleDiff} active={showDiff}>…</ActionBtn>
        </div>
      </div>

      {/* Inline diff */}
      {showDiff && (
        <div>
          {diffLoading
            ? <div style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '10px', color: '#9494b0' }}><Spinner /> loading diff…</div>
            : <DiffView diff={diff ?? ''} />
          }
        </div>
      )}
    </div>
  )
}

// ── Small inline button ────────────────────────────────────────
function ActionBtn({ children, onClick, title, danger = false, active = false }: any) {
  const [hov, setHov] = useState(false)
  const bg = active
    ? 'rgba(40,241,195,0.15)'
    : hov
      ? danger
        ? 'rgba(255,67,90,0.18)'
        : 'rgba(255,255,255,0.1)'
      : 'transparent'
  const color = danger
    ? hov ? '#ff435a' : '#ff435a'
    : active
      ? '#28f1c3'
      : '#9494b0'

  return (
    <button
      title={title}
      onClick={e => { e.stopPropagation(); onClick?.() }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: bg,
        border: 'none',
        color,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px',
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        borderRadius: 2,
        flexShrink: 0,
        outline: 'none',
        transition: 'background .1s, color .1s',
        lineHeight: 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

const smallBtnStyle: any = {
  background: 'transparent',
  border: 'none',
  color: '#9494b0',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '9px',
  cursor: 'pointer',
  padding: '1px 4px',
  outline: 'none',
  opacity: 0.5,
  transition: 'opacity .1s',
  letterSpacing: '.04em',
}

// ── Branch Dropdown ────────────────────────────────────────────
function BranchDropdown({ cwd, currentBranch, onClose, brutal }: any) {
  const [branches, setBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newBranch, setNewBranch] = useState('')
  const [opLoading, setOpLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const git = (window as any).electronAPI?.git

  useEffect(() => {
    const load = async () => {
      try {
        const result = await git?.branches(cwd)
        setBranches(Array.isArray(result) ? result : [])
      } catch {
        setBranches([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [cwd, git])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onClose])

  const handleCheckout = async (branch: string) => {
    if (branch === currentBranch) return
    setOpLoading(branch)
    setError('')
    try {
      const r = await git?.checkout(cwd, branch)
      if (!r?.success) setError(r?.error ?? 'Checkout failed')
      else onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Checkout failed')
    } finally {
      setOpLoading(null)
    }
  }

  const bg = brutal ? '#e8e4d2' : '#0d0d18'
  const textColor = brutal ? '#0f0f0f' : '#c0c8d8'

  return (
    <div ref={ref} style={{
      position: 'absolute',
      top: 32,
      left: 0,
      zIndex: 9999,
      background: bg,
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 4,
      padding: '4px 0',
      minWidth: 200,
      maxWidth: 320,
      boxShadow: '0 12px 40px rgba(0,0,0,0.9)',
    }}>
      <div style={{ padding: '4px 10px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          placeholder="Create or filter branch…"
          value={newBranch}
          onChange={e => setNewBranch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newBranch.trim()) {
              handleCheckout(newBranch.trim())
            }
            if (e.key === 'Escape') onClose()
          }}
          style={{
            width: '100%',
            background: brutal ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: textColor,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: 2,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          autoFocus
        />
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {loading
          ? <div style={{ padding: '8px 10px', fontSize: '10px', color: '#9494b0' }}><Spinner /> loading…</div>
          : branches
            .filter(b => !newBranch || b.toLowerCase().includes(newBranch.toLowerCase()))
            .map(branch => {
              const isCurrent = branch === currentBranch
              return (
                <div
                  key={branch}
                  onClick={() => handleCheckout(branch)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    background: isCurrent ? 'rgba(16,185,129,0.1)' : 'transparent',
                    gap: 6,
                  }}
                  onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isCurrent ? 'rgba(16,185,129,0.1)' : 'transparent' }}
                >
                  {isCurrent && (
                    <span style={{ color: '#10b981', fontSize: '10px' }}>✓</span>
                  )}
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11px',
                    color: isCurrent ? '#10b981' : textColor,
                    flex: 1,
                  }}>
                    {opLoading === branch ? <Spinner /> : branch}
                  </span>
                </div>
              )
            })
        }
      </div>
      {error && (
        <div style={{ padding: '4px 10px', fontSize: '10px', color: '#ff435a', fontFamily: 'monospace' }}>
          {error}
        </div>
      )}
    </div>
  )
}

// ── Lane colors ───────────────────────────────────────────────
const LANE_COLORS = [
  '#10b981','#4285f4','#bb9af7','#ffc410','#ff8080',
  '#28f1c3','#5ccfe6','#e5c07b','#c792ea','#ff1650',
  '#72f1b8','#89ddff','#ffbd5e','#4ec9b0','#ff435a','#98bb6c',
]
const ROW_H = 28
const LANE_W = 14

// ── Lane-assignment algorithm ─────────────────────────────────
function computeLanes(commits: any[]) {
  const laneMap: Record<string, number> = {}
  const slots: (string | null)[] = []

  return commits.map(commit => {
    // Find this commit's lane slot
    let myLane = laneMap[commit.hash]
    if (myLane === undefined) {
      const free = slots.indexOf(null)
      myLane = free === -1 ? slots.length : free
    }

    // Free the slot
    slots[myLane] = null
    delete laneMap[commit.hash]

    // Assign parent lanes
    const parentLanes: { hash: string; lane: number }[] = []
    commit.parents.forEach((p: string, pi: number) => {
      if (laneMap[p] !== undefined) {
        parentLanes.push({ hash: p, lane: laneMap[p] })
      } else if (pi === 0) {
        slots[myLane] = p
        laneMap[p] = myLane
        parentLanes.push({ hash: p, lane: myLane })
      } else {
        const free = slots.indexOf(null)
        const newLane = free === -1 ? slots.length : free
        slots[newLane] = p
        laneMap[p] = newLane
        parentLanes.push({ hash: p, lane: newLane })
      }
    })

    // Active lanes AFTER assigning parents (for pass-through lines in next row)
    const activeLanes = slots.map((h, i) => h !== null ? i : -1).filter(i => i >= 0)

    return { ...commit, lane: myLane, parentLanes, activeLanes }
  })
}

// ── CommitGraph component ─────────────────────────────────────
function CommitGraph({ cwd, brutal }: { cwd: string; brutal: boolean }) {
  const [commits, setCommits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const git = (window as any).electronAPI?.git

  useEffect(() => {
    if (!git?.logGraph || !cwd) return
    setLoading(true)
    git.logGraph(cwd, 80).then((r: any) => {
      if (r?.success) setCommits(computeLanes(r.commits))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [cwd])

  const text = brutal ? '#0f0f0f' : '#c0c8d8'
  const dim  = brutal ? '#666'    : '#6a6a8a'

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Spinner />
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '9px', color: dim, letterSpacing: '.1em' }}>
            LOADING GRAPH…
          </span>
        </div>
      </div>
    )
  }

  if (!commits.length) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '10px', color: text }}>
          NO COMMITS
        </span>
      </div>
    )
  }

  // Max number of lanes for SVG width
  const maxLane = commits.reduce((m, c) => Math.max(m, c.lane, ...c.parentLanes.map((p: any) => p.lane)), 0)
  const svgW = (maxLane + 1) * LANE_W + 8
  const totalH = commits.length * ROW_H

  // Build hash → index map for connecting lines
  const hashToIdx: Record<string, number> = {}
  commits.forEach((c, i) => { hashToIdx[c.hash] = i })

  const selCommit = commits.find(c => c.hash === selected)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {/* Graph SVG + commit rows rendered together */}
        <div style={{ display: 'flex', minHeight: totalH }}>
          {/* SVG Graph column */}
          <div style={{ flexShrink: 0, width: svgW, position: 'relative' }}>
            <svg width={svgW} height={totalH} style={{ display: 'block', overflow: 'visible' }}>
              {commits.map((commit, idx) => {
                const cy = idx * ROW_H + ROW_H / 2
                const cx = commit.lane * LANE_W + LANE_W / 2
                const color = LANE_COLORS[commit.lane % LANE_COLORS.length]

                return (
                  <g key={commit.hash}>
                    {/* Lines to parents */}
                    {commit.parentLanes.map((pl: any) => {
                      const parentIdx = hashToIdx[pl.hash]
                      if (parentIdx === undefined) return null
                      const pcy = parentIdx * ROW_H + ROW_H / 2
                      const pcx = pl.lane * LANE_W + LANE_W / 2
                      const pColor = LANE_COLORS[pl.lane % LANE_COLORS.length]
                      if (cx === pcx) {
                        return <line key={pl.hash} x1={cx} y1={cy} x2={pcx} y2={pcy} stroke={pColor} strokeWidth={1.5} opacity={0.55} />
                      }
                      const mid = (cy + pcy) / 2
                      return (
                        <path key={pl.hash}
                          d={`M ${cx} ${cy} C ${cx} ${mid + 6}, ${pcx} ${mid - 6}, ${pcx} ${pcy}`}
                          stroke={pColor} strokeWidth={1.5} fill="none" opacity={0.55}
                        />
                      )
                    })}
                    {/* Commit dot */}
                    <circle cx={cx} cy={cy} r={selected === commit.hash ? 5.5 : 4}
                      fill={color}
                      stroke={selected === commit.hash ? '#fff' : 'none'}
                      strokeWidth={1.5}
                      style={{ cursor: 'pointer', transition: 'r .1s' }}
                      onClick={() => setSelected(s => s === commit.hash ? null : commit.hash)}
                    />
                    {/* Ring for tagged/branched commits */}
                    {commit.refs.length > 0 && (
                      <circle cx={cx} cy={cy} r={7} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
                    )}
                  </g>
                )
              })}
            </svg>
          </div>

          {/* Commit info column */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {commits.map((commit, idx) => {
              const isSel = selected === commit.hash
              const headRef = commit.refs.find((r: string) => r.includes('HEAD'))
              const branchRef = commit.refs.find((r: string) => !r.includes('HEAD') && !r.includes('tag:'))
              const tagRef = commit.refs.find((r: string) => r.includes('tag:'))

              return (
                <div
                  key={commit.hash}
                  onClick={() => setSelected(s => s === commit.hash ? null : commit.hash)}
                  style={{
                    height: ROW_H,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '0 8px 0 4px',
                    cursor: 'pointer',
                    background: isSel
                      ? brutal ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)'
                      : 'transparent',
                    borderLeft: isSel ? `2px solid ${LANE_COLORS[commit.lane % LANE_COLORS.length]}` : '2px solid transparent',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = brutal ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#c792ea', flexShrink: 0, letterSpacing: '.02em' }}>
                    {commit.hash.slice(0, 7)}
                  </span>
                  {headRef && (
                    <span style={{ fontSize: '8px', padding: '0 4px', background: 'rgba(255,67,90,0.2)', color: '#ff435a', borderRadius: 2, flexShrink: 0, fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: '.06em' }}>
                      HEAD
                    </span>
                  )}
                  {branchRef && (
                    <span style={{ fontSize: '8px', padding: '0 4px', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: 2, flexShrink: 0, fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: '.06em', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {branchRef.replace('origin/', '').replace('HEAD -> ', '')}
                    </span>
                  )}
                  {tagRef && (
                    <span style={{ fontSize: '8px', padding: '0 4px', background: 'rgba(255,196,16,0.15)', color: '#ffc410', borderRadius: 2, flexShrink: 0, fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: '.06em' }}>
                      {tagRef.replace('tag: ', '')}
                    </span>
                  )}
                  <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '10px', color: text, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {commit.subject}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: dim, flexShrink: 0, opacity: 0.6 }}>
                    {commit.reltime}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Selected commit detail strip */}
      {selCommit && (
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '8px 12px',
          background: brutal ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: '#c792ea' }}>{selCommit.hash.slice(0, 12)}</span>
            <span style={{ color: '#ffc410', opacity: 0.7 }}>{selCommit.author}</span>
            <span style={{ color: dim, opacity: 0.6 }}>{selCommit.reltime}</span>
          </div>
          <div style={{ color: text, opacity: 0.85, lineHeight: 1.4 }}>{selCommit.subject}</div>
          {selCommit.refs.length > 0 && (
            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {selCommit.refs.map((r: string) => (
                <span key={r} style={{ fontSize: '8px', padding: '1px 5px', background: 'rgba(187,154,247,0.15)', color: '#bb9af7', borderRadius: 2, fontFamily: "'Oswald', sans-serif", letterSpacing: '.05em' }}>
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────
interface GitPanelV2Props {
  cwd: string
  brutal?: boolean
  onOpenFile?: (filepath: string) => void
  aiProvider?: string
  aiKeys?: Record<string,string>
  aiModels?: Record<string,string>
  onOpenAiSettings?: () => void
}

const AI_DEFAULT_MODELS: Record<string,string> = {
  anthropic:'claude-haiku-4-5-20251001', openai:'gpt-4o-mini', gemini:'gemini-2.0-flash', openrouter:'openai/gpt-4o-mini', ollama:'llama3',
}

// ══════════════════════════════════════════════════════════════
//  GitPanelV2
// ══════════════════════════════════════════════════════════════
export default function GitPanelV2({ cwd, brutal = false, onOpenFile, aiProvider = 'anthropic', aiKeys = {}, aiModels = {}, onOpenAiSettings }: GitPanelV2Props) {
  const [activeTab, setActiveTab] = useState<'changes' | 'history'>('changes')
  const [status, setStatus] = useState<{ branch: string; files: any[]; error?: string } | null>(null)
  const [log, setLog] = useState<Array<{ hash: string; message: string }>>([])
  const [commitMsg, setCommitMsg] = useState('')
  const [aiCommitLoading, setAiCommitLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [commitLoading, setCommitLoading] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pullLoading, setPullLoading] = useState(false)
  const [stashLoading, setStashLoading] = useState(false)
  const [pushResult, setPushResult] = useState<{ ok?: boolean; msg?: string } | null>(null)
  const [pullResult, setPullResult] = useState<{ ok?: boolean; msg?: string } | null>(null)
  const [commitError, setCommitError] = useState('')
  const [showBranchDropdown, setShowBranchDropdown] = useState(false)
  const [initLoading, setInitLoading] = useState(false)

  const git = (window as any).electronAPI?.git
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const bg     = brutal ? '#f0ece0' : '#06060e'
  const text   = brutal ? '#0f0f0f' : '#c0c8d8'
  const dim    = brutal ? '#666'    : '#6a6a8a'
  const border = brutal ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'

  // ── Data loading ──────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    if (!git || !cwd) return
    try {
      const s = await git.status(cwd)
      setStatus(s)
    } catch {
      setStatus({ branch: '', files: [], error: 'Failed to get git status' })
    }
  }, [git, cwd])

  const loadLog = useCallback(async () => {
    if (!git || !cwd) return
    try {
      const l = await git.log(cwd)
      setLog(Array.isArray(l) ? l.slice(0, 20) : [])
    } catch {
      setLog([])
    }
  }, [git, cwd])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadStatus(), loadLog()])
    setRefreshing(false)
  }, [loadStatus, loadLog])

  // Mount + interval polling
  useEffect(() => {
    if (!cwd) return
    setLoading(true)
    Promise.all([loadStatus(), loadLog()]).finally(() => setLoading(false))

    timerRef.current = setInterval(() => {
      loadStatus()
      loadLog()
    }, 5000)

    const onFocus = () => { loadStatus(); loadLog() }
    window.addEventListener('focus', onFocus)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      window.removeEventListener('focus', onFocus)
    }
  }, [cwd, loadStatus, loadLog])

  // ── File categorization ───────────────────────────────────
  const allFiles = status?.files ?? []
  // Staged: lines where state has uppercase first char and second char is space or the first char is in 'MADRCT'
  // We use git state strings like 'M ', ' M', 'A ', 'D ', '??', etc.
  const stagedFiles = allFiles.filter(f => {
    const s = f.state ?? ''
    if (s.length >= 1) {
      const idx0 = s[0]
      // If index char (first) is not space or '?', it's staged
      return idx0 !== ' ' && idx0 !== '?' && idx0 !== '!'
    }
    return false
  })
  const changedFiles = allFiles.filter(f => {
    const s = f.state ?? ''
    if (s.length >= 2) {
      const idx1 = s[1]
      return idx1 !== ' '
    }
    if (s === '??' || s === '!!') return true
    return false
  }).filter(f => !stagedFiles.includes(f))

  // ── Actions ───────────────────────────────────────────────
  const handleStageAll = async () => {
    if (!git?.stage) return
    const paths = changedFiles.map(f => f.path)
    if (!paths.length) return
    await git.stage(cwd, paths)
    await loadStatus()
  }

  const handleUnstageAll = async () => {
    if (!git?.unstage) return
    const paths = stagedFiles.map(f => f.path)
    if (!paths.length) return
    await git.unstage(cwd, paths)
    await loadStatus()
  }

  const handleAiCommit = async () => {
    const api = (window as any).electronAPI
    const activeKey = aiProvider === 'ollama' ? (aiKeys['ollama'] || 'http://localhost:11434') : (aiKeys[aiProvider] || '')
    if (aiProvider !== 'ollama' && !activeKey) { onOpenAiSettings?.(); return }
    setAiCommitLoading(true)
    try {
      const diffRes = await git?.diff(cwd, '').catch(() => ({ diff: '' }))
      const statusRes = await git?.status(cwd).catch(() => ({ files: [] }))
      const diff = (diffRes?.diff || '').slice(0, 6000)
      const files = (statusRes?.files || []).map((f: any) => f.file || f.path || '').filter(Boolean).join(', ')
      const model = aiModels[aiProvider] || AI_DEFAULT_MODELS[aiProvider] || ''
      const result = await api?.ai?.chat?.(
        [{ role: 'user', content: `Write a concise git commit message for these changes:\n\nChanged files: ${files}\n\nDiff:\n\`\`\`\n${diff}\n\`\`\`` }],
        activeKey, model,
        'You are a git commit message writer. Output ONLY the commit message, no explanation, no quotes. Follow conventional commits (feat/fix/refactor/docs/chore/etc).',
        aiProvider,
      )
      if (result?.success && result.content) setCommitMsg(result.content.trim())
    } catch {}
    setAiCommitLoading(false)
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) { setCommitError('Please enter a commit message'); return }
    setCommitError('')
    setCommitLoading(true)
    try {
      const r = await git?.commit(cwd, commitMsg.trim())
      if (r?.success) {
        setCommitMsg('')
        await refresh()
      } else {
        setCommitError(r?.error ?? 'Commit failed')
      }
    } catch (e: any) {
      setCommitError(e?.message ?? 'Commit failed')
    } finally {
      setCommitLoading(false)
    }
  }

  const handlePush = async () => {
    setPushLoading(true)
    setPushResult(null)
    try {
      const r = await git?.push(cwd)
      setPushResult({ ok: r?.success, msg: r?.output ?? r?.error ?? '' })
      if (r?.success) await refresh()
    } catch (e: any) {
      setPushResult({ ok: false, msg: e?.message ?? 'Push failed' })
    } finally {
      setPushLoading(false)
      setTimeout(() => setPushResult(null), 4000)
    }
  }

  const handlePull = async () => {
    setPullLoading(true)
    setPullResult(null)
    try {
      const r = await git?.pull(cwd)
      setPullResult({ ok: r?.success, msg: r?.output ?? r?.error ?? '' })
      if (r?.success) await refresh()
    } catch (e: any) {
      setPullResult({ ok: false, msg: e?.message ?? 'Pull failed' })
    } finally {
      setPullLoading(false)
      setTimeout(() => setPullResult(null), 4000)
    }
  }

  const handleStash = async () => {
    setStashLoading(true)
    try {
      await git?.stash(cwd)
      await loadStatus()
    } catch {}
    setStashLoading(false)
  }

  const handleStashPop = async () => {
    setStashLoading(true)
    try {
      await git?.stashPop(cwd)
      await loadStatus()
    } catch {}
    setStashLoading(false)
  }

  const handleGitInit = async () => {
    setInitLoading(true)
    try {
      await git?.init(cwd)
      await refresh()
    } catch {}
    setInitLoading(false)
  }

  // ── Render helpers ────────────────────────────────────────
  const iconBtnStyle = (hov: boolean, active = false): any => ({
    background: active ? 'rgba(16,185,129,0.12)' : hov ? 'rgba(255,255,255,0.08)' : 'transparent',
    border: 'none',
    color: active ? '#10b981' : hov ? text : dim,
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderRadius: 3,
    fontSize: '13px',
    outline: 'none',
    transition: 'background .1s, color .1s',
    flexShrink: 0,
    padding: 0,
  })

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Spinner />
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '10px', color: dim, letterSpacing: '.08em' }}>
            LOADING GIT STATUS…
          </span>
        </div>
      </div>
    )
  }

  // ── No git repo ────────────────────────────────────────────
  if (status?.error && status.files.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '24px 16px',
        background: bg,
      }}>
        <div style={{ fontSize: '24px', opacity: 0.3 }}>◈</div>
        <div style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: '10px',
          opacity: 0.4,
          textAlign: 'center',
          letterSpacing: '.08em',
          lineHeight: 1.8,
          color: text,
        }}>
          NOT A GIT REPOSITORY<br />
          <span style={{ fontSize: '9px', opacity: 0.7 }}>{cwd}</span>
        </div>
        <button
          onClick={handleGitInit}
          disabled={initLoading}
          style={{
            background: 'transparent',
            border: '1px solid rgba(16,185,129,0.4)',
            color: '#10b981',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            padding: '6px 14px',
            cursor: 'pointer',
            letterSpacing: '.08em',
            transition: 'all .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {initLoading ? <Spinner /> : 'git init'}
        </button>
      </div>
    )
  }

  const branch = status?.branch ?? '—'

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: bg,
      overflow: 'hidden',
      fontFamily: "'Share Tech Mono', monospace",
      color: text,
      position: 'relative',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 8px',
        borderBottom: `1px solid ${border}`,
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: '9px',
          letterSpacing: '.1em',
          opacity: 0.5,
          flex: 1,
          textTransform: 'uppercase',
          color: text,
        }}>
          Source Control
        </span>

        {/* Refresh */}
        <HeaderBtn title="Refresh" onClick={refresh} loading={refreshing}>⟳</HeaderBtn>
        {/* Push */}
        <HeaderBtn title="Push" onClick={handlePush} loading={pushLoading}>↑</HeaderBtn>
        {/* Pull */}
        <HeaderBtn title="Pull" onClick={handlePull} loading={pullLoading}>↓</HeaderBtn>
        {/* Stash */}
        <HeaderBtn title="Stash" onClick={handleStash} loading={stashLoading}>⊡</HeaderBtn>
        {/* Stash pop */}
        <HeaderBtn title="Stash Pop" onClick={handleStashPop}>⊞</HeaderBtn>
      </div>

      {/* ── Push/Pull results ── */}
      {(pushResult || pullResult) && (
        <div style={{
          padding: '4px 10px',
          fontSize: '10px',
          fontFamily: 'monospace',
          color: (pushResult?.ok ?? pullResult?.ok) ? '#10b981' : '#ff435a',
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
          lineHeight: 1.4,
          maxHeight: 60,
          overflowY: 'auto',
        }}>
          {pushResult?.msg || pullResult?.msg || ((pushResult?.ok ?? pullResult?.ok) ? 'Success' : 'Failed')}
        </div>
      )}

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', flexShrink: 0, borderBottom: `1px solid ${border}` }}>
        {(['changes', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #ff2a38' : '2px solid transparent',
              color: activeTab === tab ? text : dim,
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '9px',
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              padding: '6px 0',
              cursor: 'pointer',
              transition: 'color .1s, border-color .1s',
            }}
          >
            {tab === 'changes' ? `CHANGES${status?.files.length ? ` (${status.files.length})` : ''}` : 'HISTORY'}
          </button>
        ))}
      </div>

      {/* ── Branch selector ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderBottom: `1px solid ${border}`,
        flexShrink: 0,
        position: 'relative',
      }}>
        <span style={{ fontSize: '10px', opacity: 0.4, color: text }}>⎇</span>
        <button
          onClick={() => setShowBranchDropdown(v => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#10b981',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            cursor: 'pointer',
            padding: '1px 4px',
            outline: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            letterSpacing: '.02em',
          }}
        >
          {branch}
          <span style={{ fontSize: '8px', opacity: 0.5 }}>▾</span>
        </button>

        {showBranchDropdown && (
          <BranchDropdown
            cwd={cwd}
            currentBranch={branch}
            onClose={() => { setShowBranchDropdown(false); refresh() }}
            brutal={brutal}
          />
        )}
      </div>

      {/* ── History tab: visual commit graph ── */}
      {activeTab === 'history' && (
        <CommitGraph cwd={cwd} brutal={brutal} />
      )}

      {/* ── Changes tab: scrollable content ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: activeTab === 'changes' ? 'block' : 'none' }}>

        {/* CHANGES section */}
        {changedFiles.length > 0 && (
          <div>
            <SectionHeader
              label="Changes"
              count={changedFiles.length}
              onStageAll={handleStageAll}
              isStaged={false}
            />
            {changedFiles.map(file => (
              <FileRow
                key={file.path}
                file={file}
                cwd={cwd}
                isStaged={false}
                onOpenFile={onOpenFile}
                brutal={brutal}
              />
            ))}
          </div>
        )}

        {/* STAGED section */}
        {stagedFiles.length > 0 && (
          <div style={{ marginTop: changedFiles.length > 0 ? 4 : 0 }}>
            <SectionHeader
              label="Staged"
              count={stagedFiles.length}
              onUnstageAll={handleUnstageAll}
              isStaged={true}
            />
            {stagedFiles.map(file => (
              <FileRow
                key={file.path + '-staged'}
                file={file}
                cwd={cwd}
                isStaged={true}
                onOpenFile={onOpenFile}
                brutal={brutal}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {changedFiles.length === 0 && stagedFiles.length === 0 && (
          <div style={{
            padding: '20px 10px',
            textAlign: 'center',
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '10px',
            opacity: 0.3,
            letterSpacing: '.06em',
            lineHeight: 2,
            color: text,
          }}>
            NO CHANGES<br />
            <span style={{ fontSize: '9px' }}>working tree is clean</span>
          </div>
        )}

        {/* ── Commit section ── */}
        <div style={{
          padding: '8px 10px',
          borderTop: `1px solid ${border}`,
          marginTop: 4,
        }}>
          <div style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '9px',
            letterSpacing: '.1em',
            opacity: 0.4,
            marginBottom: 5,
            textTransform: 'uppercase',
            color: text,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>Commit Message</span>
            <button
              type="button"
              onClick={handleAiCommit}
              disabled={aiCommitLoading}
              title="Generate commit message with AI"
              style={{
                marginLeft: 'auto',
                background: aiCommitLoading ? 'transparent' : 'rgba(187,154,247,.12)',
                border: '1px solid rgba(187,154,247,.3)',
                color: aiCommitLoading ? 'rgba(187,154,247,.4)' : '#bb9af7',
                fontFamily: "'Oswald', sans-serif",
                fontWeight: 700,
                fontSize: '8px',
                letterSpacing: '.08em',
                padding: '1px 6px',
                cursor: aiCommitLoading ? 'default' : 'pointer',
                transition: 'all .12s',
              }}
            >
              {aiCommitLoading ? '…' : '✦ AI'}
            </button>
          </div>
          <textarea
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                handleCommit()
              }
            }}
            placeholder="Message (Ctrl+Enter to commit)…"
            rows={3}
            style={{
              width: '100%',
              background: brutal ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${border}`,
              color: text,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              padding: '6px 8px',
              resize: 'vertical',
              outline: 'none',
              borderRadius: 2,
              boxSizing: 'border-box',
              lineHeight: 1.5,
              minHeight: 52,
            }}
          />
          {commitError && (
            <div style={{
              color: '#ff435a',
              fontSize: '10px',
              fontFamily: 'monospace',
              marginTop: 3,
            }}>
              {commitError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              onClick={handleStageAll}
              style={commitBtnStyle(brutal, 'secondary')}
              onMouseEnter={e => (e.currentTarget.style.background = brutal ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = brutal ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)')}
            >
              + Stage All
            </button>
            <button
              onClick={handleCommit}
              disabled={commitLoading || !commitMsg.trim()}
              style={{
                ...commitBtnStyle(brutal, 'primary'),
                flex: 1,
                opacity: (!commitMsg.trim() && !commitLoading) ? 0.4 : 1,
              }}
              onMouseEnter={e => { if (commitMsg.trim()) e.currentTarget.style.background = '#ff1833' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#ff2a38' }}
            >
              {commitLoading ? <><Spinner /> COMMITTING…</> : 'COMMIT'}
            </button>
          </div>
        </div>

        {/* ── Recent Commits ── */}
        {log.length > 0 && (
          <div style={{ padding: '0 0 8px' }}>
            <div style={{
              padding: '8px 10px 4px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderTop: `1px solid ${border}`,
            }}>
              <span style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '9px',
                letterSpacing: '.1em',
                opacity: 0.4,
                textTransform: 'uppercase',
                color: text,
              }}>
                Recent Commits
              </span>
            </div>
            {log.map(entry => (
              <CommitRow key={entry.hash} entry={entry} brutal={brutal} text={text} dim={dim} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Header button ──────────────────────────────────────────────
function HeaderBtn({ children, onClick, title, loading = false }: any) {
  const [hov, setHov] = useState(false)
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'rgba(255,255,255,0.08)' : 'transparent',
        border: 'none',
        color: hov ? '#c0c8d8' : '#6a6a8a',
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        borderRadius: 3,
        fontSize: '13px',
        outline: 'none',
        transition: 'all .1s',
        padding: 0,
        flexShrink: 0,
      }}
    >
      {loading ? <Spinner /> : children}
    </button>
  )
}

// ── Commit row ─────────────────────────────────────────────────
function CommitRow({ entry, brutal, text, dim }: any) {
  const [hov, setHov] = useState(false)
  const hash = (entry.hash ?? '').slice(0, 7)

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '3px 10px',
        background: hov
          ? brutal ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'
          : 'transparent',
        cursor: 'default',
      }}
      title={entry.message}
    >
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '9px',
        color: '#c792ea',
        flexShrink: 0,
        letterSpacing: '.02em',
      }}>
        {hash}
      </span>
      <span style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '10px',
        color: text,
        opacity: 0.7,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {entry.message}
      </span>
    </div>
  )
}

// ── Commit button style helper ─────────────────────────────────
function commitBtnStyle(brutal: boolean, variant: 'primary' | 'secondary'): any {
  const base: any = {
    border: 'none',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    cursor: 'pointer',
    padding: '5px 10px',
    borderRadius: 2,
    outline: 'none',
    letterSpacing: '.06em',
    transition: 'background .12s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    whiteSpace: 'nowrap',
  }
  if (variant === 'primary') {
    return {
      ...base,
      background: '#ff2a38',
      color: '#fff',
      fontWeight: 700,
    }
  }
  return {
    ...base,
    background: brutal ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)',
    color: brutal ? '#333' : '#9494b0',
    border: `1px solid ${brutal ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)'}`,
    flexShrink: 0,
  }
}
