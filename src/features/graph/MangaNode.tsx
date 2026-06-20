import { memo, startTransition, useRef } from 'react'
import { ACCENTS } from '../../constants/accents'
import type { GraphNode, GraphGroup } from '../../stores/types'

// Kept local so MangaNode is self-contained
const PANEL_IMGS = [
  'Guts.jpeg','Whitebeard.jpeg','Roronoa Zoro.jpeg','PANTHEON.jpeg',
  'Thorfinn _ Vinland saga.jpeg','Choujin X.jpeg','THE CONTROL DEVIL _ GRAPHIC DESIGN.jpeg',
  'God Valley.jpeg','MATT TAYLOR.jpeg','SUBWAY DIMENSIONS.jpeg',
  'Queen Marika the Eternal.jpeg','VOGUE.jpeg','Sight - SKJEGG.jpeg',
  'Poster - Veil.jpeg','SONS OF THE DEVIL Covers 1-5 - toni infante.jpeg',
  'denji starboy album cover.jpeg','yhwach god of the Quincy.jpeg',
  'Makima! 🩸__#Makima #ChainsawMan_#ChainsawManFanart #AnimeArt_#DigitalPainting.jpeg',
  'チェンソーマン ＃１.jpeg','𝐔𝐬𝐨𝐩𝐩.jpeg','Poster One Piece - Wanted Whitebeard 61x91,5cm _ bol.jpeg',
  'CHAOS SMILE.jpeg','Fire Punch.jpeg','Nelliel Brutalism.jpeg',
  '#chainsawman.jpeg','Burning - Inspired by Van Gogh.jpeg',
  "I'LL TAKE CARE OF YOU _ TYLER THE CREATOR _ DON'T TAP THE GLASS _ FLOWER BOY.jpeg",
  'Kagurabachi X Bleach.jpeg','Kyora Sazanami Poster.jpeg',
  '0xMC001x.jpeg','0xMC002x.jpeg','0xMC003x.jpeg',
  '0xEP001p.jpeg','0xEP002p.jpeg','0xEP003p.jpeg','0xEP004p.jpeg','0xEP005p.jpeg',
  '0xEP006p.jpeg','0xEP007p.jpeg','0xEP008p.jpeg','0xEP009p.jpeg','0xEP010p.jpeg',
  '0xEP011p.jpeg','0xEP012p.jpeg','0xEP013p.jpeg','0xEP014p.jpeg','0xEP015p.jpeg',
  '0xEP016p.jpeg','0xEP017p.jpeg','0xEP018p.jpeg','0xEP019p.jpeg','0xEP020p.jpeg',
  '0xEP021p.jpeg','0xEP022p.jpeg','0xEP023p.jpeg','0xEP024p.jpeg','0xEP025p.jpeg',
  '0xEP026p.jpeg','0xEP027p.jpeg','0xEP028p.jpeg','0xEP029p.jpeg','0xEP030p.jpeg',
]

function getMangaImgSrc(node: GraphNode) {
  const numId = parseInt((node.id || '').replace(/\D/g, '')) || 0
  const idx = (numId * 11 + (node.themeIdx || 0) * 7) % PANEL_IMGS.length
  return `${import.meta.env.BASE_URL}manga/${encodeURIComponent(PANEL_IMGS[idx])}`
}

interface NodeRunState {
  status: 'running' | 'ok' | 'error'
  ms?: number
}

interface Props {
  node: GraphNode
  groups: GraphGroup[]
  brutal: boolean
  isJoinSelected: boolean
  edgeMode: string | null
  hoveredNodeId: string | null
  setHoveredNodeId: (id: string | null) => void
  draggingNodeRef: React.RefObject<any>
  lastMousePos: React.RefObject<{ x: number; y: number }>
  transform: { x: number; y: number; scale: number }
  setNodeColorPicker: (picker: any) => void
  handleNodeClickInMode: (id: string) => void
  openNodeInEditor: (id: string) => void
  nodeRunState: Record<string, NodeRunState>
  onRun?: (id: string) => void
  onCtxMenu?: (id: string, x: number, y: number) => void
  wakePhysicsRef?: React.RefObject<() => void>
}

function MangaNodeInner({
  node, groups, brutal, isJoinSelected, edgeMode, hoveredNodeId, setHoveredNodeId,
  draggingNodeRef, lastMousePos, transform, setNodeColorPicker, handleNodeClickInMode, openNodeInEditor,
  nodeRunState, onRun, onCtxMenu, wakePhysicsRef,
}: Props) {
  const nodeElRef = useRef<HTMLDivElement>(null)
  const W = node.isMain ? 108 : 90
  const H = node.isMain ? 44 : 36
  const accent = ACCENTS[node.themeIdx % ACCENTS.length]
  const group = groups.find(g => g.nodeIds.includes(node.id))
  const imgSrc = getMangaImgSrc(node)
  const isHovered = hoveredNodeId === node.id
  const dimmed = hoveredNodeId && !isHovered && !edgeMode
  const runSt = nodeRunState?.[node.id]
  const isDoc = node.type === 'doc'

  const boxShadow = brutal
    ? (isJoinSelected ? `6px 6px 0 ${accent}` : isHovered ? '8px 8px 0 #0f0f0f' : '4px 4px 0 #0f0f0f')
    : (isJoinSelected ? `0 0 24px ${accent}` : isHovered ? `0 0 28px ${accent}66` : `0 0 10px ${accent}28`)

  return (
    <div
      ref={nodeElRef}
      className="mn-node"
      style={{
        left: node.x - W / 2,
        top: node.y - H / 2,
        width: W, height: H,
        opacity: dimmed ? 0.22 : 1,
        zIndex: isJoinSelected || isHovered ? 10 : 1,
      }}
      onPointerEnter={() => !edgeMode && startTransition(() => setHoveredNodeId(node.id))}
      onPointerLeave={() => startTransition(() => setHoveredNodeId(null))}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onCtxMenu?.(node.id, e.clientX, e.clientY) }}
      onPointerDown={e => {
        e.stopPropagation()
        if (edgeMode) return
        setNodeColorPicker(null)
        draggingNodeRef.current = { id: node.id, x: node.x, y: node.y, hasDragged: false, el: nodeElRef.current }
        lastMousePos.current = { x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
        wakePhysicsRef?.current?.()
      }}
      onPointerMove={e => {
        if (!draggingNodeRef.current || draggingNodeRef.current.id !== node.id) return
        e.stopPropagation()
        const dx = (e.clientX - lastMousePos.current.x) / transform.scale
        const dy = (e.clientY - lastMousePos.current.y) / transform.scale
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) draggingNodeRef.current.hasDragged = true
        draggingNodeRef.current.x += dx
        draggingNodeRef.current.y += dy
        lastMousePos.current = { x: e.clientX, y: e.clientY }
        // Direct DOM update — bypasses React reconciliation for zero-latency drag
        if (nodeElRef.current) {
          nodeElRef.current.style.left = (draggingNodeRef.current.x - W / 2) + 'px'
          nodeElRef.current.style.top  = (draggingNodeRef.current.y - H / 2) + 'px'
        }
      }}
      onPointerUp={e => {
        e.stopPropagation()
        e.currentTarget.releasePointerCapture(e.pointerId)
        if (edgeMode === 'join') { handleNodeClickInMode(node.id); return }
        if (!draggingNodeRef.current?.hasDragged) openNodeInEditor(node.id)
        draggingNodeRef.current = null
      }}
    >
      {group && (
        <div style={{position:'absolute',top:-18,left:0,right:0,textAlign:'center',pointerEvents:'none'}}>
          <span className="mn-group-label" style={{background:brutal?'#0f0f0f':'rgba(8,8,20,.92)',color:group.color,border:`1px solid ${group.color}44`,fontSize:'8px',fontFamily:"'JetBrains Mono',monospace"}}>
            {group.name}
          </span>
        </div>
      )}
      <div className="mn-node-frame" style={{
        border: isJoinSelected
          ? (brutal ? `2px solid ${accent}` : `1px solid ${accent}`)
          : runSt?.status === 'ok' ? `1px solid #10b981`
          : runSt?.status === 'error' ? `1px solid #ff435a`
          : (brutal ? `2px solid #0f0f0f` : `1px solid ${accent}44`),
        boxShadow: runSt?.status === 'ok' ? `0 0 14px #10b98155`
          : runSt?.status === 'error' ? `0 0 14px #ff435a55`
          : boxShadow,
        background: brutal ? '#f0ece0' : 'rgba(6,6,18,.97)',
      }}>
        <div className="mn-node-strip" style={{background: accent, width: brutal ? 4 : 3}}/>
        <div className="mn-node-icon">
          <img src={imgSrc} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block',
            filter:'contrast(1.2) saturate(.5)',opacity: brutal ? 0.9 : 0.85}}/>
        </div>
        <div className="mn-node-content">
          <div className="mn-node-type-row">
            <span className="mn-node-type-chip" style={{background: isDoc ? '#c792ea' : accent, color: brutal ? '#0f0f0f' : '#000'}}>
              {isDoc ? 'DOC' : node.type.slice(0, 3).toUpperCase()}
            </span>
            {node.isMain && <span className="mn-node-main-chip" style={{color: accent, borderColor: accent}}>M</span>}
          </div>
          <div className="mn-node-label" style={{color: brutal ? '#0f0f0f' : '#d8dce8'}}>{node.label}</div>
        </div>
        <div className="mn-node-right">
          <div className="mn-node-run"
            style={{
              color: runSt?.status === 'ok' ? '#10b981' : runSt?.status === 'error' ? '#ff435a' : accent,
              opacity: runSt?.status === 'running' ? 1 : 0.7,
            }}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onRun?.(node.id) }}
            title="Run (JS)"
          >
            {runSt?.status === 'running' ? '⋯' : runSt?.status === 'ok' ? '✓' : runSt?.status === 'error' ? '✗' : '▶'}
          </div>
          <div className="mn-node-dot"
            style={{background: accent, width: 6, height: 6, borderRadius: brutal ? 0 : '50%', flexShrink: 0}}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              const rect = e.currentTarget.getBoundingClientRect()
              setNodeColorPicker((p: any) => p?.nodeId === node.id ? null : {nodeId: node.id, x: rect.left, y: rect.bottom + 6})
            }}
          />
          {node.modified && <div className="mn-node-mod"/>}
        </div>
      </div>
    </div>
  )
}

// Memoized with custom comparator — only re-renders when visually relevant props change
export default memo(MangaNodeInner, (prev, next) =>
  prev.node.x === next.node.x &&
  prev.node.y === next.node.y &&
  prev.node.modified === next.node.modified &&
  prev.node.themeIdx === next.node.themeIdx &&
  prev.node.code === next.node.code &&
  prev.isJoinSelected === next.isJoinSelected &&
  prev.hoveredNodeId === next.hoveredNodeId &&
  prev.edgeMode === next.edgeMode &&
  prev.brutal === next.brutal &&
  prev.nodeRunState === next.nodeRunState
)
