import { ACCENTS } from '../../constants/accents'
import type { GraphNode } from '../../stores/types'

interface Props {
  nodes: GraphNode[]
}

export default function GraphMinimap({ nodes }: Props) {
  if (!nodes.length) return null
  const pad = 10; const W = 110; const H = 70
  const xs = nodes.map(n => n.x); const ys = nodes.map(n => n.y)
  const minX = Math.min(...xs) - 50; const maxX = Math.max(...xs) + 50
  const minY = Math.min(...ys) - 50; const maxY = Math.max(...ys) + 50
  const rX = maxX - minX || 1; const rY = maxY - minY || 1
  const toMm = (x: number, y: number) => [
    pad + (x - minX) / rX * (W - pad * 2),
    pad + (y - minY) / rY * (H - pad * 2),
  ]
  return (
    <div className="ide-minimap">
      <svg width={W} height={H} style={{display:'block'}}>
        {nodes.map(n => {
          const [mx, my] = toMm(n.x, n.y)
          return (
            <circle key={n.id} cx={mx} cy={my}
              r={n.isMain ? 4 : 2.5}
              fill={ACCENTS[n.themeIdx % ACCENTS.length]}
              opacity=".75"
            />
          )
        })}
      </svg>
      <div className="ide-minimap-label">GRAPH OVERVIEW</div>
    </div>
  )
}
