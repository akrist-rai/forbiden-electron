import { useEffect } from 'react'
import { api } from '../lib/api'

interface Options {
  setExplorerRoot: (folder: string) => void
  setTermCwd: (folder: string) => void
  setSidebarMode: (mode: string) => void
}

export function useWorkspaceInit({ setExplorerRoot, setTermCwd, setSidebarMode }: Options) {
  useEffect(() => {
    if (!api?.fs) return
    ;(async () => {
      const [defaultRes, savedRes] = await Promise.all([
        api.fs.ensureDefaultWorkspace(),
        api.fs.getWorkspace(),
      ]) as [{ success?: boolean; path?: string } | null, { path?: string } | null]
      const folder = savedRes?.path || (defaultRes?.success ? defaultRes.path : null)
      if (!folder) return
      setExplorerRoot(folder)
      ;(window as any).__forbiddenCwd = folder
      setTermCwd(folder)
      setSidebarMode('files')
    })()
  }, [])
}
