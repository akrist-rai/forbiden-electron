import { useEffect } from 'react'
import { api } from '../lib/api'

interface Options {
  activeTabId: string | null
  handleOpenFolderForExplorer: () => void
  handleSaveActiveNode: () => void
  handleRunActiveNode: () => void
  setBottomTab: (tab: string) => void
  setBottomOpen: (fn: (v: boolean) => boolean) => void
}

export function useMenuEvents({
  activeTabId,
  handleOpenFolderForExplorer,
  handleSaveActiveNode,
  handleRunActiveNode,
  setBottomTab,
  setBottomOpen,
}: Options) {
  useEffect(() => {
    if (!api?.on) return

    const handleMenuOpenFolder   = () => handleOpenFolderForExplorer()
    const handleMenuSaveFile     = () => handleSaveActiveNode()
    const handleMenuRunActive    = () => handleRunActiveNode()
    const handleMenuToggleTerm   = () => { setBottomTab('terminal'); setBottomOpen(o => !o) }
    const handleTitleBarFolder   = (e: CustomEvent) => {
      const folder = e.detail
      if (!folder) return
      handleOpenFolderForExplorer()
      // The actual folder from the event is dispatched as a global CustomEvent;
      // the consumer must handle the detail.folder path via handleOpenFolderForExplorer
    }

    api.on('menu:open-folder',     handleMenuOpenFolder)
    api.on('menu:save-file',       handleMenuSaveFile)
    api.on('menu:run-active',      handleMenuRunActive)
    api.on('menu:toggle-terminal', handleMenuToggleTerm)
    window.addEventListener('sanction:open-folder', handleTitleBarFolder as EventListener)

    return () => {
      api.off?.('menu:open-folder',     handleMenuOpenFolder)
      api.off?.('menu:save-file',       handleMenuSaveFile)
      api.off?.('menu:run-active',      handleMenuRunActive)
      api.off?.('menu:toggle-terminal', handleMenuToggleTerm)
      window.removeEventListener('sanction:open-folder', handleTitleBarFolder as EventListener)
    }
  }, [activeTabId, handleOpenFolderForExplorer, handleSaveActiveNode, handleRunActiveNode])
}
