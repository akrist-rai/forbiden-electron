// @ts-nocheck
import { useState, useRef, useEffect, useCallback } from 'react'

// ── File-type icon colors ──────────────────────────────────
const EXT_COLOR: Record<string, string> = {
  js: '#f2c12e', jsx: '#f2c12e', mjs: '#f2c12e', cjs: '#f2c12e',
  ts: '#4285f4', tsx: '#4285f4',
  py: '#28f1c3',
  go: '#89ddff',
  c: '#ff8080', h: '#ff8080',
  cpp: '#ff9966', hpp: '#ff9966', cc: '#ff9966',
  rs: '#e36209',
  rb: '#ff435a',
  java: '#ffc410', kt: '#bb9af7',
  cs: '#4ec9b0',
  json: '#c792ea', yaml: '#c792ea', yml: '#c792ea', toml: '#c792ea',
  md: '#72f1b8', mdx: '#72f1b8',
  html: '#ff6b6b', css: '#4285f4', scss: '#ff69b4',
  vue: '#10b981', svelte: '#ff3e00',
  sh: '#10b981', bash: '#10b981', zsh: '#10b981', fish: '#10b981',
  txt: '#888', env: '#ffc410', gitignore: '#607080',
  png: '#c792ea', jpg: '#c792ea', jpeg: '#c792ea', gif: '#c792ea', svg: '#4285f4',
}

function fileIcon(name: string, type: 'file' | 'dir', isOpen?: boolean) {
  if (type === 'dir') return isOpen ? '▾' : '▸'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const color = EXT_COLOR[ext] ?? '#8888aa'
  return <span style={{ color, fontSize: '10px', fontWeight: 700, letterSpacing: '.02em', fontFamily: "'JetBrains Mono',monospace" }}>
    {ext ? ext.slice(0, 2).toUpperCase() : '··'}
  </span>
}

// ── Toolbar SVG icons ──────────────────────────────────────
function SvgNewFile() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="13" x2="12" y2="19"/>
      <line x1="9" y1="16" x2="15" y2="16"/>
    </svg>
  )
}
function SvgNewFolder() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      <line x1="12" y1="11" x2="12" y2="17"/>
      <line x1="9" y1="14" x2="15" y2="14"/>
    </svg>
  )
}
function SvgGraph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  )
}
function SvgRefresh() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
}
function SvgOpenFolder() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

// ── Toolbar button with hover feedback ────────────────────
function ToolbarBtn({ title, onClick, color = '#5a5a7a', hoverColor = '#c0c8d8', children }: any) {
  const [hov, setHov] = useState(false)
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'rgba(255,255,255,.07)' : 'transparent',
        border: 'none',
        color: hov ? hoverColor : color,
        cursor: 'pointer',
        padding: 0,
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color .12s, background .12s',
        outline: 'none',
        width: 22,
        height: 22,
        flexShrink: 0,
      }}
      type="button"
    >
      {children}
    </button>
  )
}

// ── Context menu ───────────────────────────────────────────
function CtxMenu({ x, y, item, onClose, onAction }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = () => onClose()
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [onClose])

  const sep: any = { height: 1, background: 'rgba(255,255,255,.06)', margin: '3px 0' }
  const btnStyle: any = {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '6px 12px', cursor: 'pointer', fontSize: '11px',
    fontFamily: "'JetBrains Mono',monospace", whiteSpace: 'nowrap',
    color: '#c0c8d8', transition: 'background .1s',
  }
  const Item = ({ label, icon, action, danger = false }) => (
    <div style={{ ...btnStyle, color: danger ? '#ff435a' : '#c0c8d8' }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? 'rgba(255,67,90,.12)' : 'rgba(255,255,255,.06)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onPointerDown={e => { e.stopPropagation(); onAction(action); onClose() }}>
      <span style={{ opacity: .5, width: 14, textAlign: 'center' }}>{icon}</span>
      {label}
    </div>
  )

  return (
    <div ref={ref} style={{
      position: 'fixed', left: x, top: y, zIndex: 99999,
      background: '#0d0d18', border: '1px solid rgba(255,255,255,.12)',
      borderRadius: 4, padding: '3px 0', minWidth: 180,
      boxShadow: '0 12px 40px rgba(0,0,0,.9)',
    }} onPointerDown={e => e.stopPropagation()}>
      {item.type === 'dir' && <>
        <Item label="New File"   icon="+" action="new-file"/>
        <Item label="New Folder" icon="⊕" action="new-folder"/>
        <div style={sep}/>
        <Item label="Copy Folder"     icon="⎘" action="copy"/>
        <Item label="Paste into Here" icon="⎗" action="paste"/>
        <div style={sep}/>
        <Item label="Open in Terminal" icon=">" action="open-terminal"/>
        <Item label="Reveal in Files"  icon="⬡" action="reveal"/>
        <div style={sep}/>
        <Item label="Rename" icon="✎" action="rename"/>
        <Item label="Delete" icon="✕" action="delete" danger/>
      </>}
      {item.type === 'file' && <>
        <Item label="Open"            icon="↗" action="open"/>
        <Item label="Open to Graph"   icon="◈" action="open-graph"/>
        <div style={sep}/>
        <Item label="Copy File"       icon="⎘" action="copy"/>
        <Item label="Paste"           icon="⎗" action="paste"/>
        <div style={sep}/>
        <Item label="Copy Path"       icon="⌥" action="copy-path"/>
        <Item label="Reveal in Files" icon="⬡" action="reveal"/>
        <div style={sep}/>
        <Item label="Rename" icon="✎" action="rename"/>
        <Item label="Delete" icon="✕" action="delete" danger/>
      </>}
    </div>
  )
}

// ── Rename input overlay ───────────────────────────────────
function RenameInput({ item, onCommit, onCancel }) {
  const [val, setVal] = useState(item.name)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.select() }, [])
  return (
    <input ref={ref} value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onCommit(val); if (e.key === 'Escape') onCancel() }}
      onBlur={() => onCommit(val)}
      style={{
        flex: 1, background: '#1a1a2e', border: '1px solid #10b981',
        color: '#c0c8d8', fontFamily: "'JetBrains Mono',monospace",
        fontSize: '11px', padding: '1px 4px', outline: 'none', borderRadius: 2,
      }}
    />
  )
}

// ── Tree node ─────────────────────────────────────────────
function TreeNode({ node, depth, openPaths, onToggle, onSelect, selectedPath, onCtxMenu, renamingPath, onRenameCommit, onRenameCancel, newItemState, newItemName, newItemRef, onNewItemChange, onNewItemCommit, onNewItemCancel }) {
  const isOpen = openPaths.has(node.path)
  const isSelected = selectedPath === node.path
  const isRenaming = renamingPath === node.path
  const isDir = node.type === 'dir'
  const extColor = EXT_COLOR[node.ext ?? ''] ?? '#8888aa'

  const indent = depth * 14 + 6

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: `3px 8px 3px ${indent}px`,
          cursor: 'pointer', userSelect: 'none',
          background: isSelected ? 'rgba(16,185,129,.1)' : 'transparent',
          borderLeft: isSelected ? '2px solid #10b981' : '2px solid transparent',
          transition: 'background .1s',
          minHeight: 24,
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
        onPointerDown={e => {
          if (isDir) onToggle(node.path)
          else onSelect(node)
        }}
        onContextMenu={e => { e.preventDefault(); onCtxMenu(e, node) }}
      >
        {/* Animated chevron for dirs; dot for files */}
        <span style={{ width: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isDir ? (
            <svg width="7" height="7" viewBox="0 0 7 7" fill="currentColor"
              style={{ color: isOpen ? '#10b981' : '#4a5568', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease, color .15s' }}>
              <path d="M1.5 1l4 2.5-4 2.5z"/>
            </svg>
          ) : (
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#2e3554', display: 'inline-block' }}/>
          )}
        </span>

        {/* Icon */}
        <span style={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isDir ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"
              style={{ stroke: isOpen ? '#89b4fa' : '#4a5a8a', strokeWidth: 1.5, transition: 'stroke .15s' }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                fill={isOpen ? 'rgba(137,180,250,0.08)' : 'none'}/>
            </svg>
          ) : (
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: '7px', fontWeight: 700,
              letterSpacing: '-.01em', padding: '1px 2px', borderRadius: 2,
              background: `${extColor}18`, color: extColor,
              minWidth: 18, textAlign: 'center', lineHeight: '14px', display: 'inline-block',
            }}>
              {(node.ext ?? '').slice(0, 3).toUpperCase() || '···'}
            </span>
          )}
        </span>

        {/* Name */}
        {isRenaming ? (
          <RenameInput item={node} onCommit={onRenameCommit} onCancel={onRenameCancel}/>
        ) : (
          <span style={{
            flex: 1, fontSize: '11.5px', fontFamily: "'JetBrains Mono',monospace",
            color: isSelected ? '#e8ecf8' : isDir ? (isOpen ? '#c8d0e8' : '#7a85a0') : '#a8b0c8',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            letterSpacing: '-.01em', transition: 'color .1s',
          }}>
            {node.name}
          </span>
        )}
      </div>

      {/* Children + new-item input — works at any nesting depth */}
      {node.type === 'dir' && isOpen && (
        <div>
          {newItemState?.parentPath === node.path && (
            <NewItemInput ref={newItemRef} type={newItemState.type} value={newItemName}
              onChange={onNewItemChange} onCommit={onNewItemCommit} onCancel={onNewItemCancel}
              depth={depth + 1}/>
          )}
          {node.children?.map(child => (
            <TreeNode key={child.path} node={child} depth={depth + 1}
              openPaths={openPaths} onToggle={onToggle} onSelect={onSelect}
              selectedPath={selectedPath} onCtxMenu={onCtxMenu}
              renamingPath={renamingPath} onRenameCommit={onRenameCommit} onRenameCancel={onRenameCancel}
              newItemState={newItemState} newItemName={newItemName} newItemRef={newItemRef}
              onNewItemChange={onNewItemChange} onNewItemCommit={onNewItemCommit} onNewItemCancel={onNewItemCancel}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main FileExplorer ──────────────────────────────────────
interface Props {
  rootPath: string | null
  brutal: boolean
  onOpenFile: (node: any) => void
  onOpenFolder: () => void
  onScanImports: (rootPath: string) => void
  onTerminalCd: (cwd: string) => void
  refreshKey?: number
}

export default function FileExplorer({ rootPath, brutal, onOpenFile, onOpenFolder, onScanImports, onTerminalCd, refreshKey }: Props) {
  const [tree,         setTree]         = useState<any>(null)
  const [openPaths,    setOpenPaths]    = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [ctxMenu,      setCtxMenu]      = useState<{ x: number; y: number; item: any } | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [clipboard,    setClipboard]    = useState<{ action: 'copy'; item: any } | null>(null)
  const [toast,        setToast]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [newItemState, setNewItemState] = useState<{ parentPath: string; type: 'file' | 'dir' } | null>(null)
  const [newItemName,  setNewItemName]  = useState('')
  const newItemRef = useRef<HTMLInputElement>(null)

  const api = (window as any).electronAPI?.fs

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }, [])

  const reload = useCallback(async (rp?: string) => {
    const p = rp ?? rootPath
    if (!p || !api) return
    setLoading(true)
    try {
      const res = await api.readTree(p)
      if (res.success) setTree(res.tree)
    } finally { setLoading(false) }
  }, [rootPath, api])

  useEffect(() => { if (rootPath) reload(rootPath) }, [rootPath])
  useEffect(() => { if (rootPath && refreshKey) reload(rootPath) }, [refreshKey])

  // Auto-reload when files change (Go watcher pushes events every ~1.5s)
  useEffect(() => {
    if (!rootPath) return
    const watchUrl = (window as any).electronAPI?.watch?.wsUrl?.(rootPath)
    if (!watchUrl) return
    let ws: WebSocket | null = new WebSocket(watchUrl)
    ws.onmessage = () => reload(rootPath)
    ws.onclose   = () => { ws = null }
    ws.onerror   = () => { try { ws?.close() } catch {} ws = null }
    return () => { try { ws?.close() } catch {} }
  }, [rootPath, reload])

  useEffect(() => { if (newItemState) setTimeout(() => newItemRef.current?.focus(), 50) }, [newItemState])

  const toggle = (p: string) => setOpenPaths(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })

  const handleSelect = (node: any) => {
    setSelectedPath(node.path)
    if (node.type === 'file') onOpenFile(node)
  }

  const handleCtxMenu = (e: MouseEvent, item: any) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, item })
    setSelectedPath(item.path)
  }

  const handleCtxAction = async (action: string) => {
    const item = ctxMenu?.item
    if (!item || !api) return

    if (action === 'open') { onOpenFile(item); return }
    if (action === 'open-graph') { onScanImports(item.type === 'dir' ? item.path : rootPath!); return }
    if (action === 'open-terminal') { onTerminalCd(item.type === 'dir' ? item.path : item.path.substring(0, item.path.lastIndexOf('/'))); return }
    if (action === 'reveal') { api.showInFolder(item.path); return }

    if (action === 'copy') {
      setClipboard({ action: 'copy', item })
      showToast(`Copied: ${item.name}`)
      return
    }

    if (action === 'paste' && clipboard) {
      const dest = item.type === 'dir'
        ? `${item.path}/${clipboard.item.name}`
        : `${item.path.substring(0, item.path.lastIndexOf('/'))}/${clipboard.item.name}`
      const isDir = clipboard.item.type === 'dir'
      const result = isDir
        ? await api.copyFolder(clipboard.item.path, dest)
        : await api.copyFile(clipboard.item.path, dest)
      if (result.success) { showToast('Pasted'); reload() }
      else showToast(`Error: ${result.error}`)
      return
    }

    if (action === 'copy-path') {
      navigator.clipboard.writeText(item.path).catch(() => {})
      showToast('Path copied')
      return
    }

    if (action === 'new-file') {
      setNewItemState({ parentPath: item.type === 'dir' ? item.path : item.path.substring(0, item.path.lastIndexOf('/')), type: 'file' })
      setNewItemName('')
      setOpenPaths(s => { const n = new Set(s); n.add(item.path); return n })
      return
    }

    if (action === 'new-folder') {
      setNewItemState({ parentPath: item.type === 'dir' ? item.path : item.path.substring(0, item.path.lastIndexOf('/')), type: 'dir' })
      setNewItemName('')
      setOpenPaths(s => { const n = new Set(s); n.add(item.path); return n })
      return
    }

    if (action === 'rename') { setRenamingPath(item.path); return }

    if (action === 'delete') {
      if (confirm(`Delete "${item.name}"?`)) {
        const r = await api.deleteItem(item.path)
        if (r.success) reload()
        else showToast(`Error: ${r.error}`)
      }
      return
    }
  }

  const handleRenameCommit = async (newName: string) => {
    if (!renamingPath || !api) { setRenamingPath(null); return }
    const dir = renamingPath.substring(0, renamingPath.lastIndexOf('/'))
    const newPath = `${dir}/${newName}`
    if (newPath !== renamingPath) {
      const r = await api.renameItem(renamingPath, newPath)
      if (!r.success) showToast(`Error: ${r.error}`)
      else reload()
    }
    setRenamingPath(null)
  }

  const handleNewItemCommit = async () => {
    if (!newItemState || !newItemName.trim() || !api) { setNewItemState(null); return }
    const fullPath = `${newItemState.parentPath}/${newItemName.trim()}`
    const r = newItemState.type === 'dir'
      ? await api.createFolder(fullPath)
      : await api.createFile(fullPath)
    if (r.success) { reload(); if (newItemState.type === 'file') onOpenFile({ path: fullPath, name: newItemName.trim(), type: 'file', ext: newItemName.split('.').pop() ?? '' }) }
    else showToast(`Error: ${r.error}`)
    setNewItemState(null); setNewItemName('')
  }

  if (!rootPath) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '24px 16px' }}>
        {/* Folder SVG illustration */}
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"
          style={{ stroke: 'rgba(255,255,255,.14)', strokeWidth: 1.25 }}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", textAlign: 'center', lineHeight: 1.9 }}>
          <div style={{ fontSize: '9px', letterSpacing: '.14em', color: 'rgba(255,255,255,.2)', marginBottom: 4 }}>NO WORKSPACE</div>
          <div style={{ fontSize: '9px', letterSpacing: '.05em', color: 'rgba(255,255,255,.13)' }}>open a folder to get started</div>
        </div>
        <button
          type="button"
          onClick={onOpenFolder}
          style={{ background: 'transparent', border: '1px solid rgba(16,185,129,.3)', color: '#10b981', fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', padding: '6px 16px', cursor: 'pointer', letterSpacing: '.12em', transition: 'all .15s', borderRadius: 2 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,.08)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,.6)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(16,185,129,.3)' }}>
          OPEN FOLDER
        </button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, padding: '3px 6px', borderBottom: '1px solid rgba(255,255,255,.05)', flexShrink: 0, minHeight: 28 }}>
        <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', opacity: .3, letterSpacing: '.1em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 4 }}>
          {rootPath?.split('/').pop()?.toUpperCase() ?? ''}
        </span>
        <ToolbarBtn title="New File" onClick={() => { setNewItemState({ parentPath: rootPath!, type: 'file' }); setNewItemName('') }}>
          <SvgNewFile />
        </ToolbarBtn>
        <ToolbarBtn title="New Folder" onClick={() => { setNewItemState({ parentPath: rootPath!, type: 'dir' }); setNewItemName('') }}>
          <SvgNewFolder />
        </ToolbarBtn>
        <ToolbarBtn title="Map imports to graph" onClick={() => onScanImports(rootPath!)} color="#10b981" hoverColor="#34d399">
          <SvgGraph />
        </ToolbarBtn>
        <ToolbarBtn title="Refresh" onClick={() => reload()}>
          <SvgRefresh />
        </ToolbarBtn>
        <ToolbarBtn title="Open different folder" onClick={onOpenFolder}>
          <SvgOpenFolder />
        </ToolbarBtn>
        {loading && <span style={{ fontSize: '10px', opacity: .25, marginLeft: 2 }}>…</span>}
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {tree && (
          <div>
            {/* New item input at root level */}
            {newItemState?.parentPath === rootPath && (
              <NewItemInput ref={newItemRef} type={newItemState.type} value={newItemName} onChange={setNewItemName} onCommit={handleNewItemCommit} onCancel={() => setNewItemState(null)} depth={0}/>
            )}
            {tree.children?.map((child: any) => (
              <TreeNode key={child.path} node={child} depth={0}
                openPaths={openPaths} onToggle={toggle} onSelect={handleSelect}
                selectedPath={selectedPath!} onCtxMenu={handleCtxMenu}
                renamingPath={renamingPath!} onRenameCommit={handleRenameCommit} onRenameCancel={() => setRenamingPath(null)}
                newItemState={newItemState} newItemName={newItemName} newItemRef={newItemRef}
                onNewItemChange={setNewItemName} onNewItemCommit={handleNewItemCommit} onNewItemCancel={() => setNewItemState(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} item={ctxMenu.item} onClose={() => setCtxMenu(null)} onAction={handleCtxAction}/>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(16,185,129,0.12)', color: '#10b981',
          padding: '5px 14px', fontSize: '10px',
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 600,
          borderRadius: 3, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 99,
          border: '1px solid rgba(16,185,129,0.3)',
          backdropFilter: 'blur(4px)',
          animation: 'fe-toast-in .18s ease-out',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ── Style constants ────────────────────────────────────────
const iconBtnStyle: any = {
  background: 'transparent', border: 'none', color: '#8888aa',
  cursor: 'pointer', padding: '2px 5px', fontSize: '10px',
  fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
  transition: 'color .15s', letterSpacing: '.02em',
  outline: 'none',
}

// ── New item input ─────────────────────────────────────────
const NewItemInput = ({ ref, type, value, onChange, onCommit, onCancel, depth }: any) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `2px 6px 2px ${depth * 14 + 6}px`, background: 'rgba(16,185,129,.06)', borderLeft: '2px solid #10b981' }}>
    <span style={{ display: 'flex', alignItems: 'center', opacity: .55 }}>
      {type === 'dir' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#89b4fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a8b0c8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      )}
    </span>
    <input ref={ref} value={value} onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCancel() }}
      onBlur={onCommit}
      placeholder={type === 'dir' ? 'folder-name' : 'file.ts'}
      style={{ flex: 1, background: 'transparent', border: 'none', outline: '1px solid rgba(16,185,129,.5)', color: '#c0c8d8', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', padding: '2px 4px' }}
    />
  </div>
)
