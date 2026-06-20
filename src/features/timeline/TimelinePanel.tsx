import { useState, useEffect, useRef, useMemo } from 'react'
import { TL_TRACKS, TL_COL } from '../../constants/accents'
import type { TimelineEvent } from '../../stores/types'

interface Props {
  eventLog: TimelineEvent[]
  brutal: boolean
  onPhMsChange?: ((ms: number) => void) | null
}

export default function TimelinePanel({ eventLog, brutal, onPhMsChange = null }: Props) {
  const [phMs, setPhMsInternal] = useState(() => Date.now())
  const [playing, setPlaying] = useState(false)
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const setPhMs = (v: number | ((prev: number) => number)) => {
    const ms = typeof v === 'function' ? v(phMs) : v
    setPhMsInternal(ms)
    onPhMsChange?.(ms)
  }

  const sorted = useMemo(() => [...eventLog].sort((a, b) => a.ts - b.ts), [eventLog])
  const tStart = sorted.length ? sorted[0].ts : Date.now() - 10000
  const tEnd = sorted.length ? sorted[sorted.length - 1].ts + 2000 : Date.now()
  const tDur = Math.max(tEnd - tStart, 1000)
  const prog = Math.max(0, Math.min(1, (phMs - tStart) / tDur))

  const filtered = useMemo(() => {
    if (filter === 'all') return sorted
    const tr = TL_TRACKS.find(t => t.key === filter)
    return tr ? sorted.filter(e => tr.types.includes(e.type)) : sorted
  }, [sorted, filter])

  const fmtRel = (ms: number) => {
    const diff = Date.now() - ms
    if (diff < 5000) return 'just now'
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    return new Date(ms).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit' })
  }

  const fmtT = (ms: number) => {
    const rel = Math.max(0, ms - tStart)
    const s = Math.floor(rel / 1000); const m = Math.floor(s / 60)
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  useEffect(() => {
    if (!playing) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return }
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last; last = now
      setPhMs(p => { const n = p + dt * 1.5; if (n >= tEnd) { setPlaying(false); return tEnd } return n })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing, tEnd])

  const scrubAt = (e: React.MouseEvent) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setPhMs(tStart + r * tDur)
  }

  const text = brutal ? '#0f0f0f' : '#c0c8d8'
  const sep = brutal ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.05)'

  const btnS: React.CSSProperties = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#5a5a7a', fontFamily: "'JetBrains Mono',monospace",
    fontSize: '12px', padding: '0 3px', lineHeight: 1, outline: 'none',
    transition: 'color .1s',
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'#05050f',overflow:'hidden',userSelect:'none'}}>
      <div style={{flexShrink:0,borderBottom:`1px solid ${sep}`,background:'rgba(0,0,0,.3)'}}>
        <div style={{display:'flex',alignItems:'center',gap:2,padding:'3px 8px'}}>
          <button type="button" style={btnS} onClick={()=>{setPlaying(false);setPhMs(tStart)}} title="Jump to start">⏮</button>
          <button type="button" style={{...btnS,color:playing?'#ff2a38':'#10b981',fontSize:'13px'}} onClick={()=>setPlaying(p=>!p)}>{playing?'⏸':'▶'}</button>
          <button type="button" style={btnS} onClick={()=>{setPlaying(false);setPhMs(tEnd)}} title="Jump to end">⏭</button>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'9px',color:'#bb9af7',
            background:'rgba(187,154,247,.08)',border:'1px solid rgba(187,154,247,.15)',
            padding:'1px 5px',borderRadius:2,letterSpacing:'.03em',flexShrink:0,marginLeft:2}}>
            {fmtT(phMs)}
          </div>
          <div style={{flex:1}}/>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'#5a5a7a'}}>
            {filtered.length}/{sorted.length}
          </span>
        </div>
        <div ref={trackRef} style={{position:'relative',height:18,cursor:'crosshair',background:'rgba(0,0,0,.4)',margin:'0 0 3px'}}
          onMouseDown={e=>{scrubAt(e);const move=(ev:MouseEvent)=>scrubAt(ev as any);const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up)};document.addEventListener('mousemove',move);document.addEventListener('mouseup',up)}}>
          {filtered.map(ev=>(
            <div key={ev.id} style={{position:'absolute',left:`${((ev.ts-tStart)/tDur)*100}%`,top:0,width:2,height:'100%',background:TL_COL[ev.type]||'#607080',opacity:.6,pointerEvents:'none',borderRadius:1}}/>
          ))}
          <div style={{position:'absolute',left:0,top:'40%',height:'20%',width:`${prog*100}%`,background:'rgba(255,42,56,.3)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',left:`${prog*100}%`,top:0,bottom:0,transform:'translateX(-50%)',pointerEvents:'none',zIndex:5}}>
            <div style={{width:2,height:'100%',background:'#ff2a38',boxShadow:'0 0 4px #ff2a38'}}/>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:0,padding:'0 6px 4px',overflowX:'auto',scrollbarWidth:'none'}}>
          {[{key:'all',label:'ALL',color:'#8a8aa0'},...TL_TRACKS].map(tr=>(
            <button type="button" key={tr.key} onClick={()=>setFilter(f=>f===tr.key&&tr.key!=='all'?'all':tr.key)}
              style={{...btnS,fontSize:'7px',letterSpacing:'.1em',padding:'1px 5px',
                color:filter===tr.key?tr.color:'#3e3e5a',
                borderBottom:filter===tr.key?`1px solid ${tr.color}`:'1px solid transparent',
                flexShrink:0,
              }}>{tr.label}</button>
          ))}
        </div>
      </div>
      <div ref={listRef} style={{flex:1,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.06) transparent'}}>
        {filtered.length === 0 ? (
          <div style={{padding:'24px 12px',textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'#3e3e5a',letterSpacing:'.08em',lineHeight:2}}>
            NO EVENTS<br/><span style={{fontSize:'9px',opacity:.7}}>start editing to record history</span>
          </div>
        ) : (
          [...filtered].reverse().map(ev => {
            const col = TL_COL[ev.type] || '#607080'
            const isSel = expanded === ev.id
            const isPast = ev.ts <= phMs
            return (
              <div key={ev.id}
                onClick={()=>{setExpanded(s=>s===ev.id?null:ev.id);setPhMs(ev.ts)}}
                style={{display:'flex',alignItems:'center',gap:0,
                  borderLeft:`2px solid ${isSel?col:'transparent'}`,
                  background:isSel?'rgba(255,255,255,.04)':'transparent',
                  opacity:isPast?1:0.35,cursor:'pointer',minHeight:24}}
                onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,.03)'}}
                onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='transparent'}}
              >
                <div style={{width:26,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:col,boxShadow:isSel?`0 0 5px ${col}`:'none'}}/>
                </div>
                <div style={{flex:1,minWidth:0,padding:'3px 0'}}>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{fontSize:'11px',lineHeight:1,flexShrink:0}}>{ev.icon}</span>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:isSel?col:text,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{ev.label}</span>
                  </div>
                  {isSel && (
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2}}>
                      <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.1em',color:col,opacity:.8}}>
                        {ev.type.toUpperCase().replace(/-/g,' ')}
                      </span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'8px',color:'#5a5a7a'}}>
                        {new Date(ev.ts).toLocaleTimeString('en',{hour12:false})}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{padding:'0 8px',flexShrink:0,fontFamily:"'JetBrains Mono',monospace",fontSize:'8px',color:'#3e3e5a',textAlign:'right'}}>
                  {fmtRel(ev.ts)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
