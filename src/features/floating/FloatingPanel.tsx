import type { ReactNode } from 'react'

export interface PanelState {
  x: number
  y: number
  w: number
  h: number
  z: number
  visible: boolean
}

interface Props {
  pid: string
  title: string
  icon?: string
  panels: Record<string, PanelState>
  setPanels: (updater: (ps: Record<string, PanelState>) => Record<string, PanelState>) => void
  panelDragRef: React.RefObject<any>
  children: ReactNode
  minW?: number
  minH?: number
  brutal?: boolean
  onClose?: (() => void) | null
  noPad?: boolean
}

export default function FloatingPanel({
  pid, title, icon, panels, setPanels, panelDragRef, children,
  minW = 240, minH = 160, brutal = false, onClose = null,
}: Props) {
  const p = panels[pid]
  if (!p?.visible) return null

  const bringFront = () => setPanels(ps => {
    const maxZ = Math.max(10, ...Object.values(ps).map((x: any) => x.z || 0))
    return ps[pid].z >= maxZ ? ps : { ...ps, [pid]: { ...ps[pid], z: maxZ + 1 } }
  })

  const startDrag = (e: React.MouseEvent, mode: string) => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    document.body.style.userSelect = 'none'
    panelDragRef.current = { pid, mode, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y, w: p.w, h: p.h, minW, minH }
    bringFront()
  }

  const barBg = brutal ? '#0a0a0a' : 'rgba(5,5,16,.98)'
  const panelBg = brutal ? '#ede8d5' : 'rgba(6,6,18,.97)'
  const border = brutal ? '3px solid #0f0f0f' : '1px solid rgba(255,42,56,.14)'
  const HW = 6   // handle width
  const CW = 14  // corner handle size

  return (
    <div onMouseDown={bringFront} style={{
      position: 'fixed', left: p.x - HW, top: p.y - HW,
      width: p.w + HW * 2, height: p.h + HW * 2,
      zIndex: p.z || 10,
      pointerEvents: 'none',
    }}>
      <div onMouseDown={e => startDrag(e, 'resize-e')}  style={{pointerEvents:'all',position:'absolute',right:0,top:CW,bottom:CW,width:HW,cursor:'ew-resize',zIndex:2}}/>
      <div onMouseDown={e => startDrag(e, 'resize-w')}  style={{pointerEvents:'all',position:'absolute',left:0,top:CW,bottom:CW,width:HW,cursor:'ew-resize',zIndex:2}}/>
      <div onMouseDown={e => startDrag(e, 'resize-s')}  style={{pointerEvents:'all',position:'absolute',left:CW,right:CW,bottom:0,height:HW,cursor:'ns-resize',zIndex:2}}/>
      <div onMouseDown={e => startDrag(e, 'resize-n')}  style={{pointerEvents:'all',position:'absolute',left:CW,right:CW,top:0,height:HW,cursor:'ns-resize',zIndex:2}}/>
      <div onMouseDown={e => startDrag(e, 'resize-se')} style={{pointerEvents:'all',position:'absolute',right:0,bottom:0,width:CW,height:CW,cursor:'se-resize',zIndex:3}}/>
      <div onMouseDown={e => startDrag(e, 'resize-sw')} style={{pointerEvents:'all',position:'absolute',left:0,bottom:0,width:CW,height:CW,cursor:'sw-resize',zIndex:3}}/>
      <div onMouseDown={e => startDrag(e, 'resize-ne')} style={{pointerEvents:'all',position:'absolute',right:0,top:0,width:CW,height:CW,cursor:'ne-resize',zIndex:3}}/>
      <div onMouseDown={e => startDrag(e, 'resize-nw')} style={{pointerEvents:'all',position:'absolute',left:0,top:0,width:CW,height:CW,cursor:'nw-resize',zIndex:3}}/>

      <div onMouseDown={e => { e.stopPropagation(); bringFront() }} style={{
        position: 'absolute', left: HW, top: HW, right: HW, bottom: HW,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: panelBg, border, boxShadow: '0 8px 48px rgba(0,0,0,.8)',
        borderRadius: brutal ? 0 : 3,
        pointerEvents: 'all',
      }}>
        <div onMouseDown={e => startDrag(e, 'move')} style={{
          height: 26, flexShrink: 0, display: 'flex', alignItems: 'center',
          gap: 6, padding: '0 8px', cursor: 'grab', userSelect: 'none',
          background: barBg, borderBottom: brutal ? '2px solid rgba(255,255,255,.06)' : '1px solid rgba(255,42,56,.1)',
        }}>
          {icon && <span style={{opacity: .5, fontSize: '12px'}}>{icon}</span>}
          <span style={{flex: 1, fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: '9px', letterSpacing: '.14em', opacity: .5, color: brutal ? '#f0ece0' : '#c0c8d8'}}>{title}</span>
          <div style={{display: 'flex', gap: 3, alignItems: 'center'}}>
            <div title="Minimise" style={{width: 9, height: 9, borderRadius: '50%', background: '#ffbd2e', opacity: .7, cursor: 'pointer'}}
              onMouseDown={e => { e.stopPropagation(); setPanels(ps => ({...ps, [pid]: {...ps[pid], h: 26}})) }}/>
            <div title="Close" style={{width: 9, height: 9, borderRadius: '50%', background: '#ff5f57', opacity: .7, cursor: 'pointer'}}
              onMouseDown={e => { e.stopPropagation(); onClose ? onClose() : setPanels(ps => ({...ps, [pid]: {...ps[pid], visible: false}})) }}/>
          </div>
        </div>
        <div style={{flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0}}>
          {children}
        </div>
      </div>
    </div>
  )
}
