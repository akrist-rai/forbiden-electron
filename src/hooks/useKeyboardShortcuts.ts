import { useEffect } from 'react'

interface Options {
  zenMode: boolean
  sidebarMode: string
  hoveredNodeId: string | null
  openGroupId: string | null
  activeTabId: string | null
  setShowFileFinder: (fn: (v: boolean) => boolean) => void
  setShowCmd: (fn: (v: boolean) => boolean) => void
  setShowJumpLine: (fn: (v: boolean) => boolean) => void
  setZenMode: (fn: (v: boolean) => boolean) => void
  setSidebarMode: (mode: string) => void
  setSidebarOpen: (fn: (v: boolean) => boolean | boolean) => void
  setBottomTab: (tab: string) => void
  setBottomOpen: (fn: (v: boolean) => boolean) => void
  setEdgeMode: (fn: (m: string | null) => string | null) => void
  setJoinFirstNode: (v: null) => void
  setNodeColorPicker: (v: null) => void
  setShowTermPalette: (v: boolean) => void
  setNotebookFloating: (v: boolean) => void
  setShowShortcuts: (fn: (v: boolean) => boolean) => void
  setShowCreateNode: (v: boolean) => void
  setShowCreateGroup: (v: boolean) => void
  setGroupSelected: (v: []) => void
  setOpenGroupId: (v: null) => void
  setActiveTabId: (v: null) => void
  handleDeleteNode: (id: string) => void
}

export function useKeyboardShortcuts({
  zenMode, sidebarMode, hoveredNodeId, openGroupId, activeTabId,
  setShowFileFinder, setShowCmd, setShowJumpLine, setZenMode,
  setSidebarMode, setSidebarOpen, setBottomTab, setBottomOpen,
  setEdgeMode, setJoinFirstNode, setNodeColorPicker, setShowTermPalette,
  setNotebookFloating, setShowShortcuts, setShowCreateNode, setShowCreateGroup,
  setGroupSelected, setOpenGroupId, setActiveTabId, handleDeleteNode,
}: Options) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).contentEditable === 'true'

      if ((e.metaKey || e.ctrlKey) && e.key === 'p' && !e.shiftKey) { e.preventDefault(); setShowFileFinder(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'P')                 { e.preventDefault(); setShowCmd(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p')   { e.preventDefault(); setShowCmd(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey)  { e.preventDefault(); setShowJumpLine(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); setZenMode(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); setSidebarMode('project-search'); setSidebarOpen(() => true) }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); setSidebarMode('outline'); setSidebarOpen(() => true) }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        setSidebarMode(sidebarMode === 'git' ? sidebarMode : 'git')
        setSidebarOpen(o => sidebarMode === 'git' ? !o : true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b' && !e.shiftKey) { e.preventDefault(); setSidebarOpen(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.key === '?') { e.preventDefault(); setShowShortcuts(v => !v) }

      if (e.key === 'Escape') {
        setShowCmd(()=>false); setShowFileFinder(()=>false); setShowJumpLine(()=>false); setShowShortcuts(()=>false)
        if (zenMode) { setZenMode(() => false); return }
        setEdgeMode(() => null); setJoinFirstNode(null); setNodeColorPicker(null); setShowTermPalette(false)
        setNotebookFloating(false)
        if (!openGroupId) setActiveTabId(null)
        setOpenGroupId(null)
      }

      if (!inInput) {
        if (e.key === 'n' || e.key === 'N') setShowCreateNode(true)
        if (e.key === 'g' || e.key === 'G') { setShowCreateGroup(true); setGroupSelected([]) }
        if (e.key === '`' || e.key === '~') { setBottomTab('terminal'); setBottomOpen(o => !o) }
        if (e.key === 'j' || e.key === 'J') setEdgeMode(m => m === 'join' ? null : 'join')
        if (e.key === 'x' || e.key === 'X') setEdgeMode(m => m === 'cut' ? null : 'cut')
        if ((e.key === 'Delete' || e.key === 'Backspace') && hoveredNodeId) {
          handleDeleteNode(hoveredNodeId)
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openGroupId, hoveredNodeId, activeTabId, zenMode, sidebarMode])
}
