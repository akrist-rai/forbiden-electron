import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RecentFile, SearchResult } from './types'

interface WorkspaceState {
  explorerRoot: string | null
  explorerRefreshKey: number
  recentFiles: RecentFile[]
  searchQuery: string
  projectSearchQuery: string
  projectSearchResults: SearchResult[]
  projectSearchLoading: boolean
  replaceQuery: string
  replaceLoading: boolean
  // Actions
  setExplorerRoot: (root: string | null) => void
  triggerRefresh: () => void
  addRecentFile: (file: RecentFile) => void
  setSearchQuery: (q: string) => void
  setProjectSearchQuery: (q: string) => void
  setProjectSearchResults: (results: SearchResult[]) => void
  setProjectSearchLoading: (loading: boolean) => void
  setReplaceQuery: (q: string) => void
  setReplaceLoading: (loading: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      explorerRoot: null,
      explorerRefreshKey: 0,
      recentFiles: [],
      searchQuery: '',
      projectSearchQuery: '',
      projectSearchResults: [],
      projectSearchLoading: false,
      replaceQuery: '',
      replaceLoading: false,

      setExplorerRoot: (root) => set({ explorerRoot: root }),
      triggerRefresh: () => set((s) => ({ explorerRefreshKey: s.explorerRefreshKey + 1 })),

      addRecentFile: (file) =>
        set((s) => {
          const filtered = s.recentFiles.filter((f) => f.path !== file.path)
          return { recentFiles: [file, ...filtered].slice(0, 20) }
        }),

      setSearchQuery: (q) => set({ searchQuery: q }),
      setProjectSearchQuery: (q) => set({ projectSearchQuery: q }),
      setProjectSearchResults: (results) => set({ projectSearchResults: results }),
      setProjectSearchLoading: (loading) => set({ projectSearchLoading: loading }),
      setReplaceQuery: (q) => set({ replaceQuery: q }),
      setReplaceLoading: (loading) => set({ replaceLoading: loading }),
    }),
    {
      name: 'forbiden-workspace-v1',
      partialize: (s) => ({
        explorerRoot: s.explorerRoot,
        recentFiles: s.recentFiles,
      }),
    }
  )
)
