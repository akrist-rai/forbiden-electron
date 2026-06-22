import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SidebarMode, BottomTab, EdgeMode, ThemeMode } from './types'

type Setter<T> = T | ((prev: T) => T)
const upd = <T>(val: Setter<T>, prev: T): T =>
  typeof val === 'function' ? (val as (p: T) => T)(prev) : val

interface Transform {
  x: number
  y: number
  scale: number
}

type NodePicker = { nodeId: string; x: number; y: number } | null

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
  nodeColorPicker: NodePicker
  nodeCtxMenu: NodePicker
  openGroupId: string | null
  // Theme
  themeMode: ThemeMode
  globalFontScale: number
  avatarIndex: number
  // Misc
  dragOver: boolean
  notebookFloating: boolean
  // Actions — layout (all accept updater functions)
  setSidebarOpen: (open: Setter<boolean>) => void
  setSidebarMode: (mode: Setter<SidebarMode>) => void
  setSidebarW: (w: Setter<number>) => void
  setBottomOpen: (open: Setter<boolean>) => void
  setBottomTab: (tab: Setter<BottomTab>) => void
  setBottomH: (h: Setter<number>) => void
  setEditorOpen: (open: Setter<boolean>) => void
  setEditorW: (w: Setter<number>) => void
  // Actions — modals
  setShowCmd: (show: Setter<boolean>) => void
  setShowFileFinder: (show: Setter<boolean>) => void
  setShowCreateNode: (show: Setter<boolean>) => void
  setShowCreateGroup: (show: Setter<boolean>) => void
  setShowJumpLine: (show: Setter<boolean>) => void
  setShowShortcuts: (show: Setter<boolean>) => void
  setZenMode: (zen: Setter<boolean>) => void
  // Actions — node creation form
  setNewNodeName: (name: string) => void
  setNewNodeType: (type: string) => void
  setNewNodeColor: (color: number) => void
  // Actions — group creation form
  setGroupName: (name: string) => void
  setGroupColor: (color: string) => void
  setGroupSelected: (ids: Setter<string[]>) => void
  // Actions — canvas
  setTransform: (transform: Setter<Transform>) => void
  setIsDraggingCanvas: (dragging: boolean) => void
  // Actions — graph interaction
  setEdgeMode: (mode: Setter<EdgeMode>) => void
  setHoveredNodeId: (id: string | null) => void
  setHoveredEdgeId: (id: string | null) => void
  setJoinFirstNode: (id: string | null) => void
  setNodeColorPicker: (picker: Setter<NodePicker>) => void
  setNodeCtxMenu: (menu: NodePicker) => void
  setOpenGroupId: (id: string | null) => void
  // Actions — theme
  setThemeMode: (mode: ThemeMode) => void
  setGlobalFontScale: (scale: number) => void
  setAvatarIndex: (index: number) => void
  // Actions — misc
  setDragOver: (over: Setter<boolean>) => void
  setNotebookFloating: (floating: Setter<boolean>) => void
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

      setSidebarOpen:      (v) => set((s) => ({ sidebarOpen: upd(v, s.sidebarOpen) })),
      setSidebarMode:      (v) => set((s) => ({ sidebarMode: upd(v, s.sidebarMode) })),
      setSidebarW:         (v) => set((s) => ({ sidebarW: upd(v, s.sidebarW) })),
      setBottomOpen:       (v) => set((s) => ({ bottomOpen: upd(v, s.bottomOpen) })),
      setBottomTab:        (v) => set((s) => ({ bottomTab: upd(v, s.bottomTab) })),
      setBottomH:          (v) => set((s) => ({ bottomH: upd(v, s.bottomH) })),
      setEditorOpen:       (v) => set((s) => ({ editorOpen: upd(v, s.editorOpen) })),
      setEditorW:          (v) => set((s) => ({ editorW: upd(v, s.editorW) })),
      setShowCmd:          (v) => set((s) => ({ showCmd: upd(v, s.showCmd) })),
      setShowFileFinder:   (v) => set((s) => ({ showFileFinder: upd(v, s.showFileFinder) })),
      setShowCreateNode:   (v) => set((s) => ({ showCreateNode: upd(v, s.showCreateNode) })),
      setShowCreateGroup:  (v) => set((s) => ({ showCreateGroup: upd(v, s.showCreateGroup) })),
      setShowJumpLine:     (v) => set((s) => ({ showJumpLine: upd(v, s.showJumpLine) })),
      setShowShortcuts:    (v) => set((s) => ({ showShortcuts: upd(v, s.showShortcuts) })),
      setZenMode:          (v) => set((s) => ({ zenMode: upd(v, s.zenMode) })),
      setNewNodeName:      (name) => set({ newNodeName: name }),
      setNewNodeType:      (type) => set({ newNodeType: type }),
      setNewNodeColor:     (color) => set({ newNodeColor: color }),
      setGroupName:        (name) => set({ groupName: name }),
      setGroupColor:       (color) => set({ groupColor: color }),
      setGroupSelected:    (v) => set((s) => ({ groupSelected: upd(v, s.groupSelected) })),
      setTransform:        (v) => set((s) => ({ transform: upd(v, s.transform) })),
      setIsDraggingCanvas: (dragging) => set({ isDraggingCanvas: dragging }),
      setEdgeMode:         (v) => set((s) => ({ edgeMode: upd(v, s.edgeMode) })),
      setHoveredNodeId:    (id) => set({ hoveredNodeId: id }),
      setHoveredEdgeId:    (id) => set({ hoveredEdgeId: id }),
      setJoinFirstNode:    (id) => set({ joinFirstNode: id }),
      setNodeColorPicker:  (v) => set((s) => ({ nodeColorPicker: upd(v, s.nodeColorPicker) })),
      setNodeCtxMenu:      (menu) => set({ nodeCtxMenu: menu }),
      setOpenGroupId:      (id) => set({ openGroupId: id }),
      setThemeMode:        (mode) => set({ themeMode: mode }),
      setGlobalFontScale:  (scale) => set({ globalFontScale: scale }),
      setAvatarIndex:      (index) => set({ avatarIndex: index }),
      setDragOver:         (v) => set((s) => ({ dragOver: upd(v, s.dragOver) })),
      setNotebookFloating: (v) => set((s) => ({ notebookFloating: upd(v, s.notebookFloating) })),
    }),
    {
      name: 'sanction-ui-v1',
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
