import { useState, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'

interface Script {
  name: string
  cmd: string
  source: string
}

interface Props {
  onRun: (cmd: string) => void
}

export default function ScriptsPanel({ onRun }: Props) {
  const brutal = useUIStore(s => s.themeMode === 'brutal')
  const explorerRoot = useWorkspaceStore(s => s.explorerRoot)

  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState<string | null>(null)

  const load = () => {
    if (!explorerRoot) return
    setLoading(true)
    const api = (window as any).electronAPI
    api?.tools?.getScripts?.(explorerRoot)
      .then((res: any) => { setScripts(res?.scripts || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(load, [explorerRoot])

  const text    = brutal ? '#0f0f0f' : '#c0c8d8'
  const dimText = brutal ? 'rgba(15,15,15,.4)' : 'rgba(200,200,220,.4)'

  const handleRun = (s: Script) => {
    setRunning(s.name)
    setTimeout(() => setRunning(null), 1500)
    onRun(s.cmd)
  }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'6px 10px 4px',flexShrink:0,borderBottom:'1px solid rgba(255,255,255,.06)',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.12em',color:'#ffc410'}}>⚙ SCRIPTS</span>
        {explorerRoot && (
          <button onClick={load}
            style={{marginLeft:'auto',background:'transparent',border:'1px solid rgba(255,255,255,.1)',color:dimText,fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',padding:'1px 6px',cursor:'pointer'}}>
            ↻ RELOAD
          </button>
        )}
      </div>
      <div style={{flex:1,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent',padding:'6px 8px',display:'flex',flexDirection:'column',gap:4}}>
        {!explorerRoot && (
          <div style={{padding:'20px',textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:dimText}}>OPEN A FOLDER TO SEE ITS SCRIPTS</div>
        )}
        {explorerRoot && loading && (
          <div style={{padding:'20px',textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'#ffc410',opacity:.7}}>LOADING…</div>
        )}
        {explorerRoot && !loading && scripts.length === 0 && (
          <div style={{padding:'20px',textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:dimText}}>
            NO SCRIPTS FOUND<br/>
            <span style={{fontSize:'9px',opacity:.6}}>add scripts to package.json or a Makefile</span>
          </div>
        )}
        {scripts.map((s, i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)',cursor:'default'}}>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'8px',color:s.source==='makefile'?'#4285f4':'#10b981',flexShrink:0,letterSpacing:'.06em',border:'1px solid',borderColor:s.source==='makefile'?'rgba(66,133,244,.3)':'rgba(16,185,129,.3)',padding:'0 4px'}}>
              {s.source.toUpperCase()}
            </span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:text,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',color:dimText,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.cmd}</div>
            </div>
            <button onClick={() => handleRun(s)}
              style={{flexShrink:0,background:running===s.name?'rgba(16,185,129,.2)':'rgba(255,196,16,.12)',border:`1px solid ${running===s.name?'rgba(16,185,129,.4)':'rgba(255,196,16,.3)'}`,
                color:running===s.name?'#10b981':'#ffc410',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.08em',
                padding:'3px 10px',cursor:'pointer',transition:'all .1s'}}>
              {running===s.name ? '▶…' : '▶ RUN'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
