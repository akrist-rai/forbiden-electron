const { contextBridge, ipcRenderer } = require('electron')
const os = require('os')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  homeDir:  os.homedir(),

  // ── Code execution ─────────────────────────────────────────
  run: {
    code: (lang, code, stdin = '') =>
      ipcRenderer.invoke('run-code', { lang, code, stdin }),
  },

  // ── Terminal (legacy exec — kept for compatibility) ────────
  terminal: {
    exec: (cmd, cwd) => ipcRenderer.invoke('terminal-exec', { cmd, cwd }),
  },

  // ── PTY terminal (real shell via node-pty) ─────────────────
  // Single master IPC listener per channel; React components just add/remove callbacks.
  // This prevents duplicate writes when components remount or HMR fires.
  pty: (() => {
    const dataCallbacks = new Set()
    const exitCallbacks = new Set()
    ipcRenderer.on('pty:data', (_ev, id, data) => dataCallbacks.forEach(cb => cb(id, data)))
    ipcRenderer.on('pty:exit', (_ev, id)       => exitCallbacks.forEach(cb => cb(id)))
    return {
      create:  (id, cols, rows, cwd) => ipcRenderer.invoke('pty:create', { id, cols, rows, cwd }),
      write:   (id, data)            => ipcRenderer.invoke('pty:write',  { id, data }),
      resize:  (id, cols, rows)      => ipcRenderer.invoke('pty:resize', { id, cols, rows }),
      kill:    (id)                  => ipcRenderer.invoke('pty:kill',   { id }),
      onData:  (cb) => dataCallbacks.add(cb),
      offData: (cb) => dataCallbacks.delete(cb),
      onExit:  (cb) => exitCallbacks.add(cb),
      offExit: (cb) => exitCallbacks.delete(cb),
    }
  })(),

  // ── Window controls ────────────────────────────────────────
  window: {
    minimize:         ()   => ipcRenderer.invoke('window:minimize'),
    maximize:         ()   => ipcRenderer.invoke('window:maximize'),
    close:            ()   => ipcRenderer.invoke('window:close'),
    isMaximized:      ()   => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb) => ipcRenderer.on('window:maximized-change', cb),
    offMaximizeChange:(cb) => ipcRenderer.removeListener('window:maximized-change', cb),
  },

  // ── Git ────────────────────────────────────────────────────
  git: {
    // existing
    status:   (cwd)           => ipcRenderer.invoke('git-status',   { cwd }),
    log:      (cwd)           => ipcRenderer.invoke('git-log',      { cwd }),
    logGraph: (cwd, limit)   => ipcRenderer.invoke('git-log-graph', { cwd, limit }),
    branch:   (cwd)           => ipcRenderer.invoke('git-branch',   { cwd }),
    commit:   (cwd, message)  => ipcRenderer.invoke('git-commit',   { cwd, message }),
    // extended
    diff:     (cwd, file)     => ipcRenderer.invoke('git-diff',     { cwd, file }),
    stage:    (cwd, files)    => ipcRenderer.invoke('git-stage',    { cwd, files }),
    unstage:  (cwd, files)    => ipcRenderer.invoke('git-unstage',  { cwd, files }),
    branches: (cwd)           => ipcRenderer.invoke('git-branches', { cwd }),
    checkout: (cwd, branch)   => ipcRenderer.invoke('git-checkout', { cwd, branch }),
    push:     (cwd)           => ipcRenderer.invoke('git-push',     { cwd }),
    pull:     (cwd)           => ipcRenderer.invoke('git-pull',     { cwd }),
    stash:    (cwd)           => ipcRenderer.invoke('git-stash',    { cwd }),
    stashPop: (cwd)           => ipcRenderer.invoke('git-stash-pop',{ cwd }),
    init:     (cwd)           => ipcRenderer.invoke('git-init',     { cwd }),
    discard:  (cwd, file)     => ipcRenderer.invoke('git-discard',  { cwd, file }),
  },

  // ── Dialogs ────────────────────────────────────────────────
  dialog: {
    openFolder: ()                     => ipcRenderer.invoke('dialog:open-folder'),
    saveFile:   (defaultName, content) => ipcRenderer.invoke('dialog:save-file', { defaultName, content }),
    openFiles:  ()                     => ipcRenderer.invoke('dialog:open-files'),
  },

  // ── Filesystem ─────────────────────────────────────────────
  fs: {
    readTree:               (rootPath, maxDepth) => ipcRenderer.invoke('fs:readTree',                { rootPath, maxDepth }),
    readFile:               (filePath)           => ipcRenderer.invoke('fs:readFile',               { filePath }),
    writeFile:              (filePath, content)  => ipcRenderer.invoke('fs:writeFile',              { filePath, content }),
    createFile:             (filePath)           => ipcRenderer.invoke('fs:createFile',             { filePath }),
    createFolder:           (folderPath)         => ipcRenderer.invoke('fs:createFolder',           { folderPath }),
    deleteItem:             (itemPath)           => ipcRenderer.invoke('fs:deleteItem',             { itemPath }),
    renameItem:             (oldPath, newPath)   => ipcRenderer.invoke('fs:renameItem',             { oldPath, newPath }),
    copyFolder:             (srcPath, destPath)  => ipcRenderer.invoke('fs:copyFolder',             { srcPath, destPath }),
    copyFile:               (srcPath, destPath)  => ipcRenderer.invoke('fs:copyFile',              { srcPath, destPath }),
    showInFolder:           (itemPath)           => ipcRenderer.invoke('fs:showInFolder',           { itemPath }),
    scanImports:            (rootPath)           => ipcRenderer.invoke('fs:scanImports',            { rootPath }),
    ensureDefaultWorkspace: ()                   => ipcRenderer.invoke('fs:ensureDefaultWorkspace'),
    getWorkspace:           ()                   => ipcRenderer.invoke('fs:getWorkspace'),
    saveWorkspace:          (workspacePath)      => ipcRenderer.invoke('fs:saveWorkspace',          { workspacePath }),
    getRecentWorkspaces:    ()                   => ipcRenderer.invoke('fs:getRecentWorkspaces'),
    addRecentWorkspace:     (p)                  => ipcRenderer.invoke('fs:addRecentWorkspace',     { workspacePath: p }),
    listAllFiles:           (rootPath, maxFiles) => ipcRenderer.invoke('fs:listAllFiles',            { rootPath, maxFiles }),
    searchInFiles:          (rootPath, query, maxResults) => ipcRenderer.invoke('fs:searchInFiles', { rootPath, query, maxResults }),
  },

  // ── Git extended ───────────────────────────────────────────
  gitEx: {
    blame: (cwd, file) => ipcRenderer.invoke('git:blame', { cwd, file }),
  },

  // ── AI ─────────────────────────────────────────────────────
  ai: {
    chat: (messages, apiKey, model, system) => ipcRenderer.invoke('ai:chat', { messages, apiKey, model, system }),
  },

  // ── Code tools ─────────────────────────────────────────────
  tools: {
    formatCode: (code, lang) => ipcRenderer.invoke('fs:formatCode', { code, lang }),
    getScripts:  (rootPath)  => ipcRenderer.invoke('fs:getScripts',  { rootPath }),
  },

  // ── Menu events ────────────────────────────────────────────
  on: (channel, cb) => {
    const allowed = ['menu:open-folder', 'menu:save-file', 'menu:run-active', 'menu:toggle-terminal']
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, ...args) => cb(...args))
  },
  off: (channel, cb) => ipcRenderer.removeListener(channel, cb),
})
