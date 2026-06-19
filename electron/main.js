const { app, BrowserWindow, shell, ipcMain, dialog, Menu } = require('electron')
const { spawn, exec }  = require('child_process')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

let pty
try { pty = require('node-pty') } catch {}

// ── PTY session registry ──────────────────────────────────────
const ptySessions = new Map() // id → { ptyProc, win }

// ── Main window reference (reliable alternative to getFocusedWindow) ──
let mainWin = null

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

// ── Extended PATH so Electron finds compilers installed by the user ──
function getEnvPath() {
  const home = os.homedir()
  const extras = [
    '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin',
    '/snap/bin',
    '/opt/homebrew/bin', '/opt/homebrew/sbin',
    path.join(home, '.local', 'bin'),
    path.join(home, 'go', 'bin'),
    path.join(home, '.cargo', 'bin'),
    path.join(home, '.bun', 'bin'),
    '/usr/local/go/bin',
    '/usr/local/opt/go/bin',
    'C:\\Program Files\\Python312',
    'C:\\Program Files\\Python311',
    'C:\\Program Files\\Python310',
    'C:\\Program Files\\Go\\bin',
    path.join(home, 'AppData', 'Roaming', 'npm'),
  ]
  const existing = (process.env.PATH || '').split(path.delimiter)
  return [...new Set([...existing, ...extras])].filter(Boolean).join(path.delimiter)
}

// ── Find a binary in the extended PATH ───────────────────────
function whichBin(...names) {
  const dirs = getEnvPath().split(path.delimiter)
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']
  for (const name of names) {
    for (const dir of dirs) {
      for (const suf of suffixes) {
        try {
          const full = path.join(dir, name + suf)
          fs.accessSync(full, fs.constants.X_OK)
          return full
        } catch {}
      }
    }
  }
  return null
}

// ── Not-found error result ────────────────────────────────────
function notFound(cmd, hint) {
  const ts = () => Date.now()
  return {
    logs: [
      { type: 'error', val: `'${cmd}' not found in PATH`, ts: ts() },
      { type: 'info',  val: `Install: ${hint}`, ts: ts() },
    ],
    error: `${cmd} not found`, ms: 0,
  }
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
      env: { ...process.env, PATH: getEnvPath() },
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
    // ── JavaScript / TypeScript via Bun (fallback: node for JS only) ──
    if (lang === 'js' || lang === 'ts' || lang === 'jsx' || lang === 'tsx') {
      const bin = whichBin('bun', 'node')
      if (!bin) return notFound('bun', 'curl -fsSL https://bun.sh/install | bash')
      const isBun = path.basename(bin).replace(/\.exe$/, '') === 'bun'
      const ext = lang
      const src = path.join(tmpDir, `main.${ext}`)
      fs.writeFileSync(src, code)
      if (!isBun && (lang === 'ts' || lang === 'tsx')) {
        return notFound('bun', 'curl -fsSL https://bun.sh/install | bash  (node cannot run TypeScript)')
      }
      return await runProc(bin, isBun ? ['run', src] : [src], { cwd: tmpDir, stdin })
    }

    // ── Python ───────────────────────────────────────────────
    if (lang === 'py') {
      const bin = whichBin('python3', 'python3.12', 'python3.11', 'python3.10', 'python3.9', 'python')
      if (!bin) return notFound('python3', 'sudo apt install python3  OR  brew install python  OR  python.org')
      const pipLines = []
      const codeLines = code.split('\n').map(line => {
        const m = line.match(/^%pip\s+install\s+(.+)/)
        if (!m) return line
        pipLines.push(...m[1].trim().split(/\s+/))
        return `# [pip] ${line}`
      })
      if (pipLines.length) {
        const pip = whichBin('pip3', 'pip')
        if (pip) await runProc(pip, ['install', ...pipLines], { timeout: 60000 })
      }
      const src = path.join(tmpDir, 'main.py')
      fs.writeFileSync(src, codeLines.join('\n'))
      return await runProc(bin, [src], { cwd: tmpDir, stdin })
    }

    // ── C ────────────────────────────────────────────────────
    if (lang === 'c') {
      const bin = whichBin('gcc', 'clang', 'cc')
      if (!bin) return notFound('gcc', 'sudo apt install build-essential  OR  brew install gcc  OR  xcode-select --install')
      const src = path.join(tmpDir, 'main.c')
      const out = path.join(tmpDir, 'main')
      fs.writeFileSync(src, code)
      const comp = await runProc(bin, [src, '-o', out, '-O0', '-std=c11', '-lm', '-Wall'], { cwd: tmpDir })
      const runLogs = [
        { type: 'compile-sep', val: `── ${path.basename(bin)} · C11 ──`, ts: ts() },
        ...comp.logs.map(l => ({ ...l, type: comp.error ? 'compile-err' : 'compile-warn' })),
      ]
      if (comp.error) return { logs: runLogs, error: comp.error, ms: comp.ms }
      runLogs.push({ type: 'compile-ok', val: `✓ compiled in ${comp.ms}ms`, ts: ts() })
      runLogs.push({ type: 'run-sep',    val: '── output ──', ts: ts() })
      const run = await runProc(out, [], { cwd: tmpDir, stdin })
      return { logs: [...runLogs, ...run.logs], error: run.error, ms: comp.ms + run.ms }
    }

    // ── C++ ──────────────────────────────────────────────────
    if (lang === 'cpp') {
      const bin = whichBin('g++', 'clang++', 'c++')
      if (!bin) return notFound('g++', 'sudo apt install build-essential  OR  brew install gcc  OR  xcode-select --install')
      const src = path.join(tmpDir, 'main.cpp')
      const out = path.join(tmpDir, 'main')
      fs.writeFileSync(src, code)
      const comp = await runProc(bin, [src, '-o', out, '-O0', '-std=c++17', '-Wall'], { cwd: tmpDir })
      const runLogs = [
        { type: 'compile-sep', val: `── ${path.basename(bin)} · C++17 ──`, ts: ts() },
        ...comp.logs.map(l => ({ ...l, type: comp.error ? 'compile-err' : 'compile-warn' })),
      ]
      if (comp.error) return { logs: runLogs, error: comp.error, ms: comp.ms }
      runLogs.push({ type: 'compile-ok', val: `✓ compiled in ${comp.ms}ms`, ts: ts() })
      runLogs.push({ type: 'run-sep',    val: '── output ──', ts: ts() })
      const run = await runProc(out, [], { cwd: tmpDir, stdin })
      return { logs: [...runLogs, ...run.logs], error: run.error, ms: comp.ms + run.ms }
    }

    // ── Go ───────────────────────────────────────────────────
    if (lang === 'go') {
      const bin = whichBin('go')
      if (!bin) return notFound('go', 'https://go.dev/dl/  OR  sudo apt install golang-go  OR  brew install go')
      const src = path.join(tmpDir, 'main.go')
      const out = path.join(tmpDir, 'main')
      fs.writeFileSync(src, code)
      const comp = await runProc(bin, ['build', '-o', out, src], { cwd: tmpDir })
      const runLogs = [
        { type: 'compile-sep', val: '── go ──', ts: ts() },
        ...comp.logs.map(l => ({ ...l, type: comp.error ? 'compile-err' : 'compile-warn' })),
      ]
      if (comp.error) return { logs: runLogs, error: comp.error, ms: comp.ms }
      runLogs.push({ type: 'compile-ok', val: `✓ compiled in ${comp.ms}ms`, ts: ts() })
      runLogs.push({ type: 'run-sep',    val: '── output ──', ts: ts() })
      const run = await runProc(out, [], { cwd: tmpDir, stdin })
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

// ── Default workspace persistence ────────────────────────────
const workspaceStatePath = path.join(app.getPath('userData'), 'workspace.json')

function getLastWorkspace() {
  try { return JSON.parse(fs.readFileSync(workspaceStatePath, 'utf8')).path ?? null } catch { return null }
}
function saveLastWorkspace(p) {
  try { fs.writeFileSync(workspaceStatePath, JSON.stringify({ path: p })) } catch {}
}

const DEFAULT_WS_FILES = {
  'main.js': `// FORBIDEN — Main entry point
const PROJECT = 'FORBIDEN NGO'
const VERSION  = '2.1.0'
const MODULES  = ['utils', 'DataPipeline', 'graph']

console.log(\`[BOOT] \${PROJECT} v\${VERSION}\`)
MODULES.forEach(m => console.log(\`  ↳ loading: \${m}\`))

const uptime = performance.now().toFixed(2)
console.log(\`[READY] Runtime up — \${uptime}ms\`)

return { project: PROJECT, version: VERSION, modules: MODULES, uptime }`,

  'utils.js': `// Utility helpers
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function randomId(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase()
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
}

function debounce(fn, delay) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay) }
}

console.log(capitalize('forbiden'))
console.log('ID:', randomId())
console.log('clamp(15, 0, 10):', clamp(15, 0, 10))

return { capitalize, randomId, clamp, debounce }`,

  'DataPipeline.js': `// Composable data pipeline
class DataPipeline {
  constructor(name) {
    this.name = name
    this.stages = []
    this.runs = 0
  }

  pipe(fn) {
    this.stages.push(fn)
    return this
  }

  run(input) {
    this.runs++
    return this.stages.reduce((acc, fn) => fn(acc), input)
  }
}

const pipeline = new DataPipeline('demo')
  .pipe(data => data.map(x => x * 2))
  .pipe(data => data.filter(x => x > 4))
  .pipe(data => ({
    values: data,
    sum: data.reduce((a, b) => a + b, 0),
    avg: data.reduce((a, b) => a + b, 0) / data.length
  }))

const result = pipeline.run([1, 2, 3, 4, 5])
console.log('Pipeline:', pipeline.name)
console.log('Result:', result)
console.warn('Runs so far:', pipeline.runs)

return result`,

  'graph.js': `// Graph traversal utilities
function buildGraph(edges) {
  const g = {}
  for (const [from, to] of edges) {
    ;(g[from] ??= []).push(to)
    ;(g[to]   ??= [])
  }
  return g
}

function bfs(graph, start) {
  const visited = new Set([start])
  const queue = [start]
  const order = []
  while (queue.length) {
    const node = queue.shift()
    order.push(node)
    for (const nb of (graph[node] || [])) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb) }
    }
  }
  return order
}

function pageRank(graph, iters = 20, d = 0.85) {
  const nodes = Object.keys(graph)
  const N = nodes.length
  const rank = Object.fromEntries(nodes.map(n => [n, 1 / N]))
  for (let i = 0; i < iters; i++) {
    const next = Object.fromEntries(nodes.map(n => [n, (1 - d) / N]))
    for (const [src, dsts] of Object.entries(graph)) {
      for (const dst of dsts) {
        next[dst] = (next[dst] || 0) + d * (rank[src] / (dsts.length || 1))
      }
    }
    Object.assign(rank, next)
  }
  return rank
}

const edges = [
  ['main', 'utils'], ['main', 'DataPipeline'],
  ['utils', 'graph'], ['DataPipeline', 'graph'],
]
const G = buildGraph(edges)
const traversal = bfs(G, 'main')
const ranks = pageRank(G)

console.log('BFS from main:', traversal)
console.table(Object.entries(ranks).map(([n,r]) => ({ node:n, rank: r.toFixed(4) })))

return { graph: G, traversal, ranks }`,
}

ipcMain.handle('fs:ensureDefaultWorkspace', async () => {
  try {
    const docsDir = path.join(os.homedir(), 'Documents')
    const baseDir = fs.existsSync(docsDir) ? docsDir : os.homedir()
    const wsDir = path.join(baseDir, 'FORBIDEN')
    fs.mkdirSync(wsDir, { recursive: true })
    for (const [name, content] of Object.entries(DEFAULT_WS_FILES)) {
      const fp = path.join(wsDir, name)
      if (!fs.existsSync(fp)) fs.writeFileSync(fp, content, 'utf8')
    }
    return { success: true, path: wsDir }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:getWorkspace',  () => ({ path: getLastWorkspace() }))
ipcMain.handle('fs:saveWorkspace', (_e, { workspacePath: p }) => { saveLastWorkspace(p); return { success: true } })

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

// ── IPC: window controls ──────────────────────────────────────
ipcMain.handle('window:minimize',    () => { mainWin?.minimize() })
ipcMain.handle('window:maximize',    () => {
  if (!mainWin) return
  mainWin.isMaximized() ? mainWin.unmaximize() : mainWin.maximize()
})
ipcMain.handle('window:close',       () => { mainWin?.close() })
ipcMain.handle('window:isMaximized', () => mainWin?.isMaximized() ?? false)

// ── IPC: PTY terminal ─────────────────────────────────────────
ipcMain.handle('pty:create', (event, { id, cols, rows, cwd }) => {
  if (!pty) return { error: 'node-pty not available' }
  const shell = process.platform === 'win32' ? 'cmd.exe'
    : process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  try {
    if (ptySessions.has(id)) {
      try { ptySessions.get(id).ptyProc.kill() } catch {}
      ptySessions.delete(id)
    }
    const ptyProc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || os.homedir(),
      env: { ...process.env, PATH: getEnvPath(), TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    })
    const win = BrowserWindow.fromWebContents(event.sender)
    ptyProc.onData(data => {
      if (win && !win.isDestroyed()) win.webContents.send('pty:data', id, data)
    })
    ptyProc.onExit(() => {
      ptySessions.delete(id)
      if (win && !win.isDestroyed()) win.webContents.send('pty:exit', id)
    })
    ptySessions.set(id, { ptyProc, win })
    return { success: true }
  } catch (e) { return { error: e.message } }
})

ipcMain.handle('pty:write', (_e, { id, data }) => {
  const s = ptySessions.get(id); if (s) s.ptyProc.write(data)
})

ipcMain.handle('pty:resize', (_e, { id, cols, rows }) => {
  const s = ptySessions.get(id)
  if (s) { try { s.ptyProc.resize(cols, rows) } catch {} }
})

ipcMain.handle('pty:kill', (_e, { id }) => {
  const s = ptySessions.get(id)
  if (s) { try { s.ptyProc.kill() } catch {} ptySessions.delete(id) }
})

// ── IPC: extended git operations ──────────────────────────────
ipcMain.handle('git-diff', async (_e, { cwd, file }) => {
  try {
    const args = file ? `diff HEAD -- ${JSON.stringify(file)}` : 'diff HEAD'
    const out = await gitCmd(args, cwd).catch(() => gitCmd(`diff -- ${file ? JSON.stringify(file) : ''}`, cwd))
    return { success: true, diff: out }
  } catch (e) { return { success: false, error: e.message, diff: '' } }
})

ipcMain.handle('git-stage', async (_e, { cwd, files }) => {
  try {
    const fileArgs = files.map(f => JSON.stringify(f)).join(' ')
    await gitCmd(`add -- ${fileArgs}`, cwd)
    return { success: true }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('git-unstage', async (_e, { cwd, files }) => {
  try {
    const fileArgs = files.map(f => JSON.stringify(f)).join(' ')
    await gitCmd(`restore --staged -- ${fileArgs}`, cwd).catch(() =>
      gitCmd(`reset HEAD -- ${fileArgs}`, cwd))
    return { success: true }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('git-branches', async (_e, { cwd }) => {
  try {
    const out = await gitCmd('branch -a', cwd)
    return out.split('\n').filter(Boolean).map(b => b.replace(/^\*?\s+/, '').trim()).filter(Boolean)
  } catch { return [] }
})

ipcMain.handle('git-checkout', async (_e, { cwd, branch }) => {
  try { await gitCmd(`checkout ${JSON.stringify(branch)}`, cwd); return { success: true } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('git-push', async (_e, { cwd }) => {
  try {
    const out = await gitCmd('push', cwd)
    return { success: true, output: out }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('git-pull', async (_e, { cwd }) => {
  try {
    const out = await gitCmd('pull', cwd)
    return { success: true, output: out }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('git-stash', async (_e, { cwd }) => {
  try { await gitCmd('stash', cwd); return { success: true } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('git-stash-pop', async (_e, { cwd }) => {
  try { await gitCmd('stash pop', cwd); return { success: true } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('git-init', async (_e, { cwd }) => {
  try { await gitCmd('init', cwd); return { success: true } }
  catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('git-discard', async (_e, { cwd, file }) => {
  try {
    await gitCmd(`checkout -- ${JSON.stringify(file)}`, cwd).catch(() =>
      gitCmd(`restore -- ${JSON.stringify(file)}`, cwd))
    return { success: true }
  } catch (e) { return { success: false, error: e.message } }
})

// ── IPC: git log with parent data for visual graph ────────────
ipcMain.handle('git-log-graph', async (_e, { cwd, limit = 60 }) => {
  try {
    const out = await gitCmd(`log --pretty=format:"%H|%P|%D|%s|%an|%ar" -${limit} --all`, cwd)
    const commits = out.split('\n').filter(Boolean).map(line => {
      const [hash = '', parentsRaw = '', refsRaw = '', subject = '', author = '', reltime = ''] = line.split('|')
      return {
        hash: hash.trim(),
        parents: parentsRaw.trim() ? parentsRaw.trim().split(' ').filter(Boolean) : [],
        refs: refsRaw.trim() ? refsRaw.trim().split(',').map(r => r.trim()).filter(Boolean) : [],
        subject: subject.trim(),
        author: author.trim(),
        reltime: reltime.trim(),
      }
    }).filter(c => c.hash)
    return { success: true, commits }
  } catch (e) { return { success: false, error: e.message, commits: [] } }
})

// ── IPC: list all files in workspace ─────────────────────────
ipcMain.handle('fs:listAllFiles', async (_e, { rootPath, maxFiles = 5000 }) => {
  const results = []
  const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv', '.cache', 'coverage', '.nyc_output', 'target', '.dart_tool'])
  function walk(dir, rel = '') {
    if (results.length >= maxFiles) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.') || IGNORED.has(e.name)) continue
      const full = path.join(dir, e.name)
      const relPath = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { walk(full, relPath) }
      else { results.push({ path: full, rel: relPath, name: e.name }); if (results.length >= maxFiles) return }
    }
  }
  try { walk(rootPath); return results } catch { return [] }
})

// ── IPC: search text across files ────────────────────────────
ipcMain.handle('fs:searchInFiles', async (_e, { rootPath, query, maxResults = 300 }) => {
  if (!query || query.length < 2) return []
  const results = []
  const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv', 'coverage'])
  const TEXT_EXTS = new Set(['.js','.ts','.tsx','.jsx','.py','.go','.c','.cpp','.h','.md','.json','.css','.html','.txt','.yaml','.yml','.toml','.rs','.rb','.sh','.vue','.svelte'])
  const lower = query.toLowerCase()
  function walk(dir, rel = '') {
    if (results.length >= maxResults) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.') || IGNORED.has(e.name)) continue
      const full = path.join(dir, e.name)
      const relPath = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { walk(full, relPath) }
      else {
        const ext = path.extname(e.name).toLowerCase()
        if (!TEXT_EXTS.has(ext)) continue
        try {
          const content = fs.readFileSync(full, 'utf8')
          const lines = content.split('\n')
          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            if (lines[i].toLowerCase().includes(lower)) {
              results.push({ file: relPath, fullPath: full, line: i + 1, text: lines[i].trim().slice(0, 200), col: lines[i].toLowerCase().indexOf(lower) })
            }
          }
        } catch { /* skip binary/unreadable */ }
      }
    }
  }
  try { walk(rootPath); return results } catch { return [] }
})

// ── IPC: git blame for a file ─────────────────────────────────
ipcMain.handle('git:blame', async (_e, { cwd, file }) => {
  try {
    const out = await gitCmd(`blame --line-porcelain ${JSON.stringify(file)}`, cwd)
    const lines = []
    const chunks = out.split('\n')
    let current = {}
    for (const line of chunks) {
      if (/^[0-9a-f]{40}/.test(line)) {
        const parts = line.split(' ')
        current = { hash: parts[0], origLine: parseInt(parts[1]), line: parseInt(parts[2]) }
      } else if (line.startsWith('author '))         current.author  = line.slice(7)
      else if (line.startsWith('author-time '))      current.time    = new Date(parseInt(line.slice(12)) * 1000).toLocaleDateString()
      else if (line.startsWith('summary '))          current.subject = line.slice(8)
      else if (line.startsWith('\t')) {
        lines.push({ ...current, content: line.slice(1) })
        current = {}
      }
    }
    return { success: true, lines }
  } catch (e) { return { success: false, error: e.message, lines: [] } }
})

// ── IPC: AI chat via Anthropic API ───────────────────────────
ipcMain.handle('ai:chat', async (_e, { messages, apiKey, model = 'claude-haiku-4-5-20251001', system = '' }) => {
  if (!apiKey) return { success: false, error: 'No API key provided. Add your Anthropic API key in Settings.' }
  try {
    const body = JSON.stringify({ model, max_tokens: 4096, system, messages })
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    })
    const data = await resp.json()
    if (!resp.ok) return { success: false, error: data?.error?.message || resp.statusText }
    return { success: true, content: data.content?.[0]?.text || '' }
  } catch (e) { return { success: false, error: e.message } }
})

// ── IPC: format code ──────────────────────────────────────────
ipcMain.handle('fs:formatCode', async (_e, { code, lang }) => {
  const EXT = { js:'js', mjs:'js', jsx:'jsx', ts:'ts', tsx:'tsx', css:'css', json:'json', html:'html', md:'md', py:'py', go:'go' }
  const ext = EXT[lang] || 'txt'
  const tmp = path.join(os.tmpdir(), `forbiden_fmt_${Date.now()}.${ext}`)
  try {
    fs.writeFileSync(tmp, code, 'utf8')
    let cmd
    if (['js','mjs','jsx','ts','tsx','css','json','html','md'].includes(lang)) {
      cmd = `npx --yes prettier --write "${tmp}"`
    } else if (lang === 'py') {
      cmd = `black "${tmp}" 2>&1 || autopep8 --in-place "${tmp}"`
    } else if (lang === 'go') {
      cmd = `gofmt -w "${tmp}"`
    } else {
      return { success: false, error: 'No formatter available for this language' }
    }
    await new Promise((res, rej) => exec(cmd, { timeout: 15000 }, (err, _out, stderr) => {
      if (err && !stderr.includes('warn')) rej(new Error(stderr || err.message))
      else res()
    }))
    const result = fs.readFileSync(tmp, 'utf8')
    try { fs.unlinkSync(tmp) } catch {}
    return { success: true, code: result }
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch {}
    return { success: false, error: e.message }
  }
})

// ── IPC: read npm/make scripts ────────────────────────────────
ipcMain.handle('fs:getScripts', async (_e, { rootPath }) => {
  if (!rootPath) return { success: false, scripts: [], type: 'none' }
  // Try package.json
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootPath, 'package.json'), 'utf8'))
    const scripts = Object.entries(pkg.scripts || {}).map(([name, cmd]) => ({ name, cmd: String(cmd) }))
    if (scripts.length) return { success: true, scripts, type: 'npm', name: pkg.name || '' }
  } catch {}
  // Try Makefile
  try {
    const mk = fs.readFileSync(path.join(rootPath, 'Makefile'), 'utf8')
    const scripts = (mk.match(/^[a-zA-Z][a-zA-Z0-9_-]*:/gm) || [])
      .map(t => ({ name: t.replace(':', ''), cmd: `make ${t.replace(':','')}` }))
    if (scripts.length) return { success: true, scripts, type: 'make', name: 'Makefile' }
  } catch {}
  return { success: false, scripts: [], type: 'none' }
})

// ── IPC: recent workspaces ────────────────────────────────────
const recentWsPath = path.join(app.getPath('userData'), 'recent-workspaces.json')
const loadRecentWs = () => { try { return JSON.parse(fs.readFileSync(recentWsPath, 'utf8')) || [] } catch { return [] } }
const saveRecentWs = (list) => { try { fs.writeFileSync(recentWsPath, JSON.stringify(list)) } catch {} }

ipcMain.handle('fs:getRecentWorkspaces', () => loadRecentWs().slice(0, 10))
ipcMain.handle('fs:addRecentWorkspace', (_e, { workspacePath: p }) => {
  const list = loadRecentWs().filter(x => x !== p)
  list.unshift(p)
  saveRecentWs(list.slice(0, 10))
  return { success: true }
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
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  mainWin = win

  // ── window-maximize change → push to renderer ────────────────
  win.on('maximize',   () => win.webContents.send('window:maximized-change', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized-change', false))

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
