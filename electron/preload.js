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

  // ── Terminal ───────────────────────────────────────────────
  terminal: {
    exec: (cmd, cwd) => ipcRenderer.invoke('terminal-exec', { cmd, cwd }),
  },

  // ── Git ────────────────────────────────────────────────────
  git: {
    status: (cwd) => ipcRenderer.invoke('git-status', { cwd }),
    log:    (cwd) => ipcRenderer.invoke('git-log',    { cwd }),
    branch: (cwd) => ipcRenderer.invoke('git-branch', { cwd }),
    commit: (cwd, message) => ipcRenderer.invoke('git-commit', { cwd, message }),
  },

  // ── Dialogs ────────────────────────────────────────────────
  dialog: {
    openFolder: ()                     => ipcRenderer.invoke('dialog:open-folder'),
    saveFile:   (defaultName, content) => ipcRenderer.invoke('dialog:save-file', { defaultName, content }),
    openFiles:  ()                     => ipcRenderer.invoke('dialog:open-files'),
  },

  // ── Filesystem (VS Code-style explorer) ────────────────────
  fs: {
    readTree:    (rootPath, maxDepth) => ipcRenderer.invoke('fs:readTree',    { rootPath, maxDepth }),
    readFile:    (filePath)           => ipcRenderer.invoke('fs:readFile',    { filePath }),
    writeFile:   (filePath, content)  => ipcRenderer.invoke('fs:writeFile',   { filePath, content }),
    createFile:  (filePath)           => ipcRenderer.invoke('fs:createFile',  { filePath }),
    createFolder:(folderPath)         => ipcRenderer.invoke('fs:createFolder', { folderPath }),
    deleteItem:  (itemPath)           => ipcRenderer.invoke('fs:deleteItem',  { itemPath }),
    renameItem:  (oldPath, newPath)   => ipcRenderer.invoke('fs:renameItem',  { oldPath, newPath }),
    copyFolder:  (srcPath, destPath)  => ipcRenderer.invoke('fs:copyFolder',  { srcPath, destPath }),
    copyFile:    (srcPath, destPath)  => ipcRenderer.invoke('fs:copyFile',    { srcPath, destPath }),
    showInFolder:(itemPath)           => ipcRenderer.invoke('fs:showInFolder', { itemPath }),
    scanImports: (rootPath)           => ipcRenderer.invoke('fs:scanImports', { rootPath }),
  },

  // ── Menu events (renderer listens for native menu actions) ─
  on: (channel, cb) => {
    const allowed = ['menu:open-folder', 'menu:save-file', 'menu:run-active', 'menu:toggle-terminal']
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_e, ...args) => cb(...args))
    }
  },
  off: (channel, cb) => {
    ipcRenderer.removeListener(channel, cb)
  },
})
