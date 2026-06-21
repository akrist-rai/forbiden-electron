// @ts-nocheck
import './ide.css'
import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useUIStore } from '../../stores/uiStore'
import { useEditorStore } from '../../stores/editorStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useAiStore, DEFAULT_MODELS } from '../../stores/aiStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useGitStore } from '../../stores/gitStore'
import { useBoardStore } from '../../stores/boardStore'
import { useTimelineStore } from '../../stores/timelineStore'
import ScriptsPanel from '../../features/sidebar/ScriptsPanel'
import AiChatPanel from '../../features/sidebar/AiChatPanel'
import MangaNode from '../../features/graph/MangaNode'
import GraphMinimap from '../../features/graph/GraphMinimap'
import { convexHull } from '../../features/graph/convexHull'
import TimelinePanel from '../../features/timeline/TimelinePanel'
import NotebookPanel from '../../features/notebook/NotebookPanel'
import WelcomeNodeRow from '../../features/graph/WelcomeNodeRow'
import CommandPalette from '../../features/modals/CommandPalette'
import GroupEditor from '../../features/modals/GroupEditor'
import FileFinderModal from '../../features/modals/FileFinderModal'
import JumpToLineModal from '../../features/modals/JumpToLineModal'
import {
  detectLang, extractSymbols, generateImport, injectImport,
  getDefaultCode, langLabel, isCompiled,
  runByLang, runInTerminal,
} from '../../lib/engine'
import FileExplorer from '../../components/FileExplorer'
import CodeMirrorEditor from '../../components/CodeMirrorEditor'
import XTermPanel from '../../components/XTermPanel'
import TitleBar from '../../components/TitleBar'
import GitPanelV2 from '../../components/GitPanelV2'
import { ConsolePanel } from '../../components/ConsolePanel'
import { Icons as I } from '../../components/Icons'
import { highlightCode } from '../../lib/highlight'
import { api } from '../../lib/api'
import { ACCENTS, TL_TRACKS, TL_COL } from '../../constants/accents'
import { PALETTES, PALETTE_LIGHT_IDS, TERM_PALETTES } from '../../constants/palettes'
import { getMangaImgSrc, getPanelImg } from '../../constants/manga'


// ══════════════════════════════════════════════════════════════
//  CODE EDITOR COMPONENT
// ══════════════════════════════════════════════════════════════

function CodeEditor({ node, onChange, externalPalette }) {
  const [palette, setPalette] = useState(PALETTES[0])
  useEffect(() => { if (externalPalette) setPalette(externalPalette) }, [externalPalette?.id])
  const [showPaletteMenu, setShowPaletteMenu] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [wordWrap, setWordWrap] = useState(false)
  const [cursor, setCursor] = useState({ line:1, col:1 })
  const [toastMsg, setToastMsg] = useState('')
  const [fontSize, setFontSize] = useState(13)
  const [minimap, setMinimap] = useState(true)
  const textareaRef = useRef(null)
  const lineNumRef = useRef(null)
  const overlayRef = useRef(null)
  const [acList, setAcList] = useState([])
  const [acIdx, setAcIdx] = useState(0)
  const code = node.code || ''
  const lineH = fontSize * 1.65

  const showToast = (msg) => { setToastMsg(''); setTimeout(() => setToastMsg(msg), 10); setTimeout(() => setToastMsg(''), 1800) }
  const handleScroll = () => {
    if (lineNumRef.current && textareaRef.current) lineNumRef.current.scrollTop = textareaRef.current.scrollTop
    if (overlayRef.current && textareaRef.current) overlayRef.current.style.transform = `translateY(-${textareaRef.current.scrollTop}px)`
  }
  const isJS = node.label?.match(/\.(js|ts|jsx|tsx|mjs)$/)
  const nodeLang = detectLang(node.label || '')

  const AC_JS = ['function','const','let','var','return','if','else','for','while','switch','case',
    'class','import','export','from','default','new','this','typeof','instanceof','async','await',
    'try','catch','finally','throw','break','continue','null','undefined','true','false',
    'console.log','console.error','console.warn','console.table','console.info',
    'Math.floor','Math.ceil','Math.round','Math.random','Math.max','Math.min','Math.abs','Math.sqrt','Math.PI',
    'JSON.stringify','JSON.parse','Array.from','Array.isArray',
    'Object.keys','Object.values','Object.entries','Object.assign','Object.fromEntries',
    'parseInt','parseFloat','isNaN','String','Number','Boolean','Array','Object','Promise',
    'setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame',
    'fetch','document','window','localStorage','performance.now',
    'Promise.all','Promise.race','Promise.resolve','Promise.reject',
  ]
  const AC_PY = ['def ','class ','import ','from ','return ','if ','elif ','else:','for ','while ',
    'in ','not ','and ','or ','True','False','None','pass','break','continue','raise ',
    'try:','except ','except Exception as e:','finally:','with ','as ','yield ','lambda ','async def ',
    'print(','len(','range(','list(','dict(','set(','tuple(','str(','int(','float(','bool(',
    'type(','isinstance(','hasattr(','getattr(','enumerate(','zip(',
    'map(','filter(','sorted(','reversed(','sum(','max(','min(','abs(',
    'open(','super().__init__()','self.','__init__','__str__','__repr__','__len__',
  ]

  const computeAc = (newCode, pos) => {
    const before = newCode.slice(0, pos)
    const m = before.match(/[\w.]+$/)
    const word = m ? m[0] : ''
    if (!word) { setAcList([]); return }
    const base = isJS ? AC_JS : AC_PY
    const fileWords = [...new Set((newCode.match(/\b[a-zA-Z_]\w{2,}\b/g) || []))].filter(w => w !== word && w.length > 2)
    const all = [...base, ...fileWords]
    const wl = word.toLowerCase()
    const matches = [...new Set(all.filter(s => s.toLowerCase().startsWith(wl)))].slice(0, 9)
    setAcList(matches); setAcIdx(0)
  }

  const insertAc = (item) => {
    const ta = textareaRef.current; if (!ta) return
    const s = ta.selectionStart
    const before = code.slice(0, s)
    const word = (before.match(/[\w.]+$/) || [''])[0]
    const newCode = code.slice(0, s - word.length) + item + code.slice(s)
    onChange(newCode)
    setAcList([])
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s - word.length + item.length; ta.focus() }, 0)
  }
  const tabStr = '  ' // 2 spaces

  const handleKeyDown = (e) => {
    const ta = e.target
    const s = ta.selectionStart, en = ta.selectionEnd
    const before = code.substring(0, s)
    const after  = code.substring(en)

    // Autocomplete intercept
    if (acList.length > 0) {
      if (e.key === 'Escape') { e.preventDefault(); setAcList([]); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setAcIdx(i => (i+1) % acList.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setAcIdx(i => (i-1+acList.length) % acList.length); return }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertAc(acList[acIdx]); return }
    }

    // Tab — insert 2 spaces (Shift+Tab dedents)
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        const lineStart = before.lastIndexOf('\n') + 1
        if (code.substring(lineStart).startsWith('  ')) {
          const newCode = code.substring(0, lineStart) + code.substring(lineStart + 2)
          onChange(newCode)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = Math.max(s - 2, lineStart) }, 0)
        }
      } else {
        onChange(before + '  ' + after)
        setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2 }, 0)
      }
      return
    }

    // Enter — match current line indentation
    if (e.key === 'Enter') {
      e.preventDefault()
      const lineStart = before.lastIndexOf('\n') + 1
      const currentLine = code.substring(lineStart, s)
      const indent = currentLine.match(/^(\s*)/)[1]
      const lastChar = before.trimEnd().slice(-1)
      const extra = '{[('.includes(lastChar) ? '  ' : ''
      onChange(before + '\n' + indent + extra + after)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 1 + indent.length + extra.length }, 0)
      return
    }

    if ((e.ctrlKey||e.metaKey) && e.key==='f') { e.preventDefault(); setShowFind(v=>!v) }
    if ((e.ctrlKey||e.metaKey) && e.key==='/') { e.preventDefault(); toggleLineComment() }
    if ((e.ctrlKey||e.metaKey) && e.key==='d') { e.preventDefault(); setShowDiff(v=>!v) }
  }
  const handleCursorUpdate = (e) => {
    const ta=e.target, before=code.substring(0,ta.selectionStart)
    const nl=(before.match(/\n/g)||[]).length+1
    setCursor({line:nl, col:ta.selectionStart-before.lastIndexOf('\n')})
  }
  useEffect(() => {
    if (!showPaletteMenu) return
    const h = () => setShowPaletteMenu(false)
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [showPaletteMenu])
  const handleCopy = () => { navigator.clipboard.writeText(code).catch(()=>{}); showToast('COPIED') }
  const handleFormat = () => { const formatted = code.split('\n').map(l=>l.replace(/\s+$/,'')).join('\n').replace(/\n{3,}/g,'\n\n'); onChange(formatted); showToast('FORMATTED') }
  const handleFindReplace = () => { if (!findQuery) return; const count=(code.split(findQuery).length-1); onChange(code.split(findQuery).join(replaceQuery)); showToast(`REPLACED ${count} INSTANCES`) }
  const toggleLineComment = () => {
    const ta = textareaRef.current
    const sel0 = ta.selectionStart, sel1 = ta.selectionEnd
    const marker = isJS ? '//' : '#'
    const before = code.substring(0, sel0)
    const lineStart = before.lastIndexOf('\n') + 1
    // multi-line: cover all selected lines
    const selEnd = sel1 > sel0 ? sel1 : sel0
    const lastNl = code.indexOf('\n', selEnd)
    const lineEnd = lastNl === -1 ? code.length : lastNl
    const selected = code.substring(lineStart, lineEnd)
    const lines = selected.split('\n')
    const allCommented = lines.every(l => l.trimStart().startsWith(marker))
    const toggled = allCommented
      ? lines.map(l => l.replace(new RegExp(`^(\\s*)${marker.replace('/','\\/')}\\s?`), '$1'))
      : lines.map(l => l.replace(/^(\s*)/, `$1${marker} `))
    const newCode = code.substring(0, lineStart) + toggled.join('\n') + code.substring(lineEnd)
    onChange(newCode)
    showToast('COMMENT')
  }
  const diffLines = useMemo(() => code.split('\n').map((line,i)=>({ type:i===1&&node.modified?'add':i===2&&node.modified?'del':'ctx', text:line, num:i+1 })), [code,node.modified])
  const cssVars = { '--syn-kw':palette.kw,'--syn-str':palette.str,'--syn-cmt':palette.cmt,'--syn-num':palette.num,'--syn-fn':palette.fn,'--syn-bi':palette.bi,'--syn-op':palette.op }
  const highlighted = useMemo(() => highlightCode(code, nodeLang), [code, nodeLang])
  const activeLineY = (cursor.line - 1) * lineH
  const minimapLines = useMemo(() => code.split('\n').slice(0,50).map(l=>({len:Math.min(l.length,80),indent:l.match(/^\s*/)[0].length})), [code])

  return (
    <div className="editor-palette-scope" style={{display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden',background:palette.bg}}
      ref={el => el && Object.entries(cssVars).forEach(([k,v])=>el.style.setProperty(k,v))}>
      {/* Toolbar */}
      <div className="ide-editor-toolbar">
        {/* Language pill */}
        {(() => {
          const langColors = { js:'#f2c12e', ts:'#4285f4', py:'#28f1c3', c:'#ff8080', cpp:'#ff8080', go:'#89ddff', md:'#c792ea', unknown:'#888' }
          const lc = langColors[nodeLang] || '#888'
          const ln = { js:'JS', ts:'TS', py:'PY', c:'C', cpp:'C++', go:'GO', md:'MD', unknown:'TXT' }[nodeLang] || nodeLang.toUpperCase()
          return (
            <span style={{padding:'1px 7px',fontSize:'9px',fontFamily:"'Oswald',sans-serif",fontWeight:700,letterSpacing:'.1em',
              background:`${lc}18`, color:lc, border:`1px solid ${lc}44`,
            }}>{ln}</span>
          )
        })()}
        <div className="ide-tb-sep"/>
        <button className="ide-tb-btn" onClick={handleCopy}><I.Copy/> COPY</button>
        <button className="ide-tb-btn" onClick={handleFormat}><I.Format/> FORMAT</button>
        <button className="ide-tb-btn" onClick={toggleLineComment} title="Ctrl+/">{isJS?'//':'#'} CMT</button>
        <div className="ide-tb-sep"/>
        <button className={`ide-tb-btn ${showFind?'active':''}`} onClick={()=>setShowFind(v=>!v)} title="Ctrl+F"><I.Find/> FIND</button>
        <button className={`ide-tb-btn ${wordWrap?'active':''}`} onClick={()=>setWordWrap(v=>!v)}><I.Wrap/> WRAP</button>
        <div className="ide-tb-sep"/>
        <button className="ide-tb-btn" onClick={()=>setFontSize(s=>Math.max(10,s-1))}>A−</button>
        <span style={{fontSize:'10px',opacity:.6,padding:'0 2px',color:palette.base,fontFamily:"'Share Tech Mono', monospace"}}>{fontSize}</span>
        <button className="ide-tb-btn" onClick={()=>setFontSize(s=>Math.min(20,s+1))}>A+</button>
        <div style={{marginLeft:'auto',position:'relative'}}>
          <button className={`ide-tb-btn ${showPaletteMenu?'active':''}`} onClick={()=>setShowPaletteMenu(v=>!v)} style={{gap:'4px'}}>
            <div style={{display:'flex',gap:'3px'}}>{palette.swatches.map((c,i)=><div key={i} style={{width:'8px',height:'8px',borderRadius:'2px',background:c}}/>)}</div>
            {palette.name}
          </button>
          {showPaletteMenu && (
            <div className="ide-palette-dropdown" onClick={e=>e.stopPropagation()}>
              <div className="ide-palette-sec">DARK</div>
              {PALETTES.filter(p=>!PALETTE_LIGHT_IDS.has(p.id)).map(p=>(
                <div key={p.id} className={`ide-palette-opt ${palette.id===p.id?'active':''}`} onClick={()=>{setPalette(p);setShowPaletteMenu(false)}} style={{background:p.bg}}>
                  <div className="ide-palette-swatches">{p.swatches.map((c,i)=><div key={i} className="ide-palette-swatch" style={{background:c}}/>)}</div>
                  <span className="ide-palette-name" style={{color:p.base}}>{p.name}</span>
                </div>
              ))}
              <div className="ide-palette-sec">LIGHT</div>
              {PALETTES.filter(p=>PALETTE_LIGHT_IDS.has(p.id)).map(p=>(
                <div key={p.id} className={`ide-palette-opt ${palette.id===p.id?'active':''}`} onClick={()=>{setPalette(p);setShowPaletteMenu(false)}} style={{background:p.bg}}>
                  <div className="ide-palette-swatches">{p.swatches.map((c,i)=><div key={i} className="ide-palette-swatch" style={{background:c}}/>)}</div>
                  <span className="ide-palette-name" style={{color:p.base}}>{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Find bar */}
      {showFind && (
        <div className="ide-find-bar">
          <span style={{fontSize:'9px',opacity:.5,flexShrink:0,color:palette.base}}>FIND</span>
          <input value={findQuery} onChange={e=>setFindQuery(e.target.value)} placeholder="Search..." spellCheck={false} style={{color:palette.base}} />
          <span style={{fontSize:'9px',opacity:.35,flexShrink:0,color:palette.base}}>→</span>
          <input value={replaceQuery} onChange={e=>setReplaceQuery(e.target.value)} placeholder="Replace..." spellCheck={false} style={{color:palette.base}} />
          <button className="ide-tb-btn" onClick={handleFindReplace} style={{flexShrink:0}}>REPLACE ALL</button>
          <button className="ide-tb-btn" onClick={()=>setShowFind(false)} style={{flexShrink:0,color:'#ff435a'}}>✕</button>
        </div>
      )}
      {/* Main editor area */}
      <div style={{display:'flex',flex:1,overflow:'hidden',minHeight:0}}>
        {/* Diff panel */}
        {showDiff && (
          <div style={{width:'200px',flexShrink:0,borderRight:`1px solid ${palette.lineNum}44`,overflow:'auto',background:palette.bg,display:'flex',flexDirection:'column'}}>
            <div style={{padding:'7px 10px',fontSize:'9px',opacity:.4,borderBottom:`1px solid ${palette.lineNum}44`,letterSpacing:'1px',color:palette.base}}>DIFF — WORKING TREE</div>
            <div style={{flex:1,overflow:'auto',padding:'8px 0'}}>
              {diffLines.map((dl,i)=>(
                <div key={i} className={`diff-line ${dl.type==='add'?'diff-add':dl.type==='del'?'diff-del':''}`} style={{fontSize:'10px',color:palette.base}}>
                  <span className="diff-line-num" style={{color:palette.lineNum}}>{dl.num||'+'}</span>
                  <span style={{fontFamily:"'JetBrains Mono',monospace"}}>{dl.text||' '}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Line numbers */}
        <div className="line-numbers" ref={lineNumRef} style={{background:palette.bg,color:palette.lineNum,fontSize:fontSize+'px',lineHeight:lineH+'px',overflow:'hidden',flexShrink:0,userSelect:'none',textAlign:'right',padding:`20px 8px 20px 4px`,minWidth:'36px'}}>
          {code.split('\n').map((_,i)=>(
            <div key={i} className="line-num" style={{lineHeight:lineH+'px',color:i===cursor.line-1?palette.base:palette.lineNum}}>{i+1}</div>
          ))}
        </div>
        {/* Code area */}
        <div style={{flex:1,position:'relative',overflow:'hidden'}}>
          <div className="active-line-highlight" style={{top:20+activeLineY,height:lineH,background:palette.activeLine,borderLeft:`2px solid ${palette.kw}55`,pointerEvents:'none',zIndex:1}}/>
          <div className="code-highlight-overlay" ref={overlayRef} style={{position:'absolute',top:0,left:0,right:0,padding:`20px 14px`,fontFamily:"'JetBrains Mono',monospace",fontSize:fontSize+'px',lineHeight:lineH+'px',pointerEvents:'none',color:palette.base,overflow:'hidden',whiteSpace:wordWrap?'pre-wrap':'pre'}}>
            <pre className="editor-palette-scope" style={{margin:0,fontFamily:"'JetBrains Mono',monospace",fontSize:fontSize+'px',lineHeight:lineH+'px',color:palette.base,whiteSpace:wordWrap?'pre-wrap':'pre'}} dangerouslySetInnerHTML={{__html:highlighted}}/>
          </div>
          <textarea
            ref={textareaRef}
            className="code-area"
            value={code}
            onChange={e=>{onChange(e.target.value); computeAc(e.target.value, e.target.selectionStart)}}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            onSelect={e=>{handleCursorUpdate(e)}}
            onClick={e=>{handleCursorUpdate(e)}}
            onBlur={()=>setTimeout(()=>setAcList([]),150)}
            spellCheck={false}
            style={{position:'absolute',inset:0,padding:`20px 14px`,fontFamily:"'JetBrains Mono',monospace",fontSize:fontSize+'px',lineHeight:lineH+'px',color:'transparent',caretColor:palette.fn,background:'transparent',border:'none',outline:'none',resize:'none',zIndex:2,whiteSpace:wordWrap?'pre-wrap':'pre',overflowWrap:wordWrap?'break-word':'normal',overflow:'auto'}}
          />
          {/* Autocomplete dropdown */}
          {acList.length > 0 && (
            <div className="ide-ac-popup" style={{
              position:'absolute',
              top: Math.min((cursor.line) * lineH + 20 - (textareaRef.current?.scrollTop||0), (lineH*20)),
              left: Math.min(36 + 14 + (cursor.col - 1) * (fontSize * 0.605), '60%' as any),
              fontSize:(fontSize-1)+'px',
            }}>
              {acList.map((item,i)=>(
                <div key={item} className={`ide-ac-item${i===acIdx?' active':''}`}
                  onMouseDown={e=>{e.preventDefault();insertAc(item)}}
                  style={{color:i===acIdx?palette.kw:palette.base}}>
                  {item}
                </div>
              ))}
              <div className="ide-ac-footer">
                Tab/↵ insert · Esc close
              </div>
            </div>
          )}
        </div>
        {/* Minimap */}
        {minimap && (
          <div style={{width:'56px',flexShrink:0,background:palette.bg,borderLeft:`1px solid ${palette.lineNum}22`,overflow:'hidden',padding:'8px 4px',cursor:'default'}}>
            <svg width="48" height="100%" style={{display:'block',overflow:'visible'}}>
              {minimapLines.map((l,i)=>(
                <rect key={i} x={l.indent * 0.3} y={i * 3.2} width={l.len * 0.38} height={1.6} fill={palette.lineNum} opacity=".7" rx=".5"/>
              ))}
              <rect x={0} y={(cursor.line-1)*3.2} width={48} height={3.5} fill={palette.kw} opacity=".12" rx="1"/>
            </svg>
          </div>
        )}
      </div>
      {/* Status strip */}
      <div className="editor-status-strip" style={{background:palette.bg,borderTop:`1px solid ${palette.lineNum}33`,color:palette.base}}>
        <span style={{opacity:.45}}>Ln {cursor.line}:{cursor.col}</span>
        <span style={{opacity:.2}}>|</span>
        <span style={{opacity:.45}}>{code.split('\n').length}L</span>
        <span style={{opacity:.2}}>|</span>
        <span style={{color:palette.fn,opacity:.7}}>{node.type}</span>
        {node.modified && <><span style={{opacity:.2}}>|</span><span style={{color:'#ffc410',fontSize:'8px'}}>● MOD</span></>}
        <span style={{opacity:.2}}>|</span>
        <span style={{opacity:.22,fontSize:'11px'}}>^Enter RUN · ^/ CMT · ^F FIND · Tab INDENT</span>
        <span style={{marginLeft:'auto',opacity:.35}}>{palette.name}</span>
      </div>
      {toastMsg && <div className="copy-toast">{toastMsg}</div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MARKDOWN RENDERER
// ══════════════════════════════════════════════════════════════

function renderMd(raw) {
  if (!raw) return ''
  const blocks = []
  let s = raw.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_,lang,code) => {
    blocks.push(`<pre class="md-pre"><code class="md-code-block">${code.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`)
    return `\x00BLK${blocks.length-1}\x00`
  })
  s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  s = s
    .replace(/^#{3}\s+(.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1 class="md-h1">$1</h1>')
    .replace(/^---$/gm, '<hr class="md-hr"/>')
    .replace(/^&gt;\s?(.*)$/gm, '<blockquote class="md-bq">$1</blockquote>')
    .replace(/^[\-\*]\s+(.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="md-oli">$1</li>')
  s = s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="md-ic">$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="md-img" src="$2" alt="$1"/>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-a" href="$2" target="_blank" rel="noopener">$1</a>')
  s = s.split(/\n{2,}/).map(p => {
    p = p.trim()
    if (!p) return ''
    if (/^<(h[1-3]|hr|pre|blockquote|li|\x00)/.test(p)) return p
    return `<p class="md-p">${p.replace(/\n/g,'<br/>')}</p>`
  }).join('\n')
  s = s.replace(/(<li(?:\s[^>]*)?>[\s\S]*?<\/li>\n?)+/g, m => `<ul class="md-ul">${m}</ul>`)
  s = s.replace(/\x00BLK(\d+)\x00/g, (_,i) => blocks[i])
  return s
}

// ══════════════════════════════════════════════════════════════
//  PERSISTENCE
// ══════════════════════════════════════════════════════════════

const LS_KEY    = 'forbiden-ide-v1'
function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (d.nodes?.length) return { nodes: d.nodes, edges: d.edges || [], groups: d.groups || [] }
    }
  } catch {}
  return { nodes: [], edges: [], groups: [] }
}

// ══════════════════════════════════════════════════════════════
//  FOLDER IMPORT PARSER
// ══════════════════════════════════════════════════════════════

function _parseImports(code) {
  const paths = []
  const res = [
    /import\s+(?:[^'";\n]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of res) {
    re.lastIndex = 0; let m
    while ((m = re.exec(code)) !== null) if (!paths.includes(m[1])) paths.push(m[1])
  }
  return paths
}

function _resolveRel(fromDir, imp) {
  const parts = (fromDir + imp).split('/')
  const out = []
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p) }
  return out.join('/')
}

function _guessType(name, code) {
  if (/^(index|main|app)\.(j|t)sx?$/.test(name)) return 'entry'
  if (/\bclass\s+\w+/.test(code)) return 'class'
  if (/\.(md|txt)$/.test(name)) return 'doc'
  if (/\.(jsx|tsx)$/.test(name) || /useState|useEffect|React/.test(code)) return 'module'
  return 'function'
}

const _TYPE_THEME = { entry:0, function:5, class:6, module:4, doc:11 }

async function parseFolderToGraph(fileList) {
  const all = await Promise.all([...fileList].map(f =>
    f.text().then(text => ({
      name: f.name,
      path: (f.webkitRelativePath || f.name).replace(/\\/g, '/'),
      text,
    }))
  ))
  const kept = all.filter(f =>
    /\.(js|ts|jsx|tsx|mjs|cjs|md)$/.test(f.name) &&
    !f.path.includes('node_modules/') &&
    !f.path.includes('.min.') &&
    !f.path.includes('/dist/')
  )
  const nodes = kept.map((f, i) => {
    const type = _guessType(f.name, f.text)
    return {
      id: 'u'+i, label: f.name, filepath: f.path, type,
      isMain: /^(index|main)\.(j|t)sx?$/.test(f.name),
      x: (Math.random()-.5)*700, y: (Math.random()-.5)*500,
      vx:0, vy:0, themeIdx: _TYPE_THEME[type]??1,
      classId:null, code: f.text, modified:false,
    }
  })
  const pathMap = {}
  kept.forEach((f, i) => { pathMap[f.path] = 'u'+i })
  const edges = [], seen = new Set()
  kept.forEach((f, i) => {
    if (f.name.endsWith('.md')) return
    const sid = 'u'+i
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')+1) : ''
    _parseImports(f.text).filter(p => p.startsWith('.')).forEach(imp => {
      const base = _resolveRel(dir, imp)
      for (const c of [base, base+'.js', base+'.ts', base+'.jsx', base+'.tsx', base+'/index.js', base+'/index.ts', base+'/index.tsx']) {
        const tid = pathMap[c]
        if (tid && tid !== sid) {
          const key = sid+'>'+tid
          if (!seen.has(key)) { seen.add(key); edges.push({id:'ue'+edges.length, source:sid, target:tid}) }
          break
        }
      }
    })
  })
  return { nodes, edges, groups:[] }
}


// ══════════════════════════════════════════════════════════════
//  FUZZY FILE FINDER MODAL
// ══════════════════════════════════════════════════════════════

function getFileIcon(name: string) {
  const ext = (name || '').split('.').pop()?.toLowerCase()
  const map: Record<string,string> = {
    js:'⬡', mjs:'⬡', jsx:'⬡', ts:'◈', tsx:'◈',
    py:'⬟', go:'◉', rs:'◆', c:'◇', cpp:'◇', h:'◇',
    md:'⌗', json:'{}', css:'#', html:'<>', sh:'$',
    txt:'≡', yaml:'⁞', yml:'⁞', toml:'⁞',
  }
  return map[ext || ''] || '·'
}

function getFileColor(name: string) {
  const ext = (name || '').split('.').pop()?.toLowerCase()
  const map: Record<string,string> = {
    js:'#f2c12e', mjs:'#f2c12e', jsx:'#f2c12e', ts:'#4285f4', tsx:'#4285f4',
    py:'#28f1c3', go:'#89ddff', rs:'#ff8080', c:'#ff8080', cpp:'#ff8080',
    md:'#c792ea', json:'#ffc410', css:'#89b4fa', html:'#e06c75', sh:'#10b981',
  }
  return map[ext || ''] || '#888'
}

// ══════════════════════════════════════════════════════════════
//  MAIN IDE COMPONENT
// ══════════════════════════════════════════════════════════════

function IDE({ initialTheme = 'cyber', initialAvatar = 0 }) {
  const wsHook = useWorkspace()

  // ── Zustand store reads ─────────────────────────────────────
  const {
    themeMode, setThemeMode,
    transform, setTransform,
    isDraggingCanvas, setIsDraggingCanvas,
    editorOpen, setEditorOpen,
    editorW, setEditorW,
    sidebarOpen, setSidebarOpen,
    sidebarW, setSidebarW,
    bottomOpen, setBottomOpen,
    bottomTab, setBottomTab,
    bottomH, setBottomH,
    sidebarMode, setSidebarMode,
    hoveredNodeId, setHoveredNodeId,
    hoveredEdgeId, setHoveredEdgeId,
    edgeMode, setEdgeMode,
    joinFirstNode, setJoinFirstNode,
    nodeColorPicker, setNodeColorPicker,
    nodeCtxMenu, setNodeCtxMenu,
    openGroupId, setOpenGroupId,
    showCmd, setShowCmd,
    showFileFinder, setShowFileFinder,
    showCreateNode, setShowCreateNode,
    showCreateGroup, setShowCreateGroup,
    showJumpLine, setShowJumpLine,
    showShortcuts, setShowShortcuts,
    zenMode, setZenMode,
    newNodeName, setNewNodeName,
    newNodeType, setNewNodeType,
    newNodeColor, setNewNodeColor,
    groupName, setGroupName,
    groupColor, setGroupColor,
    groupSelected, setGroupSelected,
    notebookFloating, setNotebookFloating,
    globalFontScale, setGlobalFontScale,
    avatarIndex, setAvatarIndex,
  } = useUIStore()

  const {
    openTabs, openTab, closeTab, setOpenTabsDirect: _setOpenTabsDirect,
    activeTabId, setActiveTabId,
    pinnedTabs: pinnedTabsArr, togglePinTab,
    globalEditorPalette, setGlobalEditorPalette,
    splitTabId, setSplitTabId,
    splitMode, setSplitMode,
    formatOnSave, setFormatOnSave,
    jumpLineTarget, setJumpLineTarget,
    editorCursorPos, setEditorCursorPos,
  } = useEditorStore()
  // pinnedTabs as Set for backward-compat with monolith code (uses .has/.add/.delete)
  const pinnedTabs = new Set(pinnedTabsArr)
  const setOpenTabs = (v) => {
    const curr = useEditorStore.getState().openTabs
    _setOpenTabsDirect(typeof v === 'function' ? v(curr) : v)
  }
  const setPinnedTabs = (v) => {
    // handled via togglePinTab; this shim accepts a new Set and syncs
    const ids = v instanceof Set ? [...v] : v
    useEditorStore.setState({ pinnedTabs: ids })
  }

  const {
    explorerRoot, setExplorerRoot,
    explorerRefreshKey, triggerRefresh,
    recentFiles, addRecentFile,
    searchQuery, setSearchQuery,
    projectSearchQuery, setProjectSearchQuery,
    projectSearchResults, setProjectSearchResults,
    projectSearchLoading, setProjectSearchLoading,
    replaceQuery, setReplaceQuery,
    replaceLoading, setReplaceLoading,
  } = useWorkspaceStore()
  const setExplorerRefreshKey = () => triggerRefresh()
  const trackRecentFile = (f) => addRecentFile(f)

  const {
    aiProvider, setAiProvider,
    aiKeys, setAiKeys,
    aiModels, setAiModels,
    ollamaModels, setOllamaModels,
  } = useAiStore()

  // ── Terminal store ──────────────────────────────────────────
  const {
    termCwd, setTermCwd,
    termPalette, setTermPalette,
    showTermPalette, setShowTermPalette,
    activePtyId, setActivePtyId,
    termLines: _termLinesDirect,
    setTermLines: _setTermLinesDirect,
    termInput, setTermInput,
    jsLogs,
    setJsLogs: _setJsLogsDirect,
    replInput, setReplInput,
    replHistory, setReplHistIdx,
    replHistIdx,
    compileStdin, setCompileStdin,
    mdPreviewMode, setMdPreviewMode,
    mdFontSize, setMdFontSize,
  } = useTerminalStore()
  const termLines = _termLinesDirect
  const setTermLines = useCallback((v) => {
    const curr = useTerminalStore.getState().termLines
    _setTermLinesDirect(typeof v === 'function' ? v(curr) : v)
  }, [_setTermLinesDirect])
  const setJsLogs = useCallback((v) => {
    const curr = useTerminalStore.getState().jsLogs
    _setJsLogsDirect(typeof v === 'function' ? v(curr) : v)
  }, [_setJsLogsDirect])
  const setReplHistory = useCallback((v) => {
    const curr = useTerminalStore.getState().replHistory
    useTerminalStore.setState({ replHistory: typeof v === 'function' ? v(curr) : v })
  }, [])

  // ── Git store ───────────────────────────────────────────────
  const {
    gitStatus, setGitStatus,
    gitLog, setGitLog,
    gitBranch, setGitBranch,
    gitCommitMsg, setGitCommitMsg,
    gitLoading, setGitLoading,
    aiCommitLoading, setAiCommitLoading,
  } = useGitStore()

  // ── Board store ─────────────────────────────────────────────
  const {
    cols, cards,
    focusCard, setFocusCard,
    newCardCol, setNewCardCol,
    newCardTitle, setNewCardTitle,
  } = useBoardStore()
  const board = { cols, cards }
  const setBoard = (v) => {
    const curr = useBoardStore.getState()
    const next = typeof v === 'function' ? v({ cols: curr.cols, cards: curr.cards }) : v
    useBoardStore.setState({ cols: next.cols, cards: next.cards })
  }

  // ── Timeline store ──────────────────────────────────────────
  const {
    eventLog,
    addEvent,
    playheadPos, setPlayheadPos,
    activeVersionName, setActiveVersionName,
    activeVersionIdx, setActiveVersionIdx,
  } = useTimelineStore()

  const brutal = themeMode === 'brutal'

  // Graph state
  const _saved = useMemo(() => loadSaved(), [])
  const nodesRef  = useRef(_saved.nodes)
  const edgesRef  = useRef(_saved.edges)
  const groupsRef = useRef(_saved.groups)
  const saveTimerRef = useRef(null)
  const [_rt, _setRt] = useState(0)
  const forceRender = useCallback(() => _setRt(t => t+1), [])
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false)
  const [searchResultIdx, setSearchResultIdx] = useState(-1)

  useEffect(() => {
    if (_rt === 0) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          nodes: nodesRef.current,
          edges: edgesRef.current,
          groups: groupsRef.current,
        }))
      } catch {}
    }, 800)
  }, [_rt])

  // Canvas refs (transform/isDraggingCanvas come from uiStore above)
  const lastMousePos = useRef({ x:0, y:0 })
  const draggingNodeRef  = useRef(null)
  const wakePhysicsRef   = useRef<() => void>(() => {})
  const nodeElsRef       = useRef<Map<string, HTMLDivElement>>(new Map())
  const registerNodeEl   = useCallback((id: string, el: HTMLDivElement) => { nodeElsRef.current.set(id, el) }, [])
  const unregisterNodeEl = useCallback((id: string) => { nodeElsRef.current.delete(id) }, [])
  const canvasInputRef = useRef(null)
  const folderInputRef = useRef(null)

  // ── Unified floating panel system ──────────────────────────────
  const W = typeof window!=='undefined' ? window.innerWidth  : 1400
  const H = typeof window!=='undefined' ? window.innerHeight : 900
  const splitDragRef = useRef<any>(null)
  const panelDragRef = useRef(null)
  const tlDragRef    = useRef<any>(null)

  // ── Split-pane drag (editor/sidebar width) ──────────────────
  useEffect(() => {
    const onMove = (e) => {
      const d = splitDragRef.current; if (!d) return
      const dx = e.clientX - d.sx
      if (d.side === 'editor')  setEditorW(w  => Math.max(240, Math.min(window.innerWidth*0.85, d.startW - dx)))
      if (d.side === 'sidebar') setSidebarW(w => Math.max(160, Math.min(480, d.startW + dx)))
    }
    const onUp = () => { splitDragRef.current=null; document.body.style.userSelect=''; document.body.style.cursor='' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Timeline panel drag (height) ────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      const d = tlDragRef.current; if (!d) return
      const dy = e.clientY - d.sy
      setBottomH(h => Math.max(120, Math.min(window.innerHeight*0.65, d.startH - dy)))
    }
    const onUp = () => { tlDragRef.current=null; document.body.style.userSelect=''; document.body.style.cursor='' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Git panel state ─────────────────────────────────────────
  // gitStatus, gitLog, gitBranch, gitCommitMsg, gitLoading, aiCommitLoading → gitStore (above)
  // eventLog, addEvent → timelineStore (above)

  const refreshGit = useCallback(async () => {
    if (api?.git && (window as any).__forbiddenCwd) {
      const cwd = (window as any).__forbiddenCwd
      setGitLoading(true)
      try {
        const [status, log, branch] = await Promise.all([
          api.git.status(cwd),
          api.git.log(cwd),
          api.git.branch(cwd),
        ])
        setGitStatus(status)
        setGitLog(log)
        setGitBranch(branch)
      } catch { /* keep previous state */ }
      finally { setGitLoading(false) }
      return
    }
    // No native git — derive from in-memory event log
    const modNodes = nodesRef.current.filter((n:any) => n.modified)
    setGitStatus({ modified: modNodes.map((n:any) => n.label) })
    setGitLog(eventLog.filter((e:any) => e.type==='commit').slice(0,30).map((e:any) => ({
      hash: e.id.toString(16).slice(0,7),
      message: e.label,
      author: 'Operator',
      date: new Date(e.ts).toISOString(),
    })))
    setGitBranch('main')
  }, [eventLog])

  const handleAiCommitMsg = async () => {
    const cwd = (window as any).__forbiddenCwd
    if (!cwd || !api?.git) return
    const activeKey = aiProvider === 'ollama' ? (aiKeys['ollama'] || 'http://localhost:11434') : (aiKeys[aiProvider] || '')
    if (aiProvider !== 'ollama' && !activeKey) {
      setSidebarMode('settings'); setSidebarOpen(true); return
    }
    setAiCommitLoading(true)
    const diffRes = await api.git.diff(cwd, '').catch(() => ({ diff: '' }))
    const statusRes = await api.git.status(cwd).catch(() => ({ files: [] }))
    const diff = (diffRes?.diff || '').slice(0, 6000)
    const files = (statusRes?.files || []).map((f:any) => f.file || f.path || '').filter(Boolean).join(', ')
    const activeModel = aiModels[aiProvider] || DEFAULT_MODELS[aiProvider] || ''
    const result = await api.ai.chat(
      [{ role: 'user', content: `Write a concise git commit message (50 chars or less for title, then optional body) for these changes:\n\nChanged files: ${files}\n\nDiff:\n\`\`\`\n${diff}\n\`\`\`` }],
      activeKey,
      activeModel,
      'You are a git commit message writer. Output ONLY the commit message, no explanation, no quotes. Follow conventional commits format when applicable (feat/fix/refactor/docs/etc).',
      aiProvider,
    )
    setAiCommitLoading(false)
    if (result?.success && result.content) setGitCommitMsg(result.content.trim())
  }

  const handleGitCommit = async () => {
    if (!gitCommitMsg.trim()) return
    const msg = gitCommitMsg.trim()
    if (api?.git && (window as any).__forbiddenCwd) {
      setGitLoading(true)
      const result = await api.git.commit((window as any).__forbiddenCwd, msg).catch((e:any) => ({ success:false, error: e.message }))
      setGitLoading(false)
      if (result.success) {
        addEvent('commit', `Commit: ${msg.slice(0,40)}`)
        setGitCommitMsg('')
        refreshGit()
      } else {
        addEvent('error', `Git commit failed: ${result.error || 'unknown error'}`)
      }
      return
    }
    addEvent('commit', `Commit: ${msg.slice(0,40)}`)
    nodesRef.current = nodesRef.current.map(n=>({...n,modified:false}))
    setGitCommitMsg('')
    forceRender({})
  }

  // Refresh git badge when source-control sidebar opens
  useEffect(() => {
    if (sidebarOpen && sidebarMode === 'git') refreshGit()
  }, [sidebarOpen, sidebarMode])

  const handleDeleteNode = useCallback((nid) => {
    const deletedLabel = nodesRef.current.find(n=>n.id===nid)?.label||nid
    nodesRef.current=nodesRef.current.filter(n=>n.id!==nid)
    edgesRef.current=edgesRef.current.filter(e=>e.source!==nid&&e.target!==nid)
    setOpenTabs(t=>t.filter(tid=>tid!==nid))
    if (activeTabId===nid) setActiveTabId(null)
    forceRender({})
    wakePhysicsRef.current()
    addEvent('node-delete', `Deleted ${deletedLabel}`)
    wsHook.deleteNode(nid).catch(()=>{})
  }, [activeTabId, addEvent])

  // Board, Timeline, Terminal, JS Runtime, Markdown → stores (above)
  // board/setBoard, focusCard, newCardCol, newCardTitle → boardStore
  // eventLog, addEvent, playheadPos, activeVersionName, activeVersionIdx → timelineStore
  // termCwd, termLines, termInput, termPalette, showTermPalette, activePtyId → terminalStore
  // jsLogs, replInput, replHistory, replHistIdx, compileStdin → terminalStore
  // mdPreviewMode, mdFontSize → terminalStore
  const PC = { HIGH:'#ff435a', MED:'#ffc410', LOW:'#4285f4', DONE:'#10b981' }
  const playheadDragRef = useRef({ isDragging:false })
  const activePtyIdRef = useRef<string | null>(null)
  const handleActivePtyChange = useCallback((id) => {
    activePtyIdRef.current = id
    setActivePtyId(id)
  }, [setActivePtyId])
  const termEndRef = useRef(null)
  const [nodeRunState, setNodeRunState] = useState({})
  const [edgeDataLabels, setEdgeDataLabels] = useState({})
  // Chat & Notes (local state — not persisted)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([
    {id:1, from:'System', text:'Sync established. 4 nodes active.', self:false},
    {id:2, from:'Op-2', text:'Pushing DataMatrix refactor.', self:false},
    {id:3, from:'You', text:'Architecture booted. Running tests.', self:true},
  ])
  const [notesText, setNotesText] = useState('// OPERATOR NOTES\n// Sprint-01 planning\n\nTODO:\n- Finish graph force simulation\n- Wire WebSocket protocol\n- Add color palette persistence\n')
  const [welcomeSearch, setWelcomeSearch] = useState('')
  const [welcomeFilter, setWelcomeFilter] = useState('all')
  const chatEndRef = useRef(null)

  // ── COMPUTED ──
  const activeTabNode = nodesRef.current.find(n => n.id === activeTabId) || null
  const activeLang    = detectLang(activeTabNode?.label || '')
  const canRun        = activeTabNode && activeLang !== 'md' && activeLang !== 'unknown'
  const modifiedNodes = nodesRef.current.filter(n => n.modified)
  const nodeCount = nodesRef.current.length
  const edgeCount = edgesRef.current.length
  const openGroup = groupsRef.current.find(g => g.id === openGroupId) || null

  const visibleNodes = nodesRef.current.filter(n => {
    if (n.id==='n1' && playheadPos<100) return false
    if (n.id==='n3' && playheadPos<250) return false
    return true
  })
  const visibleEdges = edgesRef.current.filter(e =>
    visibleNodes.find(n=>n.id===e.source) && visibleNodes.find(n=>n.id===e.target)
  )
  const filteredNodes = nodesRef.current.filter(n => {
    const q = searchQuery.trim().toLowerCase()
    return !q || n.label.toLowerCase().includes(q) || (n.code||'').toLowerCase().includes(q)
  })

  // ── EFFECTS ──

  useEffect(() => { termEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [termLines])
  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [chatMessages])

  // ── Init workspace folder on startup ────────────────────────
  useEffect(() => {
    if (!api?.fs) return
    ;(async () => {
      const [defaultRes, savedRes] = await Promise.all([
        api.fs.ensureDefaultWorkspace(),
        api.fs.getWorkspace(),
      ])
      const folder = savedRes?.path || (defaultRes.success ? defaultRes.path : null)
      if (!folder) return
      setExplorerRoot(folder)
      ;(window as any).__forbiddenCwd = folder
      setTermCwd(folder)
      setSidebarMode('files')
    })()
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      setEdgeDataLabels(prev => {
        const next = {...prev}
        let changed = false
        Object.keys(next).forEach(k => { if (now - next[k].ts > 8000) { delete next[k]; changed = true } })
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Load workspace data from API
  useEffect(() => {
    if (wsHook.loading || wsHook.error) return
    if (wsHook.nodes.length > 0) {
      nodesRef.current = wsHook.nodes.map(n => ({
        id:n.id, label:n.label, filepath:n.filepath,
        type:n.type||'function', isMain:n.is_main,
        x:n.x||0, y:n.y||0, vx:0, vy:0,
        themeIdx:n.theme_idx||0, classId:n.class_id,
        code:'', modified:n.modified||false,
      }))
      edgesRef.current = wsHook.edges.map(e => ({id:e.id,source:e.source,target:e.target}))
      groupsRef.current = wsHook.groups.map(g => ({id:g.id,name:g.name,color:g.color,nodeIds:g.node_ids||[]}))
      forceRender({})
    }
    if (wsHook.columns.length > 0) {
      setBoard({
        cols: wsHook.columns.map(c=>({id:c.id,title:c.title,color:c.color})),
        cards: wsHook.cards.map(k=>({id:k.id,colId:k.col_id,title:k.title,priority:k.priority,tags:k.tags||[],progress:k.progress||0,due:k.due||null,assignee:k.assignee_idx??null})),
      })
    }
  }, [wsHook.loading])

  // Force simulation — stops when settled, restarts via wakePhysicsRef
  useEffect(() => {
    let rafId: number
    let idleFrames = 0
    let lastRenderMs = 0
    let wasDragging = false

    const tick = (now: number) => {
      const isDragging = !!draggingNodeRef.current
      // React re-renders at 30fps for edge SVG. Node positions are DOM-direct (see below).
      const shouldRender = now - lastRenderMs >= 1000 / 30

      let updated = false
      const nds = nodesRef.current, eds = edgesRef.current

      // ── Build node map + adjacency list for drag propagation ──
      const nodeMap = new Map<string, any>()
      for (let i = 0; i < nds.length; i++) nodeMap.set(nds[i].id, nds[i])

      const adj = new Map<string, string[]>()
      for (let i = 0; i < eds.length; i++) {
        const { source, target } = eds[i]
        if (!adj.has(source)) adj.set(source, [])
        if (!adj.has(target)) adj.set(target, [])
        adj.get(source)!.push(target)
        adj.get(target)!.push(source)
      }

      // ── Find main node — gravity anchor for all others ──
      let mainX = 0, mainY = 0
      for (let i = 0; i < nds.length; i++) {
        if (nds[i].isMain) { mainX = nds[i].x; mainY = nds[i].y; break }
      }

      // ── Repulsion between all pairs ──
      for (let i = 0; i < nds.length; i++) {
        for (let j = i + 1; j < nds.length; j++) {
          const dx = nds[j].x - nds[i].x, dy = nds[j].y - nds[i].y
          const distSq = dx*dx + dy*dy || 1, dist = Math.sqrt(distSq)
          const force = 7000 / distSq
          nds[i].vx -= (dx/dist)*force; nds[i].vy -= (dy/dist)*force
          nds[j].vx += (dx/dist)*force; nds[j].vy += (dy/dist)*force
        }
      }

      // ── Edge springs: stiffer + longer rest for snappy elastic feel ──
      for (let i = 0; i < eds.length; i++) {
        const src = nodeMap.get(eds[i].source), tgt = nodeMap.get(eds[i].target)
        if (!src || !tgt) continue
        const dx = tgt.x - src.x, dy = tgt.y - src.y
        const dist = Math.sqrt(dx*dx + dy*dy) || 1
        const force = (dist - 150) * 0.12
        src.vx += (dx/dist)*force; src.vy += (dy/dist)*force
        tgt.vx -= (dx/dist)*force; tgt.vy -= (dy/dist)*force
      }

      // ── Gravity: main node pinned gently to origin; all others orbit main ──
      for (let i = 0; i < nds.length; i++) {
        const n = nds[i]
        if (n.isMain) {
          n.vx += (0 - n.x) * 0.006; n.vy += (0 - n.y) * 0.006
        } else {
          n.vx += (mainX - n.x) * 0.014; n.vy += (mainY - n.y) * 0.014
        }
      }

      // ── Integrate + dampen ──
      for (let i = 0; i < nds.length; i++) {
        const n = nds[i]
        n.vx *= 0.80; n.vy *= 0.80
        n.x += n.vx; n.y += n.vy
        if (Math.abs(n.vx) > 0.05 || Math.abs(n.vy) > 0.05) updated = true
      }

      // ── Dragged node: pin to pointer + propagate velocity impulse to neighbors ──
      if (isDragging) {
        const d = draggingNodeRef.current
        const dn = nodeMap.get(d.id)
        if (dn) {
          const moveX = d.x - dn.x, moveY = d.y - dn.y
          dn.x = d.x; dn.y = d.y; dn.vx = 0; dn.vy = 0
          updated = true
          const neighbors = adj.get(d.id) || []
          for (let k = 0; k < neighbors.length; k++) {
            const nb = nodeMap.get(neighbors[k])
            if (nb) { nb.vx += moveX * 0.55; nb.vy += moveY * 0.55 }
          }
        }
      }

      // ── Direct DOM: update ALL node positions — bypasses React memo for 60fps physics ──
      const els = nodeElsRef.current
      for (let i = 0; i < nds.length; i++) {
        const n = nds[i], el = els.get(n.id)
        if (!el) continue
        const W = n.isMain ? 108 : 90, H = n.isMain ? 44 : 36
        el.style.left = (n.x - W/2) + 'px'
        el.style.top  = (n.y - H/2) + 'px'
      }

      // ── React render only for SVG edges (30fps) or on drag end ──
      if (wasDragging && !isDragging) {
        forceRender(); lastRenderMs = now
      } else if (updated && shouldRender) {
        forceRender(); lastRenderMs = now
      }

      if (updated || !updated) idleFrames = updated ? 0 : idleFrames + 1
      wasDragging = isDragging

      if (updated || isDragging || idleFrames < 8) {
        rafId = requestAnimationFrame(tick)
      }
    }

    wakePhysicsRef.current = () => {
      idleFrames = 0
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(rafId); wakePhysicsRef.current = () => {} }
  }, [])

  // Non-passive wheel listener for zoom
  useEffect(() => {
    const el = canvasInputRef.current
    if (!el) return
    const handler = e => {
      e.preventDefault()
      setTransform(p => ({...p, scale: Math.min(3.0, Math.max(0.3, p.scale*(e.deltaY>0?.92:1.08)))}))
    }
    el.addEventListener('wheel', handler, { passive:false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── FOLDER OPEN (sets explorer root) ─────────────────────────
  const handleOpenFolderForExplorer = useCallback(async () => {
    if (!api?.dialog) return
    const folder = await api.dialog.openFolder()
    if (!folder) return
    setExplorerRoot(folder)
    ;(window as any).__forbiddenCwd = folder
    setTermCwd(folder)
    setSidebarMode('files')
    setSidebarOpen(true)
    // Clear graph so previous/hardcoded nodes don't bleed into the new folder
    nodesRef.current = []
    edgesRef.current = []
    groupsRef.current = []
    setOpenTabs([])
    setActiveTabId(null)
    forceRender({})
    // Persist so the same folder reopens on next launch
    api.fs?.saveWorkspace?.(folder)
    api.fs?.addRecentWorkspace?.(folder)
    addEvent('import', `Opened folder: ${folder.split('/').pop()}`)
  }, [addEvent])

  // Native menu events (Electron)
  useEffect(() => {
    if (!api?.on) return
    const handleMenuOpenFolder = () => handleOpenFolderForExplorer()
    const handleMenuSaveFile = async () => {
      const node = nodesRef.current.find(n=>n.id===activeTabId)
      if (!node) return
      if (node.filepath?.startsWith('/') && api?.fs) {
        // Direct disk save — no dialog
        const res = await api.fs.writeFile(node.filepath, node.code ?? '')
        if (res.success) {
          nodesRef.current = nodesRef.current.map(n => n.id===activeTabId ? {...n, modified:false} : n)
          forceRender({})
        }
      } else {
        // Fallback: save-as dialog (unsaved / in-memory nodes)
        const res = await api.dialog?.saveFile(node.label, node.code ?? '')
        if (res?.success && res.filePath) {
          nodesRef.current = nodesRef.current.map(n => n.id===activeTabId ? {...n, filepath: res.filePath, modified:false} : n)
          forceRender({})
        }
      }
    }
    const handleMenuRunActive = () => { if (activeTabId) handleRunNode(activeTabId) }
    const handleMenuToggleTerm = () => { setBottomTab('terminal'); setBottomOpen(o => !o) }
    const handleTitleBarFolder = (e: any) => {
      const folder = e.detail
      if (!folder) return
      setExplorerRoot(folder)
      ;(window as any).__forbiddenCwd = folder
      setTermCwd(folder)
      setSidebarMode('files')
      setSidebarOpen(true)
      nodesRef.current = []
      edgesRef.current = []
      groupsRef.current = []
      setOpenTabs([])
      setActiveTabId(null)
      forceRender({})
      api.fs?.saveWorkspace?.(folder)
      api.fs?.addRecentWorkspace?.(folder)
      addEvent('import', `Opened folder: ${folder.split('/').pop()}`)
    }
    api.on('menu:open-folder', handleMenuOpenFolder)
    api.on('menu:save-file', handleMenuSaveFile)
    api.on('menu:run-active', handleMenuRunActive)
    api.on('menu:toggle-terminal', handleMenuToggleTerm)
    window.addEventListener('forbiden:open-folder', handleTitleBarFolder)
    return () => {
      api.off?.('menu:open-folder', handleMenuOpenFolder)
      api.off?.('menu:save-file', handleMenuSaveFile)
      api.off?.('menu:run-active', handleMenuRunActive)
      api.off?.('menu:toggle-terminal', handleMenuToggleTerm)
      window.removeEventListener('forbiden:open-folder', handleTitleBarFolder)
    }
  }, [activeTabId, handleOpenFolderForExplorer, addEvent])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      const tag = e.target.tagName
      const inInput = tag==='INPUT'||tag==='TEXTAREA'||e.target.contentEditable==='true'
      if ((e.metaKey||e.ctrlKey)&&e.key==='p'&&!e.shiftKey) { e.preventDefault(); setShowFileFinder(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.key==='P') { e.preventDefault(); setShowCmd(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key==='p') { e.preventDefault(); setShowCmd(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.key==='g'&&!e.shiftKey) { e.preventDefault(); setShowJumpLine(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&(e.key==='z'||e.key==='Z')) { e.preventDefault(); setZenMode(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&(e.key==='f'||e.key==='F')) { e.preventDefault(); setSidebarMode('project-search'); setSidebarOpen(true) }
      if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&(e.key==='o'||e.key==='O')) { e.preventDefault(); setSidebarMode('outline'); setSidebarOpen(true) }
      if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&(e.key==='g'||e.key==='G')) { e.preventDefault(); setSidebarMode(m=>m==='git'?m:'git'); setSidebarOpen(o=>sidebarMode==='git'?!o:true) }
      if ((e.metaKey||e.ctrlKey)&&e.key==='b'&&!e.shiftKey) { e.preventDefault(); setSidebarOpen(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.key==='?') { e.preventDefault(); setShowShortcuts(v=>!v) }
      if (e.key==='Escape') {
        setShowCmd(false); setShowFileFinder(false); setShowJumpLine(false); setShowShortcuts(false)
        if (zenMode) { setZenMode(false); return }
        setEdgeMode(null); setJoinFirstNode(null); setNodeColorPicker(null); setShowTermPalette(false)
        setNotebookFloating(false)
        if (!openGroupId) setActiveTabId(null)
        setOpenGroupId(null)
      }
      if (!inInput) {
        if (e.key==='n'||e.key==='N') setShowCreateNode(true)
        if (e.key==='g'||e.key==='G') { setShowCreateGroup(true); setGroupSelected([]) }
        if (e.key==='`'||e.key==='~') { setBottomTab('terminal'); setBottomOpen(o => !o) }
        if (e.key==='j'||e.key==='J') setEdgeMode(m=>m==='join'?null:'join')
        if (e.key==='x'||e.key==='X') setEdgeMode(m=>m==='cut'?null:'cut')
        if ((e.key==='Delete'||e.key==='Backspace')&&hoveredNodeId) {
          handleDeleteNode(hoveredNodeId)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openGroupId, hoveredNodeId, activeTabId])

  // ── CANVAS HANDLERS ──
  const handleCanvasPtrDown = e => {
    if (edgeMode) return
    if (e.target.closest('.mn-node')) return
    setNodeColorPicker(null)
    setIsDraggingCanvas(true)
    lastMousePos.current = { x:e.clientX, y:e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handleCanvasPtrMove = e => {
    if (!isDraggingCanvas) return
    const dx=e.clientX-lastMousePos.current.x, dy=e.clientY-lastMousePos.current.y
    setTransform(p=>({...p, x:p.x+dx, y:p.y+dy}))
    lastMousePos.current = { x:e.clientX, y:e.clientY }
  }
  const handleCanvasPtrUp = e => {
    setIsDraggingCanvas(false)
    const dr = draggingNodeRef.current
    if (dr?.hasDragged) wsHook.savePositions([{id:dr.id,x:dr.x,y:dr.y}]).catch(()=>{})
    draggingNodeRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // ── NODE / EDGE ──
  const openNodeInEditor = id => {
    openTab(id)  // openTab = editorStore.openTab (sets openTabs + activeTabId atomically)
    setEditorCursorPos(null)
  }
  const closeTabLocal = id => {
    if (pinnedTabs.has(id)) return // pinned tabs cannot be closed
    closeTab(id)  // closeTab = editorStore.closeTab (handles tab list + active tab)
  }
  // togglePinTab comes from editorStore (imported above)

  // ── Disk save helper ─────────────────────────────────────────
  const saveNodeToDisk = useCallback(async (id: string, skipFormat = false) => {
    const node = nodesRef.current.find(n => n.id === id)
    if (!node) return
    const fsApi = api?.fs
    if (!fsApi) return
    const fp = node.filepath
    if (!fp || !fp.startsWith('/')) return
    let code = node.code || ''
    // Format on save when enabled (and not called recursively)
    if (!skipFormat && formatOnSave && api?.tools?.formatCode) {
      const ext = (node.label || '').split('.').pop()?.toLowerCase() || ''
      const fmtLangs = ['js','mjs','jsx','ts','tsx','css','json','html','md','py','go']
      if (fmtLangs.includes(ext)) {
        const res = await api.tools.formatCode(code, ext)
        if (res?.success && res.formatted) code = res.formatted
        else if (res?.success && res.code) code = res.code
      }
    }
    const res = await fsApi.writeFile(fp, code)
    if (res.success) {
      nodesRef.current = nodesRef.current.map(n => n.id === id ? { ...n, code, modified: false } : n)
      forceRender({})
    }
  }, [forceRender, formatOnSave])

  const codeEditTimerRef = useRef({})
  const updateNodeCode = (id, code) => {
    let wasModified = false
    nodesRef.current = nodesRef.current.map(n => {
      if (n.id === id) {
        wasModified = n.modified
        return { ...n, code, modified: true }
      }
      return n
    })
    if (!wasModified) {
      forceRender({})
    }
    clearTimeout(codeEditTimerRef.current[id])
    codeEditTimerRef.current[id] = setTimeout(() => {
      const node = nodesRef.current.find(n=>n.id===id)
      if (node) addEvent('code-edit', `Edited ${node.label}`, {nodeId:id})
      saveNodeToDisk(id)
    }, 1500)
  }
  const handleNodeClickInMode = nodeId => {
    if (edgeMode==='join') {
      if (!joinFirstNode) { setJoinFirstNode(nodeId); return }
      if (joinFirstNode===nodeId) { setJoinFirstNode(null); return }
      const exists=edgesRef.current.find(e=>(e.source===joinFirstNode&&e.target===nodeId)||(e.source===nodeId&&e.target===joinFirstNode))
      if (!exists) {
        const tempEdge={id:'e'+Date.now(),source:joinFirstNode,target:nodeId}
        edgesRef.current=[...edgesRef.current,tempEdge]
        const srcNode=nodesRef.current.find(n=>n.id===joinFirstNode)
        const tgtNode=nodesRef.current.find(n=>n.id===nodeId)
        const srcLabel=srcNode?.label||joinFirstNode
        const tgtLabel=tgtNode?.label||nodeId
        addEvent('edge-add', `${srcLabel} → ${tgtLabel}`)
        wsHook.createEdge(joinFirstNode,nodeId).catch(()=>{})

        // ── Engine: auto-inject import in target node ──
        if (srcNode && tgtNode && srcNode.code !== undefined) {
          const srcLang = detectLang(srcNode.label)
          const tgtLang = detectLang(tgtNode.label)
          if (tgtLang !== 'md' && tgtLang !== 'unknown' && srcLang !== 'md') {
            const syms = extractSymbols(srcNode.code || '', srcLang)
            const imp  = generateImport(srcNode.label, tgtLang, syms)
            if (imp && tgtNode.code !== undefined) {
              const injected = injectImport(tgtNode.code, imp, tgtLang)
              if (injected !== tgtNode.code) {
                nodesRef.current = nodesRef.current.map(n =>
                  n.id === nodeId ? {...n, code: injected, modified: true} : n
                )
                addEvent('code-edit', `Auto-linked: ${imp}`)
              }
            }
          }
        }

        forceRender({})
      }
      setJoinFirstNode(null)
    }
  }
  const handleEdgeClick = edgeId => {
    if (edgeMode==='cut') {
      edgesRef.current=edgesRef.current.filter(e=>e.id!==edgeId); forceRender({})
      addEvent('edge-del', `Removed edge`)
      wsHook.deleteEdge(edgeId).catch(()=>{})
    }
  }
  const handleChangeNodeColor = (nodeId, colorIdx) => {
    nodesRef.current=nodesRef.current.map(n=>n.id===nodeId?{...n,themeIdx:colorIdx}:n)
    setNodeColorPicker(null); forceRender({})
  }

  // ── GROUP ──
  const dissolveGroup = gid => {
    groupsRef.current=groupsRef.current.filter(g=>g.id!==gid)
    nodesRef.current=nodesRef.current.map(n=>n.classId===gid?{...n,classId:null}:n)
    if (openGroupId===gid) setOpenGroupId(null)
    forceRender({})
    if (wsHook.workspace) wsHook.deleteGroup(gid).catch(()=>{})
  }

  // ── CREATE ──
  const handleFolderUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    e.target.value = ''
    const { nodes, edges, groups } = await parseFolderToGraph(files)
    if (!nodes.length) return
    nodesRef.current  = nodes
    edgesRef.current  = edges
    groupsRef.current = groups
    setOpenTabs([])
    setActiveTabId(null)
    addEvent('import', `Imported folder — ${nodes.length} files, ${edges.length} edges`)
    forceRender()
  }

  const handleCreateNode = async () => {
    if (!newNodeName.trim()) return
    const raw = newNodeName.trim()
    const hasExt = /\.\w{1,5}$/.test(raw)
    const isDocType = newNodeType === 'doc'
    // Auto-pick extension if none provided
    const extMap = { js:'.js', ts:'.ts', py:'.py', c:'.c', cpp:'.cpp', go:'.go', doc:'.md' }
    const autoExt = extMap[newNodeType] || '.js'
    const label = hasExt ? raw.replace(/\s+/g,'_') : raw.replace(/\s+/g,'_') + (isDocType ? '.md' : autoExt)
    const isMd = label.endsWith('.md')
    const lang = detectLang(label)
    // Use engine templates for compiled/known langs, fallback to simple comment
    let code
    if (isMd) {
      code = `# ${raw.replace(/\.\w+$/,'')}\n\n`
    } else {
      const engineCode = getDefaultCode(lang, label, newNodeType)
      code = engineCode || `// ${label}\n\n`
    }
    const x=(Math.random()-.5)*300, y=(Math.random()-.5)*300
    const tempId='n'+Date.now()

    // Determine absolute filepath — use workspace folder if available
    const workspaceFolder = (window as any).__forbiddenCwd
    const absolutePath = workspaceFolder ? `${workspaceFolder}/${label}` : null

    nodesRef.current=[...nodesRef.current,{
      id:tempId, label, filepath: absolutePath || label,
      type:isDocType||isMd?'doc':newNodeType, isMain:false, x, y,
      vx:0, vy:0, themeIdx:isDocType||isMd?11:newNodeColor, classId:null, code, modified:false,
    }]
    setShowCreateNode(false); setNewNodeName(''); forceRender({}); wakePhysicsRef.current()
    openNodeInEditor(tempId)
    addEvent('node-create', `Created ${label}`, {nodeId:tempId})

    // Write to disk so it appears in the file explorer
    if (absolutePath && fsApi) {
      await fsApi.writeFile(absolutePath, code)
      setExplorerRefreshKey(k => k + 1)
    }
  }
  const handleCreateGroup = () => {
    if (!groupName.trim()||groupSelected.length<2) return
    const gid='g'+Date.now()
    groupsRef.current=[...groupsRef.current,{id:gid,name:groupName.trim(),color:groupColor,nodeIds:[...groupSelected]}]
    nodesRef.current=nodesRef.current.map(n=>groupSelected.includes(n.id)?{...n,classId:gid}:n)
    setShowCreateGroup(false); setGroupName(''); setGroupSelected([]); forceRender({})
    if (wsHook.workspace) wsHook.createGroup(groupName.trim(),groupColor,[...groupSelected]).catch(()=>{})
  }

  // trackRecentFile defined above in store bridge (calls workspaceStore.addRecentFile)

  // ── EXPLORER: open file from tree ─────────────────────────────
  const handleExplorerOpenFile = useCallback(async (node: any) => {
    if (!api?.fs) return
    const ext = (node.ext || '').replace(/^\./, '') || node.name.split('.').pop() || ''
    const isText = /^(js|ts|jsx|tsx|mjs|cjs|py|md|txt|json|csv|html|htm|css|yaml|yml|sh|bash|c|cpp|h|hpp|go|rs|rb|java|kt|swift|cs|vue|svelte|toml|xml|env|gitignore)$/i.test(ext)
    if (!isText) { addEvent('system', `Cannot open binary: ${node.name}`); return }
    const res = await api.fs.readFile(node.path)
    if (!res.success) { addEvent('system', `Error reading ${node.name}: ${res.error}`); return }
    // Check if node already exists (by path)
    const existing = nodesRef.current.find(n => n.filepath === node.path || n.label === node.name)
    if (existing) { openNodeInEditor(existing.id); return }
    const lang = detectLang(node.name)
    const nodeType = lang === 'md' ? 'doc' : 'function'
    const newId = 'ex' + Date.now()
    nodesRef.current = [...nodesRef.current, {
      id: newId, label: node.name, filepath: node.path, type: nodeType,
      isMain: /^(index|main)\.(j|t)sx?|main\.py|main\.go$/.test(node.name),
      x: (Math.random() - .5) * 300, y: (Math.random() - .5) * 300,
      vx: 0, vy: 0, themeIdx: nodesRef.current.length % 16, classId: null,
      code: res.content, modified: false,
    }]
    forceRender({})
    openNodeInEditor(newId)
    trackRecentFile({ path: node.path, name: node.name, rel: node.path })
    addEvent('import', `Opened ${node.name}`)
  }, [openNodeInEditor, addEvent, trackRecentFile])

  // ── SCAN IMPORTS → GRAPH ──────────────────────────────────────
  const handleScanImports = useCallback(async (folderPath: string) => {
    if (!api?.fs?.scanImports) { addEvent('system', 'Import scanner only available in Electron app'); return }
    addEvent('system', `Scanning imports in ${folderPath.split('/').pop()}…`)
    const res = await api.fs.scanImports(folderPath)
    if (!res.success) { addEvent('system', `Scan error: ${res.error}`); return }
    const { nodes: scanNodes, edges: scanEdges, fileCount } = res

    if (!scanNodes.length) { addEvent('system', 'No code files found'); return }

    // Map scanned nodes to graph nodes (skip if already exists)
    const existing = new Map(nodesRef.current.map(n => [n.filepath, n.id]))
    const idMap = new Map<string, string>()

    const newNodes: any[] = []
    scanNodes.forEach((sn: any, i: number) => {
      if (existing.has(sn.path)) { idMap.set(sn.id, existing.get(sn.path)!); return }
      const newId = 'scan' + Date.now() + i
      idMap.set(sn.id, newId)
      newNodes.push({
        id: newId, label: sn.label, filepath: sn.path, type: 'function',
        isMain: /^(index|main)\.(j|t)sx?|main\.py|main\.go$/.test(sn.label.split('/').pop() ?? ''),
        x: sn.x ?? (Math.random() - .5) * 600, y: sn.y ?? (Math.random() - .5) * 600,
        vx: 0, vy: 0, themeIdx: (i + nodesRef.current.length) % 16, classId: null,
        code: '', modified: false,
      })
    })

    const newEdges: any[] = []
    const edgeSet = new Set(edgesRef.current.map(e => `${e.source}>${e.target}`))
    scanEdges.forEach((se: any) => {
      const src = idMap.get(se.source), tgt = idMap.get(se.target)
      if (!src || !tgt) return
      const key = `${src}>${tgt}`
      if (!edgeSet.has(key)) { edgeSet.add(key); newEdges.push({ id: 'se' + Date.now() + Math.random(), source: src, target: tgt }) }
    })

    nodesRef.current = [...nodesRef.current, ...newNodes]
    edgesRef.current = [...edgesRef.current, ...newEdges]
    forceRender({}); wakePhysicsRef.current()
    addEvent('import', `Graph mapped: ${fileCount} files, ${newNodes.length} new nodes, ${newEdges.length} edges`)
  }, [addEvent])

  // ── BOARD ──
  const addCard = colId => {
    if (!newCardTitle.trim()) return
    const title=newCardTitle.trim()
    const newCard={id:'k'+Date.now(),colId,title,priority:'MED',tags:[],progress:0,due:'',assignee:avatarIndex}
    setBoard(b=>({...b,cards:[...b.cards,newCard]}))
    setNewCardCol(null); setNewCardTitle('')
    if (wsHook.workspace) wsHook.createCard(colId,title,{priority:'MED',assignee_idx:avatarIndex}).catch(()=>{})
  }
  const moveCard = (cardId,colId) => {
    setBoard(b=>({...b,cards:b.cards.map(c=>c.id===cardId?{...c,colId}:c)}))
    if (wsHook.workspace) wsHook.updateCard(cardId,{col_id:colId}).catch(()=>{})
  }
  const updateCard = (cardId,patch) => {
    setBoard(b=>({...b,cards:b.cards.map(c=>c.id===cardId?{...c,...patch}:c)}))
    if (wsHook.workspace) wsHook.updateCard(cardId,patch).catch(()=>{})
  }
  const deleteCard = cardId => {
    setBoard(b=>({...b,cards:b.cards.filter(c=>c.id!==cardId)}))
    setFocusCard(null)
    if (wsHook.workspace) wsHook.deleteCard(cardId).catch(()=>{})
  }

  // ── TIMELINE ──
  const handlePlayheadDown = e => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    playheadDragRef.current={isDragging:true,startX:e.clientX,startPos:playheadPos}
  }
  const handlePlayheadMove = e => {
    if (!playheadDragRef.current.isDragging) return
    const totalWidth=700, maxP=totalWidth-10
    const newPos=Math.max(0,Math.min(playheadDragRef.current.startPos+(e.clientX-playheadDragRef.current.startX),maxP))
    setPlayheadPos(newPos)
    const ver=newPos<100?'v1.0':newPos<220?'v1.1':newPos<350?'v1.2':newPos<480?'v1.3':'v1.4 (HEAD)'
    setActiveVersionName(ver)
    setActiveVersionIdx(newPos<100?0:newPos<220?1:newPos<350?2:newPos<480?3:4)
  }
  const handlePlayheadUp = e => {
    playheadDragRef.current.isDragging=false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // ── TERMINAL ──
  const handleTermInput = async e => {
    if (e.key !== 'Enter') return
    const cmd = termInput.trim(); if (!cmd) return
    setTermInput('')

    // Built-in terminal commands (always available)
    if (cmd === 'clear') { setTermLines([]); return }
    if (cmd === 'node list') {
      setTermLines(l => [...l,
        { c:'#9494b0', t:`$ ${cmd}` },
        { c:'#c0c8d8', t: nodesRef.current.map(n=>n.label).join('  ') || '(no nodes)' },
      ]); return
    }

    // Native shell (Electron)
    if (api?.terminal?.exec) {
      setTermLines(l => [...l, { c:'#9494b0', t:`${termCwd} $ ${cmd}` }])

      // Handle cd locally — child_process can't persist CWD across calls
      const cdMatch = cmd.match(/^cd\s+(.*)$/)
      if (cdMatch) {
        const target = cdMatch[1].trim() || api.homeDir
        const newCwd = target === '~' ? api.homeDir
          : target.startsWith('/') ? target
          : `${termCwd}/${target}`
        // Verify with pwd
        const check = await api.terminal.exec(`cd ${JSON.stringify(newCwd)} && pwd`, termCwd)
        if (!check.stderr && check.stdout.trim()) {
          setTermCwd(check.stdout.trim())
          setTermLines(l => [...l, { c:'#28f1c3', t: check.stdout.trim() }])
        } else {
          setTermLines(l => [...l, { c:'#ff435a', t: check.stderr.trim() || `cd: no such directory: ${newCwd}` }])
        }
        return
      }

      const result = await api.terminal.exec(cmd, termCwd)
      const lines: any[] = []
      if (result.stdout.trim()) {
        result.stdout.trimEnd().split('\n').forEach((l: string) => lines.push({ c:'#c0c8d8', t: l }))
      }
      if (result.stderr.trim()) {
        result.stderr.trimEnd().split('\n').forEach((l: string) => lines.push({ c:'#ff435a', t: l }))
      }
      if (!lines.length) lines.push({ c:'#607080', t:'(no output)' })
      setTermLines(l => [...l, ...lines])
      return
    }

    // Browser fallback — simulated
    const resp: any[] = [{ c:'#9494b0', t:`$ ${cmd}` }]
    if (cmd === 'help')       resp.push({ c:'#28f1c3', t:'Install as Electron app for a real native terminal.' })
    else if (cmd === 'ls')    resp.push({ c:'#c0c8d8', t: nodesRef.current.map(n=>n.label).join('  ') })
    else if (cmd === 'edges') resp.push({ c:'#c0c8d8', t: edgesRef.current.map(e=>`${e.source}→${e.target}`).join('  ') || 'No edges.' })
    else if (cmd === 'git status') resp.push({ c: modifiedNodes.length ? '#ffc410' : '#10b981', t: modifiedNodes.length ? `${modifiedNodes.length} modified` : 'Working tree clean.' })
    else resp.push({ c:'#ff435a', t:`command not found: ${cmd}` })
    setTermLines(l => [...l, ...resp])
  }

  // ── JS RUNTIME ──
  const handleRunNode = async (nodeId) => {
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (!node) return
    const lang = detectLang(node.label || '')
    if (lang === 'md' || lang === 'unknown') return
    setNodeRunState(s => ({...s, [nodeId]: {status:'running', ms:0}}))
    addEvent('run-ok', `▶ ${node.label}`, {nodeId})

    // Prefer running in the real terminal — output appears there naturally
    if (activePtyId) {
      setBottomTab('terminal')
      setBottomOpen(true)
      const t0 = Date.now()
      const res = await runInTerminal(activePtyId, lang, node.code || '', explorerRoot || termCwd)
      const ms = Date.now() - t0
      setNodeRunState(s => ({...s, [nodeId]: {status: res.success ? 'ok' : 'error', ms}}))
      if (!res.success) {
        setBottomTab('console')
        setJsLogs(l => [...l,
          {type:'header', val:`▶  ${node.label}`, ts:Date.now(), nodeId},
          {type:'error',  val: res.error || 'Run failed', ts:Date.now(), nodeId},
        ])
      }
      return
    }

    // Fallback: capture mode → show in console panel
    setBottomTab('console')
    setBottomOpen(true)
    setJsLogs(l => {
      const header = [{type:'header', val:`▶  ${node.label}`, ts:Date.now(), nodeId}]
      if (isCompiled(lang)) header.push({type:'info', val:`⌛ Compiling…`, ts:Date.now()})
      return [...l, ...header]
    })
    const result = await runByLang(lang, node.code || '', compileStdin)
    setNodeRunState(s => ({...s, [nodeId]: {status: result.error?'error':'ok', ms: result.ms}}))
    addEvent(result.error?'run-err':'run-ok', `${result.error?'✗':'✓'} ${node.label} (${result.ms}ms)`, {nodeId})
    setJsLogs(l => [
      ...l,
      ...result.logs.map(e => ({...e, nodeId})),
      {type: result.error?'error-footer':'footer', val: result.error ? `✗ Error · ${result.ms}ms` : `✓ Done · ${result.ms}ms`, ts:Date.now(), nodeId}
    ])
  }

  const handleRunRepl = async (code) => {
    if (!code.trim()) return
    setReplHistory(h => [code, ...h.slice(0,49)])
    setReplHistIdx(-1)
    setReplInput('')
    setJsLogs(l => [...l, {type:'repl-in', val:`> ${code}`, ts:Date.now()}])
    const result = await runByLang('js', code)
    setJsLogs(l => [...l, ...result.logs])
  }

  const handleReplKey = e => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleRunRepl(replInput) }
    if (e.key==='ArrowUp') {
      e.preventDefault()
      const idx = Math.min(replHistIdx+1, replHistory.length-1)
      setReplHistIdx(idx)
      if (replHistory[idx] !== undefined) setReplInput(replHistory[idx])
    }
    if (e.key==='ArrowDown') {
      e.preventDefault()
      const idx = Math.max(replHistIdx-1, -1)
      setReplHistIdx(idx)
      setReplInput(idx === -1 ? '' : replHistory[idx] || '')
    }
  }

  const projectSearchDebounce = useRef<any>(null)

  // AI save helpers — now write to aiStore (Zustand persist replaces manual localStorage)
  const saveAiProvider = (p: string) => setAiProvider(p)
  const saveAiKey = (provider: string, key: string) => setAiKeys({ ...aiKeys, [provider]: key })
  const saveAiModel = (provider: string, model: string) => setAiModels({ ...aiModels, [provider]: model })
  const saveFormatOnSave = (v: boolean) => setFormatOnSave(v)

  const fetchOllamaModels = async () => {
    const host = aiKeys['ollama'] || 'http://localhost:11434'
    const res = await api?.ai?.ollamaModels?.(host)
    if (res?.models?.length) setOllamaModels(res.models)
  }

  // Project-wide Replace All
  const handleReplaceAll = async () => {
    if (!projectSearchQuery.trim() || !replaceQuery || !explorerRoot) return
    if (!api?.fs) return
    setReplaceLoading(true)
    try {
      const byPath: Record<string, string> = {}
      projectSearchResults.forEach(r => { byPath[r.fullPath] = r.fullPath })
      let totalReplaced = 0
      const query = projectSearchQuery.trim()
      const applyReplace = (content: string): string => {
        if (searchCaseSensitive) {
          return content.split(query).join(replaceQuery)
        }
        return content.replace(
          new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          replaceQuery
        )
      }
      for (const fullPath of Object.values(byPath)) {
        const readRes = await api.fs.readFile(fullPath)
        if (!readRes?.content) continue
        const replaced = applyReplace(readRes.content)
        if (replaced !== readRes.content) {
          const count = searchCaseSensitive
            ? readRes.content.split(query).length - 1
            : (readRes.content.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) ?? []).length
          await api.fs.writeFile(fullPath, replaced)
          totalReplaced += count
          const openNode = nodesRef.current.find(n => n.filepath === fullPath)
          if (openNode) { openNode.code = replaced; openNode.modified = true }
        }
      }
      addEvent('info', `Replaced ${totalReplaced} occurrence${totalReplaced !== 1 ? 's' : ''} of "${query}" → "${replaceQuery}"`)
      setProjectSearchQuery(q => q + ' ')
      setTimeout(() => setProjectSearchQuery(q => q.trim()), 50)
    } catch(e: any) {
      addEvent('error', `Replace failed: ${e?.message || e}`)
    }
    setReplaceLoading(false)
  }

  // Scroll focused search group into view on keyboard nav
  useEffect(() => {
    if (searchResultIdx < 0) return
    const el = document.querySelector(`[data-search-group="${searchResultIdx}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [searchResultIdx])

  // Project-wide search debounced effect
  useEffect(() => {
    clearTimeout(projectSearchDebounce.current)
    if (!projectSearchQuery.trim() || !explorerRoot) { setProjectSearchResults([]); setSearchResultIdx(-1); return }
    setProjectSearchLoading(true)
    setSearchResultIdx(-1)
    projectSearchDebounce.current = setTimeout(async () => {
      try {
        const results = await api?.fs?.searchInFiles?.(explorerRoot, projectSearchQuery.trim(), 300, searchCaseSensitive) || []
        setProjectSearchResults(results)
      } catch { setProjectSearchResults([]) }
      setProjectSearchLoading(false)
    }, 350)
    return () => clearTimeout(projectSearchDebounce.current)
  }, [projectSearchQuery, explorerRoot, searchCaseSensitive])

  // Open a workspace file in the editor
  const handleOpenWorkspaceFile = useCallback(async (fileInfo: any) => {
    if (!api?.fs?.readFile) return
    try {
      const res = await api.fs.readFile(fileInfo.path || fileInfo.fullPath)
      if (res?.content === undefined) return
      const existing = nodesRef.current.find(n => n.filepath === (fileInfo.path || fileInfo.fullPath))
      trackRecentFile(fileInfo)
      if (existing) { openNodeInEditor(existing.id); return }
      const tempId = 'ws_' + Date.now()
      nodesRef.current = [...nodesRef.current, {
        id: tempId, label: fileInfo.name || fileInfo.rel?.split('/').pop() || 'file',
        filepath: fileInfo.path || fileInfo.fullPath, type: 'function',
        isMain: false, x: 0, y: 0, vx: 0, vy: 0, themeIdx: 0,
        classId: null, modified: false, code: res.content,
      }]
      forceRender({})
      openNodeInEditor(tempId)
    } catch {}
  }, [explorerRoot, trackRecentFile])

  const handleCmdAction = action => {
    if (!action) return
    // New action-based dispatch
    if (action === 'new-node') { setShowCreateNode(true) }
    else if (action === 'new-group') { setShowCreateGroup(true); setGroupSelected([]) }
    else if (action === 'run') { if (activeTabId) handleRunNode(activeTabId) }
    else if (action === 'terminal') { setBottomTab('terminal'); setBottomOpen(true) }
    else if (action === 'board') { setSidebarMode('board'); setSidebarOpen(false) }
    else if (action === 'timeline') { setBottomTab('timeline'); setBottomOpen(true) }
    else if (action === 'git') { setSidebarMode('git'); setSidebarOpen(true) }
    else if (action === 'sidebar') { setSidebarOpen(v => !v) }
    else if (action === 'edge-add') { setEdgeMode(m => m === 'join' ? null : 'join') }
    else if (action === 'edge-cut') { setEdgeMode(m => m === 'cut' ? null : 'cut') }
    else if (action === 'zoom-in') { setTransform(p => ({...p, scale: Math.min(3.0, p.scale * 1.25)})) }
    else if (action === 'zoom-out') { setTransform(p => ({...p, scale: Math.max(0.3, p.scale * 0.8)})) }
    else if (action === 'zoom-reset') { setTransform(p => ({...p, scale: 1})) }
    else if (action === 'open-folder') { handleOpenFolderForExplorer() }
    else if (action === 'save') { if (activeTabId) saveNodeToDisk(activeTabId) }
    else if (action === 'zen') { setZenMode(v => !v) }
    else if (action === 'file-finder') { setShowFileFinder(true) }
    else if (action === 'jump-line') { setShowJumpLine(true) }
    else if (action === 'project-search') { setSidebarMode('project-search'); setSidebarOpen(true) }
    else if (action === 'outline') { setSidebarMode('outline'); setSidebarOpen(true) }
    else if (action === 'ai') { setSidebarMode('ai'); setSidebarOpen(true) }
    else if (action === 'split-vertical') { if (activeTabId) { setSplitTabId(activeTabId); setSplitMode('vertical') } }
    else if (action === 'split-horizontal') { if (activeTabId) { setSplitTabId(activeTabId); setSplitMode('horizontal') } }
    else if (action === 'split-close') { setSplitTabId(null) }
    else if (action?.startsWith('theme:')) {
      const p = PALETTES.find(p => p.id === action.replace('theme:', ''))
      if (p) setGlobalEditorPalette(p)
    }
    // Legacy label fallbacks
    else if (action.includes('New file node')) { setShowCreateNode(true) }
    else if (action.includes('New doc node')) {
      const tempId='n'+Date.now()
      const x=(Math.random()-.5)*300, y=(Math.random()-.5)*300
      nodesRef.current=[...nodesRef.current,{id:tempId,label:'notes.md',filepath:'notes.md',type:'doc',isMain:false,x,y,vx:0,vy:0,themeIdx:11,classId:null,code:'# Notes\n\n',modified:false}]
      forceRender({}); openNodeInEditor(tempId)
    }
    setShowCmd(false)
  }

  // ── ICON BAR ──
  const gitChangeCount = (gitStatus as any)?.files?.length ?? 0
  const sideIconDefs = [
    { key:'files',          icon:<I.Files/>,  tip:'FILES' },
    { key:'git',            icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>, tip:'GIT', badge:gitChangeCount },
    { key:'project-search', icon:<I.Search/>, tip:'SEARCH', badge:0 },
    { key:'outline',        icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>, tip:'OUTLINE' },
    { key:'ai',             icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, tip:'AI' },
    { key:'note',           icon:<I.Note/>,  tip:'NOTES' },
  ]

  // ── CHAPTER SPLASH DATA ──
  const splashImgSrc = activeTabNode ? getMangaImgSrc(activeTabNode.id, activeTabNode.themeIdx ?? 0) : null
  const chapterNum = openTabs.indexOf(activeTabId) + 1

  // ── RENDER ──
  return (
    <div className={`ide-v2-root ${brutal?'theme-brutal':'theme-cyber'}${zenMode?' ide-zen-mode':''}`}
      style={{'--ide-font-scale':globalFontScale} as any}
    >

      {/* ── ZEN MODE EDITOR OVERLAY ── */}
      {zenMode && activeTabNode && (
        <div style={{position:'fixed',inset:0,zIndex:90000,background:'#06060d',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 16px',flexShrink:0,borderBottom:'1px solid rgba(255,42,56,.1)'}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:'rgba(200,200,220,.5)',letterSpacing:'.04em'}}>{activeTabNode.label}</span>
            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
              {canRun && (
                <button onClick={()=>handleRunNode(activeTabId)} style={{background:'rgba(255,42,56,.1)',border:'1px solid rgba(255,42,56,.35)',color:'#ff2a38',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',padding:'3px 12px',cursor:'pointer',letterSpacing:'.1em',fontWeight:700}}>▶ RUN</button>
              )}
              <button onClick={()=>setZenMode(false)} style={{background:'transparent',border:'1px solid rgba(255,255,255,.1)',color:'rgba(200,200,220,.35)',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',padding:'2px 8px',cursor:'pointer',letterSpacing:'.06em'}}>ESC · EXIT ZEN</button>
            </div>
          </div>
          <div style={{flex:1,minHeight:0,overflow:'hidden',display:'flex',justifyContent:'center'}}>
            <div style={{width:'min(800px,100%)',display:'flex',flexDirection:'column',minHeight:0}}>
              <CodeMirrorEditor key={activeTabId+'_zen'} node={activeTabNode} onChange={code=>updateNodeCode(activeTabId,code)} onSave={()=>saveNodeToDisk(activeTabId)} externalPalette={globalEditorPalette} onPaletteChange={p=>setGlobalEditorPalette(p)} jumpToLine={jumpLineTarget??undefined} onCursorChange={(line,col)=>setEditorCursorPos({line,col})} aiProvider={aiProvider} aiKey={aiProvider==='ollama'?(aiKeys['ollama']||'http://localhost:11434'):aiKeys[aiProvider]||''} aiModel={aiModels[aiProvider]||DEFAULT_MODELS[aiProvider]||''}/>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ TITLE BAR (custom window controls, drag region) ═══════ */}
      <TitleBar brutal={brutal} activeFile={activeTabNode?.label}/>

      {/* ═══════ TOPBAR ═══════ */}
      <div className="ide-topbar">
        <span className="ide-logo">FOR<span className="ide-logo-accent">BID</span>EN<span style={{color:'#ff2a38',animation:'fblink 1.1s infinite',fontSize:'1.1rem'}}>_</span></span>
        <div className="ide-topbar-sep"/>

        {/* Active file breadcrumb + language badge */}
        <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:6,overflow:'hidden'}}>
          {activeTabNode ? (<>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px',fontWeight:500,color:brutal?'#0f0f0f':'#c0c8d8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220,opacity:.9}}>
              {activeTabNode.label}
            </div>
            {activeLang!=='unknown' && (
              <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.14em',padding:'1px 6px',background:isCompiled(activeLang)?'rgba(255,100,80,.15)':'rgba(16,185,129,.12)',color:isCompiled(activeLang)?'#ff8060':'#10b981',border:`1px solid ${isCompiled(activeLang)?'rgba(255,100,80,.3)':'rgba(16,185,129,.25)'}`,flexShrink:0}}>
                {activeLang.toUpperCase()}
              </div>
            )}
            {activeTabNode.modified && (
              <div style={{width:5,height:5,borderRadius:'50%',background:'#f2c12e',flexShrink:0}}/>
            )}
          </>) : (
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',opacity:.25,letterSpacing:'.05em'}}>no file open</div>
          )}
        </div>

        {/* Unsaved count */}
        {modifiedNodes.length>0 && (
          <div style={{background:'#f2c12e22',color:'#f2c12e',border:'1px solid #f2c12e44',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.12em',padding:'2px 6px',flexShrink:0}}>
            {modifiedNodes.length}●
          </div>
        )}

        <div className="ide-topbar-sep"/>

        {/* ▶ RUN — primary action, only when a runnable file is open */}
        {canRun && (
          <button
            className={`ide-topbar-btn${isCompiled(activeLang)?' ide-run-compiled':' ide-run-interp'}`}
            onClick={()=>handleRunNode(activeTabId)}
            style={{fontWeight:700,letterSpacing:'.1em'}}
          >
            ▶ RUN
          </button>
        )}

        <button className="ide-topbar-btn primary" onClick={()=>setShowCreateNode(true)}>+ NODE</button>
        <button className="ide-topbar-btn" onClick={handleOpenFolderForExplorer} title="Open folder">OPEN</button>
        <button className="ide-topbar-btn" onClick={()=>folderInputRef.current?.click()} title="Import files as graph nodes">IMPORT</button>
        <input ref={folderInputRef} type="file" multiple {...{'webkitdirectory':''}} style={{display:'none'}} onChange={handleFolderUpload}/>
        <button className="ide-topbar-btn" onClick={()=>setShowFileFinder(true)} title="Quick Open (Ctrl+P)">⌕</button>
        <button className="ide-topbar-btn" onClick={()=>setShowCmd(true)} title="Command palette (Ctrl+Shift+P)">⌘</button>
        <button className="ide-topbar-btn" onClick={()=>setZenMode(v=>!v)} title="Zen mode (Ctrl+Shift+Z)" style={zenMode?{color:brutal?'#10b981':'#28f1c3',borderColor:brutal?'rgba(16,185,129,.4)':'rgba(40,241,195,.35)'}:{}}>ZEN</button>
        <button className="ide-topbar-btn" onClick={()=>setShowShortcuts(v=>!v)} title="Keyboard shortcuts (Ctrl+?)"
          style={showShortcuts?{color:'#ffc410',borderColor:'rgba(255,196,16,.4)'}:{}}>?</button>

        {/* Avatar → settings */}
        <div onClick={()=>{setSidebarMode('settings');setSidebarOpen(o=>sidebarMode==='settings'?!o:true)}}
          style={{cursor:'pointer',width:'30px',height:'30px',border:`2px solid ${sidebarMode==='settings'&&sidebarOpen?'#ff2a38':'rgba(255,255,255,.12)'}`,overflow:'hidden',flexShrink:0,transition:'border-color .15s'}}>
          <img src={`${import.meta.env.BASE_URL}avatars/0xAV0${String((avatarIndex%6)+1).padStart(2,'0')}s.jpeg`} alt="op" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
        </div>
      </div>

      {/* ═══════ WORKSPACE ═══════ */}
      <div className="ide-workspace" style={{flexDirection:'column'}}>
      <div className="ide-main-row">

        {/* ── ICON BAR (now toggles floating panels) ── */}
        <div className="ide-icon-bar">
          {sideIconDefs.map(def=>(
            <div key={def.key} data-tip={def.tip}
              className={`ide-icon-btn ${sidebarMode===def.key&&sidebarOpen?'active':''}`}
              onClick={()=>{
                if (def.key==='files' && !explorerRoot) {
                  handleOpenFolderForExplorer()
                } else if (sidebarMode===def.key) {
                  setSidebarOpen(o=>!o)
                } else {
                  setSidebarMode(def.key); setSidebarOpen(true)
                }
              }}>
              {def.icon}
              {def.badge>0 && <div className="ide-icon-badge">{def.badge}</div>}
            </div>
          ))}
          <div style={{flex:1}}/>
          {/* Console — opens run output */}
          <div data-tip="Console" className={`ide-icon-btn ${bottomOpen&&bottomTab==='console'?'active':''}`}
            onClick={()=>{ if(bottomOpen&&bottomTab==='console'){setBottomOpen(false)}else{setBottomTab('console');setBottomOpen(true)} }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="3,5 7,8 3,11"/><line x1="9" y1="11" x2="13" y2="11"/></svg>
          </div>
          {/* Notebook */}
          <div data-tip="Notebook" className={`ide-icon-btn ${bottomOpen&&bottomTab==='notebook'?'active':''}`}
            onClick={()=>{ if(bottomOpen&&bottomTab==='notebook'){setBottomOpen(false)}else{setBottomTab('notebook');setBottomOpen(true)} }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </div>
          {/* Editor pane toggle */}
          <div data-tip="Toggle Editor" className={`ide-icon-btn ${editorOpen?'active':''}`} onClick={()=>setEditorOpen(o=>!o)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>
          </div>
          {/* Settings */}
          <div data-tip="Settings" className={`ide-icon-btn ${sidebarMode==='settings'&&sidebarOpen?'active':''}`}
            onClick={()=>{setSidebarMode('settings');setSidebarOpen(o=>sidebarMode==='settings'?!o:true)}}>
            <I.Settings/>
          </div>
        </div>


        {/* ── SIDEBAR PANE (fixed, collapsible) ── */}
        {sidebarOpen && (<>
          <div className="ide-sidebar-pane" style={{width:sidebarW}}>
            <div className="ide-sidebar-header">
              <div className="ide-sidebar-mode-icon">
                {sideIconDefs.find(d=>d.key===sidebarMode)?.icon}
              </div>
              <span className="ide-sidebar-title">
                {({'files':'EXPLORER','git':'GIT','search':'SEARCH','note':'NOTES','settings':'SETTINGS','project-search':'SEARCH','outline':'OUTLINE','ai':'AI'} as any)[sidebarMode]||'EXPLORER'}
              </span>
              <div style={{marginLeft:'auto',display:'flex',gap:4,alignItems:'center'}}>
                {sidebarMode==='files'&&<button className="ide-btn ide-btn-sm" onClick={()=>setShowCreateNode(true)} title="New graph node">+N</button>}
                <button className="ide-sidebar-close" onClick={()=>setSidebarOpen(false)}>✕</button>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',overflowX:'hidden',display:'flex',flexDirection:'column'}}>
              {sidebarMode==='search' && (
                <div style={{padding:'6px 8px',flexShrink:0}}>
                  <input className="ide-toc-search" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search nodes…" autoFocus style={{width:'100%'}}/>
                </div>
              )}

              {/* ── FILE EXPLORER (VS Code-style) ── */}
              {sidebarMode==='files' && (
                <FileExplorer
                  rootPath={explorerRoot}
                  refreshKey={explorerRefreshKey}
                  brutal={brutal}
                  onOpenFile={handleExplorerOpenFile}
                  onOpenFolder={handleOpenFolderForExplorer}
                  onScanImports={handleScanImports}
                  gitStatus={Object.fromEntries(
                    ((gitStatus as any)?.files ?? []).map((f: any) => [f.path, f.state])
                  )}
                  onTerminalCd={(cwd)=>{
                    setTermCwd(cwd)
                    setBottomTab('terminal')
                    setBottomOpen(true)
                    setTermLines(l=>[...l,{c:'#28f1c3',t:`[cd] ${cwd}`}])
                  }}
                />
              )}

              {/* ── SOURCE CONTROL (git) ── */}
              {sidebarMode==='git' && (
                <GitPanelV2
                  cwd={explorerRoot || (window as any).__forbiddenCwd || termCwd}
                  brutal={brutal}
                  onOpenFile={(filepath: string) => {
                    const name = filepath.split('/').pop() || filepath
                    const ext = name.includes('.') ? name.split('.').pop() || '' : ''
                    handleExplorerOpenFile({ path: filepath, name, ext, type: 'file' })
                  }}
                  aiProvider={aiProvider}
                  aiKeys={aiKeys}
                  aiModels={aiModels}
                  onOpenAiSettings={()=>{ setSidebarMode('settings'); setSidebarOpen(true) }}
                />
              )}

              {/* ── GRAPH NODES LIST (search mode) ── */}
              {sidebarMode==='search' && (<>
                <div className="ide-toc-sec">{`${filteredNodes.length} RESULTS`}</div>
                {filteredNodes.map(node=>{
                  const grp=groupsRef.current.find(g=>g.nodeIds.includes(node.id))
                  const accent=grp?grp.color:ACCENTS[node.themeIdx%ACCENTS.length]
                  const ctx=searchQuery.trim()&&node.code?node.code.split('\n').find(l=>l.toLowerCase().includes(searchQuery.toLowerCase()))||'':''
                  return (
                    <div key={node.id} className={`ide-toc-item ${activeTabId===node.id?'active':''}`} onClick={()=>openNodeInEditor(node.id)}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:accent,flexShrink:0,marginTop:2}}/>
                      <div className="ide-toc-info">
                        <div className="ide-toc-name">{node.label}{node.modified&&<span className="modified-dot"/>}</div>
                        {ctx&&<div style={{fontSize:'11px',opacity:.4,fontFamily:"'JetBrains Mono',monospace",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ctx.trim()}</div>}
                        <div className="ide-toc-type" style={{color:accent}}>{node.type}</div>
                      </div>
                    </div>
                  )
                })}
                {searchQuery.trim()&&!filteredNodes.length&&(
                  <div style={{padding:'20px 10px',opacity:.3,textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'11px'}}>NO RESULTS</div>
                )}
              </>)}
              {sidebarMode==='note' && (
                <div className="sb-notes-wrap">
                  <div className="sb-notes-bar">
                    <span className="sb-notes-bar-label">NOTES</span>
                    <span className="sb-notes-bar-count">{notesText.split(/\s+/).filter(Boolean).length}w · {notesText.length}c</span>
                  </div>
                  <textarea
                    className="sb-notes-textarea"
                    value={notesText}
                    onChange={e=>setNotesText(e.target.value)}
                    placeholder="// scratch notes…"
                  />
                </div>
              )}

              {/* ── PROJECT-WIDE SEARCH ── */}
              {sidebarMode==='project-search' && (
                <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
                  <div style={{padding:'6px 8px',flexShrink:0,display:'flex',flexDirection:'column',gap:4}}>
                    {/* Search input */}
                    <div style={{position:'relative',display:'flex',gap:4,alignItems:'center'}}>
                      <div style={{position:'relative',flex:1}}>
                        <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:'11px',opacity:.4,pointerEvents:'none'}}>⌕</span>
                        <input
                          value={projectSearchQuery}
                          onChange={e=>setProjectSearchQuery(e.target.value)}
                          placeholder="Search in all files…"
                          autoFocus
                          style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',outline:'none',color:'#c0c8d8',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',padding:'5px 26px 5px 26px'}}
                          onFocus={e=>(e.target.style.borderColor='rgba(255,42,56,.4)')}
                          onBlur={e=>(e.target.style.borderColor='rgba(255,255,255,.08)')}
                          onKeyDown={e=>{
                            if (e.altKey && (e.key==='ArrowDown'||e.key==='ArrowUp')) {
                              e.preventDefault()
                              const files = Array.from(new Set(projectSearchResults.map(r=>r.file)))
                              if (!files.length) return
                              setSearchResultIdx(i => {
                                const next = e.key==='ArrowDown' ? Math.min(i+1,files.length-1) : Math.max(i-1,0)
                                return next
                              })
                            }
                          }}
                        />
                        {projectSearchQuery&&<button onClick={()=>setProjectSearchQuery('')} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',cursor:'pointer',color:'rgba(200,200,220,.3)',fontSize:'13px'}}>×</button>}
                      </div>
                      <button
                        onClick={()=>setSearchCaseSensitive(v=>!v)}
                        title="Case sensitive"
                        style={{flexShrink:0,padding:'3px 6px',background:searchCaseSensitive?'rgba(255,42,56,.18)':'rgba(255,255,255,.04)',border:`1px solid ${searchCaseSensitive?'rgba(255,42,56,.4)':'rgba(255,255,255,.1)'}`,color:searchCaseSensitive?'#ff2a38':'rgba(200,200,220,.45)',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',cursor:'pointer',borderRadius:2,lineHeight:'1.4'}}
                      >Aa</button>
                    </div>
                    {/* Replace input */}
                    <div style={{display:'flex',gap:4}}>
                      <div style={{flex:1,position:'relative'}}>
                        <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:'11px',opacity:.3,pointerEvents:'none'}}>↺</span>
                        <input
                          value={replaceQuery}
                          onChange={e=>setReplaceQuery(e.target.value)}
                          placeholder="Replace with…"
                          style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',outline:'none',color:'#c0c8d8',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',padding:'5px 8px 5px 26px'}}
                          onFocus={e=>(e.target.style.borderColor='rgba(226,192,141,.35)')}
                          onBlur={e=>(e.target.style.borderColor='rgba(255,255,255,.07)')}
                        />
                      </div>
                      <button
                        onClick={handleReplaceAll}
                        disabled={replaceLoading||!projectSearchQuery.trim()||projectSearchResults.length===0}
                        title={`Replace all ${projectSearchResults.length} matches`}
                        style={{flexShrink:0,padding:'3px 8px',background:replaceLoading?'transparent':'rgba(226,192,141,.1)',border:'1px solid rgba(226,192,141,.25)',color:replaceLoading||projectSearchResults.length===0?'rgba(200,200,220,.25)':'#e2c08d',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.08em',cursor:replaceLoading||projectSearchResults.length===0?'default':'pointer',whiteSpace:'nowrap',transition:'all .1s'}}
                        onMouseEnter={e=>{ if(!replaceLoading&&projectSearchResults.length>0) (e.currentTarget as HTMLElement).style.background='rgba(226,192,141,.2)' }}
                        onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=replaceLoading?'transparent':'rgba(226,192,141,.1)' }}
                      >
                        {replaceLoading?'…':'↺ ALL'}
                      </button>
                    </div>
                  </div>
                  {projectSearchLoading && <div style={{padding:'8px 10px',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'#ffc410',opacity:.7,flexShrink:0}}>SEARCHING…</div>}
                  {!projectSearchLoading && projectSearchQuery && (
                    <div className="ide-toc-sec" style={{flexShrink:0}}>
                      {explorerRoot
                        ? `${projectSearchResults.length} RESULTS IN ${new Set(projectSearchResults.map(r=>r.file)).size} FILES`
                        : 'NO FOLDER OPEN'}
                    </div>
                  )}
                  <div style={{flex:1,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent'}}>
                    {(() => {
                      const grouped: Record<string, any[]> = {}
                      projectSearchResults.forEach(r => { ;(grouped[r.file] ??= []).push(r) })
                      const files = Object.keys(grouped)
                      return files.map((file, fi) => {
                        const hits = grouped[file]
                        const focused = fi === searchResultIdx
                        return (
                          <div key={file} data-search-group={fi} style={{borderLeft:focused?'2px solid rgba(255,42,56,.5)':'2px solid transparent'}}>
                            <div style={{padding:'4px 8px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.1em',color:focused?'rgba(200,200,220,.7)':'rgba(200,200,220,.4)',background:focused?'rgba(255,42,56,.07)':'rgba(0,0,0,.2)',borderBottom:'1px solid rgba(255,255,255,.04)',display:'flex',gap:6,alignItems:'center'}}>
                              <span style={{color:getFileColor(file.split('/').pop()||''),fontSize:'10px'}}>{getFileIcon(file.split('/').pop()||'')}</span>
                              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{file}</span>
                              <span style={{opacity:.4,flexShrink:0}}>{hits.length}</span>
                            </div>
                            {hits.map((r, i) => (
                              <div key={i} onClick={async()=>{
                                setSearchResultIdx(fi)
                                await handleOpenWorkspaceFile({path:r.fullPath,name:file.split('/').pop(),rel:file})
                                setTimeout(()=>setJumpLineTarget(r.line),200)
                              }}
                                style={{padding:'3px 12px 3px 18px',cursor:'pointer',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',color:'rgba(200,200,220,.7)',display:'flex',gap:6,alignItems:'center'}}
                                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.05)')}
                                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                                <span style={{color:'rgba(200,200,220,.3)',flexShrink:0,minWidth:28,textAlign:'right'}}>{r.line}</span>
                                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{r.text}</span>
                              </div>
                            ))}
                          </div>
                        )
                      })
                    })()}
                    {!projectSearchLoading && projectSearchQuery && projectSearchResults.length===0 && (
                      <div style={{padding:'20px 10px',opacity:.3,textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'11px'}}>
                        {explorerRoot ? 'NO MATCHES' : 'OPEN A FOLDER FIRST'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── FILE OUTLINE ── */}
              {sidebarMode==='outline' && (() => {
                const code  = activeTabNode?.code || ''
                const label = activeTabNode?.label || ''
                const ext   = (label.split('.').pop()||'').toLowerCase()
                type Sym = {name:string;line:number;type:'class'|'function'|'interface'|'type'|'component'}
                const symbols: Sym[] = []
                const codeLines = code.split('\n')
                const isJS = ['js','ts','jsx','tsx'].includes(ext)
                codeLines.forEach((l, i) => {
                  if (isJS) {
                    let m: RegExpExecArray|null
                    if ((m = /^(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][\w$]*)/.exec(l)))
                      symbols.push({name:m[1],line:i+1,type:'class'})
                    else if ((m = /^(?:export\s+)?interface\s+([a-zA-Z_$][\w$]*)/.exec(l)))
                      symbols.push({name:m[1],line:i+1,type:'interface'})
                    else if ((m = /^(?:export\s+)?type\s+([A-Z][a-zA-Z_$][\w$]*)\s*=/.exec(l)))
                      symbols.push({name:m[1],line:i+1,type:'type'})
                    else if ((m = /^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/.exec(l)))
                      symbols.push({name:m[1],line:i+1,type:m[1][0]===m[1][0].toUpperCase()&&m[1][0]!==m[1][0].toLowerCase()?'component':'function'})
                    else if ((m = /^(?:export\s+)?(?:const|let)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\(|function|\([^)]*\)\s*=>)/.exec(l)))
                      symbols.push({name:m[1],line:i+1,type:m[1][0]===m[1][0].toUpperCase()&&m[1][0]!==m[1][0].toLowerCase()?'component':'function'})
                  } else if (ext==='py') {
                    let m: RegExpExecArray|null
                    if ((m = /^class\s+([a-zA-Z_][\w]*)/.exec(l))) symbols.push({name:m[1],line:i+1,type:'class'})
                    else if ((m = /^(?:async\s+)?def\s+([a-zA-Z_][\w]*)/.exec(l))) symbols.push({name:m[1],line:i+1,type:'function'})
                  } else if (ext==='go') {
                    let m: RegExpExecArray|null
                    if ((m = /^type\s+([A-Z][\w]*)\s+struct/.exec(l))) symbols.push({name:m[1],line:i+1,type:'class'})
                    else if ((m = /^type\s+([A-Z][\w]*)\s+interface/.exec(l))) symbols.push({name:m[1],line:i+1,type:'interface'})
                    else if ((m = /^func\s+(?:\([^)]*\)\s+)?([a-zA-Z_][\w]*)/.exec(l))) symbols.push({name:m[1],line:i+1,type:'function'})
                  }
                })
                const iconMap = {class:'◇',interface:'○',type:'◈',component:'⬡',function:'ƒ'} as const
                const iconCls = {class:'cls',interface:'ifc',type:'typ',component:'cmp',function:'fn'} as const
                return (
                  <div className="sb-outline-wrap">
                    {!activeTabNode && <div className="sb-outline-empty">OPEN A FILE<br/>TO SEE ITS OUTLINE</div>}
                    {activeTabNode && symbols.length===0 && <div className="sb-outline-empty">NO SYMBOLS FOUND</div>}
                    {symbols.map((s,i)=>(
                      <div key={i} className={`sb-outline-item type-${s.type}`} onClick={()=>setJumpLineTarget(s.line)}>
                        <span className={`sb-outline-icon ${iconCls[s.type]}`}>{iconMap[s.type]}</span>
                        <span className="sb-outline-name">{s.name}</span>
                        <span className="sb-outline-line">{s.line}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {/* ── AI CHAT ── */}
              {sidebarMode==='ai' && (
                <AiChatPanel
                  activeNode={activeTabNode} explorerRoot={explorerRoot}
                  onOpenSettings={()=>{ setSidebarMode('settings'); setSidebarOpen(true) }}
                />
              )}

              {sidebarMode==='settings' && (
                <div style={{overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent',flex:1}}>
                  <div style={{padding:'8px'}}>
                    <div className="ide-toc-sec">THEME</div>
                    <div style={{padding:'0 8px 10px'}}>
                      <button className="ide-btn ide-btn-sm" onClick={()=>setThemeMode(t=>t==='cyber'?'brutal':'cyber')}>
                        {brutal?'→ CYBER':'→ BRUTAL'}
                      </button>
                    </div>
                    <div className="ide-toc-sec">FONT SCALE</div>
                    <div style={{padding:'4px 8px 10px',display:'flex',alignItems:'center',gap:8}}>
                      <button className="ide-btn ide-btn-sm" onClick={()=>setGlobalFontScale(s=>Math.max(.7,+(s-.05).toFixed(2)))}>A−</button>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',opacity:.6,minWidth:32,textAlign:'center'}}>{Math.round(globalFontScale*100)}%</span>
                      <button className="ide-btn ide-btn-sm" onClick={()=>setGlobalFontScale(s=>Math.min(1.5,+(s+.05).toFixed(2)))}>A+</button>
                      <button className="ide-btn ide-btn-sm" onClick={()=>setGlobalFontScale(1)} style={{opacity:.5}}>RST</button>
                    </div>
                    <div className="ide-toc-sec">EDITOR</div>
                    <div style={{padding:'0 8px 10px',display:'flex',alignItems:'center',gap:8}}>
                      <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'rgba(200,200,220,.6)'}}>
                        <input type="checkbox" checked={formatOnSave} onChange={e=>saveFormatOnSave(e.target.checked)} style={{width:11,height:11}}/>
                        FORMAT ON SAVE
                      </label>
                    </div>
                    <div className="ide-toc-sec">PALETTE</div>
                    {PALETTES.map(p=>(
                      <div key={p.id} className={`ide-toc-item ${globalEditorPalette.id===p.id?'active':''}`} onClick={()=>setGlobalEditorPalette(p)} style={{gap:8}}>
                        <div style={{display:'flex',gap:3}}>{p.swatches.map((c,i)=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:c}}/>)}</div>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',color:p.base}}>{p.name}</span>
                      </div>
                    ))}
                    <div className="ide-toc-sec" style={{marginTop:8}}>AVATAR</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4,padding:'0 8px 12px'}}>
                      {[0,1,2,3,4,5].map(i=>(
                        <div key={i} onClick={()=>setAvatarIndex(i)}
                          style={{border:`2px solid ${avatarIndex===i?ACCENTS[i]:'rgba(128,128,128,.15)'}`,cursor:'pointer',overflow:'hidden',aspectRatio:'1'}}>
                          <img src={`${import.meta.env.BASE_URL}avatars/0xAV0${String(i+1).padStart(2,'0')}s.jpeg`} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                        </div>
                      ))}
                    </div>

                    {/* ── AI PROVIDERS ── */}
                    <div className="ide-toc-sec" style={{marginTop:8}}>AI PROVIDERS</div>
                    <div style={{padding:'4px 8px 6px'}}>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.4)',marginBottom:6}}>ACTIVE PROVIDER</div>
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        {[
                          {id:'anthropic',  label:'Anthropic',  color:'#bb9af7', note:'Claude models'},
                          {id:'openai',     label:'OpenAI',     color:'#10b981', note:'GPT-4o, GPT-4o-mini'},
                          {id:'gemini',     label:'Google Gemini',color:'#4285f4',note:'Gemini 2.0 Flash, 1.5 Pro'},
                          {id:'openrouter', label:'OpenRouter', color:'#ffc410', note:'100+ models, one key'},
                          {id:'ollama',     label:'Ollama (local)',color:'#89ddff',note:'Local models, no key needed'},
                        ].map(prov=>(
                          <div key={prov.id} onClick={()=>saveAiProvider(prov.id)}
                            style={{padding:'6px 10px',cursor:'pointer',background:aiProvider===prov.id?`${prov.color}14`:'transparent',
                              border:`1px solid ${aiProvider===prov.id?prov.color+'55':'rgba(255,255,255,.07)'}`,
                              display:'flex',alignItems:'center',gap:8,transition:'all .1s'}}
                            onMouseEnter={e=>(e.currentTarget.style.background=`${prov.color}0d`)}
                            onMouseLeave={e=>(e.currentTarget.style.background=aiProvider===prov.id?`${prov.color}14`:'transparent')}>
                            <div style={{width:6,height:6,borderRadius:'50%',background:aiProvider===prov.id?prov.color:'rgba(255,255,255,.2)',flexShrink:0}}/>
                            <div style={{flex:1}}>
                              <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.08em',color:aiProvider===prov.id?prov.color:'rgba(200,200,220,.7)'}}>{prov.label}</div>
                              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.3)'}}>{prov.note}</div>
                            </div>
                            {aiProvider===prov.id&&<span style={{color:prov.color,fontSize:'10px'}}>✓</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Per-provider key inputs */}
                    {(['anthropic','openai','gemini','openrouter'] as const).map(prov => {
                      const labels: Record<string,string> = { anthropic:'Anthropic API Key', openai:'OpenAI API Key', gemini:'Google AI API Key', openrouter:'OpenRouter API Key' }
                      const placeholders: Record<string,string> = { anthropic:'sk-ant-...', openai:'sk-...', gemini:'AIza...', openrouter:'sk-or-...' }
                      const colors: Record<string,string> = { anthropic:'#bb9af7', openai:'#10b981', gemini:'#4285f4', openrouter:'#ffc410' }
                      const links: Record<string,string> = {
                        anthropic:'console.anthropic.com',
                        openai:'platform.openai.com/api-keys',
                        gemini:'aistudio.google.com/app/apikey',
                        openrouter:'openrouter.ai/keys',
                      }
                      return (
                        <div key={prov} style={{padding:'0 8px 10px'}}>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:colors[prov],marginBottom:4,letterSpacing:'.06em'}}>{labels[prov]}</div>
                          <input type="password" value={aiKeys[prov]||''} onChange={e=>saveAiKey(prov,e.target.value)}
                            placeholder={placeholders[prov]}
                            style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.04)',border:`1px solid ${aiProvider===prov?colors[prov]+'44':'rgba(255,255,255,.08)'}`,
                              outline:'none',color:'#c0c8d8',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',padding:'4px 8px'}}
                            onFocus={e=>(e.target.style.borderColor=colors[prov]+'88')}
                            onBlur={e=>(e.target.style.borderColor=aiProvider===prov?colors[prov]+'44':'rgba(255,255,255,.08)')}/>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.25)',marginTop:3}}>{links[prov]}</div>
                        </div>
                      )
                    })}

                    {/* Ollama host */}
                    <div style={{padding:'0 8px 6px'}}>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'#89ddff',marginBottom:4,letterSpacing:'.06em'}}>OLLAMA HOST (optional)</div>
                      <input type="text" value={aiKeys['ollama']||''} onChange={e=>saveAiKey('ollama',e.target.value)}
                        placeholder="http://localhost:11434"
                        style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.04)',border:`1px solid ${aiProvider==='ollama'?'rgba(137,221,255,.44)':'rgba(255,255,255,.08)'}`,
                          outline:'none',color:'#c0c8d8',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',padding:'4px 8px'}}/>
                      <button onClick={fetchOllamaModels} style={{marginTop:4,width:'100%',background:'rgba(137,221,255,.08)',border:'1px solid rgba(137,221,255,.2)',
                        color:'#89ddff',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.08em',padding:'3px',cursor:'pointer'}}>
                        ↻ DETECT LOCAL MODELS
                      </button>
                      {ollamaModels.length>0 && (
                        <div style={{marginTop:4,display:'flex',flexDirection:'column',gap:2}}>
                          {ollamaModels.map(m=>(
                            <div key={m} onClick={()=>saveAiModel('ollama',m)}
                              style={{padding:'3px 8px',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',cursor:'pointer',
                                color:aiModels['ollama']===m?'#89ddff':'rgba(200,200,220,.5)',
                                background:aiModels['ollama']===m?'rgba(137,221,255,.1)':'transparent',
                                border:`1px solid ${aiModels['ollama']===m?'rgba(137,221,255,.3)':'transparent'}`}}>
                              {m}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Model selector for current provider */}
                    {aiProvider !== 'ollama' && (()=>{
                      const modelOpts: Record<string,{value:string,label:string}[]> = {
                        anthropic:[
                          {value:'claude-haiku-4-5-20251001',label:'Haiku 4.5 (fast)'},
                          {value:'claude-sonnet-4-6',label:'Sonnet 4.6'},
                          {value:'claude-opus-4-8',label:'Opus 4.8 (powerful)'},
                        ],
                        openai:[
                          {value:'gpt-4o-mini',label:'GPT-4o Mini (fast)'},
                          {value:'gpt-4o',label:'GPT-4o'},
                          {value:'gpt-4-turbo',label:'GPT-4 Turbo'},
                        ],
                        gemini:[
                          {value:'gemini-2.0-flash',label:'Gemini 2.0 Flash (fast)'},
                          {value:'gemini-1.5-pro',label:'Gemini 1.5 Pro'},
                          {value:'gemini-1.5-flash',label:'Gemini 1.5 Flash'},
                        ],
                        openrouter:[
                          {value:'openai/gpt-4o-mini',label:'GPT-4o Mini'},
                          {value:'anthropic/claude-haiku-4-5',label:'Claude Haiku'},
                          {value:'google/gemini-flash-1.5',label:'Gemini Flash'},
                          {value:'meta-llama/llama-3.1-8b-instruct:free',label:'Llama 3.1 8B (free)'},
                          {value:'mistralai/mistral-7b-instruct:free',label:'Mistral 7B (free)'},
                        ],
                      }
                      const opts = modelOpts[aiProvider] || []
                      return opts.length>0 ? (
                        <div style={{padding:'0 8px 12px'}}>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.4)',marginBottom:4,letterSpacing:'.06em'}}>MODEL</div>
                          <div style={{display:'flex',flexDirection:'column',gap:2}}>
                            {opts.map(opt=>(
                              <div key={opt.value} onClick={()=>saveAiModel(aiProvider,opt.value)}
                                style={{padding:'4px 8px',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',cursor:'pointer',
                                  color:( aiModels[aiProvider]||opts[0].value)===opt.value?'#c0c8d8':'rgba(200,200,220,.4)',
                                  background:(aiModels[aiProvider]||opts[0].value)===opt.value?'rgba(255,255,255,.06)':'transparent',
                                  border:`1px solid ${(aiModels[aiProvider]||opts[0].value)===opt.value?'rgba(255,255,255,.12)':'transparent'}`}}>
                                {opt.label}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null
                    })()}

                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Sidebar resize divider */}
          <div className="ide-split-divider"
            onMouseDown={e=>{e.preventDefault();document.body.style.userSelect='none';document.body.style.cursor='ew-resize';
              splitDragRef.current={side:'sidebar',sx:e.clientX,startW:sidebarW}}}/>
        </>)}

        {/* ── CANVAS ── */}
        <div className="ide-canvas-wrap" style={{flex:1, position:'relative'}}
        >
          {/* Mode bar */}
          <div className="ide-mode-bar">
            <div className="ide-mode-theme-label">{brutal?'BRUTAL':'CYBER'}</div>
            <div className="ide-tab-spacer"/>
            <button className={`ide-mode-btn ${edgeMode==='join'?'m-join':''}`} onClick={()=>setEdgeMode(m=>m==='join'?null:'join')}>
              {edgeMode==='join'&&<span className="v-pulse green"/>}JOIN
            </button>
            <button className={`ide-mode-btn ${edgeMode==='cut'?'m-cut':''}`} onClick={()=>setEdgeMode(m=>m==='cut'?null:'cut')}>
              {edgeMode==='cut'&&<span className="v-pulse red"/>}CUT
            </button>
            <div className="ide-topbar-sep"/>
            <button className="ide-mode-btn" onClick={()=>setTransform({x:300,y:220,scale:1})}>RESET</button>
            {edgeMode==='join'&&joinFirstNode && (
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',color:'#10b981',marginLeft:6}}>
                → {nodesRef.current.find(n=>n.id===joinFirstNode)?.label}
              </div>
            )}
          </div>

          {/* Canvas input layer (captures pan + wheel) */}
          <div
            ref={canvasInputRef}
            className="ide-canvas-input-layer"
            onPointerDown={handleCanvasPtrDown}
            onPointerMove={handleCanvasPtrMove}
            onPointerUp={handleCanvasPtrUp}
            onPointerLeave={handleCanvasPtrUp}
            style={{cursor:isDraggingCanvas?'grabbing':edgeMode?'crosshair':'default'}}
          >
            {/* Transform container */}
            <div
              className="ide-canvas-graph-transform"
              style={{transform:`translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`}}
            >
              <div className="ide-canvas-graph">
                {/* Edges SVG */}
                <svg
                  style={{position:'absolute',left:-9999,top:-9999,width:19998,height:19998,overflow:'visible',pointerEvents:edgeMode==='cut'?'all':'none'}}
                >
                  <defs>
                    {visibleEdges.map(e=>{
                      const src=visibleNodes.find(n=>n.id===e.source), tgt=visibleNodes.find(n=>n.id===e.target)
                      if(!src||!tgt) return null
                      const srcAcc=ACCENTS[src.themeIdx%ACCENTS.length], tgtAcc=ACCENTS[tgt.themeIdx%ACCENTS.length]
                      return (
                        <linearGradient key={'g'+e.id} id={'grad-'+e.id} x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor={srcAcc} stopOpacity="0.55"/>
                          <stop offset="100%" stopColor={tgtAcc} stopOpacity="0.55"/>
                        </linearGradient>
                      )
                    })}
                  </defs>
                  <g transform="translate(9999,9999)">
                    {/* Group hulls rendered inside the same SVG translation group */}
                    {groupsRef.current.map(grp=>{
                      const grpNodes=visibleNodes.filter(n=>grp.nodeIds.includes(n.id))
                      if (grpNodes.length<2) return null
                      const pts=grpNodes.map(n=>[n.x,n.y])
                      const hull=convexHull(pts)
                      if (hull.length<2) return null
                      const pad=brutal?54:48
                      const expanded=hull.map(([x,y])=>{
                        const cx=hull.reduce((s,[px])=>s+px,0)/hull.length
                        const cy=hull.reduce((s,[,py])=>s+py,0)/hull.length
                        const dx=x-cx, dy=y-cy, dist=Math.sqrt(dx*dx+dy*dy)||1
                        return [x+(dx/dist)*pad, y+(dy/dist)*pad]
                      })
                      const pointsStr=expanded.map(p=>p.join(',')).join(' ')
                      return (
                        <polygon key={'hull-'+grp.id} points={pointsStr} className="group-hull"
                          stroke={grp.color} strokeWidth={brutal?2.5:1.5} strokeOpacity=".45"
                          fill={grp.color} fillOpacity=".07"
                          strokeDasharray={brutal?"6 3":"5 3"}/>
                      )
                    })}

                    {/* Edges */}
                    {visibleEdges.map(e=>{
                      const src=visibleNodes.find(n=>n.id===e.source), tgt=visibleNodes.find(n=>n.id===e.target)
                      if(!src||!tgt) return null
                      const dx=tgt.x-src.x, dy=tgt.y-src.y
                      const len=Math.sqrt(dx*dx+dy*dy)||1
                      const bend=Math.min(len*0.38,72)
                      const c1x=src.x+bend, c1y=src.y
                      const c2x=tgt.x-bend, c2y=tgt.y
                      const isHov=hoveredEdgeId===e.id
                      const midX=(src.x+tgt.x)/2, midY=(src.y+tgt.y)/2
                      const edgeLabel=edgeDataLabels[e.id]
                      const srcAcc=ACCENTS[src.themeIdx%ACCENTS.length]
                      return (
                        <g key={e.id}>
                          <path
                            className="edge-path"
                            d={`M ${src.x} ${src.y} C ${c1x},${c1y} ${c2x},${c2y} ${tgt.x},${tgt.y}`}
                            stroke={isHov&&edgeMode==='cut'?'#ff435a':`url(#grad-${e.id})`}
                            strokeWidth={isHov?3:brutal?2:1.5}
                            opacity={isHov?1:.65}
                            style={{cursor:edgeMode==='cut'?'pointer':'default',transition:'opacity .15s'}}
                            onPointerEnter={()=>startTransition(()=>setHoveredEdgeId(e.id))}
                            onPointerLeave={()=>startTransition(()=>setHoveredEdgeId(null))}
                            onClick={()=>handleEdgeClick(e.id)}
                          />
                          {edgeLabel && (
                            <g transform={`translate(${midX},${midY})`} style={{pointerEvents:'none'}}>
                              <rect x={-edgeLabel.val.length*3-4} y={-9} width={edgeLabel.val.length*6+8} height={16}
                                rx={brutal?0:2} fill={brutal?'#0f0f0f':'rgba(3,3,15,.92)'} stroke={srcAcc} strokeWidth=".8" strokeOpacity=".7"/>
                              <text x={0} y={4} textAnchor="middle"
                                fontFamily="'Share Tech Mono',monospace" fontSize="8" fill={srcAcc} opacity=".95">
                                {edgeLabel.val}
                              </text>
                            </g>
                          )}
                        </g>
                      )
                    })}
                  </g>
                </svg>

                {/* Group labels positioned absolutely on canvas */}
                {groupsRef.current.map(grp=>{
                  const grpNodes=visibleNodes.filter(n=>grp.nodeIds.includes(n.id))
                  if (grpNodes.length<2) return null
                  const pts=grpNodes.map(n=>[n.x,n.y])
                  const hull=convexHull(pts)
                  if (hull.length<2) return null
                  const pad=brutal?54:48
                  const expanded=hull.map(([x,y])=>{
                    const cx=hull.reduce((s,[px])=>s+px,0)/hull.length
                    const cy=hull.reduce((s,[,py])=>s+py,0)/hull.length
                    const dx=x-cx, dy=y-cy, dist=Math.sqrt(dx*dx+dy*dy)||1
                    return [x+(dx/dist)*pad, y+(dy/dist)*pad]
                  })
                  const cx=expanded.reduce((s,[x])=>s+x,0)/expanded.length
                  const cy=Math.min(...expanded.map(([,y])=>y))-14
                  return (
                    <div key={'lbl-'+grp.id} style={{position:'absolute',left:9999+cx,top:9999+cy,transform:'translateX(-50%)',pointerEvents:'auto',cursor:'pointer',zIndex:2}}
                      onClick={()=>setOpenGroupId(grp.id)}>
                      <span className="mn-group-label" style={{background:brutal?'#0f0f0f':'rgba(5,5,12,.92)',color:grp.color,border:`1px solid ${grp.color}44`}}>
                        {grp.name}
                      </span>
                    </div>
                  )
                })}

                {/* Nodes */}
                {visibleNodes.map(node=>(
                  <MangaNode
                    key={node.id}
                    node={node}
                    groups={groupsRef.current}
                    brutal={brutal}
                    isJoinSelected={joinFirstNode===node.id}
                    edgeMode={edgeMode}
                    hoveredNodeId={hoveredNodeId}
                    setHoveredNodeId={setHoveredNodeId}
                    draggingNodeRef={draggingNodeRef}
                    lastMousePos={lastMousePos}
                    transform={transform}
                    setNodeColorPicker={setNodeColorPicker}
                    handleNodeClickInMode={handleNodeClickInMode}
                    openNodeInEditor={openNodeInEditor}
                    nodeRunState={nodeRunState}
                    onRun={handleRunNode}
                    onCtxMenu={(nid,x,y)=>{setNodeCtxMenu({nodeId:nid,x,y});setNodeColorPicker(null)}}
                    wakePhysicsRef={wakePhysicsRef}
                    onMountEl={registerNodeEl}
                    onUnmountEl={unregisterNodeEl}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Canvas decorations (not transformed) */}
          <div className="ide-canvas-chapter" style={{pointerEvents:'none'}}>CHAPTER {nodeCount} · {activeVersionName}</div>
          <div className="ide-canvas-watermark">FORBIDEN</div>
          <GraphMinimap nodes={visibleNodes}/>
        </div>

        {/* ── EDITOR SPLIT PANE ── */}
        {editorOpen && (<>
          {/* Resize divider - left edge of editor */}
          <div className="ide-split-divider"
            onMouseDown={e=>{e.preventDefault();document.body.style.userSelect='none';document.body.style.cursor='ew-resize';
              splitDragRef.current={side:'editor',sx:e.clientX,startW:editorW}}}/>
          {/* Editor pane */}
          <div className="ide-editor-pane" style={{width:editorW,flexShrink:0}}>
            {/* Drag bar */}
            <div style={{height:20,flexShrink:0,display:'flex',alignItems:'center',
              justifyContent:'space-between',padding:'0 8px',
              background:brutal?'#0a0a0a':'rgba(6,6,16,.98)',
              borderBottom:brutal?'2px solid rgba(255,255,255,.07)':'1px solid rgba(255,42,56,.12)',
              userSelect:'none'}}>
              <span style={{fontSize:'8px',letterSpacing:'.1em',opacity:.3,fontFamily:"'Oswald',sans-serif"}}>EDITOR</span>
              <div style={{display:'flex',gap:3}}>
                {['#ff5f57','#ffbd2e','#28c840'].map((c,i)=>(
                  <div key={i} style={{width:9,height:9,borderRadius:'50%',background:c,opacity:.6}}/>
                ))}
              </div>
            </div>
          {activeTabId && activeTabNode ? (
            <>
              {/* Chapter splash */}
              <div className="ide-chapter-splash">
                {splashImgSrc && <img src={splashImgSrc} alt=""/>}
                <div className="ide-splash-overlay"/>
                <div className="ide-splash-meta">
                  <span className="ide-splash-chapter">CHAPTER {chapterNum}</span>
                  <h2 className="ide-splash-title">{activeTabNode.label.replace(/\.\w+$/,'')}</h2>
                  <div className="ide-splash-info">{activeTabNode.type.toUpperCase()} · {(activeTabNode.code||'').split('\n').length} LINES · {activeTabNode.label.match(/\.(\w+)$/)?.[1]?.toUpperCase()||'FILE'}{activeTabNode.modified?' · MOD':''}</div>
                </div>
              </div>
              {/* Tabs + run button */}
              <div className="ide-file-tabs">
                {openTabs.map(id=>{
                  const n=nodesRef.current.find(nd=>nd.id===id)
                  if (!n) return null
                  const isPinned = pinnedTabs.has(id)
                  return (
                    <div key={id} className={`ide-file-tab ${activeTabId===id?'active':''} ${isPinned?'pinned':''}`}
                      onClick={()=>setActiveTabId(id)}
                      onDoubleClick={()=>togglePinTab(id)}
                      title={isPinned?'Pinned (double-click to unpin)':'Double-click to pin'}>
                      {isPinned && <span className="ide-tab-pin"/>}
                      {n.label}
                      {n.modified&&<span className="modified-dot"/>}
                      {!isPinned && <span className="ide-tab-close" onClick={e=>{e.stopPropagation();closeTabLocal(id)}}><I.X/></span>}
                    </div>
                  )
                })}
                <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:4,padding:'0 6px',flexShrink:0}}>
                  {/* Jump to line button */}
                  <button onClick={()=>setShowJumpLine(true)} title="Jump to line (Ctrl+G)"
                    style={{padding:'1px 7px',cursor:'pointer',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',background:'transparent',color:'rgba(200,200,220,.35)',border:'1px solid rgba(255,255,255,.08)',transition:'all .12s'}}
                    onMouseEnter={e=>(e.currentTarget.style.color='#c0c8d8')}
                    onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.35)')}>:N</button>
                  {/* Split editor buttons */}
                  {activeTabId && (
                    <>
                      <button onClick={()=>{ if(splitTabId===activeTabId){setSplitTabId(null)}else{setSplitTabId(activeTabId);setSplitMode('vertical')} }}
                        title={splitTabId===activeTabId?'Close split':'Split vertical'}
                        style={{padding:'1px 7px',cursor:'pointer',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',transition:'all .12s',
                          background:splitTabId===activeTabId?'rgba(16,185,129,.15)':'transparent',
                          color:splitTabId===activeTabId?'#10b981':'rgba(200,200,220,.35)',
                          border:`1px solid ${splitTabId===activeTabId?'rgba(16,185,129,.35)':'rgba(255,255,255,.08)'}`}}
                        onMouseEnter={e=>(e.currentTarget.style.color=splitTabId===activeTabId?'#10b981':'#c0c8d8')}
                        onMouseLeave={e=>(e.currentTarget.style.color=splitTabId===activeTabId?'#10b981':'rgba(200,200,220,.35)')}>⬓</button>
                    </>
                  )}
                  {activeTabNode?.type==='doc' ? (
                    <>
                      {['edit','split','preview'].map(m=>(
                        <button key={m} onClick={()=>setMdPreviewMode(m)}
                          style={{padding:'2px 7px',cursor:'pointer',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.1em',
                            background:mdPreviewMode===m?'#c792ea':'transparent',
                            color:mdPreviewMode===m?'#000':'rgba(200,200,220,.4)',
                            border:'1px solid rgba(200,100,255,.25)',transition:'all .12s'}}>
                          {m.toUpperCase()}
                        </button>
                      ))}
                      <div style={{width:1,height:12,background:'rgba(255,255,255,.1)',margin:'0 3px'}}/>
                      <button onClick={()=>setMdFontSize(s=>Math.max(11,s-1))} title="Decrease text size"
                        style={{padding:'1px 6px',cursor:'pointer',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',
                          background:'transparent',color:'rgba(200,200,220,.4)',border:'1px solid rgba(255,255,255,.1)',
                          lineHeight:1.4,transition:'all .12s'}}
                        onMouseEnter={e=>(e.currentTarget.style.color='#c792ea')}
                        onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.4)')}>A-</button>
                      <button onClick={()=>setMdFontSize(s=>Math.min(26,s+1))} title="Increase text size"
                        style={{padding:'1px 6px',cursor:'pointer',fontFamily:"'JetBrains Mono',monospace",fontSize:'13px',
                          background:'transparent',color:'rgba(200,200,220,.4)',border:'1px solid rgba(255,255,255,.1)',
                          lineHeight:1.4,transition:'all .12s'}}
                        onMouseEnter={e=>(e.currentTarget.style.color='#c792ea')}
                        onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.4)')}>A+</button>
                    </>
                  ) : (
                    <button onClick={()=>handleRunNode(activeTabId)}
                      title={`Run (Ctrl+Enter)${isCompiled(activeLang)?' — compile & run locally':''}`}
                      style={{padding:'2px 10px',cursor:'pointer',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.1em',
                        background:nodeRunState[activeTabId]?.status==='ok'?'#10b981':nodeRunState[activeTabId]?.status==='error'?'#ff435a':'transparent',
                        color:nodeRunState[activeTabId]?.status?'#000':isCompiled(activeLang)?'#ff8080':brutal?'#f2c12e':'#ff2a38',
                        border:`1px solid ${nodeRunState[activeTabId]?.status==='ok'?'#10b981':nodeRunState[activeTabId]?.status==='error'?'#ff435a':isCompiled(activeLang)?'rgba(255,128,128,.4)':brutal?'#f2c12e':'rgba(255,42,56,.4)'}`,
                        transition:'all .15s'}}>
                      {nodeRunState[activeTabId]?.status==='running'?'⋯'
                        :nodeRunState[activeTabId]?.status==='ok'?`✓ ${nodeRunState[activeTabId].ms}ms`
                        :nodeRunState[activeTabId]?.status==='error'?'✗ ERR'
                        :isCompiled(activeLang)?`▶ ${activeLang.toUpperCase()}`:'▶ RUN'}
                    </button>
                  )}
                </div>
              </div>
              {/* Editor / Markdown Preview */}
              <div className="ide-code-wrap" style={{display:'flex',flexDirection:splitTabId?(splitMode==='horizontal'?'column':'row'):'column',overflow:'hidden'}} onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();handleRunNode(activeTabId)}}}>
                {/* Primary editor pane */}
                <div style={{flex:1,overflow:'hidden',position:'relative',display:'flex',flexDirection:'column'}}>
                  {activeTabNode?.type==='doc' && mdPreviewMode==='split' ? (
                    <div style={{display:'flex',height:'100%',overflow:'hidden'}}>
                      <div style={{flex:1,overflow:'hidden',borderRight:'1px solid rgba(255,255,255,.08)'}}>
                        <CodeMirrorEditor key={activeTabId+'_s'} node={activeTabNode} onChange={code=>updateNodeCode(activeTabId,code)} onSave={()=>saveNodeToDisk(activeTabId)} externalPalette={globalEditorPalette} onPaletteChange={p=>setGlobalEditorPalette(p)}/>
                      </div>
                      <div style={{flex:1,overflow:'auto',padding:'12px 16px',fontSize:mdFontSize+'px'}} className="md-preview"
                        dangerouslySetInnerHTML={{__html: renderMd(activeTabNode.code||'')}}/>
                    </div>
                  ) : activeTabNode?.type==='doc' && mdPreviewMode==='preview' ? (
                    <div className="md-preview" style={{fontSize:mdFontSize+'px'}} dangerouslySetInnerHTML={{__html: renderMd(activeTabNode.code||'')}}/>
                  ) : (
                    <CodeMirrorEditor
                      key={activeTabId}
                      node={activeTabNode}
                      onChange={code=>updateNodeCode(activeTabId,code)}
                      onSave={()=>saveNodeToDisk(activeTabId)}
                      externalPalette={globalEditorPalette}
                      onPaletteChange={p=>setGlobalEditorPalette(p)}
                      jumpToLine={jumpLineTarget??undefined}
                      onCursorChange={(line,col)=>setEditorCursorPos({line,col})}
                      aiProvider={aiProvider}
                      aiKey={aiProvider==='ollama'?(aiKeys['ollama']||'http://localhost:11434'):aiKeys[aiProvider]||''}
                      aiModel={aiModels[aiProvider]||DEFAULT_MODELS[aiProvider]||''}
                    />
                  )}
                </div>

                {/* Split pane */}
                {splitTabId && (() => {
                  const splitNode = nodesRef.current.find(n=>n.id===splitTabId)
                  return splitNode ? (
                    <>
                      <div style={{
                        [splitMode==='horizontal'?'height':'width']:'1px',
                        background:'rgba(255,255,255,.1)',flexShrink:0,
                        cursor:splitMode==='horizontal'?'row-resize':'col-resize'
                      }}/>
                      <div style={{flex:1,overflow:'hidden',position:'relative',display:'flex',flexDirection:'column'}}>
                        <div style={{display:'flex',alignItems:'center',padding:'2px 8px',background:'rgba(0,0,0,.25)',flexShrink:0,gap:6,borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',opacity:.5,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{splitNode.label}</span>
                          <button onClick={()=>setSplitTabId(null)} style={{background:'transparent',border:'none',color:'rgba(200,200,220,.3)',cursor:'pointer',fontSize:'11px',padding:'0 2px',lineHeight:1}} title="Close split">✕</button>
                        </div>
                        <CodeMirrorEditor
                          key={splitTabId+'_split'}
                          node={splitNode}
                          onChange={code=>updateNodeCode(splitTabId,code)}
                          onSave={()=>saveNodeToDisk(splitTabId)}
                          externalPalette={globalEditorPalette}
                          onPaletteChange={p=>setGlobalEditorPalette(p)}
                          onCursorChange={(line,col)=>setEditorCursorPos({line,col})}
                          aiProvider={aiProvider}
                          aiKey={aiProvider==='ollama'?(aiKeys['ollama']||'http://localhost:11434'):aiKeys[aiProvider]||''}
                          aiModel={aiModels[aiProvider]||DEFAULT_MODELS[aiProvider]||''}
                        />
                      </div>
                    </>
                  ) : null
                })()}
              </div>
            </>
          ) : (
            <div className="ide-welcome idw-splash">

              {/* ── 3-panel manga stage (full-bleed background) ── */}
              <div className="idw-manga-stage">
                <div className="idw-mp idw-mp-a">
                  <img src={getPanelImg(2)} alt="" loading="lazy"/>
                  <div className="idw-mp-overlay"/>
                </div>
                <div className="idw-mp idw-mp-b">
                  <img src={getPanelImg(6)} alt="" loading="lazy"/>
                  <div className="idw-mp-overlay"/>
                </div>
                <div className="idw-mp idw-mp-c">
                  <img src={getPanelImg(11)} alt="" loading="lazy"/>
                  <div className="idw-mp-overlay"/>
                </div>
                <div className="idw-global-veil"/>
                <div className="idw-halftone"/>
                <div className="idw-scanlines"/>
              </div>

              {/* ── SVG speed lines ── */}
              <svg className="idw-speedlines" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
                {Array.from({length:32}).map((_:any,i:number)=>{
                  const a=(i/32)*Math.PI*2
                  const cx=130,cy=210
                  return <line key={i}
                    x1={cx} y1={cy}
                    x2={cx+Math.cos(a)*1200} y2={cy+Math.sin(a)*1200}
                    stroke={brutal?'rgba(15,15,15,.042)':'rgba(255,255,255,.042)'}
                    strokeWidth="1.3"
                  />
                })}
              </svg>

              {/* ── Hero text ── */}
              <div className="idw-hero">
                <div className="idw-hero-tag" style={{color:brutal?'#f2c12e':'#ff2a38',borderColor:brutal?'rgba(242,193,46,.55)':'rgba(255,42,56,.55)'}}>
                  FORBIDEN <span style={{opacity:.45}}>//</span> NGO
                </div>
                <div className="idw-hero-chapter">
                  CHAPTER {nodeCount} · {edgeCount>0?`${edgeCount} LINKS`:'ORIGIN'}
                </div>
                <div className="idw-hero-title">
                  SELECT<br/>A NODE
                </div>
                <div className="idw-hero-sub">Each panel is a chapter.</div>
                <button className="idw-hero-cta" style={{
                  background:brutal?'#f2c12e':'rgba(255,42,56,.13)',
                  color:brutal?'#0f0f0f':'#ff2a38',
                  border:brutal?'2.5px solid #0f0f0f':'1px solid rgba(255,42,56,.5)',
                }} onClick={()=>setShowCreateNode(true)}>
                  + CREATE NODE
                </button>
              </div>

              {/* ── Manga SFX decoration ── */}
              <div className="idw-sfx" style={{color:brutal?'rgba(15,15,15,.055)':'rgba(255,255,255,.038)'}}>
                KLIK!
              </div>

              {/* ── Floating node browser ── */}
              {(() => {
                const allTypes = ['all','entry','function','class','module','doc']
                const typeColors:any = {entry:'#ff2a38',function:'#ffc410',class:'#10b981',module:'#4285f4',doc:'#c792ea',default:'#888'}
                const wq = welcomeSearch.trim().toLowerCase()
                const allNodes = nodesRef.current
                const typeFiltered = welcomeFilter==='all' ? allNodes : allNodes.filter((n:any)=>n.type===welcomeFilter)
                const displayNodes = wq
                  ? typeFiltered.filter((n:any)=>n.label.toLowerCase().includes(wq)||(n.code||'').toLowerCase().includes(wq))
                  : typeFiltered
                const typeCounts:any = {}
                allNodes.forEach((n:any)=>{ typeCounts[n.type]=(typeCounts[n.type]||0)+1 })
                const usedTypes = allTypes.filter(t=>t==='all'||(typeCounts[t]||0)>0)
                const grouped = groupsRef.current.length>0 && !wq && welcomeFilter==='all'
                const ungroupedNodes = grouped ? displayNodes.filter((n:any)=>!groupsRef.current.some((g:any)=>g.nodeIds.includes(n.id))) : []
                return (
                <div className="idw-browser">

                  {/* ── Browser header ── */}
                  <div className="idw-browser-hdr">
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span className="idw-browser-title" style={{color:brutal?'#f2c12e':'#ff2a38'}}>FILES</span>
                      <div style={{flex:1}}/>
                      <button className="ide-btn ide-btn-sm" onClick={()=>setShowCreateNode(true)}>+ NODE</button>
                      <button className="ide-btn ide-btn-sm" onClick={()=>folderInputRef.current?.click()}>⬆</button>
                    </div>
                    <div className="idw-browser-stats">
                      <span>{nodeCount} NODES</span>
                      <span style={{opacity:.28}}>·</span>
                      <span>{edgeCount} EDGES</span>
                      {groupsRef.current.length>0&&<><span style={{opacity:.28}}>·</span><span>{groupsRef.current.length} GRP</span></>}
                      <div style={{flex:1}}/>
                      {modifiedNodes.length>0&&<span style={{color:'#ffc410'}}>{modifiedNodes.length} MOD</span>}
                    </div>
                  </div>

                  {/* ── Search ── */}
                  <div style={{padding:'6px 10px 3px',flexShrink:0}}>
                    <div style={{position:'relative'}}>
                      <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:'10px',opacity:.3,pointerEvents:'none'}}>⌕</span>
                      <input
                        value={welcomeSearch}
                        onChange={(e:any)=>setWelcomeSearch(e.target.value)}
                        placeholder="Search files and code…"
                        style={{
                          width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',
                          outline:'none',color:'#c0c8d8',fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',
                          padding:'5px 8px 5px 24px',transition:'border-color .15s',
                        }}
                        onFocus={(e:any)=>(e.target.style.borderColor=brutal?'rgba(242,193,46,.5)':'rgba(255,42,56,.4)')}
                        onBlur={(e:any)=>(e.target.style.borderColor='rgba(255,255,255,.08)')}
                      />
                      {welcomeSearch&&(
                        <button onClick={()=>setWelcomeSearch('')} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',cursor:'pointer',color:'rgba(200,200,220,.3)',fontSize:'12px',lineHeight:1}}>×</button>
                      )}
                    </div>
                  </div>

                  {/* ── Filter chips ── */}
                  {!wq && (
                    <div style={{display:'flex',gap:3,padding:'3px 10px 5px',flexShrink:0,flexWrap:'wrap'}}>
                      {usedTypes.map(t=>{
                        const active = welcomeFilter===t
                        const col = typeColors[t]||typeColors.default
                        return (
                          <button key={t} onClick={()=>setWelcomeFilter(t)}
                            style={{
                              background: active?`${col}22`:'transparent',
                              border:`1px solid ${active?col:`${col}30`}`,
                              color: active?col:`rgba(200,200,220,.3)`,
                              fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.08em',
                              padding:'2px 7px',cursor:'pointer',transition:'all .12s',
                            }}>
                            {t==='all'?`ALL (${allNodes.length})`:t.toUpperCase()+(typeCounts[t]?` (${typeCounts[t]})`:'') }
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* ── Node list ── */}
                  <div style={{flex:1,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent'}}>

                    {!wq && openTabs.length>0 && welcomeFilter==='all' && (
                      <>
                        <div style={{padding:'4px 10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.14em',color:'rgba(200,200,220,.3)',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                          RECENT
                        </div>
                        {openTabs.slice(0,4).map((tid:any)=>{
                          const n=nodesRef.current.find((n:any)=>n.id===tid)
                          if(!n) return null
                          const grp=groupsRef.current.find((g:any)=>g.nodeIds.includes(n.id))
                          const acc=grp?grp.color:ACCENTS[n.themeIdx%ACCENTS.length]
                          return (
                            <div key={n.id} onClick={()=>openNodeInEditor(n.id)}
                              style={{display:'flex',alignItems:'center',gap:8,padding:'5px 12px',cursor:'pointer',
                                background:activeTabId===n.id?'rgba(255,255,255,.05)':'transparent',transition:'background .1s'}}
                              onMouseEnter={(e:any)=>(e.currentTarget.style.background='rgba(255,255,255,.05)')}
                              onMouseLeave={(e:any)=>(e.currentTarget.style.background=activeTabId===n.id?'rgba(255,255,255,.05)':'transparent')}>
                              <div style={{width:5,height:5,borderRadius:'50%',background:acc,flexShrink:0}}/>
                              <span style={{flex:1,fontFamily:"'Share Tech Mono',monospace",fontSize:'12px',color:'#c0c8d8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                {n.label}{n.modified&&<span style={{color:'#ffc410',marginLeft:4}}>●</span>}
                              </span>
                              <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',color:acc,opacity:.55,letterSpacing:'.07em',flexShrink:0}}>
                                {n.type.slice(0,3).toUpperCase()}
                              </span>
                            </div>
                          )
                        })}
                      </>
                    )}

                    {wq && (
                      <div style={{padding:'3px 10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.16em',color:'rgba(200,200,220,.28)',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                        {displayNodes.length} RESULTS FOR "{wq.toUpperCase()}"
                      </div>
                    )}

                    {grouped ? (<>
                      {groupsRef.current.map((g:any)=>{
                        const gNodes=displayNodes.filter((n:any)=>g.nodeIds.includes(n.id))
                        if(!gNodes.length) return null
                        return (
                          <div key={g.id}>
                            <div style={{padding:'5px 10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.12em',
                              color:g.color,borderBottom:'1px solid rgba(255,255,255,.04)',display:'flex',alignItems:'center',gap:6}}>
                              <div style={{width:4,height:4,borderRadius:'50%',background:g.color}}/>
                              {g.name.toUpperCase()}
                              <span style={{opacity:.4,fontWeight:400,marginLeft:'auto'}}>{gNodes.length}</span>
                            </div>
                            {gNodes.map((n:any)=><WelcomeNodeRow key={n.id} n={n} active={activeTabId===n.id} onClick={()=>openNodeInEditor(n.id)} groups={groupsRef.current}/>)}
                          </div>
                        )
                      })}
                      {ungroupedNodes.length>0&&(<>
                        <div style={{padding:'4px 10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.14em',
                          color:'rgba(200,200,220,.28)',borderBottom:'1px solid rgba(255,255,255,.04)',display:'flex',alignItems:'center',gap:6}}>
                          UNGROUPED <span style={{opacity:.4,fontWeight:400,marginLeft:'auto'}}>{ungroupedNodes.length}</span>
                        </div>
                        {ungroupedNodes.map((n:any)=><WelcomeNodeRow key={n.id} n={n} active={activeTabId===n.id} onClick={()=>openNodeInEditor(n.id)} groups={groupsRef.current}/>)}
                      </>)}
                    </>) : (
                      <>
                        {!wq&&(
                          <div style={{padding:'4px 10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.14em',color:'rgba(200,200,220,.3)',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                            {welcomeFilter==='all'?`ALL FILES (${displayNodes.length})`:welcomeFilter.toUpperCase()+` (${displayNodes.length})`}
                          </div>
                        )}
                        {displayNodes.map((n:any)=><WelcomeNodeRow key={n.id} n={n} active={activeTabId===n.id} onClick={()=>openNodeInEditor(n.id)} groups={groupsRef.current} searchQuery={wq}/>)}
                      </>
                    )}

                    {displayNodes.length===0&&(
                      <div style={{padding:'32px 16px',textAlign:'center',opacity:.2,fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',lineHeight:2}}>
                        {wq?'NO MATCHES':'NO NODES YET'}<br/>
                        <span style={{fontSize:'9px',opacity:.6}}>
                          {wq?'try a different search':'+NODE · ⬆ FOLDER · DROP FILES ON CANVAS'}
                        </span>
                      </div>
                    )}
                    <div style={{height:12}}/>
                  </div>

                  {/* ── Bottom bar ── */}
                  <div style={{padding:'6px 10px',flexShrink:0,borderTop:'1px solid rgba(255,255,255,.06)',
                    display:'flex',alignItems:'center',gap:5,background:'rgba(0,0,0,.25)'}}>
                    <button className="ide-btn ide-btn-sm" onClick={()=>setNotebookFloating(f=>!f)}
                      style={{color:notebookFloating?'#c792ea':'',borderColor:notebookFloating?'rgba(199,146,234,.3)':''}}>
                      ◎ NOTE
                    </button>
                    <button className="ide-btn ide-btn-sm" onClick={()=>{setBottomTab('timeline');setBottomOpen(true)}}>⎔ TL</button>
                    <div style={{flex:1}}/>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'7px',opacity:.15,letterSpacing:'.08em'}}>
                      DROP ON CANVAS
                    </span>
                  </div>
                </div>
                )
              })()}
            </div>
          )}
          </div>
        </>)}
      </div>

      </div>{/* ide-main-row */}

      {/* ── FLOATING NOTEBOOK PANEL (centered modal) ── */}
      {notebookFloating && (
        <>
          {/* Backdrop */}
          <div onClick={()=>setNotebookFloating(false)}
            style={{position:'fixed',inset:0,zIndex:99,background:'rgba(0,0,0,.55)',backdropFilter:'blur(2px)'}}/>
          {/* Panel */}
          <div style={{
            position:'fixed',
            top:'50%', left:'50%',
            transform:'translate(-50%,-50%)',
            zIndex:100,
            width:'min(860px, 90vw)',
            height:'min(680px, 85vh)',
            display:'flex', flexDirection:'column', overflow:'hidden',
            background:'#07070f',
            border:'1px solid rgba(199,146,234,.25)',
            boxShadow:'0 24px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(199,146,234,.08)',
            animation:'nbFadeIn .18s cubic-bezier(.2,.8,.4,1)',
          }}>
            {/* Title bar */}
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 12px',flexShrink:0,
              borderBottom:'1px solid rgba(255,255,255,.07)',background:'rgba(0,0,0,.6)',userSelect:'none'}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c792ea" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'11px',letterSpacing:'.15em',color:'#c792ea'}}>NOTEBOOK</span>
              <span style={{opacity:.22,fontSize:'9px',fontFamily:"'Share Tech Mono',monospace"}}>Shift+Enter runs · Tab indents · Esc closes</span>
              <button onClick={()=>setNotebookFloating(false)}
                style={{marginLeft:'auto',background:'transparent',border:'none',cursor:'pointer',
                  color:'rgba(200,200,220,.3)',fontSize:'16px',lineHeight:1,padding:'2px 6px',transition:'color .12s'}}
                onMouseEnter={e=>(e.currentTarget.style.color='#ff435a')}
                onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.3)')}>✕</button>
            </div>
            <NotebookPanel/>
          </div>
        </>
      )}

      {/* ── BOTTOM PANEL (Timeline / Console / Git) ── */}
      {bottomOpen && (
        <div className="ide-bottom-panel" style={{height:bottomH}}>
          {/* Resize drag handle */}
          <div className="ide-bottom-resize"
            onMouseDown={e=>{e.preventDefault();document.body.style.userSelect='none';document.body.style.cursor='ns-resize';
              tlDragRef.current={sy:e.clientY,startH:bottomH}}}/>
          {/* Tab bar */}
          <div className="ide-bottom-tabbar">
            {[
              {key:'console',  icon:<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="3,5 7,8 3,11"/><line x1="9" y1="11" x2="13" y2="11"/></svg>, label:'CONSOLE'},
              {key:'terminal', icon:<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="2,4 6,8 2,12"/><line x1="8" y1="12" x2="14" y2="12"/></svg>, label:'TERMINAL'},
              {key:'scripts',  icon:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>, label:'SCRIPTS'},
              {key:'notebook', icon:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>, label:'NOTEBOOK'},
              {key:'timeline', icon:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>, label:'TIMELINE'},
            ].map(t=>(
              <button key={t.key}
                className={`ide-bottom-tab ${bottomTab===t.key?'active':''}`}
                onClick={()=>setBottomTab(t.key)}>
                {t.icon}
                {t.label}
              </button>
            ))}
            <div className="ide-tab-spacer"/>
            <span className="ide-resize-hint">↕ resize</span>
            <button className="ide-bottom-close" onClick={()=>setBottomOpen(false)}>✕</button>
          </div>
          {/* Content */}
          <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',minHeight:0}}>
            {bottomTab==='terminal' && (
              <XTermPanel
                cwd={termCwd}
                palette={termPalette}
                onCwdChange={setTermCwd}
                onActivePtyChange={handleActivePtyChange}
              />
            )}
            {bottomTab==='scripts' && (
              <ScriptsPanel
                onRun={(cmd)=>{
                  setBottomTab('terminal')
                  setBottomOpen(true)
                  // Give terminal tab time to mount, then inject command via ref (avoids stale closure)
                  setTimeout(() => {
                    const ptyId = activePtyIdRef.current
                    if (ptyId) {
                      api?.runInTerminal?.(ptyId, 'sh', cmd, explorerRoot)
                    }
                  }, 800)
                }}/>
            )}
            {bottomTab==='timeline' && (
              <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',minHeight:0}}>
                <TimelinePanel eventLog={eventLog} brutal={brutal}/>
              </div>
            )}
            {bottomTab==='notebook' && <NotebookPanel/>}
            {bottomTab==='console' && (
              <ConsolePanel
                logs={jsLogs}
                onClear={() => setJsLogs([])}
                compileStdin={compileStdin}
                setCompileStdin={setCompileStdin}
                replInput={replInput}
                setReplInput={setReplInput}
                handleReplKey={handleReplKey}
                showStdin={isCompiled(detectLang(nodesRef.current.find(n=>n.id===activeTabId)?.label||''))}
                activeLang={detectLang(nodesRef.current.find(n=>n.id===activeTabId)?.label||'')}
              />
            )}
          </div>
        </div>
      )}



      {/* ═══════ STATUS BAR ═══════ */}
      {/* ═══════ STATUS BAR ═══════ */}
      <div className="ide-status-bar">
        <div className="ide-status-badge" style={{background:brutal?'#c8001a':'#ff2a38',color:'#fff'}}>FORBIDEN</div>
        <span style={{color:brutal?'#10b981':'#28f1c3'}}>● LOCAL</span>
        {gitBranch && (
          <span
            title="Source Control (Ctrl+Shift+G)"
            onClick={()=>{ setSidebarMode('git'); setSidebarOpen(o=>sidebarMode==='git'?!o:true) }}
            style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',padding:'0 4px',borderRadius:2,transition:'background .12s'}}
            onMouseEnter={e=>(e.currentTarget.style.background=brutal?'rgba(255,255,255,.08)':'rgba(255,42,56,.08)')}
            onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="6" y1="3" x2="6" y2="15"/>
              <circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>
              <path d="M18 9a9 9 0 01-9 9"/>
            </svg>
            <span style={{opacity:.8}}>{gitBranch}</span>
            {gitChangeCount>0 && <span style={{color:'#e2c08d',fontSize:'9px'}}>+{gitChangeCount}</span>}
          </span>
        )}
        {editorCursorPos && activeTabId && (<>
          <span style={{opacity:.2}}>|</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'9px',opacity:.6}}>Ln {editorCursorPos.line}, Col {editorCursorPos.col}</span>
        </>)}
        <span style={{opacity:.2}}>|</span>
        <span>{nodeCount} nodes · {edgeCount} edges</span>
        {groupsRef.current.length>0 && <><span style={{opacity:.2}}>|</span><span>{groupsRef.current.length} classes</span></>}
        {edgeMode && <><span style={{opacity:.2}}>|</span><span style={{color:edgeMode==='join'?(brutal?'#10b981':'#28f1c3'):'#ff435a'}}>{edgeMode==='join'?'JOIN MODE':'CUT MODE'}</span></>}
        <div className="ide-sb-hints">
          {([['⌘P','find'],['N','node'],['J','join'],['X','cut'],['`','term']] as [string,string][]).map(([k,label])=>(
            <div key={k} className="ide-sb-hint">
              <kbd>{k}</kbd>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════ OVERLAYS ═══════ */}

      {/* Board overlay */}
      {sidebarMode==='board' && (
        <div className="ide-board-overlay" onClick={()=>setSidebarMode('files')}>
          <div className="ide-board-shell" onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:10,flexShrink:0,borderBottom:brutal?'3px solid #0f0f0f':'1px solid rgba(255,42,56,.15)'}}>
              <span style={{fontFamily:"'Bangers',sans-serif",fontSize:'1.3rem',letterSpacing:'.1em',color:brutal?'#f2c12e':'#ff2a38'}}>MISSION BOARD</span>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',opacity:.4}}>{board.cards.length} tasks</span>
              <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                <button className="ide-btn ide-btn-sm" onClick={()=>{setNewCardCol(board.cols[0]?.id);setNewCardTitle('')}}>+ TASK</button>
                <button onClick={()=>setSidebarMode('files')} style={{background:'transparent',border:'none',color:'rgba(200,200,220,.4)',cursor:'pointer',fontSize:'1.1rem'}}>✕</button>
              </div>
            </div>
            {/* Columns */}
            <div className="board-cols">
              {board.cols.map(col=>(
                <div key={col.id} className="board-col">
                  <div className="board-col-hdr" style={{color:col.color,borderBottom:brutal?`3px solid ${col.color}`:`1px solid ${col.color}44`}}>
                    <span>{col.title}</span>
                    <span style={{opacity:.5,fontFamily:"'Share Tech Mono',monospace"}}>{board.cards.filter(c=>c.colId===col.id).length}</span>
                  </div>
                  <div className="board-col-cards">
                    {board.cards.filter(c=>c.colId===col.id).map(card=>(
                      <div key={card.id} className="board-card" onClick={()=>setFocusCard(card)}>
                        <div className="board-card-accent" style={{background:PC[card.priority]||'#4a4a6a'}}/>
                        <div className="board-card-title">{card.title}</div>
                        <div className="board-card-meta">
                          <span className="board-priority" style={{background:(PC[card.priority]||'#4a4a6a')+'22',color:PC[card.priority]||'#c0c8d8',fontSize:'10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,letterSpacing:'.08em'}}>{card.priority}</span>
                          {card.tags?.slice(0,2).map(t=><span key={t} className="board-tag" style={{color:'rgba(200,200,220,.5)',borderColor:'rgba(255,255,255,.08)',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',padding:'1px 4px'}}>{t}</span>)}
                        </div>
                        {card.progress>0 && (
                          <div className="board-progress">
                            <div className="board-progress-bar" style={{width:card.progress+'%',background:PC[card.priority]||'#10b981'}}/>
                          </div>
                        )}
                      </div>
                    ))}
                    {newCardCol===col.id ? (
                      <div style={{padding:'5px'}}>
                        <input value={newCardTitle} onChange={e=>setNewCardTitle(e.target.value)} placeholder="Task title..."
                          onKeyDown={e=>{if(e.key==='Enter')addCard(col.id);if(e.key==='Escape')setNewCardCol(null)}}
                          autoFocus style={{width:'100%',background:'transparent',border:brutal?'2px solid #0f0f0f':'1px solid rgba(255,42,56,.2)',outline:'none',color:brutal?'#0f0f0f':'#c0c8d8',fontFamily:"'Share Tech Mono',monospace",fontSize:'12px',padding:'5px 7px'}}/>
                      </div>
                    ) : (
                      <div className="board-add-card" onClick={()=>{setNewCardCol(col.id);setNewCardTitle('')}}>+ ADD TASK</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Card detail */}
      {focusCard && (
        <div className="board-card-detail-overlay" onClick={()=>setFocusCard(null)}>
          <div className="board-card-detail-box" onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <div style={{width:8,height:8,background:PC[focusCard.priority]||'#4a4a6a',borderRadius:brutal?0:'50%'}}/>
              <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'11px',color:PC[focusCard.priority],letterSpacing:'.1em'}}>{focusCard.priority}</span>
              <button onClick={()=>setFocusCard(null)} style={{marginLeft:'auto',background:'transparent',border:'none',cursor:'pointer',color:'rgba(200,200,220,.35)',fontSize:'1rem'}}>✕</button>
            </div>
            <div style={{fontFamily:"'Bangers',sans-serif",fontSize:'1.1rem',letterSpacing:'.06em',marginBottom:8,color:brutal?'#0f0f0f':'#f4f0e8'}}>{focusCard.title}</div>
            {focusCard.due && <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',opacity:.5,marginBottom:8}}>DUE {focusCard.due}</div>}
            {focusCard.progress>0 && (
              <div style={{marginBottom:10}}>
                <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'11px',letterSpacing:'.12em',opacity:.4,marginBottom:4}}>PROGRESS</div>
                <div style={{height:4,background:'rgba(128,128,128,.15)',borderRadius:2}}>
                  <div style={{width:focusCard.progress+'%',height:'100%',background:PC[focusCard.priority]||'#10b981',borderRadius:2,transition:'width .3s'}}/>
                </div>
              </div>
            )}
            {/* Move to col */}
            <div>
              <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'11px',letterSpacing:'.12em',opacity:.4,marginBottom:5}}>MOVE TO</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                {board.cols.map(col=>(
                  <button key={col.id} onClick={()=>{moveCard(focusCard.id,col.id);setFocusCard(null)}}
                    className="ide-btn ide-btn-sm" style={{color:col.color,borderColor:col.color+'44'}}>
                    {col.title}
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:'flex',gap:5,marginTop:10}}>
              <button className="ide-btn ide-btn-sm" style={{color:'#ff435a'}} onClick={()=>deleteCard(focusCard.id)}>DELETE</button>
            </div>
          </div>
        </div>
      )}

      {/* Group editor */}
      {openGroupId && openGroup && (
        <GroupEditor
          group={openGroup}
          nodes={nodesRef.current}
          onClose={()=>setOpenGroupId(null)}
          onOpenNode={id=>{setOpenGroupId(null);openNodeInEditor(id)}}
        />
      )}

      {/* Command palette */}
      <CommandPalette isOpen={showCmd} onClose={()=>setShowCmd(false)} onAction={handleCmdAction} onPreviewPalette={p=>{if(p)setGlobalEditorPalette(p)}}/>

      {/* File finder (Ctrl+P) */}
      <FileFinderModal isOpen={showFileFinder} onClose={()=>setShowFileFinder(false)} onOpenFile={handleOpenWorkspaceFile} rootPath={explorerRoot} recentFiles={recentFiles}/>

      {/* Jump to line (Ctrl+G) */}
      <JumpToLineModal isOpen={showJumpLine} onClose={()=>setShowJumpLine(false)} onJump={line=>setJumpLineTarget(line)} maxLine={activeTabNode?.code?.split('\n').length||9999}/>

      {/* ── KEYBOARD SHORTCUTS OVERLAY ── */}
      {showShortcuts && (
        <div style={{position:'fixed',inset:0,zIndex:95000,background:'rgba(0,0,0,.6)',backdropFilter:'blur(4px)',display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'60px'}}
          onClick={()=>setShowShortcuts(false)}>
          <div style={{background:brutal?'#f0ece0':'#0d0d1a',border:`1px solid ${brutal?'#0f0f0f':'rgba(255,196,16,.25)'}`,
            width:'min(780px,96vw)',maxHeight:'80vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,.7)'}}
            onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',padding:'10px 16px',borderBottom:`1px solid ${brutal?'#0f0f0f':'rgba(255,255,255,.07)'}`,flexShrink:0}}>
              <span style={{fontFamily:"'Bangers',sans-serif",fontSize:'1.3rem',letterSpacing:'.12em',color:brutal?'#0f0f0f':'#ffc410'}}>KEYBOARD SHORTCUTS</span>
              <span style={{marginLeft:10,fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.3)'}}>Ctrl+? to toggle · Esc to close</span>
              <button onClick={()=>setShowShortcuts(false)} style={{marginLeft:'auto',background:'transparent',border:'none',color:'rgba(200,200,220,.4)',cursor:'pointer',fontSize:'1.1rem',lineHeight:1}}>✕</button>
            </div>
            {/* Grid of sections */}
            <div style={{overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent',padding:'12px 16px',
              display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'12px 20px'}}>
              {([
                { group:'NAVIGATION', color:'#4285f4', items:[
                  ['Ctrl+P',        'Quick open file'],
                  ['Ctrl+G',        'Go to line'],
                  ['Ctrl+Shift+F',  'Search in files'],
                  ['Ctrl+Shift+O',  'File outline'],
                  ['Ctrl+B',        'Toggle sidebar'],
                ]},
                { group:'EDITOR', color:'#10b981', items:[
                  ['Ctrl+S',        'Save file'],
                  ['Ctrl+/',        'Toggle comment'],
                  ['Ctrl+F',        'Find in file'],
                  ['Ctrl+Enter',    'Run file'],
                  ['Ctrl+Z',        'Undo'],
                  ['Ctrl+Shift+Z',  'Redo'],
                ]},
                { group:'PANELS & VIEW', color:'#ffc410', items:[
                  ['Ctrl+Shift+P',  'Command palette'],
                  ['Ctrl+Shift+Z',  'Zen / focus mode'],
                  ['Ctrl+?',        'Shortcuts cheatsheet'],
                  ['`  (backtick)', 'Toggle terminal'],
                  ['Ctrl+Shift+E',  'Explorer sidebar'],
                ]},
                { group:'AI', color:'#bb9af7', items:[
                  ['Sidebar ✦ icon','Open AI chat'],
                  ['⚙ in AI panel', 'Change provider/key'],
                  ['✦ AI in git',   'Generate commit msg'],
                  ['Settings panel','Manage API keys'],
                ]},
                { group:'SPLIT EDITOR', color:'#89ddff', items:[
                  ['⬓ tab button',  'Split/unsplit editor'],
                  ['Cmd palette',   'Split vertical'],
                  ['Cmd palette',   'Split horizontal'],
                  ['✕ in split',    'Close split pane'],
                ]},
                { group:'GIT', color:'#ff435a', items:[
                  ['Git panel',     'Stage / unstage files'],
                  ['Ctrl+Enter',    'Commit (in msg box)'],
                  ['✦ AI button',   'Generate commit msg'],
                  ['Push / Pull',   'Sync with remote'],
                ]},
                { group:'GRAPH CANVAS', color:'#f2c12e', items:[
                  ['N',             'New node'],
                  ['J',             'Join / edge mode'],
                  ['X',             'Cut edge mode'],
                  ['Scroll',        'Zoom in/out'],
                  ['Drag node',     'Move node'],
                  ['Drag canvas',   'Pan view'],
                ]},
                { group:'TERMINAL', color:'#28f1c3', items:[
                  ['Any command',   'Full PTY shell'],
                  ['New tab +',     'Open another terminal'],
                  ['Clear button',  'Clear terminal output'],
                  ['⚙ palette btn', 'Change terminal theme'],
                ]},
              ] as {group:string,color:string,items:[string,string][]}[]).map(sec=>(
                <div key={sec.group}>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.14em',
                    color:sec.color,marginBottom:6,paddingBottom:3,borderBottom:`1px solid ${sec.color}33`}}>{sec.group}</div>
                  {sec.items.map(([key,label])=>(
                    <div key={key+label} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',
                        background:brutal?'rgba(0,0,0,.08)':'rgba(255,255,255,.06)',
                        border:`1px solid ${brutal?'rgba(0,0,0,.15)':'rgba(255,255,255,.1)'}`,
                        padding:'1px 5px',color:brutal?'#0f0f0f':'#c0c8d8',flexShrink:0,whiteSpace:'nowrap'}}>{key}</span>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:brutal?'rgba(15,15,15,.55)':'rgba(200,200,220,.5)',lineHeight:1.3}}>{label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create node modal — redesigned */}
      {showCreateNode && (() => {
        const EXT_MAP: Record<string,string> = { entry:'.js', function:'.js', class:'.ts', module:'.ts', doc:'.md' }
        const LANG_ICONS: Record<string,string> = { entry:'⬡', function:'ƒ', class:'◇', module:'⬡', doc:'⌗' }
        const acc = ACCENTS[newNodeColor]
        const suggestedExt = (() => {
          const n = newNodeName.trim()
          if (n.includes('.')) return ''
          return EXT_MAP[newNodeType] || '.js'
        })()
        const previewName = newNodeName.trim() ? newNodeName.trim() + (newNodeName.includes('.') ? '' : suggestedExt) : 'untitled' + suggestedExt
        return (
          <div className="ide-overlay" onClick={()=>setShowCreateNode(false)}>
            <div className="ide-modal" onClick={e=>e.stopPropagation()} style={{width:380,maxWidth:'90vw'}}>
              {/* Header */}
              <div className="ide-modal-hdr" style={{borderBottom:`1px solid ${acc}22`}}>
                <span className="ide-modal-title" style={{color:acc}}>NEW NODE</span>
                <button onClick={()=>setShowCreateNode(false)} style={{background:'transparent',border:'none',color:'rgba(200,200,220,.3)',cursor:'pointer',fontSize:'1rem',lineHeight:1}}>✕</button>
              </div>
              <div className="ide-modal-body" style={{gap:14}}>

                {/* File name + live preview */}
                <div>
                  <div className="ide-modal-label">FILE NAME</div>
                  <div style={{position:'relative'}}>
                    <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:'13px',opacity:.5,pointerEvents:'none',color:acc}}>{LANG_ICONS[newNodeType]||'ƒ'}</span>
                    <input className="ide-modal-input" value={newNodeName} onChange={e=>setNewNodeName(e.target.value)}
                      placeholder={`my_${newNodeType}`} autoFocus
                      style={{paddingLeft:28}}
                      onKeyDown={e=>{if(e.key==='Enter')handleCreateNode();if(e.key==='Escape')setShowCreateNode(false)}}/>
                  </div>
                  <div style={{marginTop:4,fontSize:'9px',fontFamily:"'JetBrains Mono',monospace",opacity:.4,paddingLeft:2,color:acc}}>
                    → {previewName}
                  </div>
                </div>

                {/* Type selector */}
                <div>
                  <div className="ide-modal-label">TYPE</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5}}>
                    {[
                      {t:'entry',    desc:'App entry point'},
                      {t:'function', desc:'JS/TS function'},
                      {t:'class',    desc:'Class / struct'},
                      {t:'module',   desc:'Module / lib'},
                      {t:'doc',      desc:'Markdown notes'},
                    ].map(({t,desc})=>(
                      <button key={t} onClick={()=>setNewNodeType(t)}
                        style={{padding:'7px 6px',border:`1px solid ${newNodeType===t?acc:brutal?'rgba(0,0,0,.2)':'rgba(255,255,255,.1)'}`,background:newNodeType===t?acc+'18':'transparent',cursor:'pointer',
                          display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'all .12s',borderRadius:brutal?0:3,
                          color:newNodeType===t?acc:brutal?'#0f0f0f':'rgba(200,200,220,.7)'}}>
                        <span style={{fontSize:'13px',lineHeight:1}}>{LANG_ICONS[t]}</span>
                        <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.12em'}}>{t.toUpperCase()}</span>
                        <span style={{fontSize:'7px',opacity:.5,fontFamily:"'Share Tech Mono',monospace"}}>{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent color */}
                <div>
                  <div className="ide-modal-label">ACCENT</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {ACCENTS.map((c,i)=>(
                      <div key={i} onClick={()=>setNewNodeColor(i)} title={c}
                        style={{width:20,height:20,background:c,cursor:'pointer',
                          outline:`2px solid ${newNodeColor===i?'#fff':'transparent'}`,outlineOffset:2,
                          borderRadius:brutal?0:4,transition:'all .1s',
                          transform:newNodeColor===i?'scale(1.2)':'scale(1)'}}/>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{display:'flex',gap:7,paddingTop:4,borderTop:`1px solid ${brutal?'rgba(0,0,0,.1)':'rgba(255,255,255,.06)'}`}}>
                  <button className="ide-btn primary" style={{flex:1,background:acc,borderColor:acc,color:'#000'}} onClick={handleCreateNode}>
                    CREATE
                  </button>
                  <button className="ide-btn" onClick={()=>setShowCreateNode(false)}>CANCEL</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Create group modal */}
      {showCreateGroup && (
        <div className="ide-overlay" onClick={()=>setShowCreateGroup(false)}>
          <div className="ide-modal" onClick={e=>e.stopPropagation()}>
            <div className="ide-modal-hdr">
              <span className="ide-modal-title">NEW CLASS</span>
              <button onClick={()=>setShowCreateGroup(false)} style={{background:'transparent',border:'none',color:'rgba(200,200,220,.4)',cursor:'pointer',fontSize:'1.1rem'}}>✕</button>
            </div>
            <div className="ide-modal-body">
              <div>
                <div className="ide-modal-label">CLASS NAME</div>
                <input className="ide-modal-input" value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="MyClass" autoFocus/>
              </div>
              <div>
                <div className="ide-modal-label">COLOR</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {ACCENTS.slice(0,8).map((c)=>(
                    <div key={c} onClick={()=>setGroupColor(c)}
                      style={{width:18,height:18,background:c,cursor:'pointer',border:`2px solid ${groupColor===c?'#fff':'transparent'}`,borderRadius:brutal?0:'50%'}}/>
                  ))}
                </div>
              </div>
              <div>
                <div className="ide-modal-label">SELECT METHODS (min 2)</div>
                <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:160,overflowY:'auto'}}>
                  {nodesRef.current.map(n=>(
                    <div key={n.id} onClick={()=>setGroupSelected(s=>s.includes(n.id)?s.filter(id=>id!==n.id):[...s,n.id])}
                      style={{display:'flex',alignItems:'center',gap:7,padding:'4px 8px',cursor:'pointer',border:`1px solid ${groupSelected.includes(n.id)?groupColor:'rgba(255,255,255,.08)'}`,background:groupSelected.includes(n.id)?groupColor+'12':'transparent',transition:'all .12s'}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:groupSelected.includes(n.id)?groupColor:'rgba(200,200,220,.25)'}}/>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'12px'}}>{n.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display:'flex',gap:7}}>
                <button className="ide-btn primary" style={{flex:1}} onClick={handleCreateGroup} disabled={!groupName.trim()||groupSelected.length<2}>CREATE</button>
                <button className="ide-btn" onClick={()=>setShowCreateGroup(false)}>CANCEL</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Node color picker (portal) */}
      {nodeColorPicker && (
        <>
          <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setNodeColorPicker(null)}/>
          <div className="ide-color-picker" style={{top:nodeColorPicker.y,left:nodeColorPicker.x}}>
            {ACCENTS.map((c,i)=>(
              <div key={i} className={`ide-color-swatch ${nodesRef.current.find(n=>n.id===nodeColorPicker.nodeId)?.themeIdx===i?'selected':''}`}
                style={{background:c,borderRadius:brutal?0:'50%'}}
                onClick={()=>handleChangeNodeColor(nodeColorPicker.nodeId,i)}/>
            ))}
          </div>
        </>
      )}


      {/* ── NODE CONTEXT MENU ── */}
      {nodeCtxMenu && (() => {
        const node = nodesRef.current.find(n=>n.id===nodeCtxMenu.nodeId)
        if (!node) { setNodeCtxMenu(null); return null }
        const accent = ACCENTS[node.themeIdx%ACCENTS.length]
        const items = [
          { label:'Open in Editor', icon:'✏', action:()=>{ openNodeInEditor(node.id); setNodeCtxMenu(null) } },
          { label:`Run (${langLabel(detectLang(node.label))})`, icon:'▶', action:()=>{ handleRunNode(node.id); setNodeCtxMenu(null) }, show: (() => { const l=detectLang(node.label); return l!=='md'&&l!=='unknown' })() },
          { sep:true },
          { label:'Rename',         icon:'Aa', action:()=>{ const name=prompt('Rename node:',node.label); if(name?.trim()){const n2=nodesRef.current.find(x=>x.id===node.id);if(n2){n2.label=name.trim();forceRender({})}} setNodeCtxMenu(null) } },
          { label:'Change Color',   icon:'◉', action:()=>{ const rect={left:nodeCtxMenu.x,bottom:nodeCtxMenu.y}; setNodeColorPicker({nodeId:node.id,x:nodeCtxMenu.x,y:nodeCtxMenu.y}); setNodeCtxMenu(null) } },
          { label:'Duplicate',      icon:'⊕', action:()=>{
              const copy={...node,id:'n'+Date.now(),x:node.x+80,y:node.y+80,label:node.label+'_copy',modified:false}
              nodesRef.current=[...nodesRef.current,copy]
              addEvent('node-create',`Duplicated ${node.label}`)
              forceRender({}); openNodeInEditor(copy.id); setNodeCtxMenu(null)
          }},
          { label:node.isMain?'Unset Main':'Set as Main', icon:'★', action:()=>{
              nodesRef.current=nodesRef.current.map(n=>({...n,isMain:n.id===node.id?!n.isMain:false}))
              forceRender({}); setNodeCtxMenu(null)
          }},
          { sep:true },
          { label:'Delete Node',    icon:'⊖', danger:true, action:()=>{ handleDeleteNode(node.id); setNodeCtxMenu(null) } },
        ].filter(it => it.sep || it.show !== false)

        return (
          <>
            <div style={{position:'fixed',inset:0,zIndex:9996}} onContextMenu={e=>e.preventDefault()} onClick={()=>setNodeCtxMenu(null)}/>
            <div style={{
              position:'fixed', left:nodeCtxMenu.x, top:nodeCtxMenu.y, zIndex:9997,
              background:brutal?'#0f0f0f':'rgba(6,6,20,.98)',
              border:brutal?`2px solid ${accent}`:`1px solid ${accent}44`,
              boxShadow:`0 8px 40px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.04)`,
              borderRadius:brutal?0:4, minWidth:180, overflow:'hidden',
              fontFamily:"'Share Tech Mono',monospace",
            }}>
              {/* Header */}
              <div style={{padding:'7px 10px',borderBottom:`1px solid ${accent}33`,
                background:`linear-gradient(90deg,${accent}18,transparent)`,display:'flex',gap:6,alignItems:'center'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:accent,flexShrink:0}}/>
                <span style={{fontSize:'10px',fontWeight:700,fontFamily:"'Oswald',sans-serif",
                  letterSpacing:'.1em',color:accent,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {node.label}
                </span>
                <span style={{fontSize:'8px',opacity:.4,marginLeft:'auto',flexShrink:0}}>{node.type.toUpperCase()}</span>
              </div>
              {/* Items */}
              {items.map((it,i) => it.sep
                ? <div key={i} style={{height:1,background:'rgba(255,255,255,.06)',margin:'2px 0'}}/>
                : (
                  <div key={i} onClick={it.action} style={{
                    display:'flex',alignItems:'center',gap:8,padding:'7px 12px',cursor:'pointer',
                    color:it.danger?'#ff435a':brutal?'#f0ece0':'#c0c8d8',fontSize:'11px',
                    transition:'background .1s',
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background=it.danger?'rgba(255,67,90,.12)':'rgba(255,255,255,.06)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{width:14,textAlign:'center',opacity:.7,fontSize:'12px'}}>{it.icon}</span>
                    {it.label}
                  </div>
                )
              )}
            </div>
          </>
        )
      })()}

      {/* Term palette close */}
      {showTermPalette && <div style={{position:'fixed',inset:0,zIndex:97}} onClick={()=>setShowTermPalette(false)}/>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════

export default function IDEPage() {
  return <IDE initialTheme="cyber" initialAvatar={0}/>
}
