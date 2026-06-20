// @ts-nocheck
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, Decoration, WidgetType } from '@codemirror/view'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { defaultKeymap, indentWithTab, toggleComment } from '@codemirror/commands'
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
//  PALETTES
// ══════════════════════════════════════════════════════════════

const PALETTES: Palette[] = [
  { id:'forbinden',  name:'FORBINDEN',    bg:'#0b0b0f', base:'#e2d8d0', lineNum:'#2e2838', activeLine:'rgba(255,42,56,0.06)',   kw:'#ff2a38', str:'#ff7060', cmt:'#6a5878', num:'#ff3d6e', fn:'#ffb0a0', bi:'#ff9080', op:'#7a7090', swatches:['#ff2a38','#ff7060','#ffb0a0','#e2d8d0'] },
  { id:'dracula',    name:'DRACULA',       bg:'#282a36', base:'#f8f8f2', lineNum:'#44475a', activeLine:'rgba(68,71,90,0.4)',     kw:'#ff79c6', str:'#f1fa8c', cmt:'#6272a4', num:'#bd93f9', fn:'#50fa7b', bi:'#8be9fd', op:'#ff79c6', swatches:['#ff79c6','#f1fa8c','#50fa7b','#8be9fd'] },
  { id:'monokai',    name:'MONOKAI',       bg:'#272822', base:'#f8f8f2', lineNum:'#3e3d32', activeLine:'rgba(73,72,62,0.4)',     kw:'#f92672', str:'#e6db74', cmt:'#75715e', num:'#ae81ff', fn:'#a6e22e', bi:'#66d9e8', op:'#f92672', swatches:['#f92672','#e6db74','#a6e22e','#ae81ff'] },
  { id:'nord',       name:'NORD',          bg:'#2e3440', base:'#d8dee9', lineNum:'#3b4252', activeLine:'rgba(67,76,94,0.4)',     kw:'#81a1c1', str:'#a3be8c', cmt:'#4c566a', num:'#b48ead', fn:'#88c0d0', bi:'#8fbcbb', op:'#81a1c1', swatches:['#81a1c1','#a3be8c','#88c0d0','#b48ead'] },
  { id:'tokyo',      name:'TOKYO NIGHT',   bg:'#1a1b2e', base:'#a9b1d6', lineNum:'#2a2b3d', activeLine:'rgba(42,43,61,0.5)',     kw:'#bb9af7', str:'#9ece6a', cmt:'#3b4261', num:'#ff9e64', fn:'#7dcfff', bi:'#2ac3de', op:'#c0caf5', swatches:['#bb9af7','#9ece6a','#7dcfff','#ff9e64'] },
  { id:'gruvbox',    name:'GRUVBOX',       bg:'#282828', base:'#ebdbb2', lineNum:'#3c3836', activeLine:'rgba(60,56,54,0.5)',     kw:'#fb4934', str:'#b8bb26', cmt:'#665c54', num:'#d3869b', fn:'#fabd2f', bi:'#8ec07c', op:'#fe8019', swatches:['#fb4934','#b8bb26','#fabd2f','#8ec07c'] },
  { id:'onedark',    name:'ONE DARK',      bg:'#282c34', base:'#abb2bf', lineNum:'#3b4048', activeLine:'rgba(40,44,52,0.6)',     kw:'#c678dd', str:'#98c379', cmt:'#5c6370', num:'#d19a66', fn:'#61afef', bi:'#56b6c2', op:'#e06c75', swatches:['#c678dd','#98c379','#61afef','#d19a66'] },
  { id:'catppuccin', name:'CATPPUCCIN',    bg:'#1e1e2e', base:'#cdd6f4', lineNum:'#313244', activeLine:'rgba(49,50,68,0.5)',     kw:'#cba6f7', str:'#a6e3a1', cmt:'#585b70', num:'#fab387', fn:'#89b4fa', bi:'#94e2d5', op:'#f38ba8', swatches:['#cba6f7','#a6e3a1','#89b4fa','#fab387'] },
  { id:'tokyo_night_storm', name:'TOKYO STORM', bg:'#24283b', base:'#c0caf5', lineNum:'#3b4261', activeLine:'rgba(59,66,97,0.5)', kw:'#bb9af7', str:'#9ece6a', cmt:'#565f89', num:'#ff9e64', fn:'#7aa2f7', bi:'#2ac3de', op:'#89ddff', swatches:['#bb9af7','#9ece6a','#7aa2f7','#ff9e64'] },
  { id:'vesper',     name:'VESPER',        bg:'#101010', base:'#c2c2c2', lineNum:'#1e1e1e', activeLine:'rgba(30,30,30,0.6)',     kw:'#ff8080', str:'#99ffe4', cmt:'#404040', num:'#ffbd5e', fn:'#b8a4ff', bi:'#5ef1ff', op:'#ff6e6e', swatches:['#ff8080','#99ffe4','#b8a4ff','#ffbd5e'] },
  { id:'rosepine',   name:'ROSÉ PINE',     bg:'#191724', base:'#e0def4', lineNum:'#26233a', activeLine:'rgba(38,35,58,0.5)',     kw:'#c4a7e7', str:'#f6c177', cmt:'#6e6a86', num:'#ebbcba', fn:'#9ccfd8', bi:'#31748f', op:'#eb6f92', swatches:['#c4a7e7','#f6c177','#9ccfd8','#eb6f92'] },
  { id:'github',     name:'GITHUB LIGHT',  bg:'#ffffff', base:'#24292e', lineNum:'#e1e4e8', activeLine:'rgba(225,228,232,0.5)', kw:'#d73a49', str:'#032f62', cmt:'#6a737d', num:'#005cc5', fn:'#6f42c1', bi:'#e36209', op:'#d73a49', swatches:['#d73a49','#032f62','#6f42c1','#005cc5'] },
]

const LIGHT_IDS = ['github']

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
      fontSize: '13px',
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
      border: `1px solid ${palette.lineNum}88`,
      color: palette.base,
    },
    '.cm-tooltip-autocomplete': {
      backgroundColor: palette.bg,
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: palette.kw + '28',
      color: palette.kw,
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
    { tag: t.keyword,                               color: palette.kw,  fontWeight: '500' },
    { tag: [t.string, t.special(t.string)],          color: palette.str },
    { tag: t.comment,                               color: palette.cmt, fontStyle: 'italic' },
    { tag: [t.number, t.bool],                       color: palette.num },
    { tag: [t.function(t.name), t.function(t.variableName), t.definition(t.function(t.name))],
                                                    color: palette.fn },
    { tag: t.variableName,                          color: palette.base },
    { tag: t.definition(t.variableName),            color: palette.base },
    { tag: t.operator,                              color: palette.op },
    { tag: [t.typeName, t.className, t.namespace],  color: palette.bi },
    { tag: t.propertyName,                          color: palette.base },
    { tag: [t.punctuation, t.bracket],              color: palette.op },
    { tag: t.tagName,                               color: palette.kw },
    { tag: t.attributeName,                         color: palette.bi },
    { tag: t.attributeValue,                        color: palette.str },
    { tag: t.heading,                               color: palette.kw, fontWeight: 'bold' },
    { tag: t.emphasis,                              fontStyle: 'italic' },
    { tag: t.strong,                                fontWeight: 'bold' },
    { tag: [t.link, t.url],                         color: palette.bi, textDecoration: 'underline' },
    { tag: t.meta,                                  color: palette.cmt },
    { tag: t.self,                                  color: palette.kw },
    { tag: t.constant(t.name),                      color: palette.num },
    { tag: t.inserted,                              color: palette.fn },
    { tag: t.deleted,                               color: palette.kw },
  ]))
}

// ══════════════════════════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════════════════════════

export default function CodeMirrorEditor({ node, onChange, onSave, externalPalette, compact = false, minHeight, jumpToLine, onCursorChange, aiProvider, aiKey, aiModel }: CodeMirrorEditorProps) {
  const [palette, setPalette] = useState<Palette>(PALETTES[0])
  const [showPaletteMenu, setShowPaletteMenu] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [wordWrap, setWordWrap] = useState(false)
  const [fontSize, setFontSize] = useState(13)
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
  const aiDebounceRef = useRef<any>(null)
  const aiConfigRef = useRef<any>({ enabled: false })

  // Keep refs current
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onSaveRef.current   = onSave   }, [onSave])
  useEffect(() => { onCursorChangeRef.current = onCursorChange }, [onCursorChange])

  // Update AI config ref whenever AI props change
  useEffect(() => {
    const streamUrl = (window as any).electronAPI?.ai?.streamUrl?.()
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

  // Build and mount CodeMirror when palette changes (full recreate)
  useEffect(() => {
    if (!containerRef.current) return

    // Destroy previous view
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    const langExt = getLanguageExtension(nodeRef.current.label)
    const themeExt = buildTheme(palette)

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head
        const line = update.state.doc.lineAt(head)
        const lineNum = line.number
        const colNum = head - line.from + 1
        setCursor({ line: lineNum, col: colNum })
        onCursorChangeRef.current?.(lineNum, colNum)

        // Reset AI ghost text debounce
        clearTimeout(aiDebounceRef.current)
        const ghost = update.view.state.field(ghostTextField, false)
        if (ghost) setHasGhostText(false)
        const cfg = aiConfigRef.current
        if (cfg.enabled && update.docChanged) {
          const view = update.view
          const headPos = head
          aiDebounceRef.current = setTimeout(async () => {
            if (view.state.selection.main.head !== headPos) return
            const doc = view.state.doc.toString()
            const prefix = doc.slice(0, headPos)
            const suffix = doc.slice(headPos, headPos + 200)
            if (prefix.trim().length < 10) return
            try {
              const result = await (window as any).electronAPI?.ai?.chat?.(
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
    })

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      foldGutter(),
      bracketMatching(),
      closeBrackets(),
      ghostTextField,
      autocompletion(),
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
        ...defaultKeymap, ...searchKeymap, ...completionKeymap, indentWithTab,
        { key: 'Mod-s', run: () => { onSaveRef.current?.(); return true } },
      ]),
      indentOnInput(),
      buildHighlight(palette),
      updateListener,
      themeExt,
    ]

    if (langExt) extensions.push(langExt)
    if (wordWrapRef.current) extensions.push(EditorView.lineWrapping)

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
  }, [palette.id])

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

  // Toggle word wrap by reconfiguring
  useEffect(() => {
    if (!viewRef.current) return
    const view = viewRef.current
    const langExt = getLanguageExtension(node.label)
    const themeExt = buildTheme(palette)
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head
        const line = update.state.doc.lineAt(head)
        const lineNum = line.number
        const colNum = head - line.from + 1
        setCursor({ line: lineNum, col: colNum })
        onCursorChangeRef.current?.(lineNum, colNum)
      }
    })

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      foldGutter(),
      bracketMatching(),
      closeBrackets(),
      ghostTextField,
      autocompletion(),
      search({ top: false }),
      keymap.of([
        {
          key: 'Tab',
          run: (v) => {
            const ghost = v.state.field(ghostTextField, false)
            if (!ghost) return false
            v.dispatch({
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
          run: (v) => {
            const ghost = v.state.field(ghostTextField, false)
            if (!ghost) return false
            v.dispatch({ effects: setGhostText.of(null) })
            setHasGhostText(false)
            return true
          },
        },
        ...defaultKeymap, ...searchKeymap, ...completionKeymap, indentWithTab,
        { key: 'Mod-s', run: () => { onSaveRef.current?.(); return true } },
      ]),
      indentOnInput(),
      buildHighlight(palette),
      updateListener,
      themeExt,
    ]
    if (langExt) extensions.push(langExt)
    if (wordWrap) extensions.push(EditorView.lineWrapping)

    const currentCode = view.state.doc.toString()
    const newState = EditorState.create({
      doc: currentCode,
      extensions,
    })
    view.setState(newState)
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
    const api = (window as any).electronAPI
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

  // Keep minimap updated when editor changes
  const handleChange = useCallback((code: string) => {
    setCodeForMinimap(code)
    onChange(code)
  }, [onChange])

  // Re-mount with new onChange that keeps minimap in sync
  // Actually we already have updateListener tied to onChangeRef.
  // We need onChangeRef to call handleChange not onChange directly.
  // Let's update onChangeRef to call setCodeForMinimap too.
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
                    onClick={() => { setPalette(p); setShowPaletteMenu(false) }}
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
                    onClick={() => { setPalette(p); setShowPaletteMenu(false) }}
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
