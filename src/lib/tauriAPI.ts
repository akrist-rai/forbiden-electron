// ══════════════════════════════════════════════════════════════════════════════
//  SANCTION API BRIDGE
//  All heavy ops (FS, git, run, AI, workspace) go to the Go engine via HTTP.
//  Tauri is used only for: engine URL discovery, window management, dialogs.
// ══════════════════════════════════════════════════════════════════════════════

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as dialogOpen, save as dialogSave } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'

// ── Engine URL (updated once in initTauriAPI) ─────────────────────────────────

let engineUrl = 'http://127.0.0.1:49373'
let engineHost = '127.0.0.1:49373'
let WS = `ws://${engineHost}`

// ── HTTP helper — all Go API calls go through this ────────────────────────────

const api = <T = any>(path: string, body: Record<string, unknown> = {}): Promise<T> =>
  fetch(`${engineUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json())

// ── Maximize subscriptions ────────────────────────────────────────────────────

type MaximizeHandler = (val: boolean) => void
const maximizeHandlers = new Set<MaximizeHandler>()
let maximizeUnlisten: (() => void) | null = null
let lastMaximized = false

async function setupMaximizeListener() {
  const win = getCurrentWindow()
  lastMaximized = await win.isMaximized()
  const unlisten = await win.onResized(async () => {
    const now = await getCurrentWindow().isMaximized()
    if (now !== lastMaximized) {
      lastMaximized = now
      maximizeHandlers.forEach(cb => cb(now))
    }
  })
  maximizeUnlisten = unlisten
}

// ── Menu event bus ────────────────────────────────────────────────────────────

type MenuChannel = 'menu:open-folder' | 'menu:save-file' | 'menu:run-active' | 'menu:toggle-terminal'
type MenuCallback = (...args: unknown[]) => void
const menuListeners = new Map<string, Set<MenuCallback>>()

function emitMenuEvent(channel: MenuChannel, ...args: unknown[]) {
  menuListeners.get(channel)?.forEach(cb => cb(...args))
}
;(window as unknown as { __emitMenuEvent: typeof emitMenuEvent }).__emitMenuEvent = emitMenuEvent

// ── Init ──────────────────────────────────────────────────────────────────────

async function waitForEngine(url: string, maxMs = 30_000): Promise<void> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(600) })
      if (r.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 120))
  }
  console.warn('[engine] health-check timed out — proceeding anyway')
}

export async function initTauriAPI(): Promise<void> {
  // Fetch Go engine URL — one Tauri invoke, then all calls go to Go HTTP
  try {
    const url = await invoke<string>('get_engine_url')
    if (url) {
      engineUrl = url
      const match = url.match(/https?:\/\/(.+)/)
      if (match) {
        engineHost = match[1]
        WS = url.replace(/^http/, 'ws')
      }
    }
  } catch { /* use fallback port */ }

  // Block until the Go engine is actually accepting connections.
  // In a packaged AppImage the engine process may not be listening yet
  // even though Rust has already read the READY signal from stdout.
  await waitForEngine(engineUrl)

  await setupMaximizeListener()

  const homeDir: string = await invoke<string>('get_home_dir').catch(() => '/')
  const platform: string = await invoke<string>('get_platform').catch(() => 'linux')

  const electronAPI = {
    platform,
    homeDir,

    engine: {
      url:   engineUrl,
      wsUrl: WS,
      host:  engineHost,
    },

    // ── Code run (Go engine) ──────────────────────────────────────────────
    run: {
      code: (lang: string, code: string, stdin = '') =>
        api('/api/code/run', { lang, code, stdin }),
    },

    runInTerminal: (ptyId: string, lang: string, code: string, cwd: string) =>
      fetch(`${engineUrl}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ptyId, lang, code, cwd }),
      }).then(r => r.json()),

    // ── PTY WebSocket (Go engine) ─────────────────────────────────────────
    pty: {
      wsUrl: (id: string, cols: number, rows: number, cwd: string) => {
        const p = new URLSearchParams({ id, cols: String(cols), rows: String(rows), cwd })
        return `${WS}/ws/pty?${p}`
      },
      write: (id: string, text: string) =>
        fetch(`${engineUrl}/api/pty/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, text }),
        }).then(r => r.json()),
    },

    // ── File watcher WebSocket (Go engine) ───────────────────────────────
    watch: {
      wsUrl: (root: string) => `${WS}/ws/watch?root=${encodeURIComponent(root)}`,
    },

    // ── Window controls (Tauri) ───────────────────────────────────────────
    window: {
      minimize: () => getCurrentWindow().minimize(),
      maximize: async () => {
        const win = getCurrentWindow()
        if (await win.isMaximized()) { await win.unmaximize() } else { await win.maximize() }
      },
      close: () => getCurrentWindow().close(),
      isMaximized: () => getCurrentWindow().isMaximized(),
      onMaximizeChange: (cb: MaximizeHandler) => { maximizeHandlers.add(cb) },
      offMaximizeChange: (cb: MaximizeHandler) => {
        maximizeHandlers.delete(cb)
        if (maximizeHandlers.size === 0 && maximizeUnlisten) {
          maximizeUnlisten(); maximizeUnlisten = null
        }
      },
      toggleDevTools: () => invoke('plugin:webview|open_devtools').catch(() => {}),
    },

    // ── File dialogs (Tauri native) + Go for actual I/O ──────────────────
    dialog: {
      openFolder: async () => {
        const result = await dialogOpen({ directory: true, multiple: false })
        if (!result) return null
        return typeof result === 'string' ? result : (result as string[])[0] ?? null
      },

      saveFile: async (defaultName: string, content: string) => {
        const filePath = await dialogSave({ defaultPath: defaultName })
        if (!filePath) return { success: false }
        try {
          await api('/api/fs/write', { filePath, content })
          return { success: true, filePath }
        } catch { return { success: false } }
      },

      openFiles: async () => {
        const result = await dialogOpen({
          multiple: true,
          filters: [
            { name: 'Code', extensions: ['js','ts','jsx','tsx','py','c','cpp','go','md','json','yaml','yml','sh','html','css'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        })
        if (!result) return []
        const paths = Array.isArray(result) ? result : [result as string]
        return Promise.all(paths.map(async (p: string) => {
          const r = await api<{ content?: string }>('/api/fs/read', { filePath: p })
          return { path: p, name: p.split('/').pop() ?? p, content: r?.content ?? '' }
        }))
      },

      showItem: async (itemPath: string) => {
        try { await revealItemInDir(itemPath); return { success: true } }
        catch { return { success: false } }
      },
    },

    // ── Git (Go engine, all 17 commands) ─────────────────────────────────
    git: {
      status:   (cwd: string)                  => api('/api/git/status',    { cwd }),
      log:      (cwd: string)                  => api('/api/git/log',       { cwd }),
      logGraph: (cwd: string, limit: number)   => api('/api/git/log-graph', { cwd, limit }),
      branch:   (cwd: string)                  => api('/api/git/branch',    { cwd }),
      branches: (cwd: string)                  => api('/api/git/branches',  { cwd }),
      commit:   (cwd: string, message: string) => api('/api/git/commit',    { cwd, message }),
      stage:    (cwd: string, files: string[]) => api('/api/git/stage',     { cwd, files }),
      unstage:  (cwd: string, files: string[]) => api('/api/git/unstage',   { cwd, files }),
      checkout: (cwd: string, branch: string)  => api('/api/git/checkout',  { cwd, branch }),
      push:     (cwd: string)                  => api('/api/git/push',      { cwd }),
      pull:     (cwd: string)                  => api('/api/git/pull',      { cwd }),
      stash:         (cwd: string)                   => api('/api/git/stash',          { cwd }),
      stashPop:      (cwd: string)                   => api('/api/git/stash-pop',      { cwd }),
      stashList:     (cwd: string)                   => api('/api/git/stash-list',     { cwd }),
      init:          (cwd: string)                   => api('/api/git/init',           { cwd }),
      discard:       (cwd: string, file: string)     => api('/api/git/discard',        { cwd, file }),
      diff:          (cwd: string, file: string, staged?: boolean) => api('/api/git/diff', { cwd, file, staged: staged ?? false }),
      createBranch:  (cwd: string, branch: string)  => api('/api/git/create-branch',  { cwd, branch }),
      deleteBranch:  (cwd: string, branch: string)  => api('/api/git/delete-branch',  { cwd, branch }),
      fetch:         (cwd: string)                   => api('/api/git/fetch',          { cwd }),
      remoteList:    (cwd: string)                   => api('/api/git/remote-list',    { cwd }),
      resetSoft:     (cwd: string)                   => api('/api/git/reset-soft',     { cwd }),
      aheadBehind:   (cwd: string)                   => api('/api/git/ahead-behind',   { cwd }),
    },

    gitEx: {
      blame: (cwd: string, file: string) => api('/api/git/blame', { cwd, file }),
    },

    // ── Filesystem (Go engine) ────────────────────────────────────────────
    fs: {
      readTree:               (rootPath: string, maxDepth?: number)                 => api('/api/fs/tree',         { rootPath, maxDepth }),
      readFile:               (filePath: string)                                    => api('/api/fs/read',         { filePath }),
      writeFile:              (filePath: string, content: string)                   => api('/api/fs/write',        { filePath, content }),
      createFile:             (filePath: string)                                    => api('/api/fs/create-file',  { filePath }),
      createFolder:           (folderPath: string)                                  => api('/api/fs/create-dir',   { folderPath }),
      deleteItem:             (itemPath: string)                                    => api('/api/fs/delete',       { itemPath }),
      renameItem:             (oldPath: string, newPath: string)                    => api('/api/fs/rename',       { oldPath, newPath }),
      copyFolder:             (srcPath: string, destPath: string)                   => api('/api/fs/copy-folder',  { srcPath, destPath }),
      copyFile:               (srcPath: string, destPath: string)                   => api('/api/fs/copy-file',    { srcPath, destPath }),
      showInFolder:           (itemPath: string)                                    => revealItemInDir(itemPath).catch(() => {}),
      scanImports:            (rootPath: string)                                    => api('/api/fs/scan-imports', { rootPath }),
      ensureDefaultWorkspace: ()                                                    => api('/api/workspace/ensure-default'),
      getWorkspace:           ()                                                    => api('/api/workspace/get'),
      saveWorkspace:          (workspacePath: string)                               => api('/api/workspace/save',        { workspacePath }),
      getRecentWorkspaces:    ()                                                    => api('/api/workspace/recent-get'),
      addRecentWorkspace:     (workspacePath: string)                               => api('/api/workspace/recent-add',  { workspacePath }),
      listAllFiles:           (rootPath: string, maxFiles?: number)                 => api('/api/fs/list-all',    { rootPath, maxFiles }),
      searchInFiles:          (rootPath: string, query: string, maxResults?: number, caseSensitive?: boolean)=> api('/api/fs/search', { rootPath, query, maxResults, caseSensitive }),
    },

    // ── AI (Go engine proxy) ──────────────────────────────────────────────
    ai: {
      chat: (messages: unknown[], apiKey: string, model: string, system: string, provider: string) =>
        api('/api/ai/chat', { provider, apiKey, model, system, messages }),
      streamUrl: () => `${engineUrl}/api/ai/stream`,
      ollamaModels: (host: string) =>
        api('/api/ai/ollama-models', { host }),
    },

    // ── Code tools (Go engine) ────────────────────────────────────────────
    tools: {
      formatCode: (code: string, lang: string) => api('/api/fs/format',      { code, lang }),
      getScripts:  (rootPath: string)           => api('/api/fs/get-scripts', { rootPath }),
    },

    // ── Terminal shell exec (Go engine) ──────────────────────────────────
    terminal: {
      exec: (cmd: string, cwd: string) =>
        api<{ stdout: string; stderr: string }>('/api/terminal/exec', { cmd, cwd }),
    },

    // ── Menu event bus ────────────────────────────────────────────────────
    on: (channel: string, cb: MenuCallback) => {
      if (!menuListeners.has(channel)) menuListeners.set(channel, new Set())
      menuListeners.get(channel)!.add(cb)
    },
    off: (channel: string, cb: MenuCallback) => {
      menuListeners.get(channel)?.delete(cb)
    },
  }

  ;(window as unknown as { electronAPI: typeof electronAPI }).electronAPI = electronAPI
}
