import { useRef, useEffect, KeyboardEvent } from 'react'

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

function textColor(t: string) {
  if (isErr(t))  return '#ff5555'
  if (isWarn(t)) return '#ffc410'
  if (isOk(t))   return '#28f1c3'
  if (t === 'return')   return '#bb9af7'
  if (t === 'info')     return '#89ddff'
  if (t === 'repl-in')  return '#28f1c3'
  return '#7a90a8'
}

function fmtTs(ms?: number) {
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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  const errCount  = logs.filter(e => isErr(e.type)).length
  const warnCount = logs.filter(e => isWarn(e.type)).length

  let ln = 0

  return (
    <div className="cp-root">

      {/* toolbar */}
      <div className="cp-toolbar">
        <span className="cp-toolbar-label">OUTPUT</span>
        {errCount  > 0 && <span className="cp-err-badge">{errCount} err</span>}
        {warnCount > 0 && <span className="cp-warn-badge">{warnCount} warn</span>}
        <div className="cp-spacer" />
        {logs.length > 0 && (
          <span className="cp-lines-count">
            {logs.filter(e => !isSep(e.type) && !isHead(e.type)).length} lines
          </span>
        )}
        <button type="button" className="cp-clear-btn" onMouseDown={onClear}>clear</button>
      </div>

      {/* log area */}
      <div className="cp-body" onClick={() => inputRef.current?.focus()}>
        {logs.length === 0 && <div className="cp-empty">NO OUTPUT</div>}

        {logs.map((entry, i) => {
          if (isSep(entry.type)) return (
            <div key={i} className="cp-sep">
              <div className="cp-sep-line" />
              <span className="cp-sep-label">{entry.val}</span>
              <div className="cp-sep-line" />
            </div>
          )

          if (isHead(entry.type)) return (
            <div key={i} className="cp-head">
              <span className="cp-head-label">{entry.val}</span>
              {entry.ts && <span className="cp-head-ts">{fmtTs(entry.ts)}</span>}
            </div>
          )

          ln++
          const err = isErr(entry.type)

          return (
            <div key={i} className={`cp-row${err ? ' is-err' : ''}`}>
              <div className="cp-ln">{ln}</div>
              <div className="cp-text" style={{ color: textColor(entry.type) }}>{entry.val}</div>
              {entry.ts && <div className="cp-ts">{fmtTs(entry.ts)}</div>}
            </div>
          )
        })}

        <div ref={endRef} style={{ height: 2 }} />
      </div>

      {/* stdin */}
      {showStdin && (
        <div className="cp-stdin">
          <span className="cp-stdin-label">stdin</span>
          <input
            value={compileStdin}
            onChange={e => setCompileStdin(e.target.value)}
            className="cp-stdin-input"
            placeholder={`pipe to ${activeLang}...`}
            spellCheck={false}
          />
          {compileStdin && (
            <button type="button" className="cp-stdin-clear" onMouseDown={() => setCompileStdin('')}>
              ×
            </button>
          )}
        </div>
      )}

      {/* repl */}
      <div className="cp-repl">
        <span className="cp-repl-prompt">&gt;</span>
        <input
          ref={inputRef}
          value={replInput}
          onChange={e => setReplInput(e.target.value)}
          onKeyDown={handleReplKey}
          className="cp-repl-input"
          placeholder="eval expression..."
          spellCheck={false}
        />
      </div>
    </div>
  )
}
