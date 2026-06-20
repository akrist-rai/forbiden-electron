const { app, BrowserWindow, shell, ipcMain, dialog, Menu } = require('electron')
const { spawn, exec } = require('child_process')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

// ── Engine process ────────────────────────────────────────────
let engineProc = null
let engineUrl  = null  // set when Go prints READY:PORT

function startEngine() {
  return new Promise((resolve, reject) => {
    const binName = process.platform === 'win32' ? 'forbiden-engine.exe' : 'forbiden-engine'
    // In packaged builds, extraResources land in process.resourcesPath (next to app.asar).
    // In dev, the binary sits next to main.js in the electron/ directory.
    const binPath = app.isPackaged
      ? path.join(process.resourcesPath, binName)
      : path.join(__dirname, binName)

    if (!fs.existsSync(binPath)) {
      reject(new Error('Engine binary not found: ' + binPath))
      return
    }

    engineProc = spawn(binPath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    engineProc.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const m = text.match(/READY:(\d+)/)
      if (m && !engineUrl) {
        engineUrl = '127.0.0.1:' + m[1]
        resolve(engineUrl)
      }
    })

    engineProc.stderr.on('data', (d) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('[engine]', d.toString().trim())
      }
    })

    engineProc.on('error', reject)
    engineProc.on('exit', (code) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[engine] exited with', code)
      }
    })

    // Timeout safety
    setTimeout(() => reject(new Error('Engine startup timeout')), 8000)
  })
}

// ── Window state ──────────────────────────────────────────────
function getStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWinState() {
  try { return JSON.parse(fs.readFileSync(getStatePath(), 'utf8')) } catch { return null }
}
function saveWinState(win) {
  if (win.isMaximized() || win.isMinimized()) return
  try { fs.writeFileSync(getStatePath(), JSON.stringify(win.getBounds())) } catch {}
}

// ── Menu ──────────────────────────────────────────────────────
function buildMenu(win) {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder…',  accelerator: 'CmdOrCtrl+Shift+O', click: () => win?.webContents.send('menu:open-folder') },
        { label: 'Save File',     accelerator: 'CmdOrCtrl+S',       click: () => win?.webContents.send('menu:save-file') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Run',
      submenu: [
        { label: 'Run Active File', accelerator: 'CmdOrCtrl+Enter', click: () => win?.webContents.send('menu:run-active') },
        { label: 'Open Terminal',   accelerator: 'Ctrl+`',          click: () => win?.webContents.send('menu:toggle-terminal') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About FORBIDEN', click: () => dialog.showMessageBox({ title: 'FORBIDEN', message: 'FORBIDEN Graph IDE\nVersion 2.3.0\n\nElectron + React + Go Engine' }) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC: engine URL (sync) ────────────────────────────────────
ipcMain.on('engine:get-url', (event) => {
  event.returnValue = engineUrl || '127.0.0.1:49373'
})

// ── IPC: native dialogs ───────────────────────────────────────
ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:save-file', async (_e, { defaultName, content }) => {
  const result = await dialog.showSaveDialog({ defaultPath: defaultName })
  if (result.canceled || !result.filePath) return { success: false }
  fs.writeFileSync(result.filePath, content, 'utf8')
  return { success: true, filePath: result.filePath }
})

ipcMain.handle('dialog:open-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Code', extensions: ['js','ts','jsx','tsx','py','c','cpp','go','md','json','yaml','yml','sh','html','css'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled) return []
  return result.filePaths.map(p => ({
    path: p,
    name: path.basename(p),
    content: fs.readFileSync(p, 'utf8'),
  }))
})

ipcMain.handle('dialog:show-item', async (_e, { itemPath }) => {
  shell.showItemInFolder(itemPath)
  return { success: true }
})

// ── IPC: window controls ──────────────────────────────────────
let mainWin = null

ipcMain.handle('window:minimize',    () => { mainWin?.minimize() })
ipcMain.handle('window:maximize',    () => { if (!mainWin) return; mainWin.isMaximized() ? mainWin.unmaximize() : mainWin.maximize() })
ipcMain.handle('window:close',       () => { mainWin?.close() })
ipcMain.handle('window:isMaximized', () => mainWin?.isMaximized() ?? false)

// ── IPC: misc ─────────────────────────────────────────────────
ipcMain.handle('get-home-dir',  () => os.homedir())
ipcMain.handle('get-platform',  () => process.platform)
ipcMain.handle('get-user-data', () => app.getPath('userData'))

// ── IPC: inline terminal shell exec ──────────────────────────
ipcMain.handle('terminal:exec', (_e, { cmd, cwd }) => {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: 15000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || (err && !stderr ? err.message : '') })
    })
  })
})

// ── Create window ─────────────────────────────────────────────
function createWindow() {
  const saved = loadWinState()
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'assets', 'icon.png')
  const win = new BrowserWindow({
    width:  saved?.width  ?? 1440,
    height: saved?.height ?? 900,
    x: saved?.x,
    y: saved?.y,
    minWidth:  960,
    minHeight: 600,
    backgroundColor: '#0b0b0f',
    titleBarStyle: 'hidden',
    frame: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  mainWin = win
  buildMenu(win)

  win.on('maximize',   () => win.webContents.send('window:maximized-change', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized-change', false))

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    win.loadURL('http://localhost:5175')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.on('close', () => { saveWinState(win); mainWin = null })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    await startEngine()
  } catch (err) {
    console.error('Failed to start engine:', err.message)
    // Continue anyway — preload will use fallback port
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (engineProc) { try { engineProc.kill() } catch {} }
    app.quit()
  }
})

app.on('before-quit', () => {
  if (engineProc) { try { engineProc.kill() } catch {} }
})
