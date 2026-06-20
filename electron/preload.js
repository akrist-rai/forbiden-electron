const { contextBridge, ipcRenderer } = require('electron')
const os = require('os')

// ── Get Go engine URL synchronously before page loads ─────────
const engineHost = ipcRenderer.sendSync('engine:get-url') || '127.0.0.1:49373'
const API  = `http://${engineHost}`
const WS   = `ws://${engineHost}`

// ── Thin fetch helper ─────────────────────────────────────────
async function api(path, body = {}) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ── Expose to renderer ────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  homeDir:  os.homedir(),

  // ── Engine meta ────────────────────────────────────────────
  engine: {
    url:   API,
    wsUrl: WS,
    host:  engineHost,
  },

  // ── Code execution (capture mode — for console panel) ──────
  run: {
    code: (lang, code, stdin = '') => api('/api/run/code', { lang, code, stdin }),
  },

  // ── Terminal run injection ─────────────────────────────────
  runInTerminal: (ptyId, lang, code, cwd) =>
    api('/api/run', { ptyId, lang, code, cwd }),

  // ── PTY terminal — WebSocket URL builder ───────────────────
  // Components open WebSocket directly; this just builds URLs.
  pty: {
    wsUrl: (id, cols, rows, cwd) => {
      const p = new URLSearchParams({ id, cols: String(cols), rows: String(rows), cwd })
      return `${WS}/ws/pty?${p}`
    },
    // Direct PTY write — injects raw text into the session
    write: (id, text) => api('/api/pty/write', { id, text }),
  },

  // ── File-system watcher ────────────────────────────────────
  watch: {
    wsUrl: (root) => `${WS}/ws/watch?root=${encodeURIComponent(root)}`,
  },

  // ── Window controls ────────────────────────────────────────
  window: {
    minimize:         ()   => ipcRenderer.invoke('window:minimize'),
    maximize:         ()   => ipcRenderer.invoke('window:maximize'),
    close:            ()   => ipcRenderer.invoke('window:close'),
    isMaximized:      ()   => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb) => ipcRenderer.on('window:maximized-change', (_e, v) => cb(v)),
    offMaximizeChange:(cb) => ipcRenderer.removeListener('window:maximized-change', cb),
  },

  // ── Native file dialogs (must stay in Electron) ────────────
  dialog: {
    openFolder: ()                     => ipcRenderer.invoke('dialog:open-folder'),
    saveFile:   (defaultName, content) => ipcRenderer.invoke('dialog:save-file', { defaultName, content }),
    openFiles:  ()                     => ipcRenderer.invoke('dialog:open-files'),
    showItem:   (itemPath)             => ipcRenderer.invoke('dialog:show-item', { itemPath }),
  },

  // ── Git ────────────────────────────────────────────────────
  git: {
    status:   (cwd)          => api('/api/git/status',    { cwd }),
    log:      (cwd)          => api('/api/git/log',       { cwd }),
    logGraph: (cwd, limit)   => api('/api/git/log-graph', { cwd, limit }),
    branch:   (cwd)          => api('/api/git/branch',    { cwd }),
    branches: (cwd)          => api('/api/git/branches',  { cwd }),
    commit:   (cwd, message) => api('/api/git/commit',    { cwd, message }),
    stage:    (cwd, files)   => api('/api/git/stage',     { cwd, files }),
    unstage:  (cwd, files)   => api('/api/git/unstage',   { cwd, files }),
    checkout: (cwd, branch)  => api('/api/git/checkout',  { cwd, branch }),
    push:     (cwd)          => api('/api/git/push',      { cwd }),
    pull:     (cwd)          => api('/api/git/pull',      { cwd }),
    stash:    (cwd)          => api('/api/git/stash',     { cwd }),
    stashPop: (cwd)          => api('/api/git/stash-pop', { cwd }),
    init:     (cwd)          => api('/api/git/init',      { cwd }),
    discard:  (cwd, file)    => api('/api/git/discard',   { cwd, file }),
    diff:     (cwd, file)    => api('/api/git/diff',      { cwd, file }),
  },

  // ── Git extended ───────────────────────────────────────────
  gitEx: {
    blame: (cwd, file) => api('/api/git/blame', { cwd, file }),
  },

  // ── Filesystem ─────────────────────────────────────────────
  fs: {
    readTree:               (rootPath, maxDepth)            => api('/api/fs/tree',                    { rootPath, maxDepth }),
    readFile:               (filePath)                      => api('/api/fs/read',                    { filePath }),
    writeFile:              (filePath, content)             => api('/api/fs/write',                   { filePath, content }),
    createFile:             (filePath)                      => api('/api/fs/create-file',             { filePath }),
    createFolder:           (folderPath)                    => api('/api/fs/create-dir',              { folderPath }),
    deleteItem:             (itemPath)                      => api('/api/fs/delete',                  { itemPath }),
    renameItem:             (oldPath, newPath)              => api('/api/fs/rename',                  { oldPath, newPath }),
    copyFolder:             (srcPath, destPath)             => api('/api/fs/copy-folder',             { srcPath, destPath }),
    copyFile:               (srcPath, destPath)             => api('/api/fs/copy-file',               { srcPath, destPath }),
    showInFolder:           (itemPath)                      => ipcRenderer.invoke('dialog:show-item', { itemPath }),
    scanImports:            (rootPath)                      => api('/api/fs/scan-imports',            { rootPath }),
    ensureDefaultWorkspace: ()                              => api('/api/fs/ensure-default-workspace',{}),
    getWorkspace:           ()                              => api('/api/fs/get-workspace',           {}),
    saveWorkspace:          (workspacePath)                 => api('/api/fs/save-workspace',          { workspacePath }),
    getRecentWorkspaces:    ()                              => api('/api/fs/get-recent-workspaces',   {}),
    addRecentWorkspace:     (p)                             => api('/api/fs/add-recent-workspace',    { workspacePath: p }),
    listAllFiles:           (rootPath, maxFiles)            => api('/api/fs/list-all',                { rootPath, maxFiles }),
    searchInFiles:          (rootPath, query, maxResults)   => api('/api/fs/search',                  { rootPath, query, maxResults }),
  },

  // ── AI ─────────────────────────────────────────────────────
  ai: {
    chat:         (messages, apiKey, model, system, provider) => api('/api/ai/chat',          { messages, apiKey, model, system, provider }),
    streamUrl:    ()                                           => `${API}/api/ai/stream`,
    ollamaModels: (host)                                       => api('/api/ai/ollama-models', { host }),
  },

  // ── Code tools ─────────────────────────────────────────────
  tools: {
    formatCode: (code, lang) => api('/api/fs/format-code', { code, lang }),
    getScripts:  (rootPath)  => api('/api/fs/get-scripts', { rootPath }),
  },

  // ── Inline terminal shell execution ────────────────────────
  terminal: {
    exec: (cmd, cwd) => ipcRenderer.invoke('terminal:exec', { cmd, cwd }),
  },

  // ── Menu events ────────────────────────────────────────────
  on:  (channel, cb) => {
    const allowed = ['menu:open-folder', 'menu:save-file', 'menu:run-active', 'menu:toggle-terminal']
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, ...args) => cb(...args))
  },
  off: (channel, cb) => ipcRenderer.removeListener(channel, cb),
})
