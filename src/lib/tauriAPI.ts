// ══════════════════════════════════════════════════════════════════════════════
//  TAURI NATIVE API
//  All heavy ops (FS, git, run, AI) go through Tauri IPC invoke — zero TCP.
//  Only PTY WebSocket + file-watcher WS still route to the Go sidecar.
// ══════════════════════════════════════════════════════════════════════════════

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as dialogOpen, save as dialogSave } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'

// ── PTY/WS engine URL (only needed for WebSocket terminal) ────────────────────

let engineHost = '127.0.0.1:49373'
let WS = `ws://${engineHost}`

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

export async function initTauriAPI(): Promise<void> {
  // Fetch Go engine URL — only needed for PTY WS
  try {
    const url = await invoke<string>('get_engine_url')
    if (url) {
      const match = url.match(/https?:\/\/(.+)/)
      if (match) {
        engineHost = match[1]
        WS = url.replace(/^http/, 'ws')
      }
    }
  } catch { /* PTY will use fallback port */ }

  await setupMaximizeListener()

  const homeDir: string = await invoke<string>('get_home_dir').catch(() => '/')
  const platform: string = await invoke<string>('get_platform').catch(() => 'linux')

  const electronAPI = {
    platform,
    homeDir,

    engine: {
      url:   `http://${engineHost}`,
      wsUrl: WS,
      host:  engineHost,
    },

    // ── Code run (Rust native) ─────────────────────────────────────────────
    run: {
      code: (lang: string, code: string, stdin = '') =>
        invoke('run_code', { lang, code, stdin }),
    },

    runInTerminal: (ptyId: string, lang: string, code: string, cwd: string) => {
      // PTY inject still goes via Go WS; use engine HTTP for this one
      return fetch(`http://${engineHost}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ptyId, lang, code, cwd }),
      }).then(r => r.json())
    },

    // ── PTY WebSocket (Go engine handles terminal I/O) ─────────────────────
    pty: {
      wsUrl: (id: string, cols: number, rows: number, cwd: string) => {
        const p = new URLSearchParams({ id, cols: String(cols), rows: String(rows), cwd })
        return `${WS}/ws/pty?${p}`
      },
      write: (id: string, text: string) =>
        fetch(`http://${engineHost}/api/pty/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, text }),
        }).then(r => r.json()),
    },

    // ── File watcher WS (Go engine) ────────────────────────────────────────
    watch: {
      wsUrl: (root: string) => `${WS}/ws/watch?root=${encodeURIComponent(root)}`,
    },

    // ── Window controls ────────────────────────────────────────────────────
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

    // ── File dialogs ───────────────────────────────────────────────────────
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
          await invoke('fs_write', { filePath, content })
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
        const paths = Array.isArray(result) ? result : [result]
        return Promise.all(paths.map(async (p: string) => {
          const r = await invoke<{ content?: string }>('fs_read', { filePath: p })
          return { path: p, name: p.split('/').pop() ?? p, content: (r as any)?.content ?? '' }
        }))
      },

      showItem: async (itemPath: string) => {
        try { await revealItemInDir(itemPath); return { success: true } }
        catch { return { success: false } }
      },
    },

    // ── Git (Rust native, zero TCP) ───────────────────────────────────────
    git: {
      status:   (cwd: string)                  => invoke('git_status',   { cwd }),
      log:      (cwd: string)                  => invoke('git_log',      { cwd }),
      logGraph: (cwd: string, limit: number)   => invoke('git_log_graph',{ cwd, limit }),
      branch:   (cwd: string)                  => invoke('git_branch',   { cwd }),
      branches: (cwd: string)                  => invoke('git_branches', { cwd }),
      commit:   (cwd: string, message: string) => invoke('git_commit',   { cwd, message }),
      stage:    (cwd: string, files: string[]) => invoke('git_stage',    { cwd, files }),
      unstage:  (cwd: string, files: string[]) => invoke('git_unstage',  { cwd, files }),
      checkout: (cwd: string, branch: string)  => invoke('git_checkout', { cwd, branch }),
      push:     (cwd: string)                  => invoke('git_push',     { cwd }),
      pull:     (cwd: string)                  => invoke('git_pull',     { cwd }),
      stash:    (cwd: string)                  => invoke('git_stash',    { cwd }),
      stashPop: (cwd: string)                  => invoke('git_stash_pop',{ cwd }),
      init:     (cwd: string)                  => invoke('git_init',     { cwd }),
      discard:  (cwd: string, file: string)    => invoke('git_discard',  { cwd, file }),
      diff:     (cwd: string, file: string)    => invoke('git_diff',     { cwd, file }),
    },

    gitEx: {
      blame: (cwd: string, file: string) => invoke('git_blame', { cwd, file }),
    },

    // ── Filesystem (Rust native, zero TCP) ───────────────────────────────
    fs: {
      readTree:               (rootPath: string, maxDepth?: number)                => invoke('fs_tree',              { rootPath, maxDepth }),
      readFile:               (filePath: string)                                    => invoke('fs_read',              { filePath }),
      writeFile:              (filePath: string, content: string)                   => invoke('fs_write',             { filePath, content }),
      createFile:             (filePath: string)                                    => invoke('fs_create_file',       { filePath }),
      createFolder:           (folderPath: string)                                  => invoke('fs_create_dir',        { folderPath }),
      deleteItem:             (itemPath: string)                                    => invoke('fs_delete',            { itemPath }),
      renameItem:             (oldPath: string, newPath: string)                    => invoke('fs_rename',            { oldPath, newPath }),
      copyFolder:             (srcPath: string, destPath: string)                   => invoke('fs_copy_folder',       { srcPath, destPath }),
      copyFile:               (srcPath: string, destPath: string)                   => invoke('fs_copy_file',         { srcPath, destPath }),
      showInFolder:           (itemPath: string)                                    => revealItemInDir(itemPath).catch(() => {}),
      scanImports:            (rootPath: string)                                    => invoke('fs_scan_imports',      { rootPath }),
      ensureDefaultWorkspace: ()                                                    => invoke('workspace_ensure_default'),
      getWorkspace:           ()                                                    => invoke('workspace_get'),
      saveWorkspace:          (workspacePath: string)                               => invoke('workspace_save',       { workspacePath }),
      getRecentWorkspaces:    ()                                                    => invoke('workspace_recent_get'),
      addRecentWorkspace:     (workspacePath: string)                               => invoke('workspace_recent_add', { workspacePath }),
      listAllFiles:           (rootPath: string, maxFiles?: number)                 => invoke('fs_list_all',          { rootPath, maxFiles }),
      searchInFiles:          (rootPath: string, query: string, maxResults?: number)=> invoke('fs_search',            { rootPath, query, maxResults }),
    },

    // ── AI (Rust reqwest proxy, no JS fetch overhead) ─────────────────────
    ai: {
      chat: (messages: unknown[], apiKey: string, model: string, system: string, provider: string) =>
        invoke('ai_chat', { provider, apiKey, model, system, messages }),
      // Streaming still goes via Go SSE endpoint (Tauri IPC doesn't stream yet)
      streamUrl: () => `http://${engineHost}/api/ai/stream`,
      ollamaModels: (host: string) =>
        fetch(`http://${engineHost}/api/ai/ollama-models`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host }),
        }).then(r => r.json()),
    },

    // ── Code tools (Rust native) ──────────────────────────────────────────
    tools: {
      formatCode: (code: string, lang: string) => invoke('fs_format_code', { code, lang }),
      getScripts:  (rootPath: string)           => invoke('fs_get_scripts', { rootPath }),
    },

    // ── Terminal shell exec ───────────────────────────────────────────────
    terminal: {
      exec: (cmd: string, cwd: string) =>
        invoke<{ stdout: string; stderr: string }>('terminal_exec', { cmd, cwd }),
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
