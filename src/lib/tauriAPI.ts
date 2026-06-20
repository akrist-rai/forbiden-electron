// ══════════════════════════════════════════════════════════════════════════════
//  TAURI COMPATIBILITY SHIM
//  Exposes window.electronAPI with the exact same shape as the old Electron
//  preload, implemented using Tauri 2.x JS APIs and plugins.
// ══════════════════════════════════════════════════════════════════════════════

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as dialogOpen, save as dialogSave } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { open as shellOpen } from '@tauri-apps/plugin-shell'

// ── Engine URL (resolved once at startup) ────────────────────────────────────

let engineHost = '127.0.0.1:49373'
let API  = `http://${engineHost}`
let WS   = `ws://${engineHost}`

async function apiPost(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ── Maximize change subscriptions ─────────────────────────────────────────────

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

// ── Menu event emulation via CustomEvents ─────────────────────────────────────

type MenuChannel = 'menu:open-folder' | 'menu:save-file' | 'menu:run-active' | 'menu:toggle-terminal'
type MenuCallback = (...args: unknown[]) => void

const menuListeners = new Map<string, Set<MenuCallback>>()

function emitMenuEvent(channel: MenuChannel, ...args: unknown[]) {
  menuListeners.get(channel)?.forEach(cb => cb(...args))
}

// Expose for menu items triggered from within the renderer (TitleBar menus).
// Tauri apps drive menus from the frontend, so we emit these as needed.
;(window as unknown as { __emitMenuEvent: typeof emitMenuEvent }).__emitMenuEvent = emitMenuEvent

// ── Build and export the API object ──────────────────────────────────────────

export async function initTauriAPI(): Promise<void> {
  // Resolve the Go engine URL from the Rust backend
  try {
    const url = await invoke<string>('get_engine_url')
    if (url) {
      // url is like "http://127.0.0.1:PORT"
      const match = url.match(/https?:\/\/(.+)/)
      if (match) {
        engineHost = match[1]
        API = url
        WS  = url.replace(/^http/, 'ws')
      }
    }
  } catch (e) {
    console.warn('[tauriAPI] get_engine_url failed, using fallback', e)
  }

  // Setup maximize listener
  await setupMaximizeListener()

  const homeDir: string = await invoke<string>('get_home_dir').catch(() => '/')
  const platform: string = await invoke<string>('get_platform').catch(() => 'linux')

  // ── The shim object — same interface as electron/preload.js ─────────────────
  const electronAPI = {
    platform,
    homeDir,

    engine: {
      url:   API,
      wsUrl: WS,
      host:  engineHost,
    },

    run: {
      code: (lang: string, code: string, stdin = '') =>
        apiPost('/api/run/code', { lang, code, stdin }),
    },

    runInTerminal: (ptyId: string, lang: string, code: string, cwd: string) =>
      apiPost('/api/run', { ptyId, lang, code, cwd }),

    pty: {
      wsUrl: (id: string, cols: number, rows: number, cwd: string) => {
        const p = new URLSearchParams({ id, cols: String(cols), rows: String(rows), cwd })
        return `${WS}/ws/pty?${p}`
      },
      write: (id: string, text: string) => apiPost('/api/pty/write', { id, text }),
    },

    watch: {
      wsUrl: (root: string) => `${WS}/ws/watch?root=${encodeURIComponent(root)}`,
    },

    // ── Window controls ──────────────────────────────────────────────────────
    window: {
      minimize: () => getCurrentWindow().minimize(),
      maximize: async () => {
        const win = getCurrentWindow()
        if (await win.isMaximized()) {
          await win.unmaximize()
        } else {
          await win.maximize()
        }
      },
      close: () => getCurrentWindow().close(),
      isMaximized: () => getCurrentWindow().isMaximized(),
      onMaximizeChange: (cb: MaximizeHandler) => {
        maximizeHandlers.add(cb)
      },
      offMaximizeChange: (cb: MaximizeHandler) => {
        maximizeHandlers.delete(cb)
        if (maximizeHandlers.size === 0 && maximizeUnlisten) {
          maximizeUnlisten()
          maximizeUnlisten = null
        }
      },
      toggleDevTools: () => {
        // Tauri 2.x: open devtools via invoke (only available in debug builds)
        invoke('plugin:webview|open_devtools').catch(() => {})
      },
    },

    // ── File dialogs ─────────────────────────────────────────────────────────
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
          await apiPost('/api/fs/write', { filePath, content })
          return { success: true, filePath }
        } catch {
          return { success: false }
        }
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
        const paths = Array.isArray(result) ? result : [result]
        const files = await Promise.all(
          paths.map(async (p: string) => {
            const r = await apiPost('/api/fs/read', { filePath: p }) as { content?: string }
            return {
              path: p,
              name: p.split('/').pop() ?? p,
              content: r?.content ?? '',
            }
          })
        )
        return files
      },

      showItem: async (itemPath: string) => {
        try {
          await revealItemInDir(itemPath)
          return { success: true }
        } catch {
          return { success: false }
        }
      },
    },

    // ── Git ──────────────────────────────────────────────────────────────────
    git: {
      status:   (cwd: string)                => apiPost('/api/git/status',    { cwd }),
      log:      (cwd: string)                => apiPost('/api/git/log',       { cwd }),
      logGraph: (cwd: string, limit: number) => apiPost('/api/git/log-graph', { cwd, limit }),
      branch:   (cwd: string)                => apiPost('/api/git/branch',    { cwd }),
      branches: (cwd: string)                => apiPost('/api/git/branches',  { cwd }),
      commit:   (cwd: string, message: string) => apiPost('/api/git/commit',  { cwd, message }),
      stage:    (cwd: string, files: string[]) => apiPost('/api/git/stage',   { cwd, files }),
      unstage:  (cwd: string, files: string[]) => apiPost('/api/git/unstage', { cwd, files }),
      checkout: (cwd: string, branch: string)  => apiPost('/api/git/checkout',{ cwd, branch }),
      push:     (cwd: string)                => apiPost('/api/git/push',      { cwd }),
      pull:     (cwd: string)                => apiPost('/api/git/pull',      { cwd }),
      stash:    (cwd: string)                => apiPost('/api/git/stash',     { cwd }),
      stashPop: (cwd: string)                => apiPost('/api/git/stash-pop', { cwd }),
      init:     (cwd: string)                => apiPost('/api/git/init',      { cwd }),
      discard:  (cwd: string, file: string)  => apiPost('/api/git/discard',   { cwd, file }),
      diff:     (cwd: string, file: string)  => apiPost('/api/git/diff',      { cwd, file }),
    },

    gitEx: {
      blame: (cwd: string, file: string) => apiPost('/api/git/blame', { cwd, file }),
    },

    // ── Filesystem ───────────────────────────────────────────────────────────
    fs: {
      readTree:               (rootPath: string, maxDepth?: number)               => apiPost('/api/fs/tree',                    { rootPath, maxDepth }),
      readFile:               (filePath: string)                                   => apiPost('/api/fs/read',                    { filePath }),
      writeFile:              (filePath: string, content: string)                  => apiPost('/api/fs/write',                   { filePath, content }),
      createFile:             (filePath: string)                                   => apiPost('/api/fs/create-file',             { filePath }),
      createFolder:           (folderPath: string)                                 => apiPost('/api/fs/create-dir',              { folderPath }),
      deleteItem:             (itemPath: string)                                   => apiPost('/api/fs/delete',                  { itemPath }),
      renameItem:             (oldPath: string, newPath: string)                   => apiPost('/api/fs/rename',                  { oldPath, newPath }),
      copyFolder:             (srcPath: string, destPath: string)                  => apiPost('/api/fs/copy-folder',             { srcPath, destPath }),
      copyFile:               (srcPath: string, destPath: string)                  => apiPost('/api/fs/copy-file',               { srcPath, destPath }),
      showInFolder:           (itemPath: string)                                   => revealItemInDir(itemPath).catch(() => {}),
      scanImports:            (rootPath: string)                                   => apiPost('/api/fs/scan-imports',            { rootPath }),
      ensureDefaultWorkspace: ()                                                   => apiPost('/api/fs/ensure-default-workspace',{}),
      getWorkspace:           ()                                                   => apiPost('/api/fs/get-workspace',           {}),
      saveWorkspace:          (workspacePath: string)                              => apiPost('/api/fs/save-workspace',          { workspacePath }),
      getRecentWorkspaces:    ()                                                   => apiPost('/api/fs/get-recent-workspaces',   {}),
      addRecentWorkspace:     (p: string)                                          => apiPost('/api/fs/add-recent-workspace',    { workspacePath: p }),
      listAllFiles:           (rootPath: string, maxFiles?: number)                => apiPost('/api/fs/list-all',                { rootPath, maxFiles }),
      searchInFiles:          (rootPath: string, query: string, maxResults?: number) => apiPost('/api/fs/search',               { rootPath, query, maxResults }),
    },

    // ── AI ───────────────────────────────────────────────────────────────────
    ai: {
      chat:         (messages: unknown[], apiKey: string, model: string, system: string, provider: string) =>
        apiPost('/api/ai/chat', { messages, apiKey, model, system, provider }),
      streamUrl:    () => `${API}/api/ai/stream`,
      ollamaModels: (host: string) => apiPost('/api/ai/ollama-models', { host }),
    },

    // ── Code tools ───────────────────────────────────────────────────────────
    tools: {
      formatCode: (code: string, lang: string) => apiPost('/api/fs/format-code', { code, lang }),
      getScripts:  (rootPath: string)           => apiPost('/api/fs/get-scripts', { rootPath }),
    },

    // ── Terminal shell exec (inline) ─────────────────────────────────────────
    terminal: {
      exec: (cmd: string, cwd: string) =>
        invoke<{ stdout: string; stderr: string }>('terminal_exec', { cmd, cwd }),
    },

    // ── Menu event bus ───────────────────────────────────────────────────────
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
