import { useState, useEffect, useRef } from 'react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onJump: (line: number) => void
  maxLine?: number
}

export default function JumpToLineModal({ isOpen, onClose, onJump, maxLine = 9999 }: Props) {
  const [val, setVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) { setVal(''); setTimeout(() => inputRef.current?.focus(), 40) }
  }, [isOpen])

  const apply = () => {
    const n = parseInt(val)
    if (!isNaN(n) && n >= 1) { onJump(n); onClose() }
  }

  if (!isOpen) return null
  return (
    <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,.6)',backdropFilter:'blur(4px)',display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'18vh'}}
      onClick={onClose}>
      <div style={{width:300,background:'#0d0d1a',border:'1px solid rgba(255,42,56,.2)',boxShadow:'0 16px 48px rgba(0,0,0,.9)',borderRadius:4,overflow:'hidden'}}
        onClick={e=>e.stopPropagation()}>
        <div style={{padding:'8px 12px',borderBottom:'1px solid rgba(255,255,255,.06)',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.12em',color:'rgba(200,200,220,.4)'}}>GO TO LINE</div>
        <div style={{padding:'10px 12px',display:'flex',gap:6}}>
          <input ref={inputRef} type="number" min={1} max={maxLine} value={val}
            onChange={e=>setVal(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter')apply(); if(e.key==='Escape')onClose() }}
            placeholder={`1 – ${maxLine}`}
            style={{flex:1,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',outline:'none',color:'#c0c8d8',fontFamily:"'JetBrains Mono',monospace",fontSize:'13px',padding:'5px 8px'}}/>
          <button onClick={apply} style={{background:'rgba(255,42,56,.15)',border:'1px solid rgba(255,42,56,.3)',color:'#ff435a',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.08em',padding:'5px 12px',cursor:'pointer'}}>GO</button>
        </div>
      </div>
    </div>
  )
}
