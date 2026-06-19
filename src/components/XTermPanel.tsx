// @ts-nocheck
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { WebglAddon } from 'xterm-addon-webgl'
import 'xterm/css/xterm.css'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TermPalette {
  id: string
  name: string
  bg: string
  text: string
  prompt: string
  dim: string
  error: string
  warn: string
  info: string
  border: string
  cursor: string
  selection: string
}

export interface XTermPanelProps {
  cwd: string
  palette?: TermPalette
  onCwdChange?: (cwd: string) => void
  onActivePtyChange?: (ptyId: string | null) => void
}

interface TermTab {
  id: string
  label: string
  terminal: Terminal | null
  fitAddon: FitAddon | null
  ws: WebSocket | null
  containerRef: React.RefObject<HTMLDivElement>
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PALETTE: TermPalette = {
  id: 'forbiden-dark',
  name: 'FORBIDEN Dark',
  bg: '#080810',
  text: '#c0c8d8',
  prompt: '#10b981',
  dim: '#3e3e5a',
  error: '#ff435a',
  warn: '#ffc410',
  info: '#28f1c3',
  border: '#1a1a2c',
  cursor: '#10b981',
  selection: 'rgba(16,185,129,0.15)',
}

const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"
const FONT_SIZE   = 13
const TAB_HEIGHT  = 28

function paletteToXterm(p: TermPalette) {
  return {
    background: p.bg, foreground: p.text, cursor: p.cursor, cursorAccent: p.bg,
    selectionBackground: p.selection,
    black: p.dim, red: p.error, green: p.prompt, yellow: p.warn,
    blue: p.info, magenta: '#bb9af7', cyan: p.info, white: p.text,
    brightBlack: p.dim, brightRed: p.error, brightGreen: p.prompt, brightYellow: p.warn,
    brightBlue: p.info, brightMagenta: '#c792ea', brightCyan: p.info, brightWhite: '#ffffff',
  }
}

let _tabCounter = 0
function nextId(): string {
  return `pty-${Date.now()}-${++_tabCounter}`
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', width: '100%', flex: 1,
    minHeight: 0, background: '#080810', overflow: 'hidden', fontFamily: FONT_FAMILY,
  },
  tabBar: {
    display: 'flex', alignItems: 'center', height: TAB_HEIGHT, minHeight: TAB_HEIGHT,
    background: '#0d0d1a', borderBottom: '1px solid #1a1a2c',
    overflowX: 'auto', overflowY: 'hidden', userSelect: 'none',
    flexShrink: 0, scrollbarWidth: 'none',
  },
  tabInner: { display: 'flex', alignItems: 'stretch', height: '100%' },
  addBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: '100%', background: 'transparent', border: 'none',
    color: '#5a5a7a', fontSize: 18, cursor: 'pointer', padding: 0, flexShrink: 0,
  },
  termWrap: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: '#080810' },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', flex: 1, minHeight: 0, gap: 12,
    color: '#5a5a7a', fontFamily: FONT_FAMILY, fontSize: 13,
  },
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 10px 0 12px', height: '100%', fontSize: 11,
    fontFamily: FONT_FAMILY, cursor: 'pointer', whiteSpace: 'nowrap',
    borderRight: '1px solid #1a1a2c',
    background: active ? '#080810' : 'transparent',
    color: active ? '#c0c8d8' : '#5a5a7a',
    borderBottom: active ? '2px solid #10b981' : '2px solid transparent',
    transition: 'background 0.1s, color 0.1s',
    letterSpacing: '0.02em',
  }
}

function containerStyle(visible: boolean): React.CSSProperties {
  return {
    position: 'absolute', inset: 0, padding: '4px 0 0 4px',
    visibility: visible ? 'visible' : 'hidden',
    pointerEvents: visible ? 'auto' : 'none',
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

const XTermPanel: React.FC<XTermPanelProps> = ({ cwd, palette, onCwdChange, onActivePtyChange }) => {
  const pal   = useMemo(() => ({ ...DEFAULT_PALETTE, ...palette }), [palette])
  const theme = useMemo(() => paletteToXterm(pal), [pal])

  const tabsRef   = useRef<Map<string, TermTab>>(new Map())
  const [tabList, setTabList]   = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const hasEngine = !!(window as any).electronAPI?.engine?.wsUrl

  // ── Notify parent of active PTY ID ──────────────────────────
  useEffect(() => {
    onActivePtyChange?.(activeId)
  }, [activeId, onActivePtyChange])

  // ── Build WebSocket URL ──────────────────────────────────────
  const makePtyWsUrl = useCallback((id: string, cols: number, rows: number, dir: string) => {
    const api = (window as any).electronAPI
    if (api?.engine?.wsUrl) {
      // new Go engine
      return api.pty.wsUrl(id, cols, rows, dir)
    }
    return null
  }, [])

  // ── Create terminal + open WebSocket ────────────────────────
  const createTerminal = useCallback((id: string, containerEl: HTMLDivElement) => {
    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: FONT_SIZE,
      lineHeight: 1.4,
      letterSpacing: 0.5,
      theme: { ...theme },
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowTransparency: true,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
    })

    const fitAddon      = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerEl)

    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {}

    fitAddon.fit()
    const { cols, rows } = term
    const startCwd = cwd || (window as any).electronAPI?.homeDir || '/'

    const wsUrl = makePtyWsUrl(id, cols, rows, startCwd)
    let ws: WebSocket | null = null

    if (wsUrl) {
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        // terminal ready
      }

      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(e.data))
        } else if (typeof e.data === 'string') {
          // Control message from engine (e.g. exit)
          try {
            const msg = JSON.parse(e.data)
            if (msg.type === 'exit') {
              term.writeln('\r\n\x1b[2m[process exited]\x1b[0m')
            }
          } catch {
            term.write(e.data)
          }
        }
      }

      ws.onclose = () => {
        const tab = tabsRef.current.get(id)
        if (tab?.terminal) {
          tab.terminal.writeln('\r\n\x1b[2m[disconnected]\x1b[0m')
        }
      }

      ws.onerror = () => {
        term.writeln('\r\n\x1b[31mConnection to engine failed\x1b[0m\r\n')
      }

      // Forward keyboard input → WebSocket
      term.onData((data: string) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      })

      // Track cwd via OSC 7
      term.parser.registerOscHandler(7, (data: string) => {
        try {
          const url = new URL(data)
          if (url.pathname && onCwdChange) {
            onCwdChange(decodeURIComponent(url.pathname))
          }
        } catch {}
        return false
      })
    } else {
      term.writeln('\x1b[31mEngine not available. Run the app via Electron.\x1b[0m')
    }

    return { term, fitAddon, ws }
  }, [theme, cwd, makePtyWsUrl, onCwdChange])

  // ── Add tab ──────────────────────────────────────────────────
  const addTab = useCallback(() => {
    const id = nextId()
    const containerRef = React.createRef<HTMLDivElement>()
    tabsRef.current.set(id, {
      id,
      label: `bash ${tabsRef.current.size + 1}`,
      terminal: null, fitAddon: null, ws: null, containerRef,
    })
    setTabList(prev => [...prev, id])
    setActiveId(id)
  }, [])

  // ── Close tab ────────────────────────────────────────────────
  const closeTab = useCallback((id: string) => {
    const tab = tabsRef.current.get(id)
    if (!tab) return
    if (tab.ws && tab.ws.readyState === WebSocket.OPEN) tab.ws.close()
    try { tab.terminal?.dispose() } catch {}
    tabsRef.current.delete(id)
    setTabList(prev => {
      const next = prev.filter(x => x !== id)
      setActiveId(cur => {
        if (cur !== id) return cur
        const idx = prev.indexOf(id)
        return next[Math.min(idx, next.length - 1)] ?? null
      })
      return next
    })
  }, [])

  // ── Open first tab on mount ──────────────────────────────────
  useEffect(() => { addTab() }, [])

  // ── Kill all on unmount ──────────────────────────────────────
  useEffect(() => () => {
    tabsRef.current.forEach(tab => {
      if (tab.ws) try { tab.ws.close() } catch {}
      try { tab.terminal?.dispose() } catch {}
    })
    tabsRef.current.clear()
  }, [])

  // ── Resize observer ──────────────────────────────────────────
  useEffect(() => {
    if (!wrapperRef.current) return
    const ro = new ResizeObserver(() => {
      if (!activeId) return
      const tab = tabsRef.current.get(activeId)
      if (!tab?.fitAddon || !tab.terminal) return
      try {
        tab.fitAddon.fit()
        const { cols, rows } = tab.terminal
        if (tab.ws && tab.ws.readyState === WebSocket.OPEN) {
          tab.ws.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      } catch {}
    })
    ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [activeId])

  // ── Focus active tab after switch ────────────────────────────
  useEffect(() => {
    if (!activeId) return
    const tab = tabsRef.current.get(activeId)
    if (!tab?.terminal || !tab.fitAddon) return
    requestAnimationFrame(() => {
      try { tab.fitAddon!.fit(); tab.terminal!.focus() } catch {}
    })
  }, [activeId])

  // ── Update theme on palette change ───────────────────────────
  useEffect(() => {
    tabsRef.current.forEach(tab => {
      if (tab.terminal) tab.terminal.options.theme = { ...theme }
    })
  }, [theme])

  if (!hasEngine) {
    return (
      <div style={S.root}>
        <div style={S.empty}>
          <span style={{ fontSize: 32 }}>⚠</span>
          <span style={{ color: '#ffc410', fontWeight: 700 }}>Terminal unavailable</span>
          <span style={{ color: '#5a5a7a', fontSize: 11 }}>Go engine not running — start app via Electron.</span>
        </div>
      </div>
    )
  }

  return (
    <div style={S.root}>
      {/* Tab bar */}
      <div style={S.tabBar}>
        <div style={S.tabInner}>
          {tabList.map(id => {
            const tab = tabsRef.current.get(id)
            const active = id === activeId
            return (
              <div key={id} style={tabStyle(active)} onClick={() => setActiveId(id)} title={tab?.label ?? id}>
                <span style={{ color: active ? pal.prompt : '#5a5a7a', fontSize: 9 }}>▶</span>
                <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab?.label ?? id}</span>
                <span
                  style={{ display:'flex', alignItems:'center', justifyContent:'center', width:14, height:14, borderRadius:2, fontSize:12, color:'#5a5a7a', cursor:'pointer', flexShrink:0 }}
                  onClick={e => { e.stopPropagation(); closeTab(id) }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ff435a' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#5a5a7a' }}
                  title="Close terminal"
                >×</span>
              </div>
            )
          })}
        </div>
        <button
          style={S.addBtn}
          onClick={addTab}
          title="New terminal"
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#10b981' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#5a5a7a' }}
        >+</button>
      </div>

      {/* Terminal containers */}
      <div style={S.termWrap} ref={wrapperRef}>
        {tabList.map(id => (
          <TermContainer
            key={id}
            id={id}
            visible={id === activeId}
            tabsRef={tabsRef}
            createTerminal={createTerminal}
          />
        ))}
        {tabList.length === 0 && (
          <div style={S.empty}>
            <span style={{ color: '#3e3e5a' }}>No terminals open.</span>
            <button onClick={addTab} style={{ background:'transparent', border:'1px solid #1a1a2c', color:'#10b981', padding:'4px 14px', borderRadius:2, fontFamily:FONT_FAMILY, fontSize:12, cursor:'pointer' }}>
              + New terminal
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TermContainer ────────────────────────────────────────────────────────────

interface TermContainerProps {
  id: string
  visible: boolean
  tabsRef: React.MutableRefObject<Map<string, TermTab>>
  createTerminal: (id: string, el: HTMLDivElement) => { term: Terminal; fitAddon: FitAddon; ws: WebSocket | null }
}

const TermContainer: React.FC<TermContainerProps> = ({ id, visible, tabsRef, createTerminal }) => {
  const divRef      = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current || !divRef.current) return
    const { term, fitAddon, ws } = createTerminal(id, divRef.current)
    const tab = tabsRef.current.get(id)
    if (tab) { tab.terminal = term; tab.fitAddon = fitAddon; tab.ws = ws }
    initialized.current = true
    const t = setTimeout(() => { try { fitAddon.fit() } catch {} }, 50)
    return () => clearTimeout(t)
  }, [])

  return <div ref={divRef} style={containerStyle(visible)} />
}

export default XTermPanel
