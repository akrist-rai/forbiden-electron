const { app, BrowserWindow, shell, ipcMain, dialog, Menu } = require('electron')
const { spawn, exec }  = require('child_process')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

const isDev = process.env.NODE_ENV === 'development'

// ── Window state persistence ─────────────────────────────────
const statePath = path.join(app.getPath('userData'), 'window-state.json')

function loadWinState() {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')) } catch { return null }
}
function saveWinState(win) {
  if (win.isMaximized() || win.isMinimized()) return
  try { fs.writeFileSync(statePath, JSON.stringify(win.getBounds())) } catch {}
}

// ── Application menu ─────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: (_, win) => win?.webContents.send('menu:open-folder'),
        },
        {
          label: 'Save File…',
          accelerator: 'CmdOrCtrl+S',
          click: (_, win) => win?.webContents.send('menu:save-file'),
        },
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
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Run',
      submenu: [
        {
          label: 'Run Active File',
          accelerator: 'CmdOrCtrl+Enter',
          click: (_, win) => win?.webContents.send('menu:run-active'),
        },
        {
          label: 'Open Terminal',
          accelerator: 'Ctrl+`',
          click: (_, win) => win?.webContents.send('menu:toggle-terminal'),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About FORBIDEN',
          click: () => dialog.showMessageBox({
            title: 'FORBIDEN', icon: undefined,
            message: 'FORBIDEN Graph IDE\nVersion 2.1.0\n\nBuilt with Electron + React + Vite',
          }),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Run a subprocess and capture output ──────────────────────
function runProc(bin, args, opts = {}) {
  return new Promise(resolve => {
    const logs = []
    const t0 = Date.now()
    const ts  = () => Date.now()
    const child = spawn(bin, args, {
      cwd: opts.cwd || os.tmpdir(),
      timeout: opts.timeout || 30000,
      shell: false,
    })

    child.stdout.on('data', buf =>
      buf.toString().split('\n').forEach(l => { if (l) logs.push({ type: 'log', val: l, ts: ts() }) })
    )
    child.stderr.on('data', buf =>
      buf.toString().split('\n').forEach(l => { if (l) logs.push({ type: 'error', val: l, ts: ts() }) })
    )

    if (opts.stdin) {
      child.stdin.write(opts.stdin)
      child.stdin.end()
    }

    child.on('error', err => {
      logs.push({ type: 'error', val: err.message, ts: ts() })
      resolve({ logs, error: err.message, ms: Date.now() - t0 })
    })

    child.on('close', code => {
      resolve({ logs, error: code !== 0 ? `exit ${code}` : null, ms: Date.now() - t0 })
    })
  })
}

// ── IPC: native code execution ────────────────────────────────
ipcMain.handle('run-code', async (_event, { lang, code, stdin = '' }) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forbiden-'))
  const ts = () => Date.now()

  try {
    // ── Python ──────────────────────────────────────────────
    if (lang === 'py') {
      // Handle %pip install magic
      const pipLines = []
      const codeLines = code.split('\n').map(line => {
        const m = line.match(/^%pip\s+install\s+(.+)/)
        if (!m) return line
        pipLines.push(...m[1].trim().split(/\s+/))
        return `# [pip] ${line}`
      })
      if (pipLines.length) {
        await runProc('pip3', ['install', ...pipLines], { timeout: 60000 })
      }
      const src = path.join(tmpDir, 'main.py')
      fs.writeFileSync(src, codeLines.join('\n'))
      return await runProc('python3', [src], { cwd: tmpDir, stdin })
    }

    // ── C ────────────────────────────────────────────────────
    if (lang === 'c') {
      const src = path.join(tmpDir, 'main.c')
      const out = path.join(tmpDir, 'main')
      fs.writeFileSync(src, code)
      const comp = await runProc('gcc', [src, '-o', out, '-O0', '-std=c11', '-lm', '-Wall'], { cwd: tmpDir })
      const runLogs = [
        { type: 'compile-sep', val: '── gcc · C11 ──',        ts: ts() },
        ...comp.logs.map(l => ({ ...l, type: comp.error ? 'compile-err' : 'compile-warn' })),
      ]
      if (comp.error) return { logs: runLogs, error: comp.error, ms: comp.ms }
      runLogs.push({ type: 'compile-ok', val: `✓ compiled in ${comp.ms}ms`, ts: ts() })
      runLogs.push({ type: 'run-sep',    val: '── output ──',                ts: ts() })
      const run = await runProc(out, [], { cwd: tmpDir, stdin })
      return { logs: [...runLogs, ...run.logs], error: run.error, ms: comp.ms + run.ms }
    }

    // ── C++ ──────────────────────────────────────────────────
    if (lang === 'cpp') {
      const src = path.join(tmpDir, 'main.cpp')
      const out = path.join(tmpDir, 'main')
      fs.writeFileSync(src, code)
      const comp = await runProc('g++', [src, '-o', out, '-O0', '-std=c++17', '-Wall'], { cwd: tmpDir })
      const runLogs = [
        { type: 'compile-sep', val: '── g++ · C++17 ──',       ts: ts() },
        ...comp.logs.map(l => ({ ...l, type: comp.error ? 'compile-err' : 'compile-warn' })),
      ]
      if (comp.error) return { logs: runLogs, error: comp.error, ms: comp.ms }
      runLogs.push({ type: 'compile-ok', val: `✓ compiled in ${comp.ms}ms`, ts: ts() })
      runLogs.push({ type: 'run-sep',    val: '── output ──',                ts: ts() })
      const run = await runProc(out, [], { cwd: tmpDir, stdin })
      return { logs: [...runLogs, ...run.logs], error: run.error, ms: comp.ms + run.ms }
    }

    // ── Go ───────────────────────────────────────────────────
    if (lang === 'go') {
      const src = path.join(tmpDir, 'main.go')
      const bin = path.join(tmpDir, 'main')
      fs.writeFileSync(src, code)
      const comp = await runProc('go', ['build', '-o', bin, src], { cwd: tmpDir })
      const runLogs = [
        { type: 'compile-sep', val: '── go ──',                 ts: ts() },
        ...comp.logs.map(l => ({ ...l, type: comp.error ? 'compile-err' : 'compile-warn' })),
      ]
      if (comp.error) return { logs: runLogs, error: comp.error, ms: comp.ms }
      runLogs.push({ type: 'compile-ok', val: `✓ compiled in ${comp.ms}ms`, ts: ts() })
      runLogs.push({ type: 'run-sep',    val: '── output ──',                ts: ts() })
      const run = await runProc(bin, [], { cwd: tmpDir, stdin })
      return { logs: [...runLogs, ...run.logs], error: run.error, ms: comp.ms + run.ms }
    }

    return { logs: [{ type: 'error', val: `Unsupported language: ${lang}`, ts: ts() }], error: 'unsupported', ms: 0 }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

// ── IPC: terminal command execution ──────────────────────────
ipcMain.handle('terminal-exec', (_event, { cmd, cwd }) => {
  return new Promise(resolve => {
    const t0 = Date.now()
    exec(cmd, {
      cwd: cwd || os.homedir(),
      shell: true,
      timeout: 30000,
      maxBuffer: 1024 * 512,
    }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: err ? (err.code || 1) : 0,
        ms: Date.now() - t0,
      })
    })
  })
})

// ── IPC: git operations ───────────────────────────────────────
function gitCmd(args, cwd) {
  return new Promise((resolve, reject) => {
    exec(`git ${args}`, { cwd: cwd || os.homedir() }, (err, stdout, stderr) => {
      if (err && !stdout.trim()) reject(new Error(stderr.trim() || err.message))
      else resolve(stdout.trim())
    })
  })
}

ipcMain.handle('git-status', async (_event, { cwd }) => {
  try {
    const [porcelain, branch] = await Promise.all([
      gitCmd('status --porcelain', cwd),
      gitCmd('branch --show-current', cwd).catch(() => 'main'),
    ])
    const files = porcelain.split('\n').filter(Boolean).map(l => ({
      state: l.slice(0, 2).trim(),
      path:  l.slice(3).trim(),
    }))
    return { branch, files, raw: porcelain }
  } catch (e) {
    return { branch: '', files: [], raw: '', error: e.message }
  }
})

ipcMain.handle('git-log', async (_event, { cwd }) => {
  try {
    const out = await gitCmd('log --oneline --decorate -30', cwd)
    return out.split('\n').filter(Boolean).map(line => {
      const [hash, ...rest] = line.split(' ')
      return { hash, message: rest.join(' ') }
    })
  } catch {
    return []
  }
})

ipcMain.handle('git-branch', async (_event, { cwd }) => {
  try { return await gitCmd('branch --show-current', cwd) }
  catch { return 'main' }
})

ipcMain.handle('git-commit', async (_event, { cwd, message }) => {
  try {
    await gitCmd('add -A', cwd)
    const out = await gitCmd(`commit -m ${JSON.stringify(message)}`, cwd)
    return { success: true, output: out }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── IPC: native file dialogs ──────────────────────────────────
ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:save-file', async (_event, { defaultName, content }) => {
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

ipcMain.handle('get-home-dir', () => os.homedir())
ipcMain.handle('get-platform', () => process.platform)

// ── IPC: filesystem operations ───────────────────────────────
const CODE_EXTS_SCAN = new Set(['js','jsx','ts','tsx','mjs','cjs','py','c','cpp','h','hpp','go','vue','svelte','rs','rb','java','kt','swift','cs'])
const FS_IGNORE      = new Set(['.git','node_modules','.DS_Store','__pycache__','dist','.next','build','vendor','venv','.venv','.cache','coverage','.parcel-cache','out','release'])

function fsBuildTree(p, depth, maxDepth) {
  try {
    const stat = fs.statSync(p)
    if (stat.isDirectory()) {
      if (depth >= maxDepth) return { name: path.basename(p), path: p, type: 'dir', children: [] }
      const children = fs.readdirSync(p)
        .filter(e => !FS_IGNORE.has(e) && !e.startsWith('.'))
        .map(e => fsBuildTree(path.join(p, e), depth + 1, maxDepth))
        .sort((a, b) => {
          if (a.type === 'dir' && b.type !== 'dir') return -1
          if (a.type !== 'dir' && b.type === 'dir') return 1
          return a.name.localeCompare(b.name)
        })
      return { name: path.basename(p), path: p, type: 'dir', children }
    }
    return { name: path.basename(p), path: p, type: 'file', ext: path.extname(p).slice(1).toLowerCase() }
  } catch {
    return { name: path.basename(p), path: p, type: 'file', ext: '' }
  }
}

ipcMain.handle('fs:readTree',    async (_e, { rootPath, maxDepth = 6 }) => {
  try { return { success: true, tree: fsBuildTree(rootPath, 0, maxDepth) } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:readFile',    async (_e, { filePath }) => {
  try { return { success: true, content: fs.readFileSync(filePath, 'utf8') } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:writeFile',   async (_e, { filePath, content }) => {
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, content, 'utf8'); return { success: true } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:createFile',  async (_e, { filePath }) => {
  try {
    if (fs.existsSync(filePath)) return { success: false, error: 'File already exists' }
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, '', 'utf8')
    return { success: true }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:createFolder', async (_e, { folderPath }) => {
  try { fs.mkdirSync(folderPath, { recursive: true }); return { success: true } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:deleteItem',  async (_e, { itemPath }) => {
  try { fs.rmSync(itemPath, { recursive: true, force: true }); return { success: true } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:renameItem',  async (_e, { oldPath, newPath }) => {
  try { fs.renameSync(oldPath, newPath); return { success: true } }
  catch (e) { return { success: false, error: e.message } }
})

function _copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, e.name), dp = path.join(dest, e.name)
    if (e.isDirectory()) _copyDirSync(sp, dp)
    else fs.copyFileSync(sp, dp)
  }
}

ipcMain.handle('fs:copyFolder',  async (_e, { srcPath, destPath }) => {
  try { _copyDirSync(srcPath, destPath); return { success: true } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:copyFile',    async (_e, { srcPath, destPath }) => {
  try { fs.copyFileSync(srcPath, destPath); return { success: true } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:showInFolder', async (_e, { itemPath }) => {
  shell.showItemInFolder(itemPath); return { success: true }
})

// ── IPC: folder import scanner (build dependency graph) ──────
ipcMain.handle('fs:scanImports', async (_e, { rootPath }) => {
  function walkCode(dir, out = []) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (FS_IGNORE.has(e.name) || e.name.startsWith('.')) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walkCode(p, out)
        else if (CODE_EXTS_SCAN.has(path.extname(e.name).slice(1).toLowerCase())) out.push(p)
      }
    } catch {}
    return out
  }

  function extractImports(filePath) {
    const ext = path.extname(filePath).slice(1).toLowerCase()
    try {
      const src = fs.readFileSync(filePath, 'utf8')
      const imps = []
      if (['js','jsx','ts','tsx','mjs','cjs','vue','svelte'].includes(ext)) {
        for (const m of src.matchAll(/import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) imps.push(m[1])
        for (const m of src.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g))            imps.push(m[1])
        for (const m of src.matchAll(/export\s+.*?\s+from\s+['"]([^'"]+)['"]/g))           imps.push(m[1])
      }
      if (ext === 'py') {
        for (const m of src.matchAll(/^from\s+([\w.]+)\s+import/gm)) imps.push(m[1])
        for (const m of src.matchAll(/^import\s+([\w.,\s]+)/gm))     m[1].split(',').forEach(s => imps.push(s.trim()))
      }
      if (['c','cpp','h','hpp'].includes(ext)) {
        for (const m of src.matchAll(/#include\s+"([^"]+)"/g)) imps.push(m[1])
      }
      if (ext === 'go') {
        for (const m of src.matchAll(/^\s+"([^"]+)"/gm)) imps.push(m[1])
      }
      return imps.filter(Boolean)
    } catch { return [] }
  }

  try {
    const files = walkCode(rootPath)
    const COLORS = ['#10b981','#ff435a','#ffc410','#4285f4','#28f1c3','#bb9af7','#ff1650','#5ccfe6','#ffbd5e','#e36209','#72f1b8','#ff8080','#89ddff','#e5c07b','#4ec9b0','#c792ea']
    const nodes = files.map((f, i) => ({
      id: 'fi' + i,
      label: path.relative(rootPath, f),
      path: f,
      ext: path.extname(f).slice(1).toLowerCase(),
      type: 'function',
      themeIdx: i % COLORS.length,
      x: Math.cos(i / files.length * Math.PI * 2) * Math.min(200, files.length * 20),
      y: Math.sin(i / files.length * Math.PI * 2) * Math.min(200, files.length * 20),
    }))

    const byRel   = Object.fromEntries(nodes.map(n => [n.label, n.id]))
    const byBase  = Object.fromEntries(nodes.map(n => [path.basename(n.label), n.id]))
    const byNoExt = Object.fromEntries(nodes.map(n => [path.basename(n.label, path.extname(n.label)), n.id]))

    const edges = [], edgeSet = new Set()
    nodes.forEach(node => {
      extractImports(node.path).forEach(imp => {
        const base = path.basename(imp), noExt = base.replace(/\.\w+$/, '')
        let targetId = null
        if (imp.startsWith('.')) {
          const resolved = path.resolve(path.dirname(node.path), imp)
          const rel = path.relative(rootPath, resolved)
          for (const candidate of [rel, rel+'.js', rel+'.ts', rel+'.tsx', rel+'.jsx', rel+'.py', rel+'.go', rel+'/index.js', rel+'/index.ts']) {
            if (byRel[candidate]) { targetId = byRel[candidate]; break }
          }
        }
        if (!targetId) targetId = byBase[base] || byBase[base+'.py'] || byNoExt[noExt]
        if (targetId && targetId !== node.id) {
          const key = `${node.id}>${targetId}`
          if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ id: 'ei'+edges.length, source: node.id, target: targetId }) }
        }
      })
    })
    return { success: true, nodes, edges, rootPath, fileCount: files.length }
  } catch (e) { return { success: false, error: e.message } }
})

// ── Window ────────────────────────────────────────────────────
function createWindow() {
  const saved = loadWinState()
  const win = new BrowserWindow({
    width:  saved?.width  ?? 1440,
    height: saved?.height ?? 900,
    x: saved?.x,
    y: saved?.y,
    minWidth:  960,
    minHeight: 600,
    backgroundColor: '#0b0b0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    frame: process.platform !== 'darwin',
    // Allow dropping files/folders from OS file manager
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5175')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.on('close', () => saveWinState(win))

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
