// @ts-nocheck
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, indentWithTab, toggleComment } from '@codemirror/commands'
import { searchKeymap, openSearchPanel, closeSearchPanel, search } from '@codemirror/search'
import { completionKeymap, autocompletion, closeBrackets } from '@codemirror/autocomplete'
import { foldGutter, indentOnInput, bracketMatching, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
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
  compact?: boolean  // hide toolbar + status strip (for notebook cells)
  minHeight?: string // e.g. '80px'
  jumpToLine?: number // when changed, scrolls editor to that line
}

// ══════════════════════════════════════════════════════════════
//  PALETTES
// ══════════════════════════════════════════════════════════════

const PALETTES: Palette[] = [
  { id:'forbinden',  name:'FORBINDEN',    bg:'#0b0b0f', base:'#c0c8d8', lineNum:'#2e2e42', activeLine:'rgba(255,255,255,0.035)', kw:'#ff435a', str:'#ffc410', cmt:'#3e3e5a', num:'#4285f4', fn:'#10b981', bi:'#28f1c3', op:'#6a6a8a', swatches:['#ff435a','#ffc410','#10b981','#28f1c3'] },
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
      caretColor: palette.fn,
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
      borderLeftColor: palette.fn,
    },
    '.tok-keyword': { color: palette.kw },
    '.tok-string': { color: palette.str },
    '.tok-comment': { color: palette.cmt, fontStyle: 'italic' },
    '.tok-number': { color: palette.num },
    '.tok-function': { color: palette.fn },
    '.tok-definition.tok-function': { color: palette.fn },
    '.tok-variableName': { color: palette.base },
    '.tok-operator': { color: palette.op },
    '.tok-typeName': { color: palette.bi },
    '.tok-className': { color: palette.bi },
    '.tok-propertyName': { color: palette.base },
    '.tok-punctuation': { color: palette.op },
    '.tok-bracket': { color: palette.op },
    '.tok-tagName': { color: palette.kw },
    '.tok-attributeName': { color: palette.bi },
    '.tok-attributeValue': { color: palette.str },
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

// ══════════════════════════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════════════════════════

export default function CodeMirrorEditor({ node, onChange, onSave, externalPalette, compact = false, minHeight, jumpToLine }: CodeMirrorEditorProps) {
  const [palette, setPalette] = useState<Palette>(PALETTES[0])
  const [showPaletteMenu, setShowPaletteMenu] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [wordWrap, setWordWrap] = useState(false)
  const [fontSize, setFontSize] = useState(13)
  const [toastMsg, setToastMsg] = useState('')
  const [cursor, setCursor] = useState({ line: 1, col: 1 })

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef   = useRef(onSave)
  const nodeRef = useRef(node)
  const wordWrapRef = useRef(wordWrap)
  const fontSizeRef = useRef(fontSize)
  const paletteRef = useRef(palette)

  // Keep refs current
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onSaveRef.current   = onSave   }, [onSave])
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
        setCursor({ line: line.number, col: head - line.from + 1 })
      }
    })

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      foldGutter(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      search({ top: false }),
      keymap.of([
        ...defaultKeymap, ...searchKeymap, ...completionKeymap, indentWithTab,
        { key: 'Mod-s', run: () => { onSaveRef.current?.(); return true } },
      ]),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
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
    // Simplest approach: dispatch an effect to add/remove line wrapping
    // We use a compartment-free approach via reconfigure on the view
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
        setCursor({ line: line.number, col: head - line.from + 1 })
      }
    })

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      foldGutter(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      search({ top: false }),
      keymap.of([
        ...defaultKeymap, ...searchKeymap, ...completionKeymap, indentWithTab,
        { key: 'Mod-s', run: () => { onSaveRef.current?.(); return true } },
      ]),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
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

  const handleFormat = useCallback(() => {
    if (!viewRef.current) return
    const code = viewRef.current.state.doc.toString()
    const formatted = code
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
    const current = viewRef.current.state.doc.toString()
    viewRef.current.dispatch({
      changes: { from: 0, to: current.length, insert: formatted },
    })
    showToast('FORMATTED')
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
        {/* Language pill */}
        <span
          style={{
            padding: '1px 7px',
            fontSize: '9px',
            fontFamily: "'Oswald',sans-serif",
            fontWeight: 700,
            letterSpacing: '.1em',
            background: langColor + '18',
            color: langColor,
            border: `1px solid ${langColor}44`,
          }}
        >
          {langLabel}
        </span>

        <div className="ide-tb-sep" />

        <button className="ide-tb-btn" onClick={handleCopy} title="Copy code">
          <ICopy /> COPY
        </button>
        <button className="ide-tb-btn" onClick={handleFormat} title="Format code">
          <IFormat /> FORMAT
        </button>
        <button className="ide-tb-btn" onClick={handleToggleComment} title="Toggle comment (Alt+Shift+A)">
          {isJS ? '//' : '#'} CMT
        </button>

        <div className="ide-tb-sep" />

        <button
          className={`ide-tb-btn ${showFind ? 'active' : ''}`}
          onClick={handleToggleFind}
          title="Find (Ctrl+F)"
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

        <div className="ide-tb-sep" />

        <button className="ide-tb-btn" onClick={handleDecreaseFontSize} title="Decrease font size">
          A−
        </button>
        <span style={{ fontSize: '10px', opacity: 0.6, padding: '0 2px', color: palette.base, fontFamily: "'Share Tech Mono', monospace" }}>
          {fontSize}
        </span>
        <button className="ide-tb-btn" onClick={handleIncreaseFontSize} title="Increase font size">
          A+
        </button>

        {/* Palette selector */}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button
            className={`ide-tb-btn ${showPaletteMenu ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setShowPaletteMenu((v) => !v) }}
            style={{ gap: '4px' }}
          >
            <div style={{ display: 'flex', gap: '3px' }}>
              {palette.swatches.map((c, i) => (
                <div
                  key={i}
                  style={{ width: '8px', height: '8px', borderRadius: '2px', background: c }}
                />
              ))}
            </div>
            {palette.name}
          </button>

          {showPaletteMenu && (
            <div className="ide-palette-dropdown" onClick={(e) => e.stopPropagation()}>
              <div className="ide-palette-sec">DARK</div>
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
              <div className="ide-palette-sec">LIGHT</div>
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
        <div
          style={{
            width: '56px',
            flexShrink: 0,
            background: palette.bg,
            borderLeft: `1px solid ${palette.lineNum}22`,
            overflow: 'hidden',
            padding: '8px 4px',
            cursor: 'default',
          }}
        >
          <svg width="48" height="100%" style={{ display: 'block', overflow: 'visible' }}>
            {minimapLines.map((l, i) => (
              <rect
                key={i}
                x={l.indent * 0.3}
                y={i * 3.2}
                width={l.len * 0.38}
                height={1.6}
                fill={palette.lineNum}
                opacity=".7"
                rx=".5"
              />
            ))}
            <rect
              x={0}
              y={(cursor.line - 1) * 3.2}
              width={48}
              height={3.5}
              fill={palette.kw}
              opacity=".12"
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
          borderTop: `1px solid ${palette.lineNum}33`,
          color: palette.base,
        }}
      >
        <span style={{ opacity: 0.45 }}>
          Ln {cursor.line}:{cursor.col}
        </span>
        <span style={{ opacity: 0.2 }}>|</span>
        <span style={{ opacity: 0.45 }}>{lineCount}L</span>
        <span style={{ opacity: 0.2 }}>|</span>
        <span style={{ color: palette.fn, opacity: 0.7 }}>{node.type}</span>
        {node.modified && (
          <>
            <span style={{ opacity: 0.2 }}>|</span>
            <span style={{ color: '#ffc410', fontSize: '8px' }}>● MOD</span>
          </>
        )}
        <span style={{ opacity: 0.2 }}>|</span>
        <span style={{ opacity: 0.22, fontSize: '11px' }}>
          ^Enter RUN · ^/ CMT · ^F FIND · Tab INDENT
        </span>
        <span style={{ marginLeft: 'auto', opacity: 0.35 }}>{palette.name}</span>
      </div>}

      {/* ── TOAST ── */}
      {!compact && toastMsg && <div className="copy-toast">{toastMsg}</div>}
    </div>
  )
}
