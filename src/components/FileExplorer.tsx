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

  const indent = depth * 14 + 6

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: `2px 6px 2px ${indent}px`,
          cursor: 'pointer', userSelect: 'none',
          background: isSelected ? 'rgba(16,185,129,.12)' : 'transparent',
          borderLeft: isSelected ? '2px solid #10b981' : '2px solid transparent',
          transition: 'background .1s',
          minHeight: 22,
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
        onPointerDown={e => {
          if (node.type === 'dir') onToggle(node.path)
          else onSelect(node)
        }}
        onContextMenu={e => { e.preventDefault(); onCtxMenu(e, node) }}
      >
        {/* Arrow / expand indicator */}
        <span style={{ width: 14, flexShrink: 0, textAlign: 'center', fontSize: node.type === 'dir' ? '9px' : '7px', opacity: node.type === 'dir' ? .7 : .4, color: node.type === 'dir' ? (isOpen ? '#10b981' : '#c0c8d8') : '#607080' }}>
          {node.type === 'dir' ? (isOpen ? '▾' : '▸') : '·'}
        </span>

        {/* Icon */}
        <span style={{ width: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {node.type === 'dir' ? (
            <span style={{ fontSize: '13px', opacity: isOpen ? 1 : .6 }}>{isOpen ? '📂' : '📁'}</span>
          ) : (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '8px', fontWeight: 700, letterSpacing: '-.02em', padding: '1px 3px', borderRadius: 2, background: `${EXT_COLOR[node.ext ?? ''] ?? '#8888aa'}22`, color: EXT_COLOR[node.ext ?? ''] ?? '#8888aa', minWidth: 20, textAlign: 'center' }}>
              {(node.ext ?? '').slice(0, 3).toUpperCase() || '·'}
            </span>
          )}
        </span>

        {/* Name */}
        {isRenaming ? (
          <RenameInput item={node} onCommit={onRenameCommit} onCancel={onRenameCancel}/>
        ) : (
          <span style={{ flex: 1, fontSize: '11px', fontFamily: "'JetBrains Mono',monospace", color: node.type === 'dir' ? (isOpen ? '#e0e0f0' : '#a0a8c0') : '#c0c8d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-.01em' }}>
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '24px 16px' }}>
        <div style={{ fontSize: '28px', opacity: .3 }}>📂</div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '10px', opacity: .35, textAlign: 'center', letterSpacing: '.08em', lineHeight: 1.8 }}>
          NO FOLDER OPEN<br/>
          <span style={{ fontSize: '9px' }}>Use ⬆ IMPORT or drag a folder onto the canvas</span>
        </div>
        <button onClick={onOpenFolder} style={{ background: 'transparent', border: '1px solid rgba(16,185,129,.4)', color: '#10b981', fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', padding: '6px 14px', cursor: 'pointer', letterSpacing: '.08em', transition: 'all .15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          OPEN FOLDER
        </button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,.05)', flexShrink: 0 }}>
        <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', opacity: .3, letterSpacing: '.1em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rootPath?.split('/').pop()?.toUpperCase() ?? ''}
        </span>
        {/* New File */}
        <button title="New File" onClick={() => setNewItemState({ parentPath: rootPath!, type: 'file' }) ?? setNewItemName('')}
          style={iconBtnStyle}>+F</button>
        {/* New Folder */}
        <button title="New Folder" onClick={() => setNewItemState({ parentPath: rootPath!, type: 'dir' }) ?? setNewItemName('')}
          style={iconBtnStyle}>+D</button>
        {/* Map imports → graph */}
        <button title="Map imports to graph" onClick={() => onScanImports(rootPath!)}
          style={{ ...iconBtnStyle, color: '#10b981' }}>◈</button>
        {/* Refresh */}
        <button title="Refresh" onClick={() => reload()} style={iconBtnStyle}>↺</button>
        {/* Change folder */}
        <button title="Open different folder" onClick={onOpenFolder} style={iconBtnStyle}>⬆</button>
        {loading && <span style={{ fontSize: '10px', opacity: .3, marginLeft: 2 }}>…</span>}
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
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', background: '#10b981', color: '#000', padding: '4px 12px', fontSize: '10px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, borderRadius: 2, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 99 }}>
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
    <span style={{ fontSize: '10px', opacity: .5 }}>{type === 'dir' ? '📁' : '📄'}</span>
    <input ref={ref} value={value} onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCancel() }}
      onBlur={onCommit}
      placeholder={type === 'dir' ? 'folder-name' : 'file.ts'}
      style={{ flex: 1, background: 'transparent', border: 'none', outline: '1px solid rgba(16,185,129,.5)', color: '#c0c8d8', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', padding: '2px 4px' }}
    />
  </div>
)
