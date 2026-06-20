// ══════════════════════════════════════════════════════════════════════════════
//  Typed accessor for the desktop API.
//  Populated by src/lib/tauriAPI.ts before React renders.
//  Import `api` instead of casting (window as any).electronAPI everywhere.
// ══════════════════════════════════════════════════════════════════════════════

export interface DesktopAPI {
  platform: string
  homeDir: string
  engine: { url: string; wsUrl: string; host: string }
  run: { code: (lang: string, code: string, stdin?: string) => Promise<unknown> }
  runInTerminal: (ptyId: string, lang: string, code: string, cwd: string) => Promise<unknown>
  pty: {
    wsUrl: (id: string, cols: number, rows: number, cwd: string) => string
    write: (id: string, text: string) => Promise<unknown>
  }
  watch: { wsUrl: (root: string) => string }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (cb: (val: boolean) => void) => void
    offMaximizeChange: (cb: (val: boolean) => void) => void
    toggleDevTools?: () => void
  }
  dialog: {
    openFolder: () => Promise<string | null>
    saveFile: (name: string, content: string) => Promise<{ success: boolean; filePath?: string }>
    openFiles: () => Promise<Array<{ path: string; name: string; content: string }>>
    showItem: (path: string) => Promise<{ success: boolean }>
  }
  git: {
    status:   (cwd: string) => Promise<unknown>
    log:      (cwd: string) => Promise<unknown>
    logGraph: (cwd: string, limit: number) => Promise<unknown>
    branch:   (cwd: string) => Promise<unknown>
    branches: (cwd: string) => Promise<unknown>
    commit:   (cwd: string, message: string) => Promise<unknown>
    stage:    (cwd: string, files: string[]) => Promise<unknown>
    unstage:  (cwd: string, files: string[]) => Promise<unknown>
    checkout: (cwd: string, branch: string) => Promise<unknown>
    push:     (cwd: string) => Promise<unknown>
    pull:     (cwd: string) => Promise<unknown>
    stash:    (cwd: string) => Promise<unknown>
    stashPop: (cwd: string) => Promise<unknown>
    init:     (cwd: string) => Promise<unknown>
    discard:  (cwd: string, file: string) => Promise<unknown>
    diff:     (cwd: string, file: string) => Promise<unknown>
  }
  gitEx: { blame: (cwd: string, file: string) => Promise<unknown> }
  fs: {
    readTree:               (rootPath: string, maxDepth?: number) => Promise<unknown>
    readFile:               (filePath: string) => Promise<unknown>
    writeFile:              (filePath: string, content: string) => Promise<unknown>
    createFile:             (filePath: string) => Promise<unknown>
    createFolder:           (folderPath: string) => Promise<unknown>
    deleteItem:             (itemPath: string) => Promise<unknown>
    renameItem:             (oldPath: string, newPath: string) => Promise<unknown>
    copyFolder:             (srcPath: string, destPath: string) => Promise<unknown>
    copyFile:               (srcPath: string, destPath: string) => Promise<unknown>
    showInFolder:           (itemPath: string) => Promise<unknown>
    scanImports:            (rootPath: string) => Promise<unknown>
    ensureDefaultWorkspace: () => Promise<unknown>
    getWorkspace:           () => Promise<unknown>
    saveWorkspace:          (workspacePath: string) => Promise<unknown>
    getRecentWorkspaces:    () => Promise<string[]>
    addRecentWorkspace:     (p: string) => Promise<unknown>
    listAllFiles:           (rootPath: string, maxFiles?: number) => Promise<unknown>
    searchInFiles:          (rootPath: string, query: string, maxResults?: number) => Promise<unknown>
  }
  ai: {
    chat: (messages: unknown[], apiKey: string, model: string, system: string, provider: string) => Promise<unknown>
    streamUrl: () => string
    ollamaModels: (host: string) => Promise<unknown>
  }
  tools: {
    formatCode: (code: string, lang: string) => Promise<unknown>
    getScripts:  (rootPath: string) => Promise<unknown>
  }
  terminal: { exec: (cmd: string, cwd: string) => Promise<{ stdout: string; stderr: string }> }
  on:  (channel: string, cb: (...args: unknown[]) => void) => void
  off: (channel: string, cb: (...args: unknown[]) => void) => void
}

export function getAPI(): DesktopAPI | undefined {
  return (window as unknown as { electronAPI?: DesktopAPI }).electronAPI
}

export const api = new Proxy({} as DesktopAPI, {
  get(_target, prop) {
    const a = (window as unknown as { electronAPI?: DesktopAPI }).electronAPI
    return a ? (a as Record<string | symbol, unknown>)[prop] : undefined
  },
})
