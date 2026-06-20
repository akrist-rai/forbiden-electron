import { useRef, useEffect, useState, KeyboardEvent } from 'react'

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

function isErr(t: string)  { return t === 'error' || t === 'compile-err' || t === 'run-err' || t === 'error-footer' }
function isWarn(t: string) { return t === 'warn' || t === 'compile-warn' }
function isOk(t: string)   { return t === 'compile-ok' || t === 'footer' }
function isSep(t: string)  { return t === 'compile-sep' || t === 'run-sep' }
function isHead(t: string) { return t === 'header' }

function color(t: string) {
  if (isErr(t))  return '#e05555'
  if (isWarn(t)) return '#c8922a'
  if (isOk(t))   return '#3d9970'
  if (t === 'return') return '#8b6fbf'
  if (t === 'info')   return '#3a7fad'
  if (t === 'repl-in') return '#3d9970'
  return '#8a9ab0'
}

function ts(ms?: number) {
  if (!ms) return ''
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

export function ConsolePanel({
  logs, onClear,
  compileStdin, setCompileStdin,
  replInput, setReplInput, handleReplKey,
  showStdin, activeLang,
}: Props) {
  const endRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [hov, setHov] = useState<number | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  const errCount  = logs.filter(e => isErr(e.type)).length
  const warnCount = logs.filter(e => isWarn(e.type)).length

  let ln = 0

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#080c12', fontFamily: "'JetBrains Mono', monospace",
      overflow: 'hidden',
    }}>

      {/* toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
        height: 28, flexShrink: 0, borderBottom: '1px solid #111820',
        background: '#06090f',
      }}>
        <span style={{ fontSize: 9, letterSpacing: '.15em', color: '#1e2d40', fontWeight: 700 }}>
          OUTPUT
        </span>

        {errCount > 0 && (
          <span style={{ fontSize: 9, color: '#7a3535', letterSpacing: '.04em' }}>
            {errCount} err
          </span>
        )}
        {warnCount > 0 && (
          <span style={{ fontSize: 9, color: '#6b4f1a', letterSpacing: '.04em' }}>
            {warnCount} warn
          </span>
        )}

        <div style={{ flex: 1 }} />

        {logs.length > 0 && (
          <span style={{ fontSize: 9, color: '#1a2838' }}>
            {logs.filter(e => !isSep(e.type) && !isHead(e.type)).length} lines
          </span>
        )}

        <button
          type="button"
          onMouseDown={onClear}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 10, color: '#1e2d40', padding: '0 2px', lineHeight: 1,
            transition: 'color .12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#c04040')}
          onMouseLeave={e => (e.currentTarget.style.color = '#1e2d40')}
        >
          clear
        </button>
      </div>

      {/* log area */}
      <div
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          scrollbarWidth: 'thin', scrollbarColor: '#111820 transparent',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {logs.length === 0 && (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            fontSize: 9.5, letterSpacing: '.12em', color: '#0e1820',
          }}>
            NO OUTPUT
          </div>
        )}

        {logs.map((entry, i) => {
          if (isSep(entry.type)) return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 12px 3px 40px',
            }}>
              <div style={{ flex: 1, height: 1, background: '#0e1820' }} />
              <span style={{ fontSize: 8.5, color: '#0e1820', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
                {entry.val}
              </span>
              <div style={{ flex: 1, height: 1, background: '#0e1820' }} />
            </div>
          )

          if (isHead(entry.type)) return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 12px', background: '#060910',
              borderTop: i > 0 ? '1px solid #0e1820' : 'none',
              borderBottom: '1px solid #0e1820',
              marginTop: i > 0 ? 4 : 0,
            }}>
              <span style={{ fontSize: 9, letterSpacing: '.06em', color: '#253545' }}>
                {entry.val}
              </span>
              {entry.ts && (
                <span style={{ fontSize: 8.5, color: '#0e1820' }}>{ts(entry.ts)}</span>
              )}
            </div>
          )

          const c = color(entry.type)
          const err = isErr(entry.type)
          const isHov = hov === i
          ln++

          return (
            <div key={i}
              style={{
                display: 'flex', alignItems: 'flex-start',
                borderLeft: err ? '1px solid #3a1818' : '1px solid transparent',
                background: err ? 'rgba(80,20,20,.08)' : isHov ? 'rgba(255,255,255,.012)' : 'transparent',
                transition: 'background .06s',
              }}
              onMouseEnter={() => setHov(i)}
              onMouseLeave={() => setHov(null)}
            >
              {/* line number */}
              <div style={{
                width: 34, flexShrink: 0, textAlign: 'right', paddingRight: 8,
                fontSize: 9, color: isHov ? '#1e2d40' : '#0c151e',
                lineHeight: '1.65em', userSelect: 'none', paddingTop: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {ln}
              </div>
              {/* text */}
              <div style={{
                flex: 1, padding: '0 12px 0 2px', fontSize: 11,
                color: c, lineHeight: '1.65em',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {entry.val}
              </div>
              {/* timestamp on hover */}
              {entry.ts && isHov && (
                <div style={{
                  fontSize: 8.5, color: '#0e1820', lineHeight: '1.65em',
                  paddingRight: 8, flexShrink: 0, paddingTop: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {ts(entry.ts)}
                </div>
              )}
            </div>
          )
        })}

        <div ref={endRef} style={{ height: 2 }} />
      </div>

      {/* stdin */}
      {showStdin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
          flexShrink: 0, borderTop: '1px solid #0e1820',
          background: '#060910',
        }}>
          <span style={{ fontSize: 9, color: '#2a3a4a', letterSpacing: '.1em', flexShrink: 0 }}>
            stdin
          </span>
          <input
            value={compileStdin}
            onChange={e => setCompileStdin(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 11, color: '#8a9ab0', caretColor: '#4a6a80',
              fontFamily: "'JetBrains Mono', monospace",
            }}
            placeholder={`pipe to ${activeLang}...`}
            spellCheck={false}
          />
          {compileStdin && (
            <button type="button" onMouseDown={() => setCompileStdin('')}
              style={{ fontSize: 9, color: '#1e2d40', cursor: 'pointer', background: 'none', border: 'none' }}>
              x
            </button>
          )}
        </div>
      )}

      {/* repl */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
        flexShrink: 0, borderTop: '1px solid #0e1820',
        background: '#06090f',
      }}>
        <span style={{ fontSize: 10, color: '#1e3a28', fontFamily: "'JetBrains Mono',monospace" }}>
          &gt;
        </span>
        <input
          ref={inputRef}
          value={replInput}
          onChange={e => setReplInput(e.target.value)}
          onKeyDown={handleReplKey}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: 11, color: '#8a9ab0', caretColor: '#3d6050',
            fontFamily: "'JetBrains Mono', monospace",
          }}
          placeholder="eval expression..."
          spellCheck={false}
        />
      </div>
    </div>
  )
}
