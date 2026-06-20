// @ts-nocheck
import { ACCENTS } from '../../constants/accents'

interface Props {
  n: any
  active: boolean
  onClick: () => void
  groups: any[]
  searchQuery?: string
}

export default function WelcomeNodeRow({ n, active, onClick, groups, searchQuery = '' }: Props) {
  const grp = groups.find((g: any) => g.nodeIds.includes(n.id))
  const acc = grp ? grp.color : ACCENTS[n.themeIdx % ACCENTS.length]
  const typeCol: any = { entry:'#ff2a38', function:'#ffc410', class:'#10b981', module:'#4285f4', doc:'#c792ea' }
  const tCol = typeCol[n.type] || '#888'
  const label: string = n.label
  let labelEl: any = label
  if (searchQuery) {
    const idx = label.toLowerCase().indexOf(searchQuery)
    if (idx >= 0) {
      labelEl = <>{label.slice(0,idx)}<span style={{background:'rgba(255,196,16,.25)',color:'#ffc410'}}>{label.slice(idx,idx+searchQuery.length)}</span>{label.slice(idx+searchQuery.length)}</>
    }
  }
  const ctxLine = searchQuery && n.code
    ? n.code.split('\n').find((l: string)=>l.toLowerCase().includes(searchQuery)) || ''
    : ''

  return (
    <div onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:8, padding:'6px 12px',
        cursor:'pointer', borderLeft:`2px solid transparent`,
        background: active ? 'rgba(255,255,255,.05)' : 'transparent',
        transition:'all .1s',
      }}
      onMouseEnter={(e: any)=>{e.currentTarget.style.background='rgba(255,255,255,.05)';e.currentTarget.style.borderLeftColor=acc}}
      onMouseLeave={(e: any)=>{e.currentTarget.style.background=active?'rgba(255,255,255,.05)':'transparent';e.currentTarget.style.borderLeftColor='transparent'}}>
      <div style={{width:6,height:6,borderRadius:'50%',background:acc,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'13px',color:'#c0c8d8',
          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6}}>
          {labelEl}
          {n.modified && <span style={{color:'#ffc410',fontSize:'11px',flexShrink:0}}>●</span>}
          {n.isMain && <span style={{color:acc,fontSize:'10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,flexShrink:0}}>MAIN</span>}
        </div>
        {ctxLine && (
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:'rgba(200,200,220,.3)',
            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>
            {ctxLine.trim().slice(0,55)}
          </div>
        )}
      </div>
      <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.08em',
        color:tCol,opacity:.6,flexShrink:0}}>
        {n.type.slice(0,3).toUpperCase()}
      </span>
    </div>
  )
}
