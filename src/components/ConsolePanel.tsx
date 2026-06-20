import { useRef, useEffect, useState, KeyboardEvent } from 'react'

// ── Types ──────────────────────────────────────────────────────

export interface LogEntry {
  type: string
  val: string
  ts?: number
  nodeId?: string
}

interface Props {
  logs: LogEntry[]
  onClear: () => void
  compileStdin: string
  setCompileStdin: (v: string) => void
  replInput: string
  setReplInput: (v: string) => void
  handleReplKey: (e: KeyboardEvent<HTMLInputElement>) => void
  showStdin: boolean
  activeLang: string
}

// ── Entry classification ───────────────────────────────────────

function isSep(type: string)    { return type === 'compile-sep' || type === 'run-sep' }
function isHead(type: string)   { return type === 'header' }
function isErr(type: string)    { return ['error','compile-err','run-err','error-footer'].includes(type) }
function isWarn(type: string)   { return type === 'warn' || type === 'compile-warn' }
function isOk(type: string)     { return type === 'compile-ok' || type === 'footer' }
function isReturn(type: string) { return type === 'return' }
function isInfo(type: string)   { return type === 'info' }
function isReplIn(type: string) { return type === 'repl-in' }

function entryColor(type: string): string {
  if (isErr(type))    return '#ff3d5e'
  if (isWarn(type))   return '#ffaa00'
  if (isOk(type))     return '#00e566'
  if (isReturn(type)) return '#c084fc'
  if (isInfo(type))   return '#38bdf8'
  if (isReplIn(type)) return '#00e566'
  return '#a8b8cc'
}

function entryIcon(type: string): string {
  if (isErr(type))    return '✕'
  if (isWarn(type))   return '⚠'
  if (isOk(type))     return '✓'
  if (isReturn(type)) return '←'
  if (isInfo(type))   return 'ℹ'
  if (isReplIn(type)) return '›'
  return ''
}

function fmt(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// ── ConsolePanel ───────────────────────────────────────────────

export function ConsolePanel({
  logs, onClear,
  compileStdin, setCompileStdin,
  replInput, setReplInput, handleReplKey,
  showStdin, activeLang,
}: Props) {
  const endRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [hoverRow, setHoverRow] = useState<number | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const errCount  = logs.filter(e => isErr(e.type)).length
  const warnCount = logs.filter(e => isWarn(e.type)).length
  const hasOutput = logs.length > 0

  let lineNum = 0

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      background: '#04070e', fontFamily: "'JetBrains Mono', monospace",
    }}>

      {/* ── Keyframes injected once ── */}
      <style>{`
        @keyframes cIn { from { opacity:0; transform:translateX(-6px) } to { opacity:1; transform:translateX(0) } }
        @keyframes cPop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.5)} }
        @keyframes cGlow { 0%,100%{box-shadow:inset 2px 0 0 #ff3d5e}
          50%{box-shadow:inset 2px 0 0 #ff6080,0 0 12px rgba(255,61,94,.18)} }
        @keyframes cBlink { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .c-entry { animation: cIn .1s ease-out both }
        .c-err-row { animation: cGlow 2.4s ease-in-out infinite }
      `}</style>

      {/* ════════ TOOLBAR ════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
        height: 30, flexShrink: 0,
        background: 'linear-gradient(90deg,#040b14 0%,#030810 100%)',
        borderBottom: '1px solid rgba(0,229,102,.07)',
        userSelect: 'none',
      }}>
        {/* Status dot */}
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: hasOutput ? '#00e566' : '#0e2040',
          boxShadow: hasOutput ? '0 0 8px rgba(0,229,102,.7)' : 'none',
          transition: 'all .4s',
        }}/>

        {/* Label */}
        <span style={{
          fontFamily: "'Share Tech Mono',monospace",
          fontSize: 9.5, letterSpacing: '.18em', color: '#1e3a50', fontWeight: 700,
        }}>CONSOLE</span>

        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,.05)', margin: '0 2px' }}/>

        {/* Badges */}
        {errCount > 0 && (
          <span style={{
            fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
            color: '#ff3d5e', background: 'rgba(255,61,94,.10)',
            padding: '1px 7px 1px 5px', borderRadius: 2,
            border: '1px solid rgba(255,61,94,.22)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 8 }}>✕</span>{errCount}
          </span>
        )}
        {warnCount > 0 && (
          <span style={{
            fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
            color: '#ffaa00', background: 'rgba(255,170,0,.08)',
            padding: '1px 7px 1px 5px', borderRadius: 2,
            border: '1px solid rgba(255,170,0,.18)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 8 }}>⚠</span>{warnCount}
          </span>
        )}

        <div style={{ flex: 1 }}/>

        {/* Line count */}
        {hasOutput && (
          <span style={{ fontSize: 9, color: '#0e2030', fontVariantNumeric: 'tabular-nums' }}>
            {logs.filter(e => !isSep(e.type) && !isHead(e.type)).length} lines
          </span>
        )}

        {/* Clear button */}
        <button
          onMouseDown={onClear}
          title="Clear output"
          style={{
            background: 'transparent', border: '1px solid transparent', cursor: 'pointer',
            padding: '1px 6px', color: '#1e3050', fontSize: 11, lineHeight: 1,
            borderRadius: 3, transition: 'all .15s', display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#ff3d5e'
            e.currentTarget.style.borderColor = 'rgba(255,61,94,.25)'
            e.currentTarget.style.background = 'rgba(255,61,94,.06)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = '#1e3050'
            e.currentTarget.style.borderColor = 'transparent'
            e.currentTarget.style.background = 'transparent'
          }}
        >⊘</button>
      </div>

      {/* ════════ LOG AREA ════════ */}
      <div
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          fontSize: 11.5, lineHeight: 1.7,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(0,229,102,.1) transparent',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Empty state */}
        {logs.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 0', gap: 10, opacity: 0.25,
          }}>
            <div style={{
              fontSize: 32, color: '#1e3a50',
              fontFamily: "'Share Tech Mono',monospace", lineHeight: 1,
            }}>▶</div>
            <span style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: 9, letterSpacing: '.15em', color: '#1e3a50',
            }}>RUN A FILE TO SEE OUTPUT</span>
          </div>
        )}

        {/* Entries */}
        {logs.map((entry, i) => {
          // ── Separator ──
          if (isSep(entry.type)) return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center',
              padding: '6px 12px 4px 40px', margin: '2px 0',
            }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,229,102,.06)' }}/>
              <span style={{
                padding: '0 10px', fontSize: 9,
                fontFamily: "'Share Tech Mono',monospace",
                letterSpacing: '.1em', color: '#0e2840', whiteSpace: 'nowrap',
              }}>{entry.val}</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,229,102,.06)' }}/>
            </div>
          )

          // ── Section header ──
          if (isHead(entry.type)) return (
            <div key={i} className="c-entry" style={{
              display: 'flex', alignItems: 'center',
              padding: '7px 12px 6px',
              background: 'rgba(0,12,24,.6)',
              borderTop: i > 0 ? '1px solid rgba(0,229,102,.05)' : 'none',
              borderBottom: '1px solid rgba(0,229,102,.05)',
              marginTop: i > 0 ? 6 : 0, gap: 8,
            }}>
              <span style={{
                color: '#00a840', fontSize: 9,
                fontFamily: "'Share Tech Mono',monospace",
              }}>▸</span>
              <span style={{
                fontFamily: "'Share Tech Mono',monospace",
                fontSize: 9.5, letterSpacing: '.08em', color: '#3a6050', flex: 1,
              }}>{entry.val}</span>
              {entry.ts && (
                <span style={{
                  fontSize: 9, color: '#0e2030',
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '.04em',
                }}>{fmt(entry.ts)}</span>
              )}
            </div>
          )

          // ── Regular entry ──
          const err   = isErr(entry.type)
          const warn  = isWarn(entry.type)
          const color = entryColor(entry.type)
          const icon  = entryIcon(entry.type)
          lineNum++
          const num  = lineNum
          const hov  = hoverRow === i

          return (
            <div key={i}
              className={`c-entry${err ? ' c-err-row' : ''}`}
              style={{
                display: 'flex', alignItems: 'flex-start',
                borderLeft: err  ? '2px solid rgba(255,61,94,.55)'
                           : warn ? '2px solid rgba(255,170,0,.35)'
                           : '2px solid transparent',
                background: err ? 'rgba(255,30,50,.04)'
                           : hov ? 'rgba(255,255,255,.015)'
                           : 'transparent',
                transition: 'background .08s',
                cursor: 'default',
              }}
              onMouseEnter={() => setHoverRow(i)}
              onMouseLeave={() => setHoverRow(null)}
            >
              {/* Line number gutter */}
              <div style={{
                width: 36, flexShrink: 0, textAlign: 'right', paddingRight: 8,
                fontSize: 9.5, color: hov ? '#1e3a50' : '#0d1e2e',
                lineHeight: '1.7em', userSelect: 'none',
                fontVariantNumeric: 'tabular-nums', transition: 'color .1s',
              }}>
                {num}
              </div>
              {/* Icon column */}
              <div style={{
                width: 16, flexShrink: 0, textAlign: 'center',
                fontSize: 9.5, color, lineHeight: '1.7em', opacity: icon ? 0.85 : 0,
              }}>
                {icon}
              </div>
              {/* Content */}
              <div style={{
                flex: 1, padding: '0 12px 0 4px',
                color, lineHeight: '1.7em',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                fontSize: 11.5,
              }}>
                {entry.val}
              </div>
              {/* Timestamp (shown on hover) */}
              {entry.ts && hov && (
                <div style={{
                  fontSize: 9, color: '#0e2030', lineHeight: '1.7em',
                  paddingRight: 10, flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {fmt(entry.ts)}
                </div>
              )}
            </div>
          )
        })}

        <div ref={endRef} style={{ height: 4 }}/>
      </div>

      {/* ════════ STDIN (compiled languages only) ════════ */}
      {showStdin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
          flexShrink: 0, borderTop: '1px solid rgba(255,100,60,.10)',
          background: 'rgba(255,60,30,.025)',
        }}>
          <span style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: 9, letterSpacing: '.12em', color: '#b03020',
            flexShrink: 0, textTransform: 'uppercase',
          }}>STDIN</span>
          <span style={{ color: 'rgba(180,80,60,.5)', fontSize: 13, lineHeight: 1 }}>›</span>
          <input
            value={compileStdin}
            onChange={e => setCompileStdin(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5,
              color: '#c0c8d8', caretColor: '#ff6050',
            }}
            placeholder={`pipe to ${activeLang.toUpperCase()}…`}
            spellCheck={false}
          />
          {compileStdin && (
            <button
              onMouseDown={() => setCompileStdin('')}
              style={{
                fontSize: 9, color: '#2a3a4a', cursor: 'pointer',
                background: 'none', border: 'none', padding: '0 2px',
              }}
            >✕</button>
          )}
        </div>
      )}

      {/* ════════ REPL ════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        flexShrink: 0, borderTop: '1px solid rgba(0,229,102,.07)',
        background: 'rgba(0,229,102,.012)',
      }}>
        <span style={{
          fontSize: 13, color: '#00e566', flexShrink: 0, lineHeight: 1,
          textShadow: '0 0 10px rgba(0,229,102,.65)',
          fontFamily: "'JetBrains Mono',monospace",
        }}>❯</span>
        <input
          ref={inputRef}
          value={replInput}
          onChange={e => setReplInput(e.target.value)}
          onKeyDown={handleReplKey}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5,
            color: '#c8d2e0', caretColor: '#00e566',
          }}
          placeholder="eval JS expression…"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
