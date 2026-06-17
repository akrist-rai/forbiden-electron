// Pure local stub — no server, no auth, all state lives in localStorage via the IDE component
export type WsNode  = { id: string; workspace_id: string; label: string; filepath: string; type: string; is_main: boolean; x: number; y: number; theme_idx: number; class_id: string | null; modified: boolean; created_at: string; updated_at: string }
export type WsEdge  = { id: string; workspace_id: string; source: string; target: string; created_at: string }
export type WsGroup = { id: string; workspace_id: string; name: string; color: string; node_ids: string[]; created_at: string }
export type Workspace = { id: string; user_id: string; name: string; theme: string; avatar: number; remote_url: string | null; git_user: string; git_email: string }

const noop = async (..._args: any[]): Promise<any> => null

export function useWorkspace() {
  return {
    workspace:  null as Workspace | null,
    nodes:      [] as WsNode[],
    edges:      [] as WsEdge[],
    groups:     [] as WsGroup[],
    columns:    [] as any[],
    cards:      [] as any[],
    gitGraph:   { commits: [], lanes: 0 },
    loading:    false,
    error:      null as string | null,
    setNodes:   noop, setEdges: noop, setGroups: noop,
    createNode: noop, updateNode: noop, deleteNode: noop,
    savePositions: noop, getCode: async () => '', saveCode: noop,
    createEdge: noop, deleteEdge: noop,
    createGroup: noop, updateGroup: noop, deleteGroup: noop,
    createColumn: noop, updateColumn: noop, deleteColumn: noop,
    createCard: noop, updateCard: noop, deleteCard: noop,
  }
}
