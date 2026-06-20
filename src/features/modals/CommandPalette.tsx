import { useState, useMemo, useEffect, useRef } from 'react'
import type { Palette } from '../../stores/types'

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

const PALETTES: Palette[] = [
  { id:'forbinden',  name:'FORBINDEN',    bg:'#0b0b0f', base:'#c0c8d8', lineNum:'#2e2e42', activeLine:'rgba(255,255,255,0.035)', kw:'#ff435a', str:'#ffc410', cmt:'#3e3e5a', num:'#4285f4', fn:'#10b981', bi:'#28f1c3', op:'#6a6a8a', swatches:['#ff435a','#ffc410','#10b981','#28f1c3'] },
  { id:'dracula',    name:'DRACULA',       bg:'#282a36', base:'#f8f8f2', lineNum:'#44475a', activeLine:'rgba(68,71,90,0.4)',     kw:'#ff79c6', str:'#f1fa8c', cmt:'#6272a4', num:'#bd93f9', fn:'#50fa7b', bi:'#8be9fd', op:'#ff79c6', swatches:['#ff79c6','#f1fa8c','#50fa7b','#8be9fd'] },
  { id:'monokai',    name:'MONOKAI',       bg:'#272822', base:'#f8f8f2', lineNum:'#3e3d32', activeLine:'rgba(73,72,62,0.4)',     kw:'#f92672', str:'#e6db74', cmt:'#75715e', num:'#ae81ff', fn:'#a6e22e', bi:'#66d9e8', op:'#f92672', swatches:['#f92672','#e6db74','#a6e22e','#ae81ff'] },
  { id:'nord',       name:'NORD',          bg:'#2e3440', base:'#d8dee9', lineNum:'#3b4252', activeLine:'rgba(67,76,94,0.4)',     kw:'#81a1c1', str:'#a3be8c', cmt:'#4c566a', num:'#b48ead', fn:'#88c0d0', bi:'#8fbcbb', op:'#81a1c1', swatches:['#81a1c1','#a3be8c','#88c0d0','#b48ead'] },
  { id:'tokyo',      name:'TOKYO NIGHT',   bg:'#1a1b2e', base:'#a9b1d6', lineNum:'#2a2b3d', activeLine:'rgba(42,43,61,0.5)',     kw:'#bb9af7', str:'#9ece6a', cmt:'#3b4261', num:'#ff9e64', fn:'#7dcfff', bi:'#2ac3de', op:'#c0caf5', swatches:['#bb9af7','#9ece6a','#7dcfff','#ff9e64'] },
  { id:'gruvbox',    name:'GRUVBOX',       bg:'#282828', base:'#ebdbb2', lineNum:'#3c3836', activeLine:'rgba(60,56,54,0.5)',     kw:'#fb4934', str:'#b8bb26', cmt:'#665c54', num:'#d3869b', fn:'#fabd2f', bi:'#8ec07c', op:'#fe8019', swatches:['#fb4934','#b8bb26','#fabd2f','#8ec07c'] },
  { id:'onedark',    name:'ONE DARK',      bg:'#282c34', base:'#abb2bf', lineNum:'#3b4048', activeLine:'rgba(40,44,52,0.6)',     kw:'#c678dd', str:'#98c379', cmt:'#5c6370', num:'#d19a66', fn:'#61afef', bi:'#56b6c2', op:'#e06c75', swatches:['#c678dd','#98c379','#61afef','#d19a66'] },
  { id:'solarized',  name:'SOLARIZED',     bg:'#002b36', base:'#839496', lineNum:'#073642', activeLine:'rgba(7,54,66,0.6)',      kw:'#859900', str:'#2aa198', cmt:'#586e75', num:'#d33682', fn:'#268bd2', bi:'#cb4b16', op:'#657b83', swatches:['#859900','#2aa198','#268bd2','#d33682'] },
  { id:'nightowl',   name:'NIGHT OWL',     bg:'#011627', base:'#d6deeb', lineNum:'#1d3b53', activeLine:'rgba(1,56,95,0.45)',     kw:'#c792ea', str:'#addb67', cmt:'#637777', num:'#f78c6c', fn:'#82aaff', bi:'#7fdbca', op:'#c792ea', swatches:['#c792ea','#addb67','#82aaff','#7fdbca'] },
  { id:'ayu',        name:'AYU MIRAGE',    bg:'#1f2430', base:'#cccac2', lineNum:'#2d3443', activeLine:'rgba(45,52,67,0.5)',     kw:'#ffa759', str:'#bae67e', cmt:'#5c6773', num:'#ffcc66', fn:'#5ccfe6', bi:'#73d0ff', op:'#f29e74', swatches:['#ffa759','#bae67e','#5ccfe6','#ffcc66'] },
  { id:'catppuccin', name:'CATPPUCCIN',    bg:'#1e1e2e', base:'#cdd6f4', lineNum:'#313244', activeLine:'rgba(49,50,68,0.5)',     kw:'#cba6f7', str:'#a6e3a1', cmt:'#585b70', num:'#fab387', fn:'#89b4fa', bi:'#94e2d5', op:'#f38ba8', swatches:['#cba6f7','#a6e3a1','#89b4fa','#fab387'] },
  { id:'rosepine',   name:'ROSÉ PINE',     bg:'#191724', base:'#e0def4', lineNum:'#26233a', activeLine:'rgba(38,35,58,0.5)',     kw:'#c4a7e7', str:'#f6c177', cmt:'#6e6a86', num:'#ebbcba', fn:'#9ccfd8', bi:'#31748f', op:'#eb6f92', swatches:['#c4a7e7','#f6c177','#9ccfd8','#eb6f92'] },
  { id:'kanagawa',   name:'KANAGAWA',      bg:'#1f1f28', base:'#dcd7ba', lineNum:'#2a2a37', activeLine:'rgba(42,42,55,0.5)',     kw:'#957fb8', str:'#98bb6c', cmt:'#727169', num:'#d27e99', fn:'#7e9cd8', bi:'#6a9589', op:'#c0a36e', swatches:['#957fb8','#98bb6c','#7e9cd8','#c0a36e'] },
  { id:'vesper',     name:'VESPER',        bg:'#101010', base:'#c2c2c2', lineNum:'#1e1e1e', activeLine:'rgba(30,30,30,0.6)',     kw:'#ff8080', str:'#99ffe4', cmt:'#404040', num:'#ffbd5e', fn:'#b8a4ff', bi:'#5ef1ff', op:'#ff6e6e', swatches:['#ff8080','#99ffe4','#b8a4ff','#ffbd5e'] },
  { id:'everforest', name:'EVERFOREST',    bg:'#272e33', base:'#d3c6aa', lineNum:'#333c43', activeLine:'rgba(51,60,67,0.5)',     kw:'#e67e80', str:'#a7c080', cmt:'#5b6770', num:'#dbbc7f', fn:'#7fbbb3', bi:'#83c092', op:'#d699b6', swatches:['#e67e80','#a7c080','#7fbbb3','#dbbc7f'] },
  { id:'oxocarbon',  name:'OXOCARBON',     bg:'#161616', base:'#f2f4f8', lineNum:'#262626', activeLine:'rgba(38,38,38,0.55)',    kw:'#ff7eb6', str:'#42be65', cmt:'#393939', num:'#82cfff', fn:'#ee5396', bi:'#3ddbd9', op:'#be95ff', swatches:['#ff7eb6','#42be65','#ee5396','#82cfff'] },
  { id:'synthwave',  name:'SYNTHWAVE 84',  bg:'#262335', base:'#ffffff', lineNum:'#34294f', activeLine:'rgba(52,41,79,0.5)',     kw:'#ff7edb', str:'#ff8b39', cmt:'#848bbd', num:'#f97e72', fn:'#36f9f6', bi:'#72f1b8', op:'#fe4450', swatches:['#ff7edb','#36f9f6','#72f1b8','#fe4450'] },
  { id:'moonlight',  name:'MOONLIGHT',     bg:'#212337', base:'#c8d3f5', lineNum:'#2f334d', activeLine:'rgba(47,51,77,0.5)',     kw:'#ff98a4', str:'#c3e88d', cmt:'#444a73', num:'#ff995e', fn:'#82aaff', bi:'#b4f9f8', op:'#c099ff', swatches:['#ff98a4','#c3e88d','#82aaff','#c099ff'] },
  { id:'github',     name:'GITHUB LIGHT',  bg:'#ffffff', base:'#24292e', lineNum:'#e1e4e8', activeLine:'rgba(225,228,232,0.5)', kw:'#d73a49', str:'#032f62', cmt:'#6a737d', num:'#005cc5', fn:'#6f42c1', bi:'#e36209', op:'#d73a49', swatches:['#d73a49','#032f62','#6f42c1','#005cc5'] },
  { id:'gruvlight',  name:'GRUVBOX LIGHT', bg:'#fbf1c7', base:'#3c3836', lineNum:'#d5c4a1', activeLine:'rgba(213,196,161,0.5)', kw:'#9d0006', str:'#79740e', cmt:'#928374', num:'#8f3f71', fn:'#b57614', bi:'#076678', op:'#af3a03', swatches:['#9d0006','#79740e','#b57614','#076678'] },
  { id:'papercolor', name:'PAPERCOLOR',    bg:'#eeeeee', base:'#444444', lineNum:'#d0d0d0', activeLine:'rgba(208,208,208,0.5)', kw:'#005f87', str:'#718c00', cmt:'#a8a8a8', num:'#8700af', fn:'#d75f00', bi:'#0087af', op:'#d70000', swatches:['#005f87','#718c00','#d75f00','#8700af'] },
  { id:'flexoki',    name:'FLEXOKI',       bg:'#fffcf0', base:'#100f0f', lineNum:'#e6e4d9', activeLine:'rgba(230,228,217,0.5)', kw:'#af3029', str:'#66800b', cmt:'#b7b5ac', num:'#8b7ec8', fn:'#205ea6', bi:'#24837b', op:'#bc5215', swatches:['#af3029','#66800b','#205ea6','#24837b'] },
]

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
