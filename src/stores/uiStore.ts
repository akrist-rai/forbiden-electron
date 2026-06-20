import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SidebarMode, BottomTab, EdgeMode, ThemeMode } from './types'

interface Transform {
  x: number
  y: number
  scale: number
}

interface UiState {
  // Layout
  sidebarOpen: boolean
  sidebarMode: SidebarMode
  sidebarW: number
  bottomOpen: boolean
  bottomTab: BottomTab
  bottomH: number
  editorOpen: boolean
  editorW: number
  // Modals
  showCmd: boolean
  showFileFinder: boolean
  showCreateNode: boolean
  showCreateGroup: boolean
  showJumpLine: boolean
  showShortcuts: boolean
  zenMode: boolean
  // Node creation form
  newNodeName: string
  newNodeType: string
  newNodeColor: number
  // Group creation form
  groupName: string
  groupColor: string
  groupSelected: string[]
  // Canvas
  transform: Transform
  isDraggingCanvas: boolean
  // Graph interaction
  edgeMode: EdgeMode
  hoveredNodeId: string | null
  hoveredEdgeId: string | null
  joinFirstNode: string | null
  nodeColorPicker: { nodeId: string; x: number; y: number } | null
  nodeCtxMenu: { nodeId: string; x: number; y: number } | null
  openGroupId: string | null
  // Theme
  themeMode: ThemeMode
  globalFontScale: number
  avatarIndex: number
  // Misc
  dragOver: boolean
  notebookFloating: boolean
  // Actions — layout
  setSidebarOpen: (open: boolean) => void
  setSidebarMode: (mode: SidebarMode) => void
  setSidebarW: (w: number) => void
  setBottomOpen: (open: boolean) => void
  setBottomTab: (tab: BottomTab) => void
  setBottomH: (h: number) => void
  setEditorOpen: (open: boolean) => void
  setEditorW: (w: number) => void
  // Actions — modals
  setShowCmd: (show: boolean) => void
  setShowFileFinder: (show: boolean) => void
  setShowCreateNode: (show: boolean) => void
  setShowCreateGroup: (show: boolean) => void
  setShowJumpLine: (show: boolean) => void
  setShowShortcuts: (show: boolean) => void
  setZenMode: (zen: boolean) => void
  // Actions — node creation form
  setNewNodeName: (name: string) => void
  setNewNodeType: (type: string) => void
  setNewNodeColor: (color: number) => void
  // Actions — group creation form
  setGroupName: (name: string) => void
  setGroupColor: (color: string) => void
  setGroupSelected: (ids: string[]) => void
  // Actions — canvas
  setTransform: (transform: Transform | ((prev: Transform) => Transform)) => void
  setIsDraggingCanvas: (dragging: boolean) => void
  // Actions — graph interaction
  setEdgeMode: (mode: EdgeMode) => void
  setHoveredNodeId: (id: string | null) => void
  setHoveredEdgeId: (id: string | null) => void
  setJoinFirstNode: (id: string | null) => void
  setNodeColorPicker: (picker: { nodeId: string; x: number; y: number } | null) => void
  setNodeCtxMenu: (menu: { nodeId: string; x: number; y: number } | null) => void
  setOpenGroupId: (id: string | null) => void
  // Actions — theme
  setThemeMode: (mode: ThemeMode) => void
  setGlobalFontScale: (scale: number) => void
  setAvatarIndex: (index: number) => void
  // Actions — misc
  setDragOver: (over: boolean) => void
  setNotebookFloating: (floating: boolean) => void
}

export const useUIStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      sidebarMode: 'files',
      sidebarW: 240,
      bottomOpen: false,
      bottomTab: 'console',
      bottomH: 260,
      editorOpen: true,
      editorW: typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.65) : 900,
      showCmd: false,
      showFileFinder: false,
      showCreateNode: false,
      showCreateGroup: false,
      showJumpLine: false,
      showShortcuts: false,
      zenMode: false,
      newNodeName: '',
      newNodeType: 'function',
      newNodeColor: 1,
      groupName: '',
      groupColor: '#10b981',
      groupSelected: [],
      transform: { x: 300, y: 220, scale: 1 },
      isDraggingCanvas: false,
      edgeMode: null,
      hoveredNodeId: null,
      hoveredEdgeId: null,
      joinFirstNode: null,
      nodeColorPicker: null,
      nodeCtxMenu: null,
      openGroupId: null,
      themeMode: 'cyber',
      globalFontScale: 1,
      avatarIndex: 0,
      dragOver: false,
      notebookFloating: false,

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarMode: (mode) => set({ sidebarMode: mode }),
      setSidebarW: (w) => set({ sidebarW: w }),
      setBottomOpen: (open) => set({ bottomOpen: open }),
      setBottomTab: (tab) => set({ bottomTab: tab }),
      setBottomH: (h) => set({ bottomH: h }),
      setEditorOpen: (open) => set({ editorOpen: open }),
      setEditorW: (w) => set({ editorW: w }),
      setShowCmd: (show) => set({ showCmd: show }),
      setShowFileFinder: (show) => set({ showFileFinder: show }),
      setShowCreateNode: (show) => set({ showCreateNode: show }),
      setShowCreateGroup: (show) => set({ showCreateGroup: show }),
      setShowJumpLine: (show) => set({ showJumpLine: show }),
      setShowShortcuts: (show) => set({ showShortcuts: show }),
      setZenMode: (zen) => set({ zenMode: zen }),
      setNewNodeName: (name) => set({ newNodeName: name }),
      setNewNodeType: (type) => set({ newNodeType: type }),
      setNewNodeColor: (color) => set({ newNodeColor: color }),
      setGroupName: (name) => set({ groupName: name }),
      setGroupColor: (color) => set({ groupColor: color }),
      setGroupSelected: (ids) => set({ groupSelected: ids }),
      setTransform: (transform) =>
        set((s) => ({ transform: typeof transform === 'function' ? transform(s.transform) : transform })),
      setIsDraggingCanvas: (dragging) => set({ isDraggingCanvas: dragging }),
      setEdgeMode: (mode) => set({ edgeMode: mode }),
      setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
      setHoveredEdgeId: (id) => set({ hoveredEdgeId: id }),
      setJoinFirstNode: (id) => set({ joinFirstNode: id }),
      setNodeColorPicker: (picker) => set({ nodeColorPicker: picker }),
      setNodeCtxMenu: (menu) => set({ nodeCtxMenu: menu }),
      setOpenGroupId: (id) => set({ openGroupId: id }),
      setThemeMode: (mode) => set({ themeMode: mode }),
      setGlobalFontScale: (scale) => set({ globalFontScale: scale }),
      setAvatarIndex: (index) => set({ avatarIndex: index }),
      setDragOver: (over) => set({ dragOver: over }),
      setNotebookFloating: (floating) => set({ notebookFloating: floating }),
    }),
    {
      name: 'forbiden-ui-v1',
      partialize: (s) => ({
        themeMode: s.themeMode,
        globalFontScale: s.globalFontScale,
        sidebarMode: s.sidebarMode,
        sidebarW: s.sidebarW,
        bottomH: s.bottomH,
        editorW: s.editorW,
        avatarIndex: s.avatarIndex,
      }),
    }
  )
)
