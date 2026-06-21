// @ts-nocheck
import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { api } from '../lib/api'
import { useFileWatcher } from '../hooks'

const STATUS_COLOR: Record<string, string> = {
  M: '#e2c08d', A: '#73c991', D: '#f14c4c',
  R: '#73c991', C: '#73c991', U: '#e2c08d', '?': '#4285f4', '!': '#4a4a5a',
}
const STATUS_BG: Record<string, string> = {
  M: 'rgba(226,192,141,.13)', A: 'rgba(115,201,145,.13)', D: 'rgba(241,76,76,.13)',
  R: 'rgba(115,201,145,.13)', C: 'rgba(115,201,145,.13)', U: 'rgba(226,192,141,.13)',
  '?': 'rgba(66,133,244,.13)', '!': 'rgba(74,74,90,.1)',
}
const STATUS_LABEL: Record<string, string> = {
  M: 'M', A: 'A', D: 'D', R: 'R', C: 'C', U: 'M', '?': 'U', '!': '!',
}

function isConflict(state: string): boolean {
  if (!state || state.length < 2) return false
  return state[0] === 'U' || state[1] === 'U' || state === 'AA' || state === 'DD'
}

// ─────────────────────────────────────────────────────────────
//  Spinner
// ─────────────────────────────────────────────────────────────
function Spinner({ size = 11 }: { size?: number }) {
  const [frame, setFrame] = useState(0)
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % frames.length), 80)
    return () => clearInterval(id)
  }, [])
  return <span style={{ fontFamily: 'monospace', fontSize: size + 'px', color: '#10b981' }}>{frames[frame]}</span>
}

// ─────────────────────────────────────────────────────────────
//  DiffView
// ─────────────────────────────────────────────────────────────
function DiffView({ diff }: { diff: string }) {
  if (!diff) return <div className="gp-diff-empty">No diff available.</div>
  return (
    <div className="gp-diff">
      {diff.split('\n').map((line, i) => {
        let cls = 'gp-diff-line'
        if (line.startsWith('+') && !line.startsWith('+++')) cls += ' add'
        else if (line.startsWith('-') && !line.startsWith('---')) cls += ' del'
        else if (line.startsWith('@@')) cls += ' hunk'
        else if (line.startsWith('+++') || line.startsWith('---')) cls += ' meta'
        else if (line.startsWith('diff ') || line.startsWith('index ')) cls += ' meta dim'
        return (
          <div key={i} className={cls}>
            <span className="gp-diff-sign">{line[0] ?? ' '}</span>
            <pre className="gp-diff-code">{line.length > 1 ? line.slice(1) : ''}</pre>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  ActionBtn
// ─────────────────────────────────────────────────────────────
function ActionBtn({ children, onClick, title, danger = false, active = false }: any) {
  return (
    <button
      type="button" title={title}
      onClick={e => { e.stopPropagation(); onClick?.() }}
      className={`gp-action-btn${danger ? ' danger' : ''}${active ? ' active' : ''}`}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
//  HeaderBtn
// ─────────────────────────────────────────────────────────────
function HeaderBtn({ children, onClick, title, loading = false, active = false }: any) {
  return (
    <button
      type="button" title={title} onClick={onClick} disabled={loading}
      className={`gp-header-btn${active ? ' active' : ''}`}
    >
      {loading ? <Spinner /> : children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
//  FileRow
// ─────────────────────────────────────────────────────────────
function FileRow({ file, cwd, isStaged, onOpenFile, onRefresh }: any) {
  const [hovered, setHovered]         = useState(false)
  const [showDiff, setShowDiff]       = useState(false)
  const [diff, setDiff]               = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [opLoading, setOpLoading]     = useState(false)

  const git        = api?.git
  const stateRaw   = file.state ?? '??'
  const xi         = stateRaw[0] ?? '?'
  const yi         = stateRaw[1] ?? '?'
  const statusChar = (isStaged ? xi : (yi !== ' ' ? yi : xi)).toUpperCase()
  const color      = STATUS_COLOR[statusChar] ?? '#6a6a8a'
  const bgColor    = STATUS_BG[statusChar] ?? 'rgba(106,106,138,.1)'
  const name       = file.path?.split('/').pop() ?? file.path
  const dirPart    = file.path?.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : ''

  const handleToggleDiff = async () => {
    if (showDiff) { setShowDiff(false); return }
    setShowDiff(true)
    if (diff !== null) return
    setDiffLoading(true)
    try {
      const r = await git?.diff(cwd, file.path, isStaged) as any
      setDiff(typeof r === 'string' ? r : (r?.diff ?? ''))
    } catch { setDiff('') }
    finally { setDiffLoading(false) }
  }

  const run = async (fn: () => Promise<any>) => {
    setOpLoading(true)
    try { await fn() } catch {}
    setOpLoading(false)
    onRefresh?.()
  }

  const handleStage   = () => run(() => git?.stage(cwd, [file.path]))
  const handleUnstage = () => run(() => git?.unstage(cwd, [file.path]))
  const handleDiscard = async () => {
    if (!confirm(`Discard changes to "${file.path}"?`)) return
    run(() => git?.discard(cwd, file.path))
  }

  return (
    <div>
      <div
        className={`gp-file-row${hovered ? ' hov' : ''}`}
        style={{ borderLeftColor: hovered ? color : 'transparent' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span className="gp-file-status" style={{ color, background: bgColor }}>
          {opLoading ? <Spinner size={10}/> : (STATUS_LABEL[statusChar] ?? statusChar)}
        </span>
        <span className="gp-file-name" onClick={() => onOpenFile?.(file.path)} title={file.path}>
          {name}
          {dirPart && <span className="gp-file-dir">{dirPart.replace(/\/$/, '')}</span>}
        </span>
        <div className="gp-file-actions">
          <ActionBtn title="View diff" onClick={handleToggleDiff} active={showDiff}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="2.5" x2="10" y2="2.5"/>
              <line x1="1" y1="5.5" x2="7.5" y2="5.5"/>
              <line x1="1" y1="8.5" x2="10" y2="8.5"/>
            </svg>
          </ActionBtn>
          {!isStaged && (
            <ActionBtn title="Stage file" onClick={handleStage}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <line x1="5.5" y1="1" x2="5.5" y2="10"/>
                <line x1="1" y1="5.5" x2="10" y2="5.5"/>
              </svg>
            </ActionBtn>
          )}
          {isStaged && (
            <ActionBtn title="Unstage file" onClick={handleUnstage}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <line x1="1" y1="5.5" x2="10" y2="5.5"/>
              </svg>
            </ActionBtn>
          )}
          {!isStaged && (
            <ActionBtn title="Discard changes" onClick={handleDiscard} danger>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="2" y1="2" x2="9" y2="9"/><line x1="9" y1="2" x2="2" y2="9"/>
              </svg>
            </ActionBtn>
          )}
        </div>
      </div>
      {showDiff && (
        diffLoading
          ? <div className="gp-diff-loading"><Spinner /> loading diff…</div>
          : <DiffView diff={diff ?? ''} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  ConflictRow
// ─────────────────────────────────────────────────────────────
function ConflictRow({ file, cwd, onOpenFile, onRefresh }: any) {
  const [opLoading, setOpLoading] = useState(false)
  const git = api?.git
  const name    = file.path?.split('/').pop() ?? file.path
  const dirPart = file.path?.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : ''

  const handleMarkResolved = async () => {
    setOpLoading(true)
    try { await git?.stage(cwd, [file.path]) } catch {}
    setOpLoading(false)
    onRefresh?.()
  }

  return (
    <div className="gp-file-row gp-conflict-row">
      <span className="gp-file-status" style={{ color: '#ff5566', background: 'rgba(255,67,90,.13)' }}>
        {opLoading ? <Spinner size={10}/> : '!'}
      </span>
      <span className="gp-file-name gp-conflict-name" onClick={() => onOpenFile?.(file.path)} title={file.path}>
        {name}
        {dirPart && <span className="gp-file-dir">{dirPart.replace(/\/$/, '')}</span>}
      </span>
      <div className="gp-file-actions" style={{ opacity: 1 }}>
        <ActionBtn title="Mark as resolved (stage)" onClick={handleMarkResolved}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2 6 4.5 8.5 9 3"/>
          </svg>
        </ActionBtn>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Section
// ─────────────────────────────────────────────────────────────
function Section({ title, count, open, onToggle, actionLabel, onAction, children, accent }: any) {
  return (
    <div className="gp-section">
      <div className="gp-section-hdr" onClick={onToggle} style={accent ? { borderLeftColor: accent } : undefined}>
        <span className="gp-section-caret">{open ? '▾' : '▸'}</span>
        <span className="gp-section-title" style={accent ? { color: accent, opacity: .7 } : undefined}>{title}</span>
        {count > 0 && <span className="gp-section-count">{count}</span>}
        {onAction && count > 0 && (
          <button
            type="button"
            className="gp-section-action"
            onClick={e => { e.stopPropagation(); onAction() }}
            title={actionLabel === '+all' ? 'Stage all' : 'Unstage all'}
          >
            {actionLabel === '+all'
              ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="5" y1="1" x2="5" y2="9"/><line x1="1" y1="5" x2="9" y2="5"/></svg>
              : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="1" y1="5" x2="9" y2="5"/></svg>
            }
          </button>
        )}
      </div>
      {open && <div>{children}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  CommitRow
// ─────────────────────────────────────────────────────────────
function CommitRow({ entry }: any) {
  const hash = (entry.hash ?? '').slice(0, 7)
  return (
    <div className="gp-commit-row" title={entry.message}>
      <span className="gp-commit-hash">{hash}</span>
      <span className="gp-commit-msg">{entry.message}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  CommitGraph
// ─────────────────────────────────────────────────────────────
const LANE_COLORS = [
  '#10b981','#4285f4','#bb9af7','#ffc410','#ff8080',
  '#28f1c3','#5ccfe6','#e5c07b','#c792ea','#ff6a7a',
]
const ROW_H = 24
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
    return { ...commit, lane: myLane, parentLanes }
  })
}

function CommitGraph({ cwd }: { cwd: string }) {
  const git = api?.git
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

  if (loading) return <div className="gp-graph-loading"><Spinner /> <span>Loading history…</span></div>
  if (!commits.length) return <div className="gp-graph-empty">No commits yet</div>

  const maxLane = commits.reduce((m, c) => Math.max(m, c.lane, ...c.parentLanes.map((p: any) => p.lane)), 0)
  const svgW    = (maxLane + 1) * LANE_W + 8
  const totalH  = commits.length * ROW_H
  const hashToIdx: Record<string, number> = {}
  commits.forEach((c, i) => { hashToIdx[c.hash] = i })
  const selCommit = commits.find(c => c.hash === selected)

  return (
    <div className="gp-graph">
      <div className="gp-graph-scroll">
        <div className="gp-graph-inner" style={{ minHeight: totalH }}>
          <div className="gp-graph-svg-col" style={{ width: svgW }}>
            <svg width={svgW} height={totalH} className="gp-graph-svg">
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
                      if (cx === pcx) return <line key={pl.hash} x1={cx} y1={cy} x2={pcx} y2={pcy} stroke={pColor} strokeWidth={1.5} opacity={0.45} />
                      const mid = (cy + pcy) / 2
                      return <path key={pl.hash} d={`M ${cx} ${cy} C ${cx} ${mid+8}, ${pcx} ${mid-8}, ${pcx} ${pcy}`} stroke={pColor} strokeWidth={1.5} fill="none" opacity={0.45} />
                    })}
                    <circle cx={cx} cy={cy} r={selected === commit.hash ? 4.5 : 3} fill={color}
                      stroke={selected === commit.hash ? 'rgba(255,255,255,.75)' : 'none'} strokeWidth={1.5}
                      className="gp-graph-dot"
                      onClick={() => setSelected(s => s === commit.hash ? null : commit.hash)} />
                    {commit.refs.length > 0 && <circle cx={cx} cy={cy} r={6} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />}
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="gp-graph-labels">
            {commits.map((commit) => {
              const isSel     = selected === commit.hash
              const branchRef = commit.refs.find((r: string) => !r.includes('HEAD') && !r.includes('tag:'))
              const color     = LANE_COLORS[commit.lane % LANE_COLORS.length]
              return (
                <div key={commit.hash}
                  className={`gp-graph-row${isSel ? ' sel' : ''}`}
                  style={isSel ? { borderLeftColor: color } : undefined}
                  onClick={() => setSelected(s => s === commit.hash ? null : commit.hash)}
                >
                  <span className="gp-graph-hash">{commit.hash.slice(0, 7)}</span>
                  {branchRef && (
                    <span className="gp-graph-ref" style={{ background: color + '20', color }}>
                      {branchRef.replace('HEAD -> ', '')}
                    </span>
                  )}
                  <span className="gp-graph-subject">{commit.subject}</span>
                  <span className="gp-graph-time">{commit.reltime}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {selCommit && (
        <div className="gp-graph-detail">
          <span className="gp-graph-detail-hash">{selCommit.hash.slice(0, 12)}</span>
          <span className="gp-graph-detail-author">{selCommit.author}</span>
          <span className="gp-graph-detail-time">{selCommit.reltime}</span>
          <div className="gp-graph-detail-msg">{selCommit.subject}</div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  BranchDropdown
// ─────────────────────────────────────────────────────────────
function BranchDropdown({ cwd, currentBranch, onClose }: any) {
  const git = api?.git
  const [branches, setBranches]   = useState<string[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('')
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
    // Strip remotes/origin/ prefix for checkout
    const cleaned = branch.replace(/^remotes\/[^/]+\//, '')
    if (cleaned === currentBranch) return
    setOpLoading(branch); setError('')
    try {
      const r = await git?.checkout(cwd, cleaned) as any
      if (!r?.success) setError(r?.error ?? 'Checkout failed')
      else onClose()
    } catch (e: any) { setError(e?.message ?? 'Checkout failed') }
    finally { setOpLoading(null) }
  }

  const handleCreate = async () => {
    const name = newBranch.trim()
    if (!name) return
    setOpLoading('__create__'); setError('')
    try {
      const r = await git?.createBranch(cwd, name) as any
      if (!r?.success) setError(r?.error ?? 'Create failed')
      else onClose()
    } catch (e: any) { setError(e?.message ?? 'Create failed') }
    finally { setOpLoading(null) }
  }

  const filterLower   = filter.toLowerCase()
  const localBranches = branches.filter(b => !b.startsWith('remotes/'))
  const remoteBranches = branches
    .filter(b => b.startsWith('remotes/'))
    .map(b => ({ raw: b, display: b.replace(/^remotes\/[^/]+\//, '') }))
    .filter((b, i, arr) => arr.findIndex(x => x.display === b.display) === i)

  const visLocal  = localBranches.filter(b => !filterLower || b.toLowerCase().includes(filterLower))
  const visRemote = remoteBranches.filter(b => !filterLower || b.display.toLowerCase().includes(filterLower))

  return (
    <div ref={ref} className="gp-branch-dd">
      <div className="gp-branch-dd-search">
        <input
          placeholder="Filter branches…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          className="gp-input"
          autoFocus
        />
      </div>
      <div className="gp-branch-dd-list">
        {loading
          ? <div className="gp-branch-dd-loading"><Spinner /> loading…</div>
          : <>
              {visLocal.length > 0 && (
                <>
                  <div className="gp-branch-dd-group">LOCAL</div>
                  {visLocal.map(branch => {
                    const isCurrent = branch === currentBranch
                    return (
                      <div key={branch}
                        className={`gp-branch-dd-item${isCurrent ? ' current' : ''}`}
                        onClick={() => handleCheckout(branch)}
                      >
                        {isCurrent
                          ? <span className="gp-branch-dd-check">✓</span>
                          : <span className="gp-branch-dd-check" style={{ opacity: 0 }}>·</span>
                        }
                        <span className="gp-branch-dd-name">
                          {opLoading === branch ? <Spinner size={10}/> : branch}
                        </span>
                      </div>
                    )
                  })}
                </>
              )}
              {visRemote.length > 0 && (
                <>
                  <div className="gp-branch-dd-group">REMOTE</div>
                  {visRemote.map(b => (
                    <div key={b.raw}
                      className={`gp-branch-dd-item remote${b.display === currentBranch ? ' current' : ''}`}
                      onClick={() => handleCheckout(b.raw)}
                    >
                      <span className="gp-branch-dd-check" style={{ opacity: 0 }}>·</span>
                      <span className="gp-branch-dd-name">
                        {opLoading === b.raw ? <Spinner size={10}/> : b.display}
                      </span>
                    </div>
                  ))}
                </>
              )}
              {visLocal.length === 0 && visRemote.length === 0 && (
                <div className="gp-branch-dd-loading">No branches found</div>
              )}
            </>
        }
      </div>
      <div className="gp-branch-dd-create">
        <input
          placeholder="New branch name…"
          value={newBranch}
          onChange={e => setNewBranch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
          className="gp-input"
        />
        <button type="button" className="gp-branch-dd-create-btn" onClick={handleCreate} disabled={!newBranch.trim()}>
          {opLoading === '__create__' ? <Spinner size={9}/> : '+'}
        </button>
      </div>
      {error && <div className="gp-error" style={{ padding: '4px 10px 6px' }}>{error}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  StashList
// ─────────────────────────────────────────────────────────────
function StashList({ cwd, onClose, onRefresh }: any) {
  const git = api?.git
  const [stashes, setStashes]       = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [popLoading, setPopLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    git?.stashList(cwd)
      .then((r: any) => setStashes(r?.stashes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [cwd])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onClose])

  const handlePop = async () => {
    setPopLoading(true)
    try { await git?.stashPop(cwd); onRefresh?.(); onClose() } catch {}
    setPopLoading(false)
  }

  return (
    <div ref={ref} className="gp-branch-dd gp-stash-dd">
      <div className="gp-stash-header">
        <span>Stash entries</span>
        {stashes.length > 0 && (
          <button type="button" className="gp-stash-pop-btn" onClick={handlePop} disabled={popLoading}>
            {popLoading ? <Spinner size={9}/> : 'pop latest'}
          </button>
        )}
      </div>
      <div className="gp-branch-dd-list">
        {loading && <div className="gp-branch-dd-loading"><Spinner /> loading…</div>}
        {!loading && stashes.length === 0 && <div className="gp-branch-dd-loading gp-muted">No stashes</div>}
        {stashes.map((s, i) => (
          <div key={i} className="gp-stash-item">
            <div className="gp-stash-ref">{s.ref}</div>
            <div className="gp-stash-msg">{s.message}</div>
            <div className="gp-stash-date">{s.date}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  GitPanelV2
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
  const git = api?.git
  const [status,        setStatus]        = useState<{ branch: string; files: any[]; error?: string } | null>(null)
  const [log,           setLog]           = useState<any[]>([])
  const [commitMsg,     setCommitMsg]     = useState('')
  const [aiLoading,     setAiLoading]     = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [refreshing,    setRefreshing]    = useState(false)
  const [commitLoading, setCommitLoading] = useState(false)
  const [pushLoading,   setPushLoading]   = useState(false)
  const [pullLoading,   setPullLoading]   = useState(false)
  const [fetchLoading,  setFetchLoading]  = useState(false)
  const [stashLoading,  setStashLoading]  = useState(false)
  const [initLoading,   setInitLoading]   = useState(false)
  const [aheadBehind,   setAheadBehind]   = useState<{ ahead: number; behind: number; noUpstream: boolean } | null>(null)
  const [notification,  setNotification]  = useState<{ ok: boolean; msg: string } | null>(null)
  const [commitError,   setCommitError]   = useState('')
  const [showBranch,    setShowBranch]    = useState(false)
  const [showStash,     setShowStash]     = useState(false)
  const [openSections,  setOpenSections]  = useState({ conflicts: true, staged: true, changes: true, commits: false, graph: false })

  const notify = (ok: boolean, msg: string) => {
    setNotification({ ok, msg })
    setTimeout(() => setNotification(null), 4000)
  }

  const loadStatus = useCallback(async () => {
    if (!git || !cwd) return
    try { setStatus(await git.status(cwd) as any) }
    catch { setStatus({ branch: '', files: [], error: 'git status failed' }) }
  }, [git, cwd])

  const loadLog = useCallback(async () => {
    if (!git || !cwd) return
    try { const l = await git.log(cwd) as any; setLog(Array.isArray(l) ? l.slice(0, 30) : []) }
    catch { setLog([]) }
  }, [git, cwd])

  const loadAheadBehind = useCallback(async () => {
    if (!(git as any)?.aheadBehind || !cwd) return
    try {
      const r = await (git as any).aheadBehind(cwd) as any
      if (r?.success !== false) setAheadBehind(r)
    } catch {}
  }, [git, cwd])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadStatus(), loadLog(), loadAheadBehind()])
    setRefreshing(false)
  }, [loadStatus, loadLog, loadAheadBehind])

  useFileWatcher({
    explorerRoot: cwd,
    onChanged: useCallback(() => { loadStatus(); loadLog() }, [loadStatus, loadLog])
  })

  useEffect(() => {
    if (!cwd) return
    setLoading(true)
    Promise.all([loadStatus(), loadLog(), loadAheadBehind()]).finally(() => setLoading(false))
    const onFocus = () => { loadStatus(); loadLog(); loadAheadBehind() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [cwd, loadStatus, loadLog, loadAheadBehind])

  const allFiles      = status?.files ?? []
  const conflictFiles = allFiles.filter(f => isConflict(f.state ?? ''))
  const stagedFiles   = allFiles.filter(f => {
    if (isConflict(f.state ?? '')) return false
    const s = f.state ?? ''
    return s.length >= 1 && s[0] !== ' ' && s[0] !== '?' && s[0] !== '!'
  })
  const changedFiles  = allFiles.filter(f => {
    if (isConflict(f.state ?? '')) return false
    const s = f.state ?? ''
    if (s === '??' || s === '!!') return true
    return s.length >= 2 && s[1] !== ' '
  }).filter(f => !stagedFiles.includes(f))

  const handleStageAll   = async () => {
    if (!git?.stage || !changedFiles.length) return
    await git.stage(cwd, changedFiles.map(f => f.path))
    loadStatus()
  }
  const handleUnstageAll = async () => {
    if (!git?.unstage || !stagedFiles.length) return
    await git.unstage(cwd, stagedFiles.map(f => f.path))
    loadStatus()
  }

  const handleAiCommit = async () => {
    const key = aiProvider === 'ollama' ? (aiKeys['ollama'] || 'http://localhost:11434') : (aiKeys[aiProvider] || '')
    if (aiProvider !== 'ollama' && !key) { onOpenAiSettings?.(); return }
    setAiLoading(true)
    try {
      const [diffRes, statusRes] = await Promise.all([
        git?.diff(cwd, '', false).catch(() => ({ diff: '' })),
        git?.status(cwd).catch(() => ({ files: [] })),
      ]) as any[]
      const diff   = (diffRes?.diff || '').slice(0, 6000)
      const files  = (statusRes?.files || []).map((f: any) => f.file || f.path || '').filter(Boolean).join(', ')
      const model  = aiModels[aiProvider] || AI_DEFAULT_MODELS[aiProvider] || ''
      const result = await api?.ai?.chat?.(
        [{ role: 'user', content: `Write a concise git commit message for these changes:\n\nChanged files: ${files}\n\nDiff:\n\`\`\`\n${diff}\n\`\`\`` }],
        key, model,
        'You are a git commit message writer. Output ONLY the commit message, no explanation, no quotes. Follow conventional commits (feat/fix/refactor/docs/chore/etc).',
        aiProvider,
      ) as any
      if (result?.success && result.content) setCommitMsg(result.content.trim())
    } catch {}
    setAiLoading(false)
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) { setCommitError('Enter a commit message'); return }
    setCommitError(''); setCommitLoading(true)
    try {
      const r = await git?.commit(cwd, commitMsg.trim()) as any
      if (r?.success) { setCommitMsg(''); await refresh() }
      else setCommitError(r?.error ?? 'Commit failed')
    } catch (e: any) { setCommitError(e?.message ?? 'Commit failed') }
    finally { setCommitLoading(false) }
  }

  const handleUndoCommit = async () => {
    if (!confirm('Undo last commit? Changes will remain as staged files.')) return
    setCommitLoading(true); setCommitError('')
    try {
      const r = await (git as any)?.resetSoft?.(cwd) as any
      if (r?.success) { await refresh(); notify(true, 'Last commit undone — changes restored to staged') }
      else setCommitError(r?.error ?? 'Reset failed')
    } catch (e: any) { setCommitError(e?.message ?? 'Reset failed') }
    finally { setCommitLoading(false) }
  }

  const handlePush = async () => {
    setPushLoading(true)
    try {
      const r = await git?.push(cwd) as any
      notify(r?.success ?? false, r?.output ?? r?.error ?? (r?.success ? 'Pushed successfully' : 'Push failed'))
      if (r?.success) { await refresh() }
    } catch (e: any) { notify(false, e?.message ?? 'Push failed') }
    finally { setPushLoading(false) }
  }

  const handlePull = async () => {
    setPullLoading(true)
    try {
      const r = await git?.pull(cwd) as any
      notify(r?.success ?? false, r?.output ?? r?.error ?? (r?.success ? 'Pulled successfully' : 'Pull failed'))
      if (r?.success) { await refresh() }
    } catch (e: any) { notify(false, e?.message ?? 'Pull failed') }
    finally { setPullLoading(false) }
  }

  const handleFetch = async () => {
    setFetchLoading(true)
    try {
      const r = await git?.fetch(cwd) as any
      notify(r?.success ?? false, r?.output || r?.error || (r?.success ? 'Fetched' : 'Fetch failed'))
      if (r?.success) { await loadAheadBehind() }
    } catch (e: any) { notify(false, e?.message ?? 'Fetch failed') }
    finally { setFetchLoading(false) }
  }

  const handleStash = async () => {
    setStashLoading(true)
    try {
      const r = await git?.stash(cwd) as any
      if (r?.success) { await loadStatus(); notify(true, 'Changes stashed') }
      else notify(false, r?.error ?? 'Stash failed')
    } catch {}
    setStashLoading(false)
  }

  const handleGitInit = async () => {
    setInitLoading(true)
    try { await git?.init(cwd); refresh() } catch {}
    setInitLoading(false)
  }

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections(s => ({ ...s, [key]: !s[key] }))

  if (loading) return (
    <div className="gp-root gp-center">
      <Spinner size={14}/>
      <span className="gp-loading-label">Loading git…</span>
    </div>
  )

  if (status?.error && status.files.length === 0) return (
    <div className="gp-root gp-center gp-no-repo">
      <div className="gp-no-repo-icon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity=".18">
          <circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>
          <line x1="6" y1="9" x2="6" y2="15"/><path d="M18 9a9 9 0 01-9 9"/>
        </svg>
      </div>
      <div className="gp-no-repo-label">
        Not a git repository
        <span className="gp-no-repo-path">{cwd}</span>
      </div>
      <button type="button" className="gp-init-btn" onClick={handleGitInit} disabled={initLoading}>
        {initLoading ? <><Spinner /> Initializing…</> : 'git init'}
      </button>
    </div>
  )

  const branch       = status?.branch ?? '—'
  const totalChanges = allFiles.length
  const hasConflicts = conflictFiles.length > 0

  return (
    <div className="gp-root">
      {/* ── Toolbar ── */}
      <div className="gp-toolbar">
        <HeaderBtn title="Refresh" onClick={refresh} loading={refreshing}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="10.5 2 10.5 5.5 7 5.5"/>
            <path d="M10.5 5.5A5 5 0 1 1 8.2 2"/>
          </svg>
        </HeaderBtn>
        <div className="gp-toolbar-sep"/>
        <div className="gp-toolbar-group">
          <HeaderBtn title="Push to remote" onClick={handlePush} loading={pushLoading}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="9" x2="6" y2="2"/><polyline points="3 5 6 2 9 5"/>
              <line x1="3" y1="10.5" x2="9" y2="10.5"/>
            </svg>
          </HeaderBtn>
          <HeaderBtn title="Pull from remote" onClick={handlePull} loading={pullLoading}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="2" x2="6" y2="9"/><polyline points="3 6 6 9 9 6"/>
              <line x1="3" y1="10.5" x2="9" y2="10.5"/>
            </svg>
          </HeaderBtn>
          <HeaderBtn title="Fetch from remote" onClick={handleFetch} loading={fetchLoading}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="10.5 7 10.5 10.5 1.5 10.5 1.5 7"/>
              <line x1="6" y1="1.5" x2="6" y2="8.5"/>
              <polyline points="3.5 6 6 8.5 8.5 6"/>
            </svg>
          </HeaderBtn>
        </div>
        <div className="gp-toolbar-sep"/>
        <div className="gp-toolbar-group">
          <HeaderBtn title="Stash changes" onClick={handleStash} loading={stashLoading}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="8" height="6" rx="1"/>
              <path d="M4 5V3.5a2 2 0 0 1 4 0V5"/>
            </svg>
          </HeaderBtn>
          <HeaderBtn title="View stash list" onClick={() => setShowStash(v => !v)} active={showStash}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="3" x2="10" y2="3"/>
              <line x1="2" y1="6" x2="10" y2="6"/>
              <line x1="2" y1="9" x2="7" y2="9"/>
            </svg>
          </HeaderBtn>
        </div>
        <div className="gp-toolbar-sep"/>
        <HeaderBtn title="Undo last commit (soft reset)" onClick={handleUndoCommit} loading={commitLoading}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1.5 3.5 1.5 6.5 4.5 6.5"/>
            <path d="M1.5 6.5A5 5 0 1 0 3.5 3"/>
          </svg>
        </HeaderBtn>
        <div style={{ flex: 1 }}/>
        {totalChanges > 0 && (
          <span className={`gp-change-count${hasConflicts ? ' conflict' : ''}`} title={`${totalChanges} file${totalChanges !== 1 ? 's' : ''} changed`}>
            {hasConflicts && '! '}{totalChanges}
          </span>
        )}
        {showStash && <StashList cwd={cwd} onClose={() => setShowStash(false)} onRefresh={loadStatus} />}
      </div>

      {/* ── Notification ── */}
      {notification && (
        <div className={`gp-result ${notification.ok ? 'ok' : 'err'}`}>
          {notification.msg || (notification.ok ? 'Success' : 'Failed')}
        </div>
      )}

      {/* ── Branch row ── */}
      <div className="gp-branch-row">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="gp-branch-icon">
          <line x1="6" y1="3" x2="6" y2="15"/>
          <circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>
          <path d="M18 9a9 9 0 01-9 9"/>
        </svg>
        <button className="gp-branch-btn" type="button" onClick={() => setShowBranch(v => !v)}>
          <span className="gp-branch-name">{branch}</span>
          <span className="gp-branch-caret">▾</span>
        </button>
        {aheadBehind && !aheadBehind.noUpstream && (aheadBehind.ahead > 0 || aheadBehind.behind > 0) && (
          <div className="gp-sync-badges">
            {aheadBehind.ahead > 0 && (
              <span className="gp-sync-up" title={`${aheadBehind.ahead} commit${aheadBehind.ahead !== 1 ? 's' : ''} ahead of remote`}>
                ↑{aheadBehind.ahead}
              </span>
            )}
            {aheadBehind.behind > 0 && (
              <span className="gp-sync-dn" title={`${aheadBehind.behind} commit${aheadBehind.behind !== 1 ? 's' : ''} behind remote`}>
                ↓{aheadBehind.behind}
              </span>
            )}
          </div>
        )}
        {showBranch && <BranchDropdown cwd={cwd} currentBranch={branch} onClose={() => { setShowBranch(false); refresh() }} />}
      </div>

      {/* ── Scrollable body ── */}
      <div className="gp-body">

        {/* ── Commit area ── */}
        <div className="gp-commit-area">
          <div className="gp-commit-hdr">
            <span className="gp-commit-hdr-label">Commit</span>
            <button className="gp-ai-btn" type="button" onClick={handleAiCommit} disabled={aiLoading}
              title="Generate commit message with AI">
              {aiLoading ? <Spinner size={9}/> : '✦ AI'}
            </button>
          </div>
          <textarea
            className="gp-textarea"
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleCommit() } }}
            placeholder="Commit message (Ctrl+Enter)…"
            rows={3}
          />
          {commitError && <div className="gp-error">{commitError}</div>}
          <button
            className={`gp-commit-btn${commitMsg.trim() ? ' ready' : ''}`}
            type="button"
            onClick={handleCommit}
            disabled={commitLoading || !commitMsg.trim()}
          >
            {commitLoading
              ? <><Spinner /> Committing…</>
              : <>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1.5 6 4 8.5 9.5 3"/>
                  </svg>
                  Commit
                </>
            }
          </button>
        </div>

        {/* ── CONFLICTS ── */}
        {conflictFiles.length > 0 && (
          <Section
            title="Merge Conflicts"
            count={conflictFiles.length}
            open={openSections.conflicts}
            onToggle={() => toggleSection('conflicts')}
            accent="#ff5566"
          >
            {conflictFiles.map(file => (
              <ConflictRow key={file.path} file={file} cwd={cwd} onOpenFile={onOpenFile} onRefresh={loadStatus} />
            ))}
          </Section>
        )}

        {/* ── STAGED ── */}
        <Section
          title="Staged"
          count={stagedFiles.length}
          open={openSections.staged}
          onToggle={() => toggleSection('staged')}
          actionLabel="−all"
          onAction={stagedFiles.length > 0 ? handleUnstageAll : undefined}
          accent="#10b981"
        >
          {stagedFiles.length === 0
            ? <div className="gp-empty-section">Nothing staged</div>
            : stagedFiles.map(file => (
                <FileRow key={file.path + '-s'} file={file} cwd={cwd} isStaged onOpenFile={onOpenFile} onRefresh={loadStatus} />
              ))
          }
        </Section>

        {/* ── CHANGES ── */}
        <Section
          title="Changes"
          count={changedFiles.length}
          open={openSections.changes}
          onToggle={() => toggleSection('changes')}
          actionLabel="+all"
          onAction={changedFiles.length > 0 ? handleStageAll : undefined}
          accent="#e2c08d"
        >
          {changedFiles.length === 0
            ? <div className="gp-empty-section">No unstaged changes</div>
            : changedFiles.map(file => (
                <FileRow key={file.path} file={file} cwd={cwd} isStaged={false} onOpenFile={onOpenFile} onRefresh={loadStatus} />
              ))
          }
        </Section>

        {/* ── Clean working tree ── */}
        {stagedFiles.length === 0 && changedFiles.length === 0 && conflictFiles.length === 0 && (
          <div className="gp-clean">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="gp-clean-icon">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Working tree clean</span>
          </div>
        )}

        {/* ── COMMITS ── */}
        {log.length > 0 && (
          <Section
            title="Recent Commits"
            count={log.length}
            open={openSections.commits}
            onToggle={() => toggleSection('commits')}
          >
            {log.slice(0, 20).map(entry => (
              <CommitRow key={entry.hash} entry={entry} />
            ))}
          </Section>
        )}

        {/* ── GRAPH ── */}
        {cwd && (
          <Section
            title="Graph"
            count={0}
            open={openSections.graph}
            onToggle={() => toggleSection('graph')}
          >
            <CommitGraph cwd={cwd} />
          </Section>
        )}

        <div style={{ flex: 1 }}/>
      </div>
    </div>
  )
}

export default memo(GitPanelV2)
