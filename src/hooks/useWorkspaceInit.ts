import { useEffect } from 'react'

interface Options {
  setExplorerRoot: (folder: string) => void
  setTermCwd: (folder: string) => void
  setSidebarMode: (mode: string) => void
}

export function useWorkspaceInit({ setExplorerRoot, setTermCwd, setSidebarMode }: Options) {
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.fs) return
    ;(async () => {
      const [defaultRes, savedRes] = await Promise.all([
        api.fs.ensureDefaultWorkspace(),
        api.fs.getWorkspace(),
      ])
      const folder = savedRes?.path || (defaultRes?.success ? defaultRes.path : null)
      if (!folder) return
      setExplorerRoot(folder)
      ;(window as any).__forbiddenCwd = folder
      setTermCwd(folder)
      setSidebarMode('files')
    })()
  }, [])
}
