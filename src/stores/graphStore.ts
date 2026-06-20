import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GraphNode, GraphEdge, GraphGroup, NodeRunState, EdgeDataLabel } from './types'

interface GraphState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  groups: GraphGroup[]
  nodeRunState: Record<string, NodeRunState>
  edgeDataLabels: Record<string, EdgeDataLabel>
  // Actions
  setNodes: (nodes: GraphNode[]) => void
  setEdges: (edges: GraphEdge[]) => void
  setGroups: (groups: GraphGroup[]) => void
  addNode: (node: GraphNode) => void
  updateNode: (id: string, patch: Partial<GraphNode>) => void
  deleteNode: (id: string) => void
  addEdge: (edge: GraphEdge) => void
  deleteEdge: (id: string) => void
  addGroup: (group: GraphGroup) => void
  updateGroup: (id: string, patch: Partial<GraphGroup>) => void
  deleteGroup: (id: string) => void
  setNodeCode: (id: string, code: string) => void
  setNodeModified: (id: string, modified: boolean) => void
  setNodeRunState: (id: string, state: NodeRunState | null) => void
  setEdgeDataLabel: (id: string, label: EdgeDataLabel | null) => void
  batchUpdatePositions: (positions: Array<{ id: string; x: number; y: number; vx: number; vy: number }>) => void
  clearEdgeDataLabelsOlderThan: (maxAgeMs: number) => void
}

export const useGraphStore = create<GraphState>()(
  persist(
    (set) => ({
      nodes: [],
      edges: [],
      groups: [],
      nodeRunState: {},
      edgeDataLabels: {},

      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),
      setGroups: (groups) => set({ groups }),

      addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),

      updateNode: (id, patch) =>
        set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),

      deleteNode: (id) =>
        set((s) => ({
          nodes: s.nodes.filter((n) => n.id !== id),
          edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        })),

      addEdge: (edge) => set((s) => ({ edges: [...s.edges, edge] })),

      deleteEdge: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),

      addGroup: (group) => set((s) => ({ groups: [...s.groups, group] })),

      updateGroup: (id, patch) =>
        set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),

      deleteGroup: (id) => set((s) => ({ groups: s.groups.filter((g) => g.id !== id) })),

      setNodeCode: (id, code) =>
        set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, code, modified: true } : n)) })),

      setNodeModified: (id, modified) =>
        set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, modified } : n)) })),

      setNodeRunState: (id, state) =>
        set((s) => {
          if (state === null) {
            const next = { ...s.nodeRunState }
            delete next[id]
            return { nodeRunState: next }
          }
          return { nodeRunState: { ...s.nodeRunState, [id]: state } }
        }),

      setEdgeDataLabel: (id, label) =>
        set((s) => {
          if (label === null) {
            const next = { ...s.edgeDataLabels }
            delete next[id]
            return { edgeDataLabels: next }
          }
          return { edgeDataLabels: { ...s.edgeDataLabels, [id]: label } }
        }),

      // Zero-copy-friendly: called from physics worker result dispatch
      batchUpdatePositions: (positions) =>
        set((s) => {
          const map = new Map(positions.map((p) => [p.id, p]))
          return {
            nodes: s.nodes.map((n) => {
              const p = map.get(n.id)
              return p ? { ...n, x: p.x, y: p.y, vx: p.vx, vy: p.vy } : n
            }),
          }
        }),

      clearEdgeDataLabelsOlderThan: (maxAgeMs) =>
        set((s) => {
          const now = Date.now()
          const next: Record<string, EdgeDataLabel> = {}
          let changed = false
          for (const [k, v] of Object.entries(s.edgeDataLabels)) {
            if (now - v.ts < maxAgeMs) {
              next[k] = v
            } else {
              changed = true
            }
          }
          return changed ? { edgeDataLabels: next } : s
        }),
    }),
    {
      name: 'forbiden-graph-v2',
      // Don't persist physics velocities or ephemeral runtime state
      partialize: (s) => ({
        nodes: s.nodes.map(({ vx: _vx, vy: _vy, ...rest }) => ({ ...rest, vx: 0, vy: 0 })),
        edges: s.edges,
        groups: s.groups,
      }),
    }
  )
)
