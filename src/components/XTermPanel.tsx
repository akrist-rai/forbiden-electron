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
}

interface TermTab {
  id: string
  label: string
  terminal: Terminal | null
  fitAddon: FitAddon | null
  containerRef: React.RefObject<HTMLDivElement>
  alive: boolean
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
const FONT_SIZE = 13
const TAB_BAR_HEIGHT = 28

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _tabCounter = 0
function nextTabId(): string {
  return `pty-${Date.now()}-${++_tabCounter}`
}

function paletteToXterm(p: TermPalette) {
  return {
    background: p.bg,
    foreground: p.text,
    cursor: p.cursor,
    cursorAccent: p.bg,
    selectionBackground: p.selection,
    black: p.dim,
    red: p.error,
    green: p.prompt,
    yellow: p.warn,
    blue: p.info,
    magenta: '#bb9af7',
    cyan: p.info,
    white: p.text,
    brightBlack: p.dim,
    brightRed: p.error,
    brightGreen: p.prompt,
    brightYellow: p.warn,
    brightBlue: p.info,
    brightMagenta: '#c792ea',
    brightCyan: p.info,
    brightWhite: '#ffffff',
  }
}

// ─── TabBar ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    flex: 1,
    minHeight: 0,
    background: '#080810',
    overflow: 'hidden',
    fontFamily: FONT_FAMILY,
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    height: TAB_BAR_HEIGHT,
    minHeight: TAB_BAR_HEIGHT,
    background: '#0d0d1a',
    borderBottom: '1px solid #1a1a2c',
    overflowX: 'auto',
    overflowY: 'hidden',
    userSelect: 'none',
    flexShrink: 0,
    scrollbarWidth: 'none',
  },
  tabBarInner: {
    display: 'flex',
    alignItems: 'stretch',
    height: '100%',
  },
  tab: (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 10px 0 12px',
    height: '100%',
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    borderRight: '1px solid #1a1a2c',
    background: active ? '#080810' : 'transparent',
    color: active ? '#c0c8d8' : '#5a5a7a',
    borderBottom: active ? '2px solid #10b981' : '2px solid transparent',
    transition: 'background 0.1s, color 0.1s',
    letterSpacing: '0.02em',
  }),
  tabClose: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    height: 14,
    borderRadius: 2,
    fontSize: 12,
    lineHeight: 1,
    color: '#5a5a7a',
    cursor: 'pointer',
    flexShrink: 0,
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: '100%',
    background: 'transparent',
    border: 'none',
    color: '#5a5a7a',
    fontSize: 18,
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },
  termWrapper: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
    background: '#080810',
  },
  termContainer: (visible: boolean): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    padding: '4px 0 0 4px',
    visibility: visible ? 'visible' : 'hidden',
    pointerEvents: visible ? 'auto' : 'none',
  }),
  noElectron: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 0,
    gap: 12,
    color: '#5a5a7a',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
  },
}

// ─── Main component ───────────────────────────────────────────────────────────

const XTermPanel: React.FC<XTermPanelProps> = ({
  cwd,
  palette,
  onCwdChange,
}) => {
  const pal = useMemo(() => ({ ...DEFAULT_PALETTE, ...palette }), [palette])
  const xtheme = useMemo(() => paletteToXterm(pal), [pal])

  // Map of tabId -> TermTab
  const tabsRef = useRef<Map<string, TermTab>>(new Map())
  const [tabList, setTabList] = useState<string[]>([]) // ordered list of IDs
  const [activeId, setActiveId] = useState<string | null>(null)

  // Global PTY data listener (registered once)
  const dataListenerRef = useRef<((ev: any, id: string, data: string) => void) | null>(null)

  // Resize observer on the wrapper
  const wrapperRef = useRef<HTMLDivElement>(null)

  // ─── Check for Electron API ───────────────────────────────────────────────
  const hasElectron = typeof window !== 'undefined' && !!window.electronAPI?.pty

  // ─── PTY data handler ─────────────────────────────────────────────────────
  const handlePtyData = useCallback((id: string, data: string) => {
    const tab = tabsRef.current.get(id)
    if (tab?.terminal) {
      tab.terminal.write(data)
    }
  }, [])

  // ─── Register global PTY onData listener ─────────────────────────────────
  useEffect(() => {
    if (!hasElectron) return
    const listener = handlePtyData
    dataListenerRef.current = listener
    window.electronAPI.pty.onData(listener)
    return () => {
      window.electronAPI.pty.offData(listener)
    }
  }, [hasElectron, handlePtyData])

  // ─── Create a terminal instance ───────────────────────────────────────────
  const createTerminal = useCallback(
    (id: string, containerEl: HTMLDivElement) => {
      const theme = { ...xtheme }

      const term = new Terminal({
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: 1.4,
        letterSpacing: 0.5,
        theme,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 5000,
        allowTransparency: true,
        macOptionIsMeta: true,
        rightClickSelectsWord: true,
      })

      const fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()

      term.loadAddon(fitAddon)
      term.loadAddon(webLinksAddon)

      term.open(containerEl)

      // Try WebGL; fall back to canvas silently
      try {
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          webglAddon.dispose()
        })
        term.loadAddon(webglAddon)
      } catch {
        // WebGL not available; canvas renderer already active
      }

      fitAddon.fit()
      const { cols, rows } = term

      if (hasElectron) {
        const startCwd = cwd || window.electronAPI.homeDir || process.env.HOME || '/'
        window.electronAPI.pty.create(id, cols, rows, startCwd).then((res: any) => {
          if (res?.error) term.writeln(`\r\n\x1b[31mFailed to create PTY: ${res.error}\x1b[0m\r\n`)
        }).catch((err: Error) => {
          term.writeln(`\r\n\x1b[31mFailed to create PTY: ${err.message}\x1b[0m\r\n`)
        })
      }

      // Forward keyboard input to PTY
      term.onData((data: string) => {
        if (hasElectron) {
          window.electronAPI.pty.write(id, data).catch(() => {})
        }
      })

      // Detect `cd` changes by watching OSC 7 escape sequence (many shells emit it)
      term.parser.registerOscHandler(7, (data: string) => {
        try {
          const url = new URL(data)
          if (url.pathname && onCwdChange) {
            onCwdChange(decodeURIComponent(url.pathname))
          }
        } catch {
          // not a valid URL; ignore
        }
        return false // let default handler run too
      })

      return { term, fitAddon }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [xtheme, hasElectron, cwd, onCwdChange]
  )

  // ─── Add a new tab ────────────────────────────────────────────────────────
  const addTab = useCallback(() => {
    const id = nextTabId()
    const containerRef = React.createRef<HTMLDivElement>()
    const tab: TermTab = {
      id,
      label: `bash ${tabsRef.current.size + 1}`,
      terminal: null,
      fitAddon: null,
      containerRef,
      alive: true,
    }
    tabsRef.current.set(id, tab)
    setTabList((prev) => [...prev, id])
    setActiveId(id)
  }, [])

  // ─── Close a tab ─────────────────────────────────────────────────────────
  const closeTab = useCallback(
    (id: string) => {
      const tab = tabsRef.current.get(id)
      if (!tab) return

      // Kill PTY
      if (hasElectron && tab.alive) {
        window.electronAPI.pty.kill(id).catch(() => {})
      }

      // Dispose terminal
      try { tab.terminal?.dispose() } catch { /* ignore */ }

      tab.alive = false
      tabsRef.current.delete(id)

      setTabList((prev) => {
        const next = prev.filter((x) => x !== id)
        setActiveId((cur) => {
          if (cur === id) {
            // Pick adjacent tab
            const idx = prev.indexOf(id)
            return next[Math.min(idx, next.length - 1)] ?? null
          }
          return cur
        })
        return next
      })
    },
    [hasElectron]
  )

  // ─── Open first tab on mount ──────────────────────────────────────────────
  useEffect(() => {
    addTab()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Kill all PTYs on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      tabsRef.current.forEach((tab) => {
        if (hasElectron && tab.alive) {
          window.electronAPI.pty.kill(tab.id).catch(() => {})
        }
        try { tab.terminal?.dispose() } catch { /* ignore */ }
      })
      tabsRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasElectron])

  // ─── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!wrapperRef.current) return
    const ro = new ResizeObserver(() => {
      // Fit only the active tab
      if (!activeId) return
      const tab = tabsRef.current.get(activeId)
      if (!tab?.fitAddon || !tab.terminal) return
      try {
        tab.fitAddon.fit()
        const { cols, rows } = tab.terminal
        if (hasElectron && tab.alive) {
          window.electronAPI.pty.resize(activeId, cols, rows).catch(() => {})
        }
      } catch { /* ignore */ }
    })
    ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [activeId, hasElectron])

  // ─── Switch active tab and fit ────────────────────────────────────────────
  useEffect(() => {
    if (!activeId) return
    const tab = tabsRef.current.get(activeId)
    if (!tab?.terminal || !tab.fitAddon) return
    // Give DOM a tick to become visible
    requestAnimationFrame(() => {
      try {
        tab.fitAddon!.fit()
        tab.terminal!.focus()
      } catch { /* ignore */ }
    })
  }, [activeId])

  // ─── Theme update when palette changes ────────────────────────────────────
  useEffect(() => {
    tabsRef.current.forEach((tab) => {
      if (tab.terminal) {
        tab.terminal.options.theme = { ...xtheme }
      }
    })
  }, [xtheme])

  // ─── Render (no Electron) ─────────────────────────────────────────────────
  if (!hasElectron) {
    return (
      <div style={styles.root}>
        <div style={styles.noElectron}>
          <span style={{ fontSize: 32 }}>⚠</span>
          <span style={{ color: '#ffc410', fontWeight: 700 }}>Terminal unavailable</span>
          <span style={{ color: '#5a5a7a', fontSize: 11 }}>
            window.electronAPI.pty is not available in this context.
          </span>
          <span style={{ color: '#5a5a7a', fontSize: 11 }}>
            Run the app via Electron to use the integrated terminal.
          </span>
        </div>
      </div>
    )
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* Tab bar */}
      <div style={styles.tabBar}>
        <div style={styles.tabBarInner}>
          {tabList.map((id) => {
            const tab = tabsRef.current.get(id)
            const isActive = id === activeId
            return (
              <div
                key={id}
                style={styles.tab(isActive)}
                onClick={() => setActiveId(id)}
                title={tab?.label ?? id}
              >
                <span
                  style={{
                    color: isActive ? pal.prompt : '#5a5a7a',
                    fontSize: 9,
                    letterSpacing: 0,
                  }}
                >
                  ▶
                </span>
                <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tab?.label ?? id}
                </span>
                <span
                  style={styles.tabClose}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(id)
                  }}
                  title="Close terminal"
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.color = '#ff435a'
                    ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,67,90,0.12)'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.color = '#5a5a7a'
                    ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  ×
                </span>
              </div>
            )
          })}
        </div>
        <button
          style={styles.addButton}
          onClick={addTab}
          title="New terminal"
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.color = '#10b981'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.color = '#5a5a7a'
          }}
        >
          +
        </button>
      </div>

      {/* Terminal containers */}
      <div style={styles.termWrapper} ref={wrapperRef}>
        {tabList.map((id) => (
          <TermContainer
            key={id}
            id={id}
            visible={id === activeId}
            tabsRef={tabsRef}
            createTerminal={createTerminal}
          />
        ))}
        {tabList.length === 0 && (
          <div style={styles.noElectron}>
            <span style={{ color: '#3e3e5a' }}>No terminals open.</span>
            <button
              onClick={addTab}
              style={{
                background: 'transparent',
                border: '1px solid #1a1a2c',
                color: '#10b981',
                padding: '4px 14px',
                borderRadius: 2,
                fontFamily: FONT_FAMILY,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              + New terminal
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TermContainer ────────────────────────────────────────────────────────────
// Separate component so each tab gets its own DOM node and lifecycle.

interface TermContainerProps {
  id: string
  visible: boolean
  tabsRef: React.MutableRefObject<Map<string, TermTab>>
  createTerminal: (
    id: string,
    containerEl: HTMLDivElement
  ) => { term: Terminal; fitAddon: FitAddon }
}

const TermContainer: React.FC<TermContainerProps> = ({
  id,
  visible,
  tabsRef,
  createTerminal,
}) => {
  const divRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    if (!divRef.current) return

    const { term, fitAddon } = createTerminal(id, divRef.current)
    const tab = tabsRef.current.get(id)
    if (tab) {
      tab.terminal = term
      tab.fitAddon = fitAddon
    }
    initialized.current = true

    // Fit after a short delay to let the layout settle
    const t = setTimeout(() => {
      try { fitAddon.fit() } catch { /* ignore */ }
    }, 50)

    return () => {
      clearTimeout(t)
      // Disposal is handled by the parent closeTab / unmount logic
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={divRef}
      style={styles.termContainer(visible)}
    />
  )
}

export default XTermPanel
