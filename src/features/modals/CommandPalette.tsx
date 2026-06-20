import { useState, useMemo, useEffect, useRef } from 'react'
import type { Palette } from '../../stores/types'
import { PALETTES } from '../../constants/palettes'

interface CmdItem {
  icon: string
  label: string
  hint: string
  action: string
  group: string
  palette?: Palette
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onAction: (action: string) => void
  previewPalette: Palette | null
  onPreviewPalette: (p: Palette | null) => void
}

const CMD_ITEMS: CmdItem[] = [
  { icon:'F', label:'New file node',             hint:'N',           action:'new-node',          group:'GRAPH'    },
  { icon:'G', label:'New class group',           hint:'G',           action:'new-group',          group:'GRAPH'    },
  { icon:'J', label:'Join nodes (add edge)',     hint:'J',           action:'edge-add',           group:'GRAPH'    },
  { icon:'X', label:'Cut edge',                 hint:'X',           action:'edge-cut',           group:'GRAPH'    },
  { icon:'▶', label:'Run active file',           hint:'Ctrl+Enter',  action:'run',                group:'RUN'      },
  { icon:'T', label:'Open terminal',             hint:'`',           action:'terminal',           group:'VIEW'     },
  { icon:'B', label:'Open kanban board',         hint:'',            action:'board',              group:'VIEW'     },
  { icon:'⌚', label:'Show timeline',             hint:'',            action:'timeline',           group:'VIEW'     },
  { icon:'⎇', label:'Toggle Git panel',          hint:'',            action:'git',                group:'VIEW'     },
  { icon:'◉', label:'Toggle sidebar',            hint:'',            action:'sidebar',            group:'VIEW'     },
  { icon:'/', label:'Toggle line comment',       hint:'Ctrl+/',      action:'comment',            group:'EDIT'     },
  { icon:'⤢', label:'Toggle word wrap',          hint:'',            action:'wordwrap',           group:'EDIT'     },
  { icon:'⊞', label:'Zoom in',                  hint:'',            action:'zoom-in',            group:'VIEW'     },
  { icon:'⊟', label:'Zoom out',                 hint:'',            action:'zoom-out',           group:'VIEW'     },
  { icon:'⊡', label:'Reset zoom',               hint:'',            action:'zoom-reset',         group:'VIEW'     },
  { icon:'⌕', label:'Quick open file',          hint:'Ctrl+P',      action:'file-finder',        group:'NAVIGATE' },
  { icon:'⊞', label:'Go to line',               hint:'Ctrl+G',      action:'jump-line',          group:'NAVIGATE' },
  { icon:'≡', label:'File outline',             hint:'Ctrl+Shift+O',action:'outline',            group:'NAVIGATE' },
  { icon:'⌕', label:'Search in files',          hint:'Ctrl+Shift+F',action:'project-search',     group:'NAVIGATE' },
  { icon:'✦', label:'Zen mode',                hint:'Ctrl+Shift+Z',action:'zen',                group:'VIEW'     },
  { icon:'⬡', label:'AI Assistant',            hint:'',            action:'ai',                 group:'VIEW'     },
  { icon:'⬓', label:'Split editor vertical',   hint:'',            action:'split-vertical',     group:'VIEW'     },
  { icon:'⬔', label:'Split editor horizontal', hint:'',            action:'split-horizontal',   group:'VIEW'     },
  { icon:'✕', label:'Close split',             hint:'',            action:'split-close',        group:'VIEW'     },
  { icon:'📁', label:'Open folder',             hint:'',            action:'open-folder',        group:'FILE'     },
  { icon:'💾', label:'Save file',               hint:'Ctrl+S',      action:'save',               group:'FILE'     },
  ...PALETTES.map(p => ({
    icon:'🎨', label:`Theme: ${p.name}`, hint:'', action:`theme:${p.id}`, group:'THEME', palette: p,
  })),
]

export default function CommandPalette({ isOpen, onClose, onAction, onPreviewPalette }: Props) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return CMD_ITEMS
    return CMD_ITEMS.filter(i =>
      i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)
    )
  }, [query])

  useEffect(() => {
    if (isOpen) { setQuery(''); setFocused(0); setTimeout(() => inputRef.current?.focus(), 10) }
    else { onPreviewPalette(null) }
  }, [isOpen])

  useEffect(() => { setFocused(0) }, [query])

  if (!isOpen) return null

  const grouped: Record<string, CmdItem[]> = {}
  filtered.forEach(item => {
    if (!grouped[item.group]) grouped[item.group] = []
    grouped[item.group].push(item)
  })

  const execItem = (item: CmdItem) => {
    onPreviewPalette(null)
    onAction(item.action)
    onClose()
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)) }
    if (e.key === 'Enter' && filtered[focused]) execItem(filtered[focused])
    if (e.key === 'Escape') { onPreviewPalette(null); onClose() }
  }

  const handleHover = (item: CmdItem, idx: number) => {
    setFocused(idx)
    onPreviewPalette(item.palette ?? null)
  }

  return (
    <div className="ide-cmd-overlay" onClick={() => { onPreviewPalette(null); onClose() }}>
      <div className="ide-cmd-box" onClick={e => e.stopPropagation()} style={{maxHeight:'70vh',display:'flex',flexDirection:'column'}}>
        <div className="ide-cmd-input-row">
          <span className="ide-cmd-prefix">⌘</span>
          <input
            ref={inputRef}
            className="ide-cmd-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or theme name…"
            onKeyDown={handleKey}
          />
          {query && (
            <button style={{background:'transparent',border:'none',color:'#6a6a8a',cursor:'pointer',fontSize:'12px',padding:'0 6px'}}
              onClick={() => setQuery('')}>✕</button>
          )}
        </div>

        <div className="ide-cmd-results" style={{overflowY:'auto',flex:1}}>
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div style={{padding:'4px 12px 2px',fontSize:'8px',letterSpacing:'.12em',opacity:.35,fontFamily:"'Share Tech Mono',monospace",color:'#c0c8d8'}}>
                {group}
              </div>
              {items.map(item => {
                const globalIdx = filtered.indexOf(item)
                const isFocused = globalIdx === focused
                return (
                  <div key={item.label}
                    className={`ide-cmd-item ${isFocused ? 'focused' : ''}`}
                    onMouseEnter={() => handleHover(item, globalIdx)}
                    onMouseLeave={() => { if (item.palette) onPreviewPalette(null) }}
                    onClick={() => execItem(item)}
                  >
                    <div className="ide-cmd-icon">{item.icon}</div>
                    <span style={{flex:1}}>{item.label.replace('Theme: ','')}</span>
                    {item.palette && (
                      <span style={{display:'flex',gap:2,marginRight:4}}>
                        {item.palette.swatches.map((c, si) => (
                          <span key={si} style={{width:8,height:8,borderRadius:2,background:c,display:'inline-block'}}/>
                        ))}
                      </span>
                    )}
                    {item.hint && <span className="ide-cmd-hint">{item.hint}</span>}
                  </div>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{padding:'20px',textAlign:'center',opacity:.3,fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'#c0c8d8'}}>
              NO MATCHES
            </div>
          )}
        </div>

        <div className="ide-cmd-footer">
          <span>↑↓ navigate</span>
          <span>↵ execute</span>
          <span>hover themes to preview</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}

export { PALETTES }
export type { CmdItem }
