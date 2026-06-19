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

const MENU_ITEMS = ['File', 'Edit', 'View', 'Run', 'Help']

export default function TitleBar({
  title = 'FORBIDEN',
  brutal = false,
  onOpenFolder,
  onSettings,
  activeFile,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null)
  const winAPI = (window as any).electronAPI?.window
  const shellAPI = (window as any).electronAPI?.shell
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

    return () => {
      cancelled = true
      winAPI.offMaximizeChange(handler)
    }
  }, [winAPI])

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

  const handleMenu = useCallback((name: string) => {
    if (shellAPI?.openMenu) {
      try { shellAPI.openMenu(name) } catch {}
    }
  }, [shellAPI])

  // ── Colors ────────────────────────────────────────────────
  const bg      = brutal ? '#f0ece0' : '#08080f'
  const text    = brutal ? '#0f0f0f' : '#c0c8d8'
  const subText = brutal ? '#555'    : '#6a6a8a'
  const red     = '#ff2a38'

  // ── Styles ────────────────────────────────────────────────
  const barStyle: React.CSSProperties = {
    height: 32,
    background: bg,
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    userSelect: 'none',
    WebkitAppRegion: 'drag' as any,
    borderBottom: brutal
      ? '2px solid rgba(0,0,0,0.18)'
      : '1px solid rgba(255,255,255,0.05)',
    position: 'relative',
    zIndex: 9999,
    // expose bg for IconRestore background match
    '--tb-bg': bg,
  } as any

  const noDragStyle: React.CSSProperties = {
    WebkitAppRegion: 'no-drag' as any,
    display: 'flex',
    alignItems: 'center',
  }

  const menuBtnStyle = (name: string): React.CSSProperties => ({
    ...noDragStyle,
    background: 'transparent',
    border: 'none',
    color: text,
    fontSize: '11px',
    fontFamily: "'Share Tech Mono', monospace",
    padding: '0 8px',
    height: 32,
    cursor: 'pointer',
    letterSpacing: '.02em',
    opacity: brutal ? 0.7 : 0.65,
    transition: 'background .1s, opacity .1s',
    outline: 'none',
    backgroundColor:
      hoveredBtn === `menu-${name}`
        ? brutal ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
        : 'transparent',
  })

  const winBtnBase: React.CSSProperties = {
    ...noDragStyle,
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

  // Parse title display: FOR + BID (red) + EN
  const logoLeft = 'FOR'
  const logoMid  = 'BID'
  const logoRight = 'EN'

  return (
    <div style={barStyle}>
      {/* ── Logo ── */}
      <div style={{ ...noDragStyle, paddingLeft: 12, paddingRight: 8, gap: 0, flexShrink: 0 }}>
        <span style={{
          fontFamily: "'Oswald', sans-serif",
          fontWeight: 700,
          fontSize: '12px',
          letterSpacing: '.12em',
          color: text,
        }}>
          {logoLeft}
          <span style={{ color: red }}>{logoMid}</span>
          {logoRight}
        </span>
        {/* Diamond logo accent */}
        <span style={{
          marginLeft: 6,
          color: red,
          fontSize: '8px',
          opacity: 0.7,
          lineHeight: 1,
        }}>◆</span>
      </div>

      {/* ── Separator ── */}
      <div style={{
        width: 1,
        height: 16,
        background: brutal ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)',
        flexShrink: 0,
        margin: '0 4px',
      }} />

      {/* ── Menu items ── */}
      <div style={{ ...noDragStyle, gap: 0, flexShrink: 0 }}>
        {MENU_ITEMS.map(name => (
          <button
            key={name}
            style={menuBtnStyle(name)}
            onMouseEnter={() => setHoveredBtn(`menu-${name}`)}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => handleMenu(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {/* ── Separator ── */}
      <div style={{
        width: 1,
        height: 16,
        background: brutal ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)',
        flexShrink: 0,
        margin: '0 4px',
      }} />

      {/* ── Active file breadcrumb ── */}
      {activeFile && (
        <div style={{
          ...noDragStyle,
          paddingLeft: 8,
          paddingRight: 8,
          gap: 4,
          flexShrink: 1,
          minWidth: 0,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            color: subText,
            opacity: 0.6,
          }}>›</span>
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

      {/* ── Spacer (draggable) ── */}
      <div style={{ flex: 1, height: '100%', WebkitAppRegion: 'drag' as any }} />

      {/* ── Center title (absolute) ── */}
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
      <div style={{ ...noDragStyle, flexShrink: 0 }}>
        {/* Minimize */}
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

        {/* Maximize / Restore */}
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

        {/* Close */}
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
