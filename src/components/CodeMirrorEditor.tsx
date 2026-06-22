// @ts-nocheck
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, Decoration, WidgetType } from '@codemirror/view'
import { EditorState, StateEffect, StateField, Compartment } from '@codemirror/state'
import { defaultKeymap, indentWithTab, toggleComment, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, openSearchPanel, closeSearchPanel, search } from '@codemirror/search'
import { completionKeymap, autocompletion, closeBrackets } from '@codemirror/autocomplete'
import { foldGutter, indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { cpp } from '@codemirror/lang-cpp'
import { go } from '@codemirror/lang-go'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { api } from '../lib/api'
import { PALETTES as GLOBAL_PALETTES, PALETTE_LIGHT_IDS } from '../constants/palettes'

// ══════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════

interface Palette {
  id: string
  name: string
  bg: string
  base: string
  lineNum: string
  activeLine: string
  kw: string
  str: string
  cmt: string
  num: string
  fn: string
  bi: string
  op: string
  swatches: string[]
}

interface Node {
  id: string
  label: string
  code: string
  type: string
  modified: boolean
}

interface CodeMirrorEditorProps {
  node: Node
  onChange: (code: string) => void
  onSave?: () => void
  externalPalette?: Palette
  onPaletteChange?: (palette: Palette) => void
  compact?: boolean
  minHeight?: string
  jumpToLine?: number
  onCursorChange?: (line: number, col: number) => void
  aiProvider?: string
  aiKey?: string
  aiModel?: string
}

// ══════════════════════════════════════════════════════════════
//  AI GHOST TEXT — module-level (shared across instances)
// ══════════════════════════════════════════════════════════════

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) { super() }
  toDOM() {
    const el = document.createElement('span')
    el.textContent = this.text.split('\n')[0]
    el.setAttribute('aria-hidden', 'true')
    Object.assign(el.style, {
      color: 'rgba(200,200,220,.28)',
      fontStyle: 'italic',
      pointerEvents: 'none',
      userSelect: 'none',
      whiteSpace: 'pre',
    })
    return el
  }
  ignoreEvent() { return true }
  eq(other: GhostTextWidget) { return other.text === this.text }
}

const setGhostText = StateEffect.define<{ pos: number; text: string } | null>()

const ghostTextField = StateField.define<{ pos: number; text: string } | null>({
  create: () => null,
  update(val, tr) {
    for (const e of tr.effects) {
      if (e.is(setGhostText)) return e.value
    }
    if (tr.docChanged || tr.selectionSet) return null
    return val
  },
  provide: f => EditorView.decorations.from(f, val => {
    if (!val) return Decoration.none
    return Decoration.set([
      Decoration.widget({ widget: new GhostTextWidget(val.text), side: 1 }).range(val.pos)
    ])
  }),
})

// ══════════════════════════════════════════════════════════════
//  PALETTES  (unified with constants/palettes.ts)
// ══════════════════════════════════════════════════════════════

const PALETTES: Palette[] = GLOBAL_PALETTES
const LIGHT_IDS = [...PALETTE_LIGHT_IDS]

// ══════════════════════════════════════════════════════════════
//  ICONS
// ══════════════════════════════════════════════════════════════

const ICopy   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
const IWrap   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
const IFormat = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
const IFind   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function getLanguageExtension(label: string) {
  const ext = (label || '').split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'jsx':
      return javascript({ jsx: true })
    case 'ts':
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    case 'py':
      return python()
    case 'c':
    case 'h':
    case 'cpp':
    case 'hpp':
    case 'cc':
    case 'cxx':
      return cpp()
    case 'go':
      return go()
    case 'md':
    case 'mdx':
      return markdown()
    case 'json':
      return json()
    case 'css':
      return css()
    case 'html':
      return html()
    default:
      return null
  }
}

function getLangLabel(label: string) {
  const ext = (label || '').split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    js: 'JS', mjs: 'JS', jsx: 'JSX',
    ts: 'TS', tsx: 'TSX',
    py: 'PY',
    c: 'C', h: 'C',
    cpp: 'C++', hpp: 'C++', cc: 'C++', cxx: 'C++',
    go: 'GO',
    md: 'MD', mdx: 'MDX',
    json: 'JSON',
    css: 'CSS',
    html: 'HTML',
  }
  return map[ext] || 'TXT'
}

function getLangColor(label: string) {
  const ext = (label || '').split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    js: '#f2c12e', mjs: '#f2c12e', jsx: '#f2c12e',
    ts: '#4285f4', tsx: '#4285f4',
    py: '#28f1c3',
    c: '#ff8080', h: '#ff8080',
    cpp: '#ff8080', hpp: '#ff8080', cc: '#ff8080', cxx: '#ff8080',
    go: '#89ddff',
    md: '#c792ea', mdx: '#c792ea',
    json: '#ffc410',
    css: '#89b4fa',
    html: '#e06c75',
  }
  return map[ext] || '#888888'
}

function buildTheme(palette: Palette) {
  return EditorView.theme({
    '&': {
      color: palette.base,
      backgroundColor: palette.bg,
      height: '100%',
    },
    '.cm-content': {
      padding: '20px 14px',
      caretColor: palette.kw,
    },
    '.cm-gutters': {
      backgroundColor: palette.bg,
      color: palette.lineNum,
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: palette.activeLine,
    },
    '.cm-activeLine': {
      backgroundColor: palette.activeLine,
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: palette.kw + '33',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: palette.kw + '44',
    },
    '.cm-cursor': {
      borderLeftColor: palette.kw,
    },
    '.cm-scroller': {
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '15px',
      lineHeight: '1.65',
      overflow: 'auto',
    },
    '.cm-search': {
      backgroundColor: palette.bg,
      color: palette.base,
      borderTop: `1px solid ${palette.lineNum}44`,
    },
    '.cm-search input': {
      backgroundColor: palette.bg,
      color: palette.base,
      border: `1px solid ${palette.lineNum}88`,
      outline: 'none',
    },
    '.cm-button': {
      backgroundColor: 'transparent',
      border: `1px solid ${palette.kw}55`,
      color: palette.kw,
      cursor: 'pointer',
    },
    '.cm-tooltip': {
      backgroundColor: palette.bg,
      border: `1px solid ${palette.kw}44`,
      color: palette.base,
      borderRadius: '6px',
      boxShadow: `0 8px 32px rgba(0,0,0,.6), 0 0 0 1px ${palette.kw}18`,
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete': {
      backgroundColor: palette.bg + 'f0',
      backdropFilter: 'blur(12px)',
      padding: '4px 0',
      minWidth: '260px',
      maxWidth: '420px',
    },
    '.cm-tooltip-autocomplete ul': {
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '13px',
    },
    '.cm-tooltip-autocomplete ul li': {
      padding: '4px 12px 4px 8px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      lineHeight: '1.4',
      color: palette.base,
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: palette.kw + '22',
      color: palette.kw,
    },
    '.cm-tooltip-autocomplete ul li:hover': {
      backgroundColor: palette.kw + '16',
    },
    '.cm-completionIcon': {
      fontSize: '10px',
      width: '16px',
      opacity: '.75',
      flexShrink: '0',
    },
    '.cm-completionIcon-function, .cm-completionIcon-method': { color: palette.fn },
    '.cm-completionIcon-keyword': { color: palette.kw },
    '.cm-completionIcon-variable': { color: palette.base },
    '.cm-completionIcon-class, .cm-completionIcon-type, .cm-completionIcon-interface': { color: palette.bi },
    '.cm-completionIcon-constant': { color: palette.num },
    '.cm-completionIcon-property': { color: palette.str },
    '.cm-completionIcon-text': { color: palette.cmt },
    '.cm-completionLabel': {
      flex: '1',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    '.cm-completionMatchedText': {
      color: palette.kw,
      fontWeight: '700',
      textDecoration: 'none',
    },
    '.cm-completionDetail': {
      color: palette.cmt,
      fontSize: '11px',
      marginLeft: 'auto',
      paddingLeft: '8px',
      flexShrink: '0',
    },
    '.cm-foldGutter': {
      color: palette.lineNum,
    },
    '.cm-foldPlaceholder': {
      backgroundColor: palette.kw + '22',
      color: palette.kw,
      border: 'none',
    },
    '.cm-line': {
      paddingLeft: '4px',
    },
  })
}

function buildHighlight(palette: Palette) {
  return syntaxHighlighting(HighlightStyle.define([
    // Keywords — control flow, declarations
    { tag: t.keyword,                                          color: palette.kw, fontWeight: '600' },
    { tag: [t.controlKeyword, t.moduleKeyword],                color: palette.kw, fontWeight: '600' },
    { tag: t.definitionKeyword,                               color: palette.kw, fontStyle: 'italic' },
    // Strings & template literals
    { tag: [t.string, t.special(t.string), t.regexp],         color: palette.str },
    { tag: t.escape,                                          color: palette.bi },
    // Comments
    { tag: t.comment,                                         color: palette.cmt, fontStyle: 'italic' },
    { tag: t.lineComment,                                     color: palette.cmt, fontStyle: 'italic' },
    { tag: t.blockComment,                                    color: palette.cmt, fontStyle: 'italic' },
    { tag: t.docComment,                                      color: palette.cmt, fontStyle: 'italic', fontWeight: '500' },
    // Numbers, booleans, null
    { tag: [t.number, t.float, t.integer],                    color: palette.num },
    { tag: t.bool,                                            color: palette.num, fontWeight: '600' },
    { tag: t.null,                                            color: palette.num, fontWeight: '600' },
    // Functions & methods
    { tag: [t.function(t.name), t.function(t.variableName)],  color: palette.fn, fontWeight: '500' },
    { tag: [t.definition(t.function(t.name)), t.definition(t.function(t.variableName))], color: palette.fn, fontWeight: '600' },
    { tag: t.function(t.propertyName),                        color: palette.fn },
    // Variables
    { tag: t.variableName,                                    color: palette.base },
    { tag: t.definition(t.variableName),                      color: palette.base, fontWeight: '500' },
    { tag: t.local(t.variableName),                           color: palette.base },
    { tag: t.special(t.variableName),                         color: palette.bi },
    // Types & classes
    { tag: [t.typeName, t.className],                         color: palette.bi, fontWeight: '500' },
    { tag: t.namespace,                                       color: palette.bi },
    { tag: t.typeOperator,                                    color: palette.kw },
    { tag: t.definition(t.typeName),                          color: palette.bi, fontWeight: '600' },
    // Properties
    { tag: t.propertyName,                                    color: palette.str },
    { tag: t.definition(t.propertyName),                      color: palette.str, fontWeight: '500' },
    // Operators & punctuation
    { tag: t.operator,                                        color: palette.op },
    { tag: t.arithmeticOperator,                              color: palette.op },
    { tag: t.logicOperator,                                   color: palette.kw },
    { tag: t.compareOperator,                                 color: palette.op },
    { tag: [t.punctuation, t.bracket],                        color: palette.op + 'bb' },
    { tag: t.derefOperator,                                   color: palette.op },
    { tag: t.separator,                                       color: palette.op + '88' },
    // HTML / JSX tags
    { tag: t.tagName,                                         color: palette.kw },
    { tag: t.angleBracket,                                    color: palette.op },
    { tag: t.attributeName,                                   color: palette.bi },
    { tag: t.attributeValue,                                  color: palette.str },
    // Markdown
    { tag: t.heading,                                         color: palette.kw, fontWeight: 'bold' },
    { tag: t.heading1,                                        color: palette.kw, fontWeight: 'bold', fontSize: '1.15em' },
    { tag: t.heading2,                                        color: palette.kw, fontWeight: 'bold', fontSize: '1.08em' },
    { tag: t.heading3,                                        color: palette.fn, fontWeight: 'bold' },
    { tag: t.emphasis,                                        fontStyle: 'italic' },
    { tag: t.strong,                                          fontWeight: 'bold' },
    { tag: t.strikethrough,                                   textDecoration: 'line-through' },
    { tag: [t.link, t.url],                                   color: palette.bi, textDecoration: 'underline' },
    { tag: t.monospace,                                       fontFamily: "monospace", color: palette.str },
    { tag: t.content,                                         color: palette.base },
    // Decorators / annotations
    { tag: t.annotation,                                      color: palette.bi, fontWeight: '500' },
    { tag: t.meta,                                            color: palette.cmt },
    // Self / this
    { tag: t.self,                                            color: palette.kw, fontWeight: '600' },
    // Constants
    { tag: t.constant(t.name),                                color: palette.num, fontWeight: '500' },
    { tag: t.constant(t.variableName),                        color: palette.num },
    // Diff colors
    { tag: t.inserted,                                        color: palette.fn },
    { tag: t.deleted,                                         color: palette.kw },
    { tag: t.changed,                                         color: palette.num },
    // Labels
    { tag: t.labelName,                                       color: palette.bi, fontStyle: 'italic' },
    // Invalid
    { tag: t.invalid,                                         color: palette.kw, textDecoration: 'underline wavy' },
  ]))
}

// ══════════════════════════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════════════════════════

export default function CodeMirrorEditor({ node, onChange, onSave, externalPalette, onPaletteChange, compact = false, minHeight, jumpToLine, onCursorChange, aiProvider, aiKey, aiModel }: CodeMirrorEditorProps) {
  const [palette, setPalette] = useState<Palette>(PALETTES[0])
  const [showPaletteMenu, setShowPaletteMenu] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [wordWrap, setWordWrap] = useState(false)
  const [fontSize, setFontSize] = useState(15)
  const [toastMsg, setToastMsg] = useState('')
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [hasGhostText, setHasGhostText] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef   = useRef(onSave)
  const onCursorChangeRef = useRef(onCursorChange)
  const nodeRef = useRef(node)
  const wordWrapRef = useRef(wordWrap)
  const fontSizeRef = useRef(fontSize)
  const paletteRef = useRef(palette)
  const aiDebounceRef      = useRef<any>(null)
  const aiConfigRef        = useRef<any>({ enabled: false })
  const codeDebounceRef    = useRef<any>(null)
  const cursorDebounceRef  = useRef<any>(null)

  // Keep refs current
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onSaveRef.current   = onSave   }, [onSave])
  useEffect(() => { onCursorChangeRef.current = onCursorChange }, [onCursorChange])

  // Update AI config ref whenever AI props change
  useEffect(() => {
    const streamUrl = api?.ai?.streamUrl?.()
    const enabled = !!(streamUrl && aiProvider && aiKey && !compact)
    aiConfigRef.current = { enabled, provider: aiProvider, apiKey: aiKey, model: aiModel, streamUrl }
  }, [aiProvider, aiKey, aiModel, compact])
  useEffect(() => { nodeRef.current = node }, [node])
  useEffect(() => { wordWrapRef.current = wordWrap }, [wordWrap])
  useEffect(() => { fontSizeRef.current = fontSize }, [fontSize])
  useEffect(() => { paletteRef.current = palette }, [palette])

  // Sync external palette
  useEffect(() => {
    if (externalPalette) setPalette(externalPalette)
  }, [externalPalette?.id])

  // Jump to line when prop changes
  useEffect(() => {
    if (!jumpToLine || !viewRef.current) return
    const view = viewRef.current
    const doc = view.state.doc
    const lineNum = Math.max(1, Math.min(jumpToLine, doc.lines))
    const line = doc.line(lineNum)
    view.dispatch({
      selection: { anchor: line.from },
      scrollIntoView: true,
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    })
    view.focus()
  }, [jumpToLine])

  // Close palette menu on outside click
  useEffect(() => {
    if (!showPaletteMenu) return
    const handler = () => setShowPaletteMenu(false)
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [showPaletteMenu])

  const showToast = useCallback((msg: string) => {
    setToastMsg('')
    setTimeout(() => setToastMsg(msg), 10)
    setTimeout(() => setToastMsg(''), 1800)
  }, [])

  const themeCompartment = useMemo(() => new Compartment(), [])
  const wrapCompartment = useMemo(() => new Compartment(), [])

  // Build and mount CodeMirror (mount once)
  useEffect(() => {
    if (!containerRef.current) return

    const langExt = getLanguageExtension(nodeRef.current.label)

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        // Debounce onChange — avoids doc.toString() + React state write on every keystroke
        clearTimeout(codeDebounceRef.current)
        codeDebounceRef.current = setTimeout(() => {
          if (viewRef.current) onChangeRef.current(viewRef.current.state.doc.toString())
        }, 50)

        // AI ghost text (separate debounce)
        clearTimeout(aiDebounceRef.current)
        const ghost = update.view.state.field(ghostTextField, false)
        if (ghost) setHasGhostText(false)
        const cfg = aiConfigRef.current
        if (cfg.enabled) {
          const view = update.view
          const headPos = update.state.selection.main.head
          aiDebounceRef.current = setTimeout(async () => {
            if (!view.state || view.state.selection.main.head !== headPos) return
            const doc = view.state.doc.toString()
            const prefix = doc.slice(0, headPos)
            const suffix = doc.slice(headPos, headPos + 200)
            if (prefix.trim().length < 10) return
            try {
              const result = await api?.ai?.chat?.(
                [{ role: 'user', content: `Complete the code at the cursor (<|>):\n\n${prefix.slice(-500)}<|>${suffix}` }],
                cfg.apiKey,
                cfg.model,
                'Code completion engine. Output ONLY the raw completion inserted at <|>, 1–4 lines max. No markdown, no explanation.',
                cfg.provider,
              )
              if (!result?.success || !result.content) return
              const completion = result.content.trim()
              if (!completion) return
              if (view.state.selection.main.head === headPos) {
                view.dispatch({ effects: setGhostText.of({ pos: headPos, text: completion }) })
                setHasGhostText(true)
              }
            } catch {}
          }, 1800)
        }
      }
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head
        const line = update.state.doc.lineAt(head)
        const lineNum = line.number
        const colNum  = head - line.from + 1
        setCursor({ line: lineNum, col: colNum })  // local state, cheap
        // Debounce the parent store write to avoid re-rendering the whole IDE on every keypress
        clearTimeout(cursorDebounceRef.current)
        cursorDebounceRef.current = setTimeout(() => {
          onCursorChangeRef.current?.(lineNum, colNum)
        }, 120)
      }
    })

    const extensions = [
      history(),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      foldGutter(),
      bracketMatching(),
      closeBrackets(),
      ghostTextField,
      autocompletion({ defaultKeymap: true, closeOnBlur: false }),
      search({ top: false }),
      keymap.of([
        {
          key: 'Tab',
          run: (view) => {
            const ghost = view.state.field(ghostTextField, false)
            if (!ghost) return false
            view.dispatch({
              changes: { from: ghost.pos, insert: ghost.text },
              effects: setGhostText.of(null),
              selection: { anchor: ghost.pos + ghost.text.length },
            })
            setHasGhostText(false)
            return true
          },
        },
        {
          key: 'Escape',
          run: (view) => {
            const ghost = view.state.field(ghostTextField, false)
            if (!ghost) return false
            view.dispatch({ effects: setGhostText.of(null) })
            setHasGhostText(false)
            return true
          },
        },
        ...historyKeymap, ...defaultKeymap, ...searchKeymap, ...completionKeymap, indentWithTab,
        { key: 'Mod-s', run: () => { onSaveRef.current?.(); return true } },
      ]),
      indentOnInput(),
      updateListener,
      themeCompartment.of([buildTheme(paletteRef.current), buildHighlight(paletteRef.current)]),
      wrapCompartment.of(wordWrapRef.current ? EditorView.lineWrapping : []),
    ]

    if (langExt) extensions.push(langExt)

    const state = EditorState.create({
      doc: nodeRef.current.code || '',
      extensions,
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      clearTimeout(aiDebounceRef.current)
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // Update theme dynamically — use bg+kw as a cheap change key so same-ID palettes also re-apply
  useEffect(() => {
    if (!viewRef.current) return
    viewRef.current.dispatch({
      effects: themeCompartment.reconfigure([buildTheme(palette), buildHighlight(palette)])
    })
  }, [palette.id, palette.bg, palette.kw])

  // Sync node content when node changes
  useEffect(() => {
    if (!viewRef.current) return
    const current = viewRef.current.state.doc.toString()
    if (current !== (node.code || '')) {
      viewRef.current.dispatch({
        changes: { from: 0, to: current.length, insert: node.code || '' },
      })
    }
  }, [node.id, node.code])

  // Update font size via CSS on scroller
  useEffect(() => {
    if (!viewRef.current) return
    const scroller = viewRef.current.dom.querySelector('.cm-scroller') as HTMLElement
    if (scroller) {
      scroller.style.fontSize = fontSize + 'px'
    }
  }, [fontSize])

  // Toggle word wrap dynamically
  useEffect(() => {
    if (!viewRef.current) return
    viewRef.current.dispatch({
      effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : [])
    })
  }, [wordWrap])

  // Toolbar handlers
  const handleCopy = useCallback(() => {
    if (!viewRef.current) return
    const code = viewRef.current.state.doc.toString()
    navigator.clipboard.writeText(code).catch(() => {})
    showToast('COPIED')
  }, [showToast])

  const handleFormat = useCallback(async () => {
    if (!viewRef.current) return
    const code = viewRef.current.state.doc.toString()
    const ext = (nodeRef.current?.label || '').split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string,string> = { js:'js', mjs:'js', jsx:'jsx', ts:'ts', tsx:'tsx', py:'py', go:'go', json:'json', css:'css', html:'html' }
    const lang = langMap[ext] || ext
    const t0 = Date.now()
    let formatted = code
    if (api?.tools?.formatCode) {
      const result = await api.tools.formatCode(code, lang)
      if (result?.success && result.formatted) formatted = result.formatted
    }
    if (formatted === code) {
      // fall back to basic cleanup
      formatted = code.split('\n').map((l:string)=>l.replace(/\s+$/,'')).join('\n').replace(/\n{3,}/g,'\n\n')
    }
    const cur = viewRef.current.state.doc.toString()
    viewRef.current.dispatch({ changes: { from: 0, to: cur.length, insert: formatted } })
    showToast(`FORMATTED ${Date.now()-t0}ms`)
  }, [showToast])

  const handleToggleComment = useCallback(() => {
    if (!viewRef.current) return
    toggleComment(viewRef.current)
  }, [])

  const handleToggleFind = useCallback(() => {
    if (!viewRef.current) return
    setShowFind((prev) => {
      const next = !prev
      if (next) {
        openSearchPanel(viewRef.current)
      } else {
        closeSearchPanel(viewRef.current)
      }
      return next
    })
  }, [])

  const handleDecreaseFontSize = useCallback(() => {
    setFontSize((s) => Math.max(10, s - 1))
  }, [])

  const handleIncreaseFontSize = useCallback(() => {
    setFontSize((s) => Math.min(20, s + 1))
  }, [])

  // Minimap lines derived from current code
  const [codeForMinimap, setCodeForMinimap] = useState(node.code || '')
  useEffect(() => {
    // Update minimap code on node change
    setCodeForMinimap(node.code || '')
  }, [node.id, node.code])

  // Use updateListener to keep minimap in sync
  // We'll pull from viewRef on each onChange call — simpler: derive from prop
  const minimapLines = useMemo(() => {
    return (codeForMinimap || '').split('\n').slice(0, 80).map((l) => ({
      len: Math.min(l.length, 80),
      indent: (l.match(/^\s*/) || [''])[0].length,
    }))
  }, [codeForMinimap])

  // Keep minimap in sync: update onChangeRef to also push to minimap
  useEffect(() => {
    onChangeRef.current = (code: string) => {
      setCodeForMinimap(code)
      onChange(code)
    }
  }, [onChange])

  const lineCount = (codeForMinimap || '').split('\n').length

  const langLabel = getLangLabel(node.label)
  const langColor = getLangColor(node.label)

  const isJS = /\.(js|ts|jsx|tsx|mjs)$/.test(node.label || '')

  return (
    <div
      className="editor-palette-scope"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: compact ? undefined : 1,
        minHeight: minHeight ?? 0,
        overflow: 'hidden',
        background: palette.bg,
      }}
    >
      {/* ── TOOLBAR ── */}
      {!compact && <div className="ide-editor-toolbar">
        {/* File info: name + modified + lang badge */}
        <div className="ide-tb-fileinfo">
          <span className="ide-tb-filename" style={{ color: palette.base }}>
            {node.label}
          </span>
          {node.modified && <span className="ide-tb-moddot" />}
          <span
            className="ide-tb-lang-badge"
            style={{ background: langColor + '1a', color: langColor, border: `1px solid ${langColor}44` }}
          >
            {langLabel}
          </span>
        </div>

        <div className="ide-tb-sep" />

        {/* Actions */}
        <button className="ide-tb-btn" onClick={handleCopy} title="Copy all code">
          <ICopy /> COPY
        </button>
        <button className="ide-tb-btn" onClick={handleFormat} title="Format code">
          <IFormat /> FMT
        </button>
        <button className="ide-tb-btn" onClick={handleToggleComment} title="Toggle comment (Ctrl+/)">
          <span style={{ fontFamily: 'monospace', fontSize: '10px', opacity: 0.8 }}>{isJS ? '//' : '#'}</span> CMT
        </button>

        <div className="ide-tb-sep" />

        <button
          className={`ide-tb-btn ${showFind ? 'active' : ''}`}
          onClick={handleToggleFind}
          title="Find / Replace (Ctrl+F)"
        >
          <IFind /> FIND
        </button>
        <button
          className={`ide-tb-btn ${wordWrap ? 'active' : ''}`}
          onClick={() => setWordWrap((v) => !v)}
          title="Toggle word wrap"
        >
          <IWrap /> WRAP
        </button>

        {/* Spacer pushes right controls to end */}
        <div style={{ flex: 1 }} />

        {/* Font size control */}
        <div className="ide-tb-fontrow">
          <button className="ide-tb-btn ide-tb-fontbtn" onClick={handleDecreaseFontSize} title="Decrease font size">−</button>
          <span className="ide-tb-fontval" style={{ color: palette.base }}>{fontSize}</span>
          <button className="ide-tb-btn ide-tb-fontbtn" onClick={handleIncreaseFontSize} title="Increase font size">+</button>
        </div>

        <div className="ide-tb-sep" />

        {/* Palette selector */}
        <div style={{ position: 'relative' }}>
          <button
            className={`ide-tb-btn ide-tb-palette-btn ${showPaletteMenu ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setShowPaletteMenu((v) => !v) }}
          >
            <div className="ide-tb-swatches">
              {palette.swatches.map((c, i) => (
                <div key={i} className="ide-tb-swatch" style={{ background: c }} />
              ))}
            </div>
            <span style={{ color: palette.base, opacity: 0.65 }}>{palette.name}</span>
            <span className="ide-tb-caret">▾</span>
          </button>

          {showPaletteMenu && (
            <div className="ide-palette-dropdown" onClick={(e) => e.stopPropagation()}>
              <div className="ide-palette-sec">DARK</div>
              <div className="ide-palette-grid">
                {PALETTES.filter((p) => !LIGHT_IDS.includes(p.id)).map((p) => (
                  <div
                    key={p.id}
                    className={`ide-palette-opt ${palette.id === p.id ? 'active' : ''}`}
                    onClick={() => { setPalette(p); onPaletteChange?.(p); setShowPaletteMenu(false) }}
                    style={{ background: p.bg }}
                  >
                    <div className="ide-palette-swatches">
                      {p.swatches.map((c, i) => (
                        <div key={i} className="ide-palette-swatch" style={{ background: c }} />
                      ))}
                    </div>
                    <span className="ide-palette-name" style={{ color: p.base }}>
                      {p.name}
                    </span>
                  </div>
                ))}
              </div>
              <div className="ide-palette-sec">LIGHT</div>
              <div className="ide-palette-grid">
                {PALETTES.filter((p) => LIGHT_IDS.includes(p.id)).map((p) => (
                  <div
                    key={p.id}
                    className={`ide-palette-opt ${palette.id === p.id ? 'active' : ''}`}
                    onClick={() => { setPalette(p); onPaletteChange?.(p); setShowPaletteMenu(false) }}
                    style={{ background: p.bg }}
                  >
                    <div className="ide-palette-swatches">
                      {p.swatches.map((c, i) => (
                        <div key={i} className="ide-palette-swatch" style={{ background: c }} />
                      ))}
                    </div>
                    <span className="ide-palette-name" style={{ color: p.base }}>
                      {p.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>}

      {/* ── MAIN EDITOR AREA ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* CodeMirror container */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            fontSize: fontSize + 'px',
          }}
        />

        {/* ── MINIMAP ── */}
        <div className="ide-minimap" style={{ borderLeft: `1px solid ${palette.lineNum}28`, background: palette.bg }}>
          {/* Header label */}
          <div className="ide-minimap-label" style={{ color: palette.lineNum }}>MAP</div>
          <svg width="52" height="calc(100% - 18px)" style={{ display: 'block', overflow: 'visible', marginTop: '2px' }}>
            {/* Code lines */}
            {minimapLines.map((l, i) => (
              <rect
                key={i}
                x={2 + l.indent * 0.25}
                y={i * 3.4}
                width={Math.max(2, l.len * 0.42)}
                height={1.8}
                fill={i % 5 === 0 ? palette.fn : palette.lineNum}
                opacity={i % 5 === 0 ? 0.55 : 0.45}
                rx=".6"
              />
            ))}
            {/* Viewport indicator */}
            <rect
              x={0}
              y={(cursor.line - 1) * 3.4}
              width={52}
              height={5}
              fill={palette.kw}
              opacity=".18"
              rx="1.5"
            />
            {/* Cursor line highlight */}
            <rect
              x={0}
              y={(cursor.line - 1) * 3.4 + 1.5}
              width={52}
              height={2}
              fill={palette.fn}
              opacity=".55"
              rx="1"
            />
          </svg>
        </div>
      </div>

      {/* ── STATUS STRIP ── */}
      {!compact && <div
        className="editor-status-strip"
        style={{
          background: palette.bg,
          borderTop: `1px solid ${palette.kw}20`,
          color: palette.base,
        }}
      >
        {/* Cursor position */}
        <span className="esr-pos" style={{ color: palette.fn }}>
          {cursor.line}<span style={{ opacity: 0.4 }}>:</span>{cursor.col}
        </span>
        <span className="esr-pipe" style={{ color: palette.lineNum }}>│</span>

        {/* Line count */}
        <span style={{ opacity: 0.5 }}>{lineCount}</span>
        <span style={{ opacity: 0.3, fontSize: '9px', letterSpacing: '.08em' }}>LN</span>

        <span className="esr-pipe" style={{ color: palette.lineNum }}>│</span>

        {/* File type */}
        <span style={{ color: palette.kw, opacity: 0.75, letterSpacing: '.08em' }}>{(node.type || '').toUpperCase()}</span>

        {/* Modified indicator */}
        {node.modified && (
          <>
            <span className="esr-pipe" style={{ color: palette.lineNum }}>│</span>
            <span className="esr-modified">● UNSAVED</span>
          </>
        )}

        {/* AI ghost text indicator */}
        {hasGhostText && (
          <>
            <span className="esr-pipe" style={{ color: palette.lineNum }}>│</span>
            <span style={{ color: palette.bi, fontSize: '10px', letterSpacing: '.06em' }}>
              ⚡ AI  <span style={{ opacity: 0.55 }}>Tab·accept  Esc·dismiss</span>
            </span>
          </>
        )}

        {/* Right side */}
        <div style={{ flex: 1 }} />
        {!hasGhostText && (
          <span className="esr-hints" style={{ color: palette.base }}>
            <kbd>^S</kbd> save <span style={{ opacity: 0.3 }}>·</span> <kbd>^/</kbd> cmt <span style={{ opacity: 0.3 }}>·</span> <kbd>^F</kbd> find
          </span>
        )}
        <span className="esr-pipe" style={{ color: palette.lineNum }}>│</span>
        <span style={{ color: palette.kw, opacity: 0.5, fontSize: '9px', letterSpacing: '.1em' }}>{palette.name}</span>
      </div>}

      {/* ── TOAST ── */}
      {!compact && toastMsg && <div className="copy-toast">{toastMsg}</div>}
    </div>
  )
}
