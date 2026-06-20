// Shared types for all Zustand stores

export interface GraphNode {
  id: string
  type: string
  label: string
  isMain?: boolean
  x: number
  y: number
  vx: number
  vy: number
  themeIdx: number
  modified: boolean
  code: string
  classId?: string | null
  filepath?: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
}

export interface GraphGroup {
  id: string
  name: string
  color: string
  nodeIds: string[]
}

export interface NodeRunState {
  status: 'running' | 'ok' | 'error'
  ms?: number
}

export interface EdgeDataLabel {
  label: string
  ts: number
}

export interface Palette {
  id: string
  name: string
  bg: string
  base: string
  lineNum: string
  activeLine: string
  kw: string
  str: string
  cmt: string
  num: string
  fn: string
  bi: string
  op: string
  swatches: string[]
}

export interface TermPalette {
  id: string
  name: string
  bg: string
  text: string
  prompt: string
  dim: string
  error: string
  warn: string
  info: string
  border: string
  cursor: string
  selection: string
}

export interface TimelineEvent {
  id: number
  type: string
  label: string
  ts: number
  icon: string
  meta?: Record<string, unknown>
}

export interface KanbanCol {
  id: string
  title: string
  color: string
}

export interface KanbanCard {
  id: string
  colId: string
  title: string
  priority: string
  tags: string[]
  progress: number
  due: string | null
  assignee: number | null
}

export interface RecentFile {
  path: string
  label: string
  ts: number
}

export interface SearchResult {
  fullPath: string
  relPath: string
  line: number
  col: number
  lineText: string
}

export type SidebarMode = 'files' | 'git' | 'project-search' | 'outline' | 'ai' | 'note' | 'settings' | 'search'
export type BottomTab = 'console' | 'terminal' | 'timeline' | 'notebook'
export type EdgeMode = null | 'join' | 'cut'
export type SplitMode = 'vertical' | 'horizontal'
export type ThemeMode = 'cyber' | 'brutal'
