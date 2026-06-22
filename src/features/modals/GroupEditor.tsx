import type { GraphNode, GraphGroup } from '../../stores/types'

interface Props {
  group: GraphGroup | null
  nodes: GraphNode[]
  onClose: () => void
  onOpenNode: (id: string) => void
}

const COLORS = ['#10b981','#ff435a','#ffc410','#4285f4','#28f1c3','#bb9af7','#ff1650','#5ccfe6']

const PANEL_IMGS_SHORT = [
  'Guts.jpeg','Whitebeard.jpeg','Roronoa Zoro.jpeg','PANTHEON.jpeg',
  'Thorfinn _ Vinland saga.jpeg','Choujin X.jpeg','God Valley.jpeg',
  'MATT TAYLOR.jpeg','SUBWAY DIMENSIONS.jpeg','Queen Marika the Eternal.jpeg',
  'VOGUE.jpeg','Sight - SKJEGG.jpeg','CHAOS SMILE.jpeg','Fire Punch.jpeg',
  '0xEP001p.jpeg','0xEP002p.jpeg','0xEP003p.jpeg','0xEP004p.jpeg',
]

function getPanelImg(seed: number) {
  return `${import.meta.env.BASE_URL}manga/${encodeURIComponent(PANEL_IMGS_SHORT[seed % PANEL_IMGS_SHORT.length])}`
}

function highlightCode(code: string) {
  if (!code) return ''
  const JS_KW = /\b(function|const|let|var|return|if|else|for|while|in|of|class|import|export|from|default|new|this|true|false|null|undefined|try|catch|finally|async|await|typeof|instanceof|break|continue|switch|case|throw|delete|void|static|extends|super)\b/g
  const STRINGS = /("""[\s\S]*?"""|'''[\s\S]*?'''|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g
  const COMMENTS = /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/)/gm
  const NUMBERS = /(?<![a-zA-Z_$])\b(\d+\.?\d*)\b(?![a-zA-Z_])/g
  const FUNCS = /\b([a-zA-Z_$]\w*)(?=\s*\()/g
  let html = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const stored: string[] = []
  const ph = (n: number) => '\x00P' + n + '\x01'
  const store = (cls: string, content: string) => { stored.push(`<span class="${cls}">${content}</span>`); return ph(stored.length - 1) }
  html = html.replace(COMMENTS, m => store('syn-comment', m))
  html = html.replace(STRINGS, m => store('syn-string', m))
  html = html.replace(FUNCS, (_, fn) => store('syn-function', fn))
  html = html.replace(JS_KW, m => store('syn-keyword', m))
  html = html.replace(NUMBERS, m => store('syn-number', m))
  return html.replace(/\x00P(\d+)\x01/g, (_, i) => stored[+i])
}

export default function GroupEditor({ group, nodes, onClose, onOpenNode }: Props) {
  if (!group) return null

  const members = nodes.filter(n => group.nodeIds.includes(n.id))
  const accent = group.color
  const getSynVars = (col: string) => ({ '--syn-kw': col, '--syn-str': '#ffc410', '--syn-cmt': '#5c6370', '--syn-num': '#d19a66', '--syn-fn': '#61afef', '--syn-bi': '#56b6c2' })
  const totalLines = members.reduce((s, n) => (n.code || '').split('\n').length + s, 0)
  const scrollToFn = (id: string) => { document.getElementById('fn-block-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const gNum = parseInt(group.id.replace(/\D/g, '')) || 0
  const groupArtSrc = getPanelImg(gNum * 3 + 1)
  const sideArtSrc = getPanelImg(gNum * 3 + 7)

  return (
    <div className="grp-editor-overlay" onClick={onClose}>
      <div className="grp-editor-shell" onClick={e => e.stopPropagation()}>
        <div className="grp-editor-chrome">
          <div className="grp-chrome-dot" style={{background:'#ff5f57'}}/>
          <div className="grp-chrome-dot" style={{background:'#febc2e'}}/>
          <div className="grp-chrome-dot" style={{background:'#28c840',cursor:'pointer'}} onClick={onClose}/>
          <div className="grp-chrome-sep"/>
          <div className="grp-chrome-title">{group.name}</div>
          <span style={{marginLeft:'6px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'11px',letterSpacing:'.12em',padding:'1px 7px',background:accent,color:'#000'}}>CLASS</span>
          <div className="grp-chrome-meta" style={{marginLeft:'auto'}}>
            {members.length} methods · {totalLines} lines · READ-ONLY
          </div>
          <button onClick={onClose} style={{marginLeft:'12px',background:'transparent',border:'none',color:'rgba(200,200,220,.4)',cursor:'pointer',fontSize:'16px',lineHeight:1}}>✕</button>
        </div>
        <div className="grp-editor-body">
          <div className="grp-sidebar">
            <div className="grp-sidebar-hdr" style={{padding:0,position:'relative',overflow:'hidden',height:'88px',flexShrink:0}}>
              <img src={sideArtSrc} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',filter:'contrast(1.2) saturate(.4) brightness(.65)'}}/>
              <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,rgba(5,5,13,.2) 0%,rgba(5,5,13,.88) 100%)',pointerEvents:'none'}}/>
              <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'8px 14px'}}>
                <div className="grp-sidebar-sup">Class</div>
                <div className="grp-sidebar-classname" style={{color:accent}}>{group.name}</div>
              </div>
            </div>
            <div className="grp-sidebar-struct">
              <div className="grp-sidebar-struct-class" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px'}}>
                <span style={{color:'#c792ea'}}>class </span>
                <span style={{color:accent}}>{group.name}</span>
                <span style={{opacity:.4}}>:</span>
              </div>
              {members.map((n, i) => (
                <div key={n.id} className="grp-sidebar-struct-method" onClick={() => scrollToFn(n.id)}
                  style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:COLORS[i % COLORS.length]}}>
                  <span style={{opacity:.4}}>def </span>
                  <span>{n.label.replace('.py','').replace('.js','')}</span>
                  <span style={{opacity:.3}}>()</span>
                </div>
              ))}
            </div>
            <div className="grp-member-list">
              {members.map((n, i) => (
                <div key={n.id} className="grp-member-row" onClick={() => scrollToFn(n.id)}>
                  <div className="grp-member-dot" style={{background:COLORS[i % COLORS.length]}}/>
                  <div className="grp-member-info">
                    <div className="grp-member-fname" style={{color:COLORS[i % COLORS.length]}}>{n.label}</div>
                    <div className="grp-member-ftype">{n.type}</div>
                  </div>
                  {n.modified && <div style={{width:'5px',height:'5px',borderRadius:'50%',background:'#ffc410',flexShrink:0}}/>}
                </div>
              ))}
            </div>
            <div className="grp-sidebar-stats">
              <div className="grp-stat-row"><span className="grp-stat-label">METHODS</span><span className="grp-stat-val" style={{color:accent}}>{members.length}</span></div>
              <div className="grp-stat-row"><span className="grp-stat-label">LINES</span><span className="grp-stat-val" style={{color:accent}}>{totalLines}</span></div>
              <div className="grp-stat-row"><span className="grp-stat-label">MODIFIED</span><span className="grp-stat-val" style={{color:'#ff435a'}}>{members.filter(n => n.modified).length}</span></div>
            </div>
          </div>
          <div className="grp-main">
            <div className="grp-tabs">
              <div className="grp-tab active" style={{color:accent,borderBottom:`2px solid ${accent}`}}>ALL MEMBERS</div>
              {members.map((n, i) => {
                const col = COLORS[i % COLORS.length]
                return (
                  <div key={n.id} className="grp-tab"
                    style={{color:col,borderBottom:'2px solid transparent'}}
                    onClick={() => scrollToFn(n.id)}>
                    {n.label}
                  </div>
                )
              })}
            </div>
            <div className="grp-codescroll">
              <div className="grp-class-banner">
                <img src={groupArtSrc} alt="" className="grp-banner-art"/>
                <div className="grp-banner-scanlines"/>
                <div className="grp-banner-overlay" style={{background:'linear-gradient(to right,rgba(5,5,13,.6) 0%,transparent 50%,rgba(5,5,13,.72) 100%)'}}/>
                <div className="grp-banner-content">
                  <div className="grp-banner-kw" style={{color:'#c792ea'}}>class</div>
                  <div className="grp-banner-title" style={{color:accent}}>{group.name}</div>
                  <div className="grp-banner-note">{members.length} methods · {totalLines} lines · read-only</div>
                </div>
                <div className="grp-banner-chips">
                  <div style={{padding:'2px 8px',border:`1px solid ${accent}55`,fontSize:'8px',color:accent,fontFamily:"'Oswald',sans-serif",fontWeight:700,letterSpacing:'.1em'}}>CLASS</div>
                </div>
              </div>
              {members.map((n, i) => {
                const col = COLORS[i % COLORS.length]
                const codeLines = (n.code || '# empty').split('\n')
                const hlCode = highlightCode(n.code || '# empty')
                const synVars = getSynVars(col) as React.CSSProperties
                return (
                  <div key={n.id} id={'fn-block-' + n.id} className="grp-fn-section"
                    style={{borderLeftColor:col+'44',borderLeftWidth:'3px',borderLeftStyle:'solid'}}>
                    <div className="grp-fn-header" style={{background:col+'08',borderBottom:`1px solid ${col}18`,display:'flex',alignItems:'center',gap:'8px',padding:'7px 12px'}}>
                      <div className="grp-fn-num" style={{background:col+'18',color:col}}>{String(i+1).padStart(2,'0')}</div>
                      <div className="grp-fn-name-col" style={{flex:1,minWidth:0}}>
                        <div className="grp-fn-title" style={{color:col}}>{n.label}</div>
                        <div className="grp-fn-subtitle">def {n.label.replace('.py','').replace('.js','')}(self) · {codeLines.length} lines</div>
                      </div>
                      <div className="grp-fn-badge" style={{color:col,borderColor:col+'55',fontSize:'8px',padding:'2px 6px',border:'1px solid',fontFamily:"'Oswald',sans-serif",fontWeight:700,letterSpacing:'.1em'}}>{n.type.toUpperCase()}</div>
                      {n.modified && <div style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'8px',color:'#ffc410',flexShrink:0}}><div style={{width:'5px',height:'5px',borderRadius:'50%',background:'#ffc410'}}/>UNSAVED</div>}
                      <button style={{padding:'2px 8px',cursor:'pointer',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.08em',background:'transparent',flexShrink:0,border:`1px solid ${col}44`,color:col}} onClick={() => onOpenNode(n.id)}>OPEN →</button>
                    </div>
                    <div className="grp-fn-codewrap" ref={el => { if (el) Object.entries(synVars).forEach(([k, v]) => (el as any).style.setProperty(k, v)) }}>
                      <div className="grp-fn-linenums">
                        {codeLines.map((_, li) => (<div key={li} style={{lineHeight:'1.65',color:li===0?col+'55':'rgba(255,255,255,.1)'}}>{li+1}</div>))}
                      </div>
                      <pre className="grp-fn-code editor-palette-scope" dangerouslySetInnerHTML={{__html: hlCode}}/>
                    </div>
                  </div>
                )
              })}
              <div style={{height:'40px'}}/>
            </div>
            <div className="grp-statusbar">
              <span style={{color:accent,fontWeight:'bold'}}>{group.name}</span>
              <span style={{opacity:.25}}>·</span>
              <span>{members.length} functions</span>
              <span style={{opacity:.25}}>·</span>
              <span>{totalLines} total lines</span>
              <span style={{marginLeft:'auto',opacity:.3}}>SANCTION // CLASS ASSEMBLY</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
