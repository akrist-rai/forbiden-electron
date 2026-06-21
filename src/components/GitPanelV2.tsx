// @ts-nocheck
import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { api } from '../lib/api'
import { useFileWatcher } from '../hooks'

const STATUS_COLOR: Record<string, string> = {
  M: '#e2c08d', A: '#73c991', D: '#f14c4c',
  R: '#73c991', C: '#73c991', U: '#73c991', '?': '#73c991', '!': '#4a4a5a',
}

const STATUS_LABEL: Record<string, string> = {
  M: 'M', A: 'A', D: 'D', R: 'R', C: 'C', U: 'U', '?': 'U', '!': '!',
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
  if (!diff) return (
    <div className="gp-diff-empty">No diff available.</div>
  )
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
            <span className="gp-diff-ln">{i + 1}</span>
            <pre className="gp-diff-code">{line}</pre>
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
      type="button"
      title={title}
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
      type="button"
      title={title} onClick={onClick} disabled={loading}
      className={`gp-header-btn${active ? ' active' : ''}`}
    >
      {loading ? <Spinner /> : children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
//  FileRow
// ─────────────────────────────────────────────────────────────
function FileRow({ file, cwd, isStaged, onOpenFile }: any) {
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
  const name       = file.path?.split('/').pop() ?? file.path
  const dirPart    = file.path?.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : ''

  const handleToggleDiff = async () => {
    if (showDiff) { setShowDiff(false); return }
    setShowDiff(true)
    if (diff !== null) return
    setDiffLoading(true)
    try {
      const r = await git?.diff(cwd, file.path, isStaged)
      setDiff(typeof r === 'string' ? r : (r?.diff ?? ''))
    } catch { setDiff('') }
    finally { setDiffLoading(false) }
  }

  const handleStage   = async () => { setOpLoading(true); try { await git?.stage(cwd, [file.path]) } catch {} setOpLoading(false) }
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
        className={`gp-file-row${hovered ? ' hov' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span className="gp-file-status" style={{ color }}>
          {opLoading ? <Spinner size={10}/> : (STATUS_LABEL[statusChar] ?? statusChar)}
        </span>
        <span className="gp-file-name" onClick={() => onOpenFile?.(file.path)} title={file.path}>
          {name}
          {dirPart && <span className="gp-file-dir">{dirPart.replace(/\/$/, '')}</span>}
        </span>
        <div className="gp-file-actions">
          {!isStaged && (
            <ActionBtn title="Stage" onClick={handleStage}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="5" y1="1" x2="5" y2="9"/><line x1="1" y1="5" x2="9" y2="5"/>
              </svg>
            </ActionBtn>
          )}
          {isStaged && (
            <ActionBtn title="Unstage" onClick={handleUnstage}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="1" y1="5" x2="9" y2="5"/>
              </svg>
            </ActionBtn>
          )}
          <ActionBtn title="Discard" onClick={handleDiscard} danger>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 3 1 7 5 7"/>
              <path d="M1 7a5 5 0 1 1 1.4 3.5"/>
            </svg>
          </ActionBtn>
          <ActionBtn title="Diff" onClick={handleToggleDiff} active={showDiff}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="3" x2="8" y2="3"/>
              <line x1="2" y1="5" x2="6" y2="5"/>
              <line x1="2" y1="7" x2="8" y2="7"/>
            </svg>
          </ActionBtn>
        </div>
      </div>
      {showDiff && (
        diffLoading
          ? <div className="gp-diff-loading"><Spinner /> loading…</div>
          : <DiffView diff={diff ?? ''} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Section
// ─────────────────────────────────────────────────────────────
function Section({ title, count, open, onToggle, actionLabel, onAction, children }: any) {
  return (
    <div className="gp-section">
      <div className="gp-section-hdr" onClick={onToggle}>
        <span className="gp-section-caret">{open ? '▼' : '▶'}</span>
        <span className="gp-section-title">{title}</span>
        {count > 0 && <span className="gp-section-count">{count}</span>}
        {onAction && count > 0 && (
          <button
            className="gp-section-action"
            title={actionLabel === '+all' ? 'Stage all' : 'Unstage all'}
            onClick={e => { e.stopPropagation(); onAction() }}
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
  '#28f1c3','#5ccfe6','#e5c07b','#c792ea','#ff1650',
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

  if (loading) return <div className="gp-graph-loading"><Spinner /> <span>LOADING</span></div>
  if (!commits.length) return <div className="gp-graph-empty">NO COMMITS</div>

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
                      if (cx === pcx) return <line key={pl.hash} x1={cx} y1={cy} x2={pcx} y2={pcy} stroke={pColor} strokeWidth={1.5} opacity={0.55} />
                      const mid = (cy + pcy) / 2
                      return <path key={pl.hash} d={`M ${cx} ${cy} C ${cx} ${mid+6}, ${pcx} ${mid-6}, ${pcx} ${pcy}`} stroke={pColor} strokeWidth={1.5} fill="none" opacity={0.55} />
                    })}
                    <circle cx={cx} cy={cy} r={selected === commit.hash ? 5 : 3.5} fill={color}
                      stroke={selected === commit.hash ? '#fff' : 'none'} strokeWidth={1.5}
                      className="gp-graph-dot"
                      onClick={() => setSelected(s => s === commit.hash ? null : commit.hash)} />
                    {commit.refs.length > 0 && <circle cx={cx} cy={cy} r={7} fill="none" stroke={color} strokeWidth={1} opacity={0.4} />}
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="gp-graph-labels">
            {commits.map((commit) => {
              const isSel      = selected === commit.hash
              const branchRef  = commit.refs.find((r: string) => !r.includes('HEAD') && !r.includes('tag:'))
              const color      = LANE_COLORS[commit.lane % LANE_COLORS.length]
              return (
                <div key={commit.hash}
                  className={`gp-graph-row${isSel ? ' sel' : ''}`}
                  style={isSel ? { borderLeft: `2px solid ${color}`, paddingLeft: 6 } : undefined}
                  onClick={() => setSelected(s => s === commit.hash ? null : commit.hash)}
                >
                  <span className="gp-graph-hash">{commit.hash.slice(0, 7)}</span>
                  {branchRef && <span className="gp-graph-ref">{branchRef.replace('HEAD -> ', '')}</span>}
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
    if (branch === currentBranch) return
    setOpLoading(branch); setError('')
    try {
      const r = await git?.checkout(cwd, branch)
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
      const r = await git?.createBranch(cwd, name)
      if (!r?.success) setError(r?.error ?? 'Create failed')
      else onClose()
    } catch (e: any) { setError(e?.message ?? 'Create failed') }
    finally { setOpLoading(null) }
  }

  const visible = branches.filter(b => !filter || b.toLowerCase().includes(filter.toLowerCase()))

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
          : visible.map(branch => {
              const isCurrent = branch === currentBranch
              return (
                <div key={branch}
                  className={`gp-branch-dd-item${isCurrent ? ' current' : ''}`}
                  onClick={() => handleCheckout(branch)}
                >
                  {isCurrent && <span className="gp-branch-dd-check">✓</span>}
                  <span className="gp-branch-dd-name">
                    {opLoading === branch ? <Spinner size={10}/> : branch}
                  </span>
                </div>
              )
            })
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
      {error && <div className="gp-error">{error}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  StashList
// ─────────────────────────────────────────────────────────────
function StashList({ cwd, onClose }: any) {
  const git = api?.git
  const [stashes, setStashes]     = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
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

  return (
    <div ref={ref} className="gp-branch-dd gp-stash-dd">
      <div className="gp-stash-header">STASH ENTRIES</div>
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
  const [stashLoading,  setStashLoading]  = useState(false)
  const [pushResult,    setPushResult]    = useState<{ ok?: boolean; msg?: string } | null>(null)
  const [pullResult,    setPullResult]    = useState<{ ok?: boolean; msg?: string } | null>(null)
  const [commitError,   setCommitError]   = useState('')
  const [showBranch,    setShowBranch]    = useState(false)
  const [showStash,     setShowStash]     = useState(false)
  const [initLoading,   setInitLoading]   = useState(false)
  const [openSections,  setOpenSections]  = useState({ staged: true, changes: true, commits: false, graph: false })

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

  useFileWatcher({
    explorerRoot: cwd,
    onChanged: useCallback(() => { loadStatus(); loadLog() }, [loadStatus, loadLog])
  })

  useEffect(() => {
    if (!cwd) return
    setLoading(true)
    Promise.all([loadStatus(), loadLog()]).finally(() => setLoading(false))
    const onFocus = () => { loadStatus(); loadLog() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [cwd, loadStatus, loadLog])

  const allFiles     = status?.files ?? []
  const stagedFiles  = allFiles.filter(f => {
    const s = f.state ?? ''
    return s.length >= 1 && s[0] !== ' ' && s[0] !== '?' && s[0] !== '!'
  })
  const changedFiles = allFiles.filter(f => {
    const s = f.state ?? ''
    if (s === '??' || s === '!!') return true
    return s.length >= 2 && s[1] !== ' '
  }).filter(f => !stagedFiles.includes(f))

  const handleStageAll   = async () => { if (!git?.stage)   return; await git.stage(cwd,   changedFiles.map(f => f.path)); loadStatus() }
  const handleUnstageAll = async () => { if (!git?.unstage) return; await git.unstage(cwd, stagedFiles.map(f => f.path));  loadStatus() }

  const handleAiCommit = async () => {
    const key = aiProvider === 'ollama' ? (aiKeys['ollama'] || 'http://localhost:11434') : (aiKeys[aiProvider] || '')
    if (aiProvider !== 'ollama' && !key) { onOpenAiSettings?.(); return }
    setAiLoading(true)
    try {
      const [diffRes, statusRes] = await Promise.all([
        git?.diff(cwd, '', false).catch(() => ({ diff: '' })),
        git?.status(cwd).catch(() => ({ files: [] })),
      ])
      const diff   = (diffRes?.diff || '').slice(0, 6000)
      const files  = (statusRes?.files || []).map((f: any) => f.file || f.path || '').filter(Boolean).join(', ')
      const model  = aiModels[aiProvider] || AI_DEFAULT_MODELS[aiProvider] || ''
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

  if (loading) return (
    <div className="gp-root gp-center">
      <Spinner size={14}/>
      <span className="gp-loading-label">LOADING</span>
    </div>
  )

  if (status?.error && status.files.length === 0) return (
    <div className="gp-root gp-center gp-no-repo">
      <div className="gp-no-repo-icon">◈</div>
      <div className="gp-no-repo-label">NOT A GIT REPO<br/><span className="gp-no-repo-path">{cwd}</span></div>
      <button type="button" className="gp-init-btn" onClick={handleGitInit} disabled={initLoading}>
        {initLoading ? <Spinner /> : 'git init'}
      </button>
    </div>
  )

  const branch       = status?.branch ?? '—'
  const totalChanges = allFiles.length

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
        <HeaderBtn title="Push" onClick={handlePush} loading={pushLoading}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="9" x2="6" y2="2"/><polyline points="3 5 6 2 9 5"/>
            <line x1="3" y1="10.5" x2="9" y2="10.5"/>
          </svg>
        </HeaderBtn>
        <HeaderBtn title="Pull" onClick={handlePull} loading={pullLoading}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="2" x2="6" y2="9"/><polyline points="3 6 6 9 9 6"/>
            <line x1="3" y1="10.5" x2="9" y2="10.5"/>
          </svg>
        </HeaderBtn>
        <div className="gp-toolbar-sep"/>
        <HeaderBtn title="Stash" onClick={handleStash} loading={stashLoading}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="8" height="6" rx="1"/>
            <path d="M4 5V3.5a2 2 0 0 1 4 0V5"/>
          </svg>
        </HeaderBtn>
        <HeaderBtn title="Pop stash" onClick={handleStashPop}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="8" height="6" rx="1"/>
            <line x1="6" y1="3" x2="6" y2="1"/><polyline points="4 2.5 6 1 8 2.5"/>
          </svg>
        </HeaderBtn>
        <HeaderBtn title="Stash list" onClick={() => setShowStash(v => !v)} active={showStash}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="2" y1="3" x2="10" y2="3"/>
            <line x1="2" y1="6" x2="10" y2="6"/>
            <line x1="2" y1="9" x2="7" y2="9"/>
          </svg>
        </HeaderBtn>
        <div style={{ flex: 1 }}/>
        {totalChanges > 0 && <span className="gp-change-count">{totalChanges}</span>}
        {showStash && <StashList cwd={cwd} onClose={() => setShowStash(false)} />}
      </div>

      {/* ── Push/pull result ── */}
      {(pushResult || pullResult) && (
        <div className={`gp-result ${(pushResult?.ok ?? pullResult?.ok) ? 'ok' : 'err'}`}>
          {pushResult?.msg || pullResult?.msg || ((pushResult?.ok ?? pullResult?.ok) ? 'Success' : 'Failed')}
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
        {showBranch && <BranchDropdown cwd={cwd} currentBranch={branch} onClose={() => { setShowBranch(false); refresh() }} />}
      </div>

      {/* ── Scrollable body ── */}
      <div className="gp-body">

        {/* ── Commit area ── */}
        <div className="gp-commit-area">
          <div className="gp-commit-hdr">
            <span className="gp-commit-hdr-label">Message</span>
            <button className="gp-ai-btn" type="button" onClick={handleAiCommit} disabled={aiLoading}
              title="Generate commit message with AI">
              {aiLoading ? '…' : '✦ AI'}
            </button>
          </div>
          <textarea
            className="gp-textarea"
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleCommit() } }}
            placeholder="Message (Ctrl+Enter to commit)…"
            rows={3}
          />
          {commitError && <div className="gp-error">{commitError}</div>}
          <button
            className={`gp-commit-btn${commitMsg.trim() ? ' ready' : ''}`}
            type="button"
            onClick={handleCommit}
            disabled={commitLoading || !commitMsg.trim()}
          >
            {commitLoading ? <><Spinner /> COMMITTING…</> : '✓ COMMIT'}
          </button>
        </div>

        {/* ── STAGED ── */}
        <Section
          title="Staged"
          count={stagedFiles.length}
          open={openSections.staged}
          onToggle={() => toggleSection('staged')}
          actionLabel="−all"
          onAction={stagedFiles.length > 0 ? handleUnstageAll : undefined}
        >
          {stagedFiles.length === 0
            ? <div className="gp-empty-section">No staged files</div>
            : stagedFiles.map(file => (
                <FileRow key={file.path + '-s'} file={file} cwd={cwd} isStaged onOpenFile={onOpenFile} />
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
        >
          {changedFiles.length === 0
            ? <div className="gp-empty-section">No unstaged changes</div>
            : changedFiles.map(file => (
                <FileRow key={file.path} file={file} cwd={cwd} isStaged={false} onOpenFile={onOpenFile} />
              ))
          }
        </Section>

        {/* ── Clean working tree ── */}
        {stagedFiles.length === 0 && changedFiles.length === 0 && (
          <div className="gp-clean">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="gp-clean-icon">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>CLEAN</span>
          </div>
        )}

        {/* ── COMMITS ── */}
        {log.length > 0 && (
          <Section
            title="Commits"
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
