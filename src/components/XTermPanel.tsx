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
import { api } from '../lib/api'

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
  bg: '#0d0d0d',
  text: '#cccccc',
  prompt: '#10b981',
  dim: '#444444',
  error: '#ff435a',
  warn: '#ffc410',
  info: '#28f1c3',
  border: '#1e1e1e',
  cursor: '#10b981',
  selection: 'rgba(255,255,255,0.1)',
}

const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', monospace"
const FONT_SIZE   = 13
const TAB_HEIGHT  = 28

function paletteToXterm(p: TermPalette) {
  return {
    background:         p.bg,
    foreground:         p.text,
    cursor:             p.cursor,
    cursorAccent:       p.bg,
    selectionBackground: p.selection,
    black: '#1e1e1e', red: p.error, green: p.prompt, yellow: p.warn,
    blue: p.info, magenta: '#bb9af7', cyan: p.info, white: p.text,
    brightBlack: '#555555', brightRed: p.error, brightGreen: p.prompt,
    brightYellow: p.warn, brightBlue: p.info, brightMagenta: '#c792ea',
    brightCyan: p.info, brightWhite: '#ffffff',
  }
}

let _tabCounter = 0
function nextId(): string {
  return `pty-${Date.now()}-${++_tabCounter}`
}

// ─── Main component ───────────────────────────────────────────────────────────

const XTermPanel: React.FC<XTermPanelProps> = ({ cwd, palette, onCwdChange, onActivePtyChange }) => {
  const pal   = useMemo(() => ({ ...DEFAULT_PALETTE, ...palette }), [palette])
  const theme = useMemo(() => paletteToXterm(pal), [pal])

  const tabsRef    = useRef<Map<string, TermTab>>(new Map())
  const [tabList, setTabList]   = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const hasEngine = !!api?.engine?.wsUrl

  useEffect(() => { onActivePtyChange?.(activeId) }, [activeId, onActivePtyChange])

  const makePtyWsUrl = useCallback((id: string, cols: number, rows: number, dir: string) => {
    if (api?.engine?.wsUrl) return api.pty.wsUrl(id, cols, rows, dir)
    return null
  }, [])

  const createTerminal = useCallback((id: string, containerEl: HTMLDivElement) => {
    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: FONT_SIZE,
      lineHeight: 1.4,
      letterSpacing: 0,
      theme: { ...theme },
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowTransparency: false,
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

    // Middle-click paste (Linux primary selection fallback to clipboard)
    containerEl.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      navigator.clipboard.readText().then(text => {
        if (text && term) term.paste(text)
      }).catch(() => {})
    })

    fitAddon.fit()
    const { cols, rows } = term
    const startCwd = cwd || api?.homeDir || '/'
    const wsUrl = makePtyWsUrl(id, cols, rows, startCwd)
    let ws: WebSocket | null = null

    if (wsUrl) {
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => {}
      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(e.data))
        } else if (typeof e.data === 'string') {
          try {
            const msg = JSON.parse(e.data)
            if (msg.type === 'exit') term.writeln('\r\n\x1b[2m[process exited]\x1b[0m')
          } catch {
            term.write(e.data)
          }
        }
      }
      ws.onclose = () => {
        const tab = tabsRef.current.get(id)
        if (tab?.terminal) tab.terminal.writeln('\r\n\x1b[2m[disconnected]\x1b[0m')
      }
      ws.onerror = () => {
        term.writeln('\r\n\x1b[31mConnection to engine failed\x1b[0m\r\n')
      }
      term.onData((data: string) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(data)
      })
      term.parser.registerOscHandler(7, (data: string) => {
        try {
          const url = new URL(data)
          if (url.pathname && onCwdChange) onCwdChange(decodeURIComponent(url.pathname))
        } catch {}
        return false
      })
    } else {
      term.writeln('\x1b[31mPTY engine not available\x1b[0m')
    }

    return { term, fitAddon, ws }
  }, [theme, cwd, makePtyWsUrl, onCwdChange])

  const addTab = useCallback(() => {
    const id = nextId()
    const containerRef = React.createRef<HTMLDivElement>()
    tabsRef.current.set(id, {
      id, label: `bash ${tabsRef.current.size + 1}`,
      terminal: null, fitAddon: null, ws: null, containerRef,
    })
    setTabList(prev => [...prev, id])
    setActiveId(id)
  }, [])

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

  useEffect(() => { addTab() }, [])

  useEffect(() => () => {
    tabsRef.current.forEach(tab => {
      if (tab.ws) try { tab.ws.close() } catch {}
      try { tab.terminal?.dispose() } catch {}
    })
    tabsRef.current.clear()
  }, [])

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

  useEffect(() => {
    if (!activeId) return
    const tab = tabsRef.current.get(activeId)
    if (!tab?.terminal || !tab.fitAddon) return
    requestAnimationFrame(() => {
      try { tab.fitAddon!.fit(); tab.terminal!.focus() } catch {}
    })
  }, [activeId])

  useEffect(() => {
    tabsRef.current.forEach(tab => {
      if (tab.terminal) tab.terminal.options.theme = { ...theme }
    })
  }, [theme])

  if (!hasEngine) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        flex:1, background: pal.bg, color: pal.dim, fontFamily: FONT_FAMILY, fontSize:12 }}>
        PTY engine not ready
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', width:'100%', flex:1,
      minHeight:0, background: pal.bg, overflow:'hidden', fontFamily: FONT_FAMILY }}>

      {/* Tab bar */}
      <div style={{
        display:'flex', alignItems:'stretch', height: TAB_HEIGHT, minHeight: TAB_HEIGHT,
        background: pal.border, borderBottom: `1px solid ${pal.dim}33`,
        overflowX:'auto', overflowY:'hidden', userSelect:'none', flexShrink:0,
        scrollbarWidth:'none',
      }}>
        {tabList.map((id, idx) => {
          const tab = tabsRef.current.get(id)
          const active = id === activeId
          return (
            <div
              key={id}
              onClick={() => setActiveId(id)}
              title={tab?.label ?? id}
              style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'0 8px 0 12px', height:'100%',
                fontSize:11, fontFamily: FONT_FAMILY, cursor:'pointer',
                whiteSpace:'nowrap',
                background: active ? pal.bg : 'transparent',
                color: active ? pal.text : pal.dim,
                borderRight: `1px solid ${pal.dim}22`,
                borderBottom: active ? `2px solid ${pal.prompt}` : '2px solid transparent',
              }}
            >
              <span style={{ maxWidth:100, overflow:'hidden', textOverflow:'ellipsis' }}>
                {tab?.label ?? `bash ${idx + 1}`}
              </span>
              <span
                style={{ fontSize:12, color:'transparent', cursor:'pointer', padding:'0 2px', flexShrink:0 }}
                onClick={e => { e.stopPropagation(); closeTab(id) }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = pal.dim }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'transparent' }}
                title="Close"
              >×</span>
            </div>
          )
        })}

        {/* New tab */}
        <button
          type="button"
          onClick={addTab}
          title="New terminal"
          style={{
            display:'flex', alignItems:'center', justifyContent:'center',
            width:28, height:'100%', background:'transparent', border:'none',
            color: pal.dim, cursor:'pointer', padding:0, flexShrink:0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = pal.text }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = pal.dim }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="5.5" y1="1" x2="5.5" y2="10"/>
            <line x1="1" y1="5.5" x2="10" y2="5.5"/>
          </svg>
        </button>
      </div>

      {/* Terminal area */}
      <div style={{ flex:1, minHeight:0, position:'relative', overflow:'hidden', background: pal.bg }} ref={wrapperRef}>
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
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
            height:'100%', color: pal.dim, fontFamily: FONT_FAMILY, fontSize:12 }}>
            <button type="button" onClick={addTab}
              style={{ background:'transparent', border:`1px solid ${pal.dim}44`,
                color: pal.dim, padding:'4px 14px', fontFamily: FONT_FAMILY, fontSize:11, cursor:'pointer' }}>
              + new terminal
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

  return (
    <div
      ref={divRef}
      style={{
        position:'absolute', inset:0,
        padding:'4px 0 0 4px',
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    />
  )
}

export default React.memo(XTermPanel)
