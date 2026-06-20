import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../../lib/api'

interface FileEntry {
  name: string
  path: string
  rel?: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onOpenFile: (file: FileEntry) => void
  rootPath: string | null
  recentFiles?: FileEntry[]
}

function getFileIcon(name: string) {
  const ext = (name || '').split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    js:'⬡', mjs:'⬡', jsx:'⬡', ts:'◈', tsx:'◈',
    py:'⬟', go:'◉', rs:'◆', c:'◇', cpp:'◇', h:'◇',
    md:'⌗', json:'{}', css:'#', html:'<>', sh:'$',
    txt:'≡', yaml:'⁞', yml:'⁞', toml:'⁞',
  }
  return map[ext || ''] || '·'
}

function getFileColor(name: string) {
  const ext = (name || '').split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    js:'#f2c12e', mjs:'#f2c12e', jsx:'#f2c12e', ts:'#4285f4', tsx:'#4285f4',
    py:'#28f1c3', go:'#89ddff', rs:'#ff8080', c:'#ff8080', cpp:'#ff8080',
    md:'#c792ea', json:'#ffc410', css:'#89b4fa', html:'#e06c75', sh:'#10b981',
  }
  return map[ext || ''] || '#888'
}

function fuzzyMatch(str: string, query: string) {
  if (!query) return true
  const s = str.toLowerCase(); const q = query.toLowerCase()
  let si = 0; let qi = 0
  while (si < s.length && qi < q.length) { if (s[si] === q[qi]) qi++; si++ }
  return qi === q.length
}

export default function FileFinderModal({ isOpen, onClose, onOpenFile, rootPath, recentFiles = [] }: Props) {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [focused, setFocused] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || !rootPath) return
    api?.fs?.listAllFiles?.(rootPath, 6000).then((list: FileEntry[]) => setFiles(list || [])).catch(() => {})
  }, [isOpen, rootPath])

  const filtered = useMemo(() => {
    if (!query) {
      if (recentFiles.length > 0) return recentFiles.slice(0, 20)
      return files.slice(0, 60)
    }
    const q = query.toLowerCase()
    return files
      .filter(f => fuzzyMatch(f.rel || f.path, q) || f.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const an = a.name.toLowerCase().startsWith(q) ? 0 : 1
        const bn = b.name.toLowerCase().startsWith(q) ? 0 : 1
        return an - bn || (a.rel?.length ?? 0) - (b.rel?.length ?? 0)
      })
      .slice(0, 60)
  }, [query, files, recentFiles])

  useEffect(() => { setFocused(0) }, [filtered])

  useEffect(() => {
    if (isOpen) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 40) }
  }, [isOpen])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[focused] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [focused])

  const open = (f: FileEntry) => { onOpenFile(f); onClose() }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(i => Math.min(i+1, filtered.length-1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(i => Math.max(i-1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[focused]) open(filtered[focused]) }
    else if (e.key === 'Escape') onClose()
  }

  if (!isOpen) return null
  return (
    <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,.75)',backdropFilter:'blur(6px)',display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'12vh'}}
      onClick={onClose}>
      <div style={{width:'min(620px,90vw)',background:'#0d0d1a',border:'1px solid rgba(255,42,56,.25)',boxShadow:'0 24px 80px rgba(0,0,0,.95)',overflow:'hidden',borderRadius:4}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
          <span style={{color:'#ff435a',fontSize:'14px',flexShrink:0}}>⌕</span>
          <input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={handleKey}
            placeholder="Search files by name…"
            style={{flex:1,background:'transparent',border:'none',outline:'none',fontFamily:"'JetBrains Mono',monospace",fontSize:'13px',color:'#c0c8d8'}}/>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.25)',flexShrink:0}}>Ctrl+P</span>
          {query && <button onClick={()=>setQuery('')} style={{background:'transparent',border:'none',color:'rgba(200,200,220,.3)',cursor:'pointer',fontSize:'16px',lineHeight:1,flexShrink:0}}>×</button>}
        </div>
        <div ref={listRef} style={{maxHeight:'52vh',overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent'}}>
          {!query && recentFiles.length > 0 && (
            <div style={{padding:'4px 14px 2px',fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.2)',letterSpacing:'.08em',textTransform:'uppercase'}}>Recent</div>
          )}
          {filtered.length === 0 && (
            <div style={{padding:'24px',textAlign:'center',color:'rgba(200,200,220,.25)',fontFamily:"'Share Tech Mono',monospace",fontSize:'11px'}}>
              {files.length === 0 ? 'Open a folder first (File → Open Folder)' : 'No matching files'}
            </div>
          )}
          {filtered.map((f, i) => {
            const dir = (f.rel || f.path || '').split('/').slice(0,-1).join('/')
            return (
              <div key={f.path} onClick={()=>open(f)}
                style={{display:'flex',alignItems:'center',gap:10,padding:'7px 14px',cursor:'pointer',
                  background:i===focused?'rgba(255,42,56,.1)':'transparent',
                  borderLeft:i===focused?'2px solid #ff435a':'2px solid transparent',transition:'background .08s'}}
                onMouseEnter={()=>setFocused(i)}>
                <span style={{fontSize:'12px',color:getFileColor(f.name),flexShrink:0,width:14,textAlign:'center'}}>{getFileIcon(f.name)}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px',color:'#c0c8d8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
                  {dir && <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'rgba(200,200,220,.35)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dir}/</div>}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{padding:'5px 14px',borderTop:'1px solid rgba(255,255,255,.05)',display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.2)'}}>↑↓ navigate · ↩ open · Esc close</span>
          {files.length > 0 && <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.2)',marginLeft:'auto'}}>{files.length} files indexed</span>}
        </div>
      </div>
    </div>
  )
}
