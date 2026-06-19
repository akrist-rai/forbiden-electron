// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react'

// ── SVG Window Control Icons ──────────────────────────────────
function IconMinimize() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="4.5" width="10" height="1" fill="currentColor"/>
    </svg>
  )
}

function IconMaximize() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none"/>
    </svg>
  )
}

function IconRestore() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="0" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="none"/>
      <rect x="0" y="2" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="none" style={{ fill: 'var(--tb-bg)' }}/>
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

// ── Props ─────────────────────────────────────────────────────
interface TitleBarProps {
  title?: string
  brutal?: boolean
  onOpenFolder?: () => void
  onSettings?: () => void
  activeFile?: string
}

type MenuItem = { label: string; action?: () => void; separator?: boolean; disabled?: boolean }

const MENUS: Record<string, MenuItem[]> = {
  File: [
    { label: 'Open Folder…', action: () => (window as any).electronAPI?.dialog?.openFolder().then((p: string) => p && window.dispatchEvent(new CustomEvent('forbiden:open-folder', { detail: p }))) },
    { label: 'Open Files…',  action: () => (window as any).electronAPI?.dialog?.openFiles() },
    { label: 'Save File',    action: () => window.dispatchEvent(new CustomEvent('forbiden:save-file')) },
    { separator: true, label: '' },
    { label: 'Quit', action: () => (window as any).electronAPI?.window?.close() },
  ],
  Edit: [
    { label: 'Undo',       action: () => document.execCommand('undo') },
    { label: 'Redo',       action: () => document.execCommand('redo') },
    { separator: true, label: '' },
    { label: 'Cut',        action: () => document.execCommand('cut') },
    { label: 'Copy',       action: () => document.execCommand('copy') },
    { label: 'Paste',      action: () => document.execCommand('paste') },
    { separator: true, label: '' },
    { label: 'Select All', action: () => document.execCommand('selectAll') },
  ],
  View: [
    { label: 'Reload',          action: () => window.location.reload() },
    { label: 'Toggle DevTools', action: () => (window as any).electronAPI?.window?.toggleDevTools?.() },
    { separator: true, label: '' },
    { label: 'Zoom In',         action: () => window.dispatchEvent(new CustomEvent('forbiden:zoom-in')) },
    { label: 'Zoom Out',        action: () => window.dispatchEvent(new CustomEvent('forbiden:zoom-out')) },
    { label: 'Reset Zoom',      action: () => window.dispatchEvent(new CustomEvent('forbiden:zoom-reset')) },
    { separator: true, label: '' },
    { label: 'Toggle Sidebar',  action: () => window.dispatchEvent(new CustomEvent('forbiden:toggle-sidebar')) },
    { label: 'Toggle Terminal', action: () => window.dispatchEvent(new CustomEvent('forbiden:toggle-terminal')) },
  ],
  Run: [
    { label: 'Run Active File', action: () => window.dispatchEvent(new CustomEvent('forbiden:run-active')) },
    { label: 'Open Terminal',   action: () => window.dispatchEvent(new CustomEvent('forbiden:toggle-terminal')) },
  ],
  Help: [
    { label: 'About FORBIDEN', action: () => alert('FORBIDEN Graph IDE\nVersion 2.2.0\n\nBuilt with Electron + React + Vite') },
  ],
}

export default function TitleBar({
  title = 'FORBIDEN',
  brutal = false,
  onOpenFolder,
  onSettings,
  activeFile,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const winAPI = (window as any).electronAPI?.window
  const hasWinAPI = Boolean(winAPI)

  // Poll initial maximized state and subscribe to changes
  useEffect(() => {
    if (!winAPI) return
    let cancelled = false
    winAPI.isMaximized().then((val: boolean) => {
      if (!cancelled) setIsMaximized(val)
    }).catch(() => {})
    const handler = (_event: any, val: boolean) => setIsMaximized(val)
    winAPI.onMaximizeChange(handler)
    return () => { cancelled = true; winAPI.offMaximizeChange(handler) }
  }, [winAPI])

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu])

  const handleMinimize = useCallback(() => {
    if (!winAPI) return
    winAPI.minimize().catch(() => {})
  }, [winAPI])

  const handleMaximize = useCallback(() => {
    if (!winAPI) return
    winAPI.maximize().catch(() => {})
  }, [winAPI])

  const handleClose = useCallback(() => {
    if (!winAPI) return
    winAPI.close().catch(() => {})
  }, [winAPI])

  const handleMenuToggle = useCallback((name: string) => {
    setOpenMenu(prev => prev === name ? null : name)
  }, [])

  // ── Colors ────────────────────────────────────────────────
  const bg      = brutal ? '#f0ece0' : '#08080f'
  const text    = brutal ? '#0f0f0f' : '#c0c8d8'
  const subText = brutal ? '#555'    : '#6a6a8a'
  const red     = '#ff2a38'

  // ── Styles ────────────────────────────────────────────────
  // No WebkitAppRegion on the bar itself — only the spacer strip is draggable.
  // This means every button is naturally clickable without needing no-drag overrides.
  const barStyle: React.CSSProperties = {
    height: 32,
    background: bg,
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    userSelect: 'none',
    borderBottom: brutal
      ? '2px solid rgba(0,0,0,0.18)'
      : '1px solid rgba(255,255,255,0.05)',
    position: 'relative',
    zIndex: 9999,
    '--tb-bg': bg,
  } as any

  const flexRow: React.CSSProperties = { display: 'flex', alignItems: 'center' }

  const menuBtnStyle = (name: string): React.CSSProperties => ({
    ...flexRow,
    background: openMenu === name
      ? (brutal ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)')
      : hoveredBtn === `menu-${name}`
        ? (brutal ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)')
        : 'transparent',
    border: 'none',
    color: text,
    fontSize: '11px',
    fontFamily: "'Share Tech Mono', monospace",
    padding: '0 9px',
    height: 32,
    cursor: 'pointer',
    letterSpacing: '.02em',
    opacity: brutal ? 0.8 : 0.7,
    transition: 'background .1s',
    outline: 'none',
  })

  const winBtnBase: React.CSSProperties = {
    ...flexRow,
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: brutal ? '#444' : '#9494b0',
    width: 46,
    height: 32,
    cursor: 'pointer',
    transition: 'background .1s, color .1s',
    outline: 'none',
    flexShrink: 0,
    opacity: hasWinAPI ? 1 : 0.35,
    fontSize: 0,
  }

  const winBtnStyle = (id: string): React.CSSProperties => {
    const hovered = hoveredBtn === id
    if (id === 'close' && hovered) {
      return { ...winBtnBase, backgroundColor: '#e81123', color: '#fff' }
    }
    return {
      ...winBtnBase,
      backgroundColor: hovered
        ? brutal ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)'
        : 'transparent',
    }
  }

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    minWidth: 190,
    background: brutal ? '#f0ece0' : '#12121e',
    border: brutal ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
    zIndex: 99999,
    padding: '4px 0',
  }

  return (
    <div style={barStyle}>
      {/* ── Logo ── */}
      <div style={{ ...flexRow, paddingLeft: 12, paddingRight: 8, gap: 0, flexShrink: 0 }}>
        <span style={{
          fontFamily: "'Oswald', sans-serif",
          fontWeight: 700,
          fontSize: '12px',
          letterSpacing: '.12em',
          color: text,
        }}>
          FOR<span style={{ color: red }}>BID</span>EN
        </span>
        <span style={{ marginLeft: 6, color: red, fontSize: '8px', opacity: 0.7, lineHeight: 1 }}>◆</span>
      </div>

      {/* ── Separator ── */}
      <div style={{ width: 1, height: 16, background: brutal ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)', flexShrink: 0, margin: '0 4px' }} />

      {/* ── Menu items with dropdowns ── */}
      <div ref={menuRef} style={{ ...flexRow, gap: 0, flexShrink: 0 }}>
        {Object.keys(MENUS).map(name => (
          <div key={name} style={{ position: 'relative' }}>
            <button
              style={menuBtnStyle(name)}
              onMouseEnter={() => { setHoveredBtn(`menu-${name}`); if (openMenu && openMenu !== name) setOpenMenu(name) }}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={() => handleMenuToggle(name)}
            >
              {name}
            </button>
            {openMenu === name && (
              <div style={dropdownStyle}>
                {MENUS[name].map((item, i) => item.separator ? (
                  <div key={i} style={{ height: 1, background: brutal ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)', margin: '3px 0' }} />
                ) : (
                  <button
                    key={i}
                    disabled={item.disabled}
                    onClick={() => { item.action?.(); setOpenMenu(null) }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      color: item.disabled ? (brutal ? '#aaa' : '#4a4a6a') : (brutal ? '#0f0f0f' : '#c0c8d8'),
                      fontSize: '12px',
                      fontFamily: "'Share Tech Mono', monospace",
                      padding: '5px 16px',
                      cursor: item.disabled ? 'default' : 'pointer',
                      letterSpacing: '.02em',
                    }}
                    onMouseEnter={e => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = brutal ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Separator ── */}
      <div style={{ width: 1, height: 16, background: brutal ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)', flexShrink: 0, margin: '0 4px' }} />

      {/* ── Active file breadcrumb ── */}
      {activeFile && (
        <div style={{ ...flexRow, paddingLeft: 8, paddingRight: 8, gap: 4, flexShrink: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: subText, opacity: 0.6 }}>›</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            color: text,
            opacity: 0.75,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 200,
          }}>
            {activeFile}
          </span>
        </div>
      )}

      {/* ── Spacer — the ONLY draggable region ── */}
      <div style={{ flex: 1, height: '100%', WebkitAppRegion: 'drag' as any }} />

      {/* ── Center title (absolute, pointer-events off so it doesn't block drag) ── */}
      <div style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '10px',
        letterSpacing: '.1em',
        color: subText,
        opacity: 0.5,
        whiteSpace: 'nowrap',
      }}>
        {activeFile ? `${title} — ${activeFile}` : title}
      </div>

      {/* ── Window control buttons ── */}
      <div style={{ ...flexRow, flexShrink: 0 }}>
        <button
          style={winBtnStyle('minimize')}
          onMouseEnter={() => setHoveredBtn('minimize')}
          onMouseLeave={() => setHoveredBtn(null)}
          onClick={handleMinimize}
          title="Minimize"
          disabled={!hasWinAPI}
        >
          <IconMinimize />
        </button>

        <button
          style={winBtnStyle('maximize')}
          onMouseEnter={() => setHoveredBtn('maximize')}
          onMouseLeave={() => setHoveredBtn(null)}
          onClick={handleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
          disabled={!hasWinAPI}
        >
          {isMaximized ? <IconRestore /> : <IconMaximize />}
        </button>

        <button
          style={winBtnStyle('close')}
          onMouseEnter={() => setHoveredBtn('close')}
          onMouseLeave={() => setHoveredBtn(null)}
          onClick={handleClose}
          title="Close"
          disabled={!hasWinAPI}
        >
          <IconClose />
        </button>
      </div>
    </div>
  )
}
