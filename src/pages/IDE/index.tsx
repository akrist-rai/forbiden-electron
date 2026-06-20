// @ts-nocheck
import './ide.css'
import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react'
import { useWorkspace } from '../../hooks/useWorkspace'
import {
  detectLang, extractSymbols, generateImport, injectImport,
  getDefaultCode, langLabel, isCompiled,
  runByLang, runInTerminal,
} from '../../lib/engine'
import FileExplorer from '../../components/FileExplorer'
import CodeMirrorEditor from '../../components/CodeMirrorEditor'
import XTermPanel from '../../components/XTermPanel'
import TitleBar from '../../components/TitleBar'
import GitPanelV2 from '../../components/GitPanelV2'

// ══════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════

const ACCENTS = ['#10b981','#ff435a','#ffc410','#4285f4','#28f1c3','#bb9af7','#ff1650','#5ccfe6','#ffbd5e','#e36209','#72f1b8','#ff8080','#89ddff','#e5c07b','#4ec9b0','#c792ea']


const TL_TRACKS = [
  { key:'create', types:['node-create'],            label:'CREATE', color:'#10b981', icon:'⊕' },
  { key:'edit',   types:['code-edit'],              label:'EDIT',   color:'#ffc410', icon:'✏' },
  { key:'run',    types:['run-ok','run-err'],        label:'RUN',    color:'#4285f4', icon:'▶' },
  { key:'edge',   types:['edge-add','edge-del'],     label:'EDGE',   color:'#bb9af7', icon:'⇢' },
  { key:'import', types:['import','group'],          label:'IMPORT', color:'#c792ea', icon:'⬆' },
  { key:'commit', types:['commit'],                  label:'COMMIT', color:'#ff2a38', icon:'◆' },
  { key:'sys',    types:['system','node-delete'],    label:'SYSTEM', color:'#607080', icon:'⚡' },
]
const TL_COL = {
  'node-create':'#10b981','node-delete':'#ff435a','code-edit':'#ffc410',
  'edge-add':'#4285f4','edge-del':'#bb9af7','run-ok':'#10b981','run-err':'#ff435a',
  'import':'#c792ea','group':'#c792ea','commit':'#ff2a38','system':'#607080',
}
const INITIAL_NODES = [
  { id:'n1', type:'entry', label:'main.js', isMain:true, x:0, y:0, vx:0, vy:0, themeIdx:0, modified:false, code:
`// FORBIDEN — Main entry point
const PROJECT = 'FORBIDEN NGO'
const VERSION  = '2.1.0'
const MODULES  = ['utils', 'DataPipeline', 'graph']

console.log(\`[BOOT] \${PROJECT} v\${VERSION}\`)
MODULES.forEach(m => console.log(\`  ↳ loading: \${m}\`))

const uptime = performance.now().toFixed(2)
console.log(\`[READY] Runtime up — \${uptime}ms\`)

return { project: PROJECT, version: VERSION, modules: MODULES, uptime }`
  },
  { id:'n2', type:'function', label:'utils.js', isMain:false, x:150, y:-140, vx:0, vy:0, themeIdx:5, classId:'g1', modified:true, code:
`// Utility helpers
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

// Smoke test
console.log(capitalize('forbiden'))
console.log('ID:', randomId())
console.log('clamp(15, 0, 10):', clamp(15, 0, 10))

return { capitalize, randomId, clamp, debounce }`
  },
  { id:'n3', type:'class', label:'DataPipeline.js', isMain:false, x:-110, y:160, vx:0, vy:0, themeIdx:6, classId:'g1', modified:false, code:
`// Composable data pipeline
class DataPipeline {
  constructor(name) {
    this.name = name
    this.stages = []
    this.runs = 0
  }

  pipe(fn) {
    this.stages.push(fn)
    return this // chainable
  }

  run(input) {
    this.runs++
    return this.stages.reduce((acc, fn) => fn(acc), input)
  }
}

// Demo — process an array of numbers
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

return result`
  },
  { id:'n4', type:'function', label:'graph.js', isMain:false, x:70, y:190, vx:0, vy:0, themeIdx:4, classId:null, modified:false, code:
`// Graph traversal utilities
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

return { graph: G, traversal, ranks }`
  },
]
const INITIAL_EDGES = [{id:'e1',source:'n1',target:'n2'},{id:'e2',source:'n1',target:'n3'},{id:'e3',source:'n2',target:'n4'},{id:'e4',source:'n3',target:'n4'}]
const INITIAL_GROUPS = [{id:'g1',name:'CoreLayer',color:'#10b981',nodeIds:['n2','n3']}]
const INITIAL_BOARD = {
  cols:[{id:'c1',title:'BACKLOG',color:'#4a4a6a'},{id:'c2',title:'TO DO',color:'#4285f4'},{id:'c3',title:'IN PROGRESS',color:'#ffc410'},{id:'c4',title:'REVIEW',color:'#ff435a'},{id:'c5',title:'DONE',color:'#10b981'}],
  cards:[
    {id:'k1',colId:'c3',title:'Build graph force simulation',priority:'HIGH',tags:['core','physics'],progress:70,due:'Mar 12',assignee:0},
    {id:'k2',colId:'c2',title:'WebSocket sync protocol',priority:'HIGH',tags:['backend','net'],progress:0,due:'Mar 18',assignee:1},
    {id:'k3',colId:'c2',title:'Class grouping thread UI',priority:'MED',tags:['ui','graph'],progress:20,due:'Mar 15',assignee:0},
    {id:'k5',colId:'c4',title:'Syntax highlight engine',priority:'MED',tags:['editor','parser'],progress:90,due:'Mar 10',assignee:0},
    {id:'k6',colId:'c5',title:'Babel JSX setup',priority:'DONE',tags:['infra'],progress:100,due:'Feb 28',assignee:1},
    {id:'k7',colId:'c5',title:'Boot sequence modal',priority:'DONE',tags:['ui'],progress:100,due:'Feb 25',assignee:0},
    {id:'k8',colId:'c3',title:'Color palette engine',priority:'MED',tags:['editor','ui'],progress:45,due:'Mar 14',assignee:2},
  ],
}

const CMD_ITEMS = [
  { icon:'F', label:'New file node', hint:'N' },
  { icon:'D', label:'New doc node (.md)', hint:'' },
  { icon:'G', label:'New class group', hint:'G' },
  { icon:'J', label:'Join nodes (add edge)', hint:'J' },
  { icon:'X', label:'Cut edge', hint:'X' },
  { icon:'▶', label:'Run current file (JS)', hint:'Ctrl+Enter' },
  { icon:'>', label:'Open JS console', hint:'' },
  { icon:'/', label:'Toggle comment', hint:'Ctrl+/' },
  { icon:'T', label:'Open terminal', hint:'`' },
  { icon:'B', label:'Open board', hint:'' },
  { icon:'⌘', label:'Open Command Palette', hint:'Ctrl+P' },
]

const PALETTES = [
  { id:'forbinden',  name:'FORBINDEN',    bg:'#0b0b0f', base:'#c0c8d8', lineNum:'#2e2e42', activeLine:'rgba(255,255,255,0.035)', kw:'#ff435a', str:'#ffc410', cmt:'#3e3e5a', num:'#4285f4', fn:'#10b981', bi:'#28f1c3', op:'#6a6a8a', swatches:['#ff435a','#ffc410','#10b981','#28f1c3'] },
  { id:'dracula',    name:'DRACULA',       bg:'#282a36', base:'#f8f8f2', lineNum:'#44475a', activeLine:'rgba(68,71,90,0.4)',     kw:'#ff79c6', str:'#f1fa8c', cmt:'#6272a4', num:'#bd93f9', fn:'#50fa7b', bi:'#8be9fd', op:'#ff79c6', swatches:['#ff79c6','#f1fa8c','#50fa7b','#8be9fd'] },
  { id:'monokai',    name:'MONOKAI',       bg:'#272822', base:'#f8f8f2', lineNum:'#3e3d32', activeLine:'rgba(73,72,62,0.4)',     kw:'#f92672', str:'#e6db74', cmt:'#75715e', num:'#ae81ff', fn:'#a6e22e', bi:'#66d9e8', op:'#f92672', swatches:['#f92672','#e6db74','#a6e22e','#ae81ff'] },
  { id:'nord',       name:'NORD',          bg:'#2e3440', base:'#d8dee9', lineNum:'#3b4252', activeLine:'rgba(67,76,94,0.4)',     kw:'#81a1c1', str:'#a3be8c', cmt:'#4c566a', num:'#b48ead', fn:'#88c0d0', bi:'#8fbcbb', op:'#81a1c1', swatches:['#81a1c1','#a3be8c','#88c0d0','#b48ead'] },
  { id:'tokyo',      name:'TOKYO NIGHT',   bg:'#1a1b2e', base:'#a9b1d6', lineNum:'#2a2b3d', activeLine:'rgba(42,43,61,0.5)',     kw:'#bb9af7', str:'#9ece6a', cmt:'#3b4261', num:'#ff9e64', fn:'#7dcfff', bi:'#2ac3de', op:'#c0caf5', swatches:['#bb9af7','#9ece6a','#7dcfff','#ff9e64'] },
  { id:'gruvbox',    name:'GRUVBOX',       bg:'#282828', base:'#ebdbb2', lineNum:'#3c3836', activeLine:'rgba(60,56,54,0.5)',     kw:'#fb4934', str:'#b8bb26', cmt:'#665c54', num:'#d3869b', fn:'#fabd2f', bi:'#8ec07c', op:'#fe8019', swatches:['#fb4934','#b8bb26','#fabd2f','#8ec07c'] },
  { id:'onedark',    name:'ONE DARK',      bg:'#282c34', base:'#abb2bf', lineNum:'#3b4048', activeLine:'rgba(40,44,52,0.6)',     kw:'#c678dd', str:'#98c379', cmt:'#5c6370', num:'#d19a66', fn:'#61afef', bi:'#56b6c2', op:'#e06c75', swatches:['#c678dd','#98c379','#61afef','#d19a66'] },
  { id:'solarized',  name:'SOLARIZED',     bg:'#002b36', base:'#839496', lineNum:'#073642', activeLine:'rgba(7,54,66,0.6)',      kw:'#859900', str:'#2aa198', cmt:'#586e75', num:'#d33682', fn:'#268bd2', bi:'#cb4b16', op:'#657b83', swatches:['#859900','#2aa198','#268bd2','#d33682'] },
  { id:'nightowl',   name:'NIGHT OWL',     bg:'#011627', base:'#d6deeb', lineNum:'#1d3b53', activeLine:'rgba(1,56,95,0.45)',     kw:'#c792ea', str:'#addb67', cmt:'#637777', num:'#f78c6c', fn:'#82aaff', bi:'#7fdbca', op:'#c792ea', swatches:['#c792ea','#addb67','#82aaff','#7fdbca'] },
  { id:'ayu',        name:'AYU MIRAGE',    bg:'#1f2430', base:'#cccac2', lineNum:'#2d3443', activeLine:'rgba(45,52,67,0.5)',     kw:'#ffa759', str:'#bae67e', cmt:'#5c6773', num:'#ffcc66', fn:'#5ccfe6', bi:'#73d0ff', op:'#f29e74', swatches:['#ffa759','#bae67e','#5ccfe6','#ffcc66'] },
  { id:'catppuccin', name:'CATPPUCCIN',    bg:'#1e1e2e', base:'#cdd6f4', lineNum:'#313244', activeLine:'rgba(49,50,68,0.5)',     kw:'#cba6f7', str:'#a6e3a1', cmt:'#585b70', num:'#fab387', fn:'#89b4fa', bi:'#94e2d5', op:'#f38ba8', swatches:['#cba6f7','#a6e3a1','#89b4fa','#fab387'] },
  { id:'rosepine',   name:'ROSÉ PINE',     bg:'#191724', base:'#e0def4', lineNum:'#26233a', activeLine:'rgba(38,35,58,0.5)',     kw:'#c4a7e7', str:'#f6c177', cmt:'#6e6a86', num:'#ebbcba', fn:'#9ccfd8', bi:'#31748f', op:'#eb6f92', swatches:['#c4a7e7','#f6c177','#9ccfd8','#eb6f92'] },
  { id:'kanagawa',   name:'KANAGAWA',      bg:'#1f1f28', base:'#dcd7ba', lineNum:'#2a2a37', activeLine:'rgba(42,42,55,0.5)',     kw:'#957fb8', str:'#98bb6c', cmt:'#727169', num:'#d27e99', fn:'#7e9cd8', bi:'#6a9589', op:'#c0a36e', swatches:['#957fb8','#98bb6c','#7e9cd8','#c0a36e'] },
  { id:'vesper',     name:'VESPER',        bg:'#101010', base:'#c2c2c2', lineNum:'#1e1e1e', activeLine:'rgba(30,30,30,0.6)',     kw:'#ff8080', str:'#99ffe4', cmt:'#404040', num:'#ffbd5e', fn:'#b8a4ff', bi:'#5ef1ff', op:'#ff6e6e', swatches:['#ff8080','#99ffe4','#b8a4ff','#ffbd5e'] },
  { id:'everforest', name:'EVERFOREST',    bg:'#272e33', base:'#d3c6aa', lineNum:'#333c43', activeLine:'rgba(51,60,67,0.5)',     kw:'#e67e80', str:'#a7c080', cmt:'#5b6770', num:'#dbbc7f', fn:'#7fbbb3', bi:'#83c092', op:'#d699b6', swatches:['#e67e80','#a7c080','#7fbbb3','#dbbc7f'] },
  { id:'oxocarbon',  name:'OXOCARBON',     bg:'#161616', base:'#f2f4f8', lineNum:'#262626', activeLine:'rgba(38,38,38,0.55)',    kw:'#ff7eb6', str:'#42be65', cmt:'#393939', num:'#82cfff', fn:'#ee5396', bi:'#3ddbd9', op:'#be95ff', swatches:['#ff7eb6','#42be65','#ee5396','#82cfff'] },
  { id:'synthwave',  name:'SYNTHWAVE 84',  bg:'#262335', base:'#ffffff', lineNum:'#34294f', activeLine:'rgba(52,41,79,0.5)',     kw:'#ff7edb', str:'#ff8b39', cmt:'#848bbd', num:'#f97e72', fn:'#36f9f6', bi:'#72f1b8', op:'#fe4450', swatches:['#ff7edb','#36f9f6','#72f1b8','#fe4450'] },
  { id:'moonlight',  name:'MOONLIGHT',     bg:'#212337', base:'#c8d3f5', lineNum:'#2f334d', activeLine:'rgba(47,51,77,0.5)',     kw:'#ff98a4', str:'#c3e88d', cmt:'#444a73', num:'#ff995e', fn:'#82aaff', bi:'#b4f9f8', op:'#c099ff', swatches:['#ff98a4','#c3e88d','#82aaff','#c099ff'] },
  { id:'github',     name:'GITHUB LIGHT',  bg:'#ffffff', base:'#24292e', lineNum:'#e1e4e8', activeLine:'rgba(225,228,232,0.5)', kw:'#d73a49', str:'#032f62', cmt:'#6a737d', num:'#005cc5', fn:'#6f42c1', bi:'#e36209', op:'#d73a49', swatches:['#d73a49','#032f62','#6f42c1','#005cc5'] },
  { id:'gruvlight',  name:'GRUVBOX LIGHT', bg:'#fbf1c7', base:'#3c3836', lineNum:'#d5c4a1', activeLine:'rgba(213,196,161,0.5)', kw:'#9d0006', str:'#79740e', cmt:'#928374', num:'#8f3f71', fn:'#b57614', bi:'#076678', op:'#af3a03', swatches:['#9d0006','#79740e','#b57614','#076678'] },
  { id:'papercolor', name:'PAPERCOLOR',    bg:'#eeeeee', base:'#444444', lineNum:'#d0d0d0', activeLine:'rgba(208,208,208,0.5)', kw:'#005f87', str:'#718c00', cmt:'#a8a8a8', num:'#8700af', fn:'#d75f00', bi:'#0087af', op:'#d70000', swatches:['#005f87','#718c00','#d75f00','#8700af'] },
  { id:'flexoki',    name:'FLEXOKI',       bg:'#fffcf0', base:'#100f0f', lineNum:'#e6e4d9', activeLine:'rgba(230,228,217,0.5)', kw:'#af3029', str:'#66800b', cmt:'#b7b5ac', num:'#8b7ec8', fn:'#205ea6', bi:'#24837b', op:'#bc5215', swatches:['#af3029','#66800b','#205ea6','#24837b'] },
]

const TERM_PALETTES = [
  { id:'matrix',    name:'MATRIX',       bg:'#020c02', text:'#00ff41', prompt:'#00cc33', dim:'#005c17', error:'#ff435a', warn:'#ffc410', info:'#00ff41', border:'#005c17', cursor:'#00ff41', selection:'rgba(0,255,65,0.2)' },
  { id:'forbinden', name:'FORBINDEN',     bg:'#080810', text:'#c0c8d8', prompt:'#10b981', dim:'#3e3e5a', error:'#ff435a', warn:'#ffc410', info:'#28f1c3', border:'#1a1a2c', cursor:'#10b981', selection:'rgba(16,185,129,0.15)' },
  { id:'dracula',   name:'DRACULA',       bg:'#282a36', text:'#f8f8f2', prompt:'#50fa7b', dim:'#6272a4', error:'#ff5555', warn:'#f1fa8c', info:'#8be9fd', border:'#44475a', cursor:'#f8f8f2', selection:'rgba(68,71,90,0.5)' },
  { id:'tokyo',     name:'TOKYO NIGHT',   bg:'#1a1b2e', text:'#a9b1d6', prompt:'#7dcfff', dim:'#3b4261', error:'#f7768e', warn:'#ff9e64', info:'#2ac3de', border:'#2a2b3d', cursor:'#7dcfff', selection:'rgba(42,43,61,0.6)' },
  { id:'nord',      name:'NORD',          bg:'#2e3440', text:'#d8dee9', prompt:'#88c0d0', dim:'#4c566a', error:'#bf616a', warn:'#ebcb8b', info:'#81a1c1', border:'#3b4252', cursor:'#88c0d0', selection:'rgba(67,76,94,0.5)' },
  { id:'synthwave', name:'SYNTHWAVE',     bg:'#1a1030', text:'#ff7edb', prompt:'#36f9f6', dim:'#5c5080', error:'#fe4450', warn:'#ff8b39', info:'#72f1b8', border:'#34294f', cursor:'#36f9f6', selection:'rgba(54,249,246,0.1)' },
  { id:'gruvbox',   name:'GRUVBOX',       bg:'#1d2021', text:'#ebdbb2', prompt:'#fabd2f', dim:'#504945', error:'#cc241d', warn:'#d79921', info:'#689d6a', border:'#3c3836', cursor:'#fabd2f', selection:'rgba(250,189,47,0.12)' },
  { id:'catppuccin',name:'CATPPUCCIN',    bg:'#1e1e2e', text:'#cdd6f4', prompt:'#a6e3a1', dim:'#585b70', error:'#f38ba8', warn:'#fab387', info:'#89dceb', border:'#313244', cursor:'#a6e3a1', selection:'rgba(166,227,161,0.1)' },
  { id:'kanagawa',  name:'KANAGAWA',      bg:'#1f1f28', text:'#dcd7ba', prompt:'#7e9cd8', dim:'#727169', error:'#e82424', warn:'#ff9e3b', info:'#6a9589', border:'#2a2a37', cursor:'#7e9cd8', selection:'rgba(126,156,216,0.12)' },
  { id:'rosepine',  name:'ROSÉ PINE',     bg:'#191724', text:'#e0def4', prompt:'#9ccfd8', dim:'#6e6a86', error:'#eb6f92', warn:'#f6c177', info:'#31748f', border:'#26233a', cursor:'#9ccfd8', selection:'rgba(156,207,216,0.1)' },
  { id:'hacker',    name:'HACKER',        bg:'#000000', text:'#39ff14', prompt:'#39ff14', dim:'#1a5c09', error:'#ff073a', warn:'#ffe600', info:'#00ffff', border:'#0d3305', cursor:'#39ff14', selection:'rgba(57,255,20,0.15)' },
  { id:'amber',     name:'AMBER',         bg:'#0d0800', text:'#ffb000', prompt:'#ffd700', dim:'#5c3d00', error:'#ff4500', warn:'#ffc400', info:'#ffb000', border:'#2a1a00', cursor:'#ffd700', selection:'rgba(255,176,0,0.15)' },
  { id:'iceberg',   name:'ICEBERG',       bg:'#161821', text:'#c6c8d1', prompt:'#84a0c6', dim:'#444b71', error:'#e27878', warn:'#e2a478', info:'#89b8c2', border:'#2c2f45', cursor:'#84a0c6', selection:'rgba(132,160,198,0.15)' },
  { id:'monokai',   name:'MONOKAI',       bg:'#272822', text:'#f8f8f2', prompt:'#a6e22e', dim:'#75715e', error:'#f92672', warn:'#e6db74', info:'#66d9e8', border:'#3e3d32', cursor:'#a6e22e', selection:'rgba(166,226,46,0.1)' },
  { id:'classic',   name:'CLASSIC',       bg:'#0c0c0c', text:'#cccccc', prompt:'#ffffff', dim:'#666666', error:'#c50f1f', warn:'#c19c00', info:'#3b78ff', border:'#333333', cursor:'#ffffff', selection:'rgba(255,255,255,0.1)' },
  { id:'solarized', name:'SOLARIZED',     bg:'#002b36', text:'#839496', prompt:'#268bd2', dim:'#586e75', error:'#dc322f', warn:'#b58900', info:'#2aa198', border:'#073642', cursor:'#268bd2', selection:'rgba(38,139,210,0.1)' },
]

// ══════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════

const PANEL_IMGS = [
  // Curated manga/art posters
  'Guts.jpeg','Whitebeard.jpeg','Roronoa Zoro.jpeg','PANTHEON.jpeg',
  'Thorfinn _ Vinland saga.jpeg','Choujin X.jpeg','THE CONTROL DEVIL _ GRAPHIC DESIGN.jpeg',
  'God Valley.jpeg','MATT TAYLOR.jpeg','SUBWAY DIMENSIONS.jpeg',
  'Queen Marika the Eternal.jpeg','VOGUE.jpeg','Sight - SKJEGG.jpeg',
  'Poster - Veil.jpeg','SONS OF THE DEVIL Covers 1-5 - toni infante.jpeg',
  'denji starboy album cover.jpeg','yhwach god of the Quincy.jpeg',
  'Makima! 🩸__#Makima #ChainsawMan_#ChainsawManFanart #AnimeArt_#DigitalPainting.jpeg',
  'チェンソーマン ＃１.jpeg','𝐔𝐬𝐨𝐩𝐩.jpeg','Poster One Piece - Wanted Whitebeard 61x91,5cm _ bol.jpeg',
  'CHAOS SMILE.jpeg','Fire Punch.jpeg','Nelliel Brutalism.jpeg',
  // New additions from not-used folder
  '#chainsawman.jpeg',
  'Burning - Inspired by Van Gogh.jpeg',
  'I\'LL TAKE CARE OF YOU _ TYLER THE CREATOR _ DON\'T TAP THE GLASS _ FLOWER BOY.jpeg',
  'Kagurabachi X Bleach.jpeg','Kyora Sazanami Poster.jpeg',
  '0xMC001x.jpeg','0xMC002x.jpeg','0xMC003x.jpeg',
  // Episode art panels
  '0xEP001p.jpeg','0xEP002p.jpeg','0xEP003p.jpeg','0xEP004p.jpeg','0xEP005p.jpeg',
  '0xEP006p.jpeg','0xEP007p.jpeg','0xEP008p.jpeg','0xEP009p.jpeg','0xEP010p.jpeg',
  '0xEP011p.jpeg','0xEP012p.jpeg','0xEP013p.jpeg','0xEP014p.jpeg','0xEP015p.jpeg',
  '0xEP016p.jpeg','0xEP017p.jpeg','0xEP018p.jpeg','0xEP019p.jpeg','0xEP020p.jpeg',
  '0xEP021p.jpeg','0xEP022p.jpeg','0xEP023p.jpeg','0xEP024p.jpeg','0xEP025p.jpeg',
  '0xEP026p.jpeg','0xEP027p.jpeg','0xEP028p.jpeg','0xEP029p.jpeg','0xEP030p.jpeg',
  '0xEP031p.jpeg','0xEP032p.jpeg','0xEP033p.jpeg','0xEP034p.jpeg','0xEP035p.jpeg',
  '0xEP036p.jpeg','0xEP037p.jpeg','0xEP038p.jpeg','0xEP039p.jpeg','0xEP040p.jpeg',
  '0xEP041p.jpeg','0xEP042p.jpeg','0xEP043p.jpeg','0xEP044p.jpeg','0xEP045p.jpeg',
  '0xEP046p.jpeg','0xEP047p.jpeg','0xEP048p.jpeg','0xEP049p.jpeg','0xEP050p.jpeg',
  '0xEP051p.jpeg','0xEP052p.jpeg','0xEP053p.jpeg','0xEP054p.jpeg','0xEP055p.jpeg',
  '0xEP056p.jpeg','0xEP057p.jpeg','0xEP058p.jpeg','0xEP059p.jpeg','0xEP060p.jpeg',
  '0xEP061p.jpeg','0xEP062p.jpeg','0xEP069p.jpeg','0xEP070p.jpeg','0xEP071p.jpeg',
  '0xEP072p.jpeg','0xEP073p.jpeg','0xEP074p.jpeg','0xEP075p.jpeg','0xEP076t.jpeg',
  '0xEP077t.jpeg','0xEP078t.jpeg','0xEP079t.jpeg','0xEP080t.jpeg','0xEP081t.jpeg',
  '0xEP082t.jpeg','0xEP083t.jpeg',
]

function getMangaImgSrc(node) {
  const numId = parseInt((node.id || '').replace(/\D/g,'')) || 0
  const idx = (numId * 11 + (node.themeIdx || 0) * 7) % PANEL_IMGS.length
  return `${import.meta.env.BASE_URL}manga/${encodeURIComponent(PANEL_IMGS[idx])}`
}

function getPanelImg(seed) {
  return `${import.meta.env.BASE_URL}manga/${encodeURIComponent(PANEL_IMGS[seed % PANEL_IMGS.length])}`
}

function highlightCode(code, lang = null) {
  if (!code) return ''
  // Language keywords
  const PY_KW   = /\b(def|class|import|from|return|if|elif|else|for|while|in|not|and|or|True|False|None|pass|break|continue|try|except|finally|with|as|yield|lambda|self|raise|del|global|nonlocal|assert|async|await)\b/g
  const JS_KW   = /\b(function|const|let|var|return|if|else|for|while|in|of|class|import|export|from|default|new|this|true|false|null|undefined|try|catch|finally|async|await|typeof|instanceof|break|continue|switch|case|throw|delete|void|static|extends|super)\b/g
  const SYS_KW  = /\b(int|long|short|char|double|float|bool|void|unsigned|signed|struct|enum|union|typedef|public|private|protected|namespace|template|typename|auto|register|volatile|const|extern|static|inline|virtual|override|final|nullptr|printf|scanf|malloc|free|sizeof|NULL)\b/g
  const GO_KW_RE = /\b(func|package|import|return|if|else|for|range|switch|case|default|break|continue|var|const|type|struct|interface|map|chan|go|defer|select|fallthrough|nil|true|false|make|new|len|cap|append|copy|delete|close|panic|recover|error|string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|any|fmt|os|io)\b/g
  const BUILTINS = /\b(len|range|type|str|int|float|list|dict|set|tuple|map|filter|zip|enumerate|open|super|object|bool|abs|max|min|sum|sorted|reversed|console|Math|JSON|Array|Object|Promise|setTimeout|clearTimeout|setInterval|parseInt|parseFloat|isNaN|fetch|document|window|print|input|repr|println|Println|Printf|Fprintf|Sprintf)\b/g
  const STRINGS  = /("""[\s\S]*?"""|'''[\s\S]*?'''|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g
  const COMMENTS = /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/)/gm
  const NUMBERS  = /(?<![a-zA-Z_$])\b(0x[\da-fA-F]+|0o[0-7]+|0b[01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b(?![a-zA-Z_])/g
  const FUNCS    = /\b([a-zA-Z_$]\w*)(?=\s*\()/g
  const PREPROC  = /^(#\s*(?:include|define|ifndef|ifdef|endif|pragma|undef|if|elif|else)\b.*)$/gm

  let html = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const stored:string[] = []
  const ph = (n:number) => '\x00P' + n + '\x01'
  const store = (cls:string, content:string) => { stored.push(`<span class="${cls}">${content}</span>`); return ph(stored.length-1) }

  html = html.replace(PREPROC,   m  => store('syn-builtin',  m))
  html = html.replace(COMMENTS,  m  => store('syn-comment',  m))
  html = html.replace(STRINGS,   m  => store('syn-string',   m))
  html = html.replace(FUNCS,    (_,fn) => store('syn-function', fn))
  if (lang === 'go') {
    html = html.replace(GO_KW_RE, m => store('syn-keyword', m))
  } else {
    html = html.replace(PY_KW,   m  => store('syn-keyword',  m))
    html = html.replace(JS_KW,   m  => store('syn-keyword',  m))
    html = html.replace(SYS_KW,  m  => store('syn-keyword',  m))
    html = html.replace(GO_KW_RE,m  => store('syn-keyword',  m))
  }
  html = html.replace(BUILTINS,  m  => store('syn-builtin',  m))
  html = html.replace(NUMBERS,   m  => store('syn-number',   m))
  return html.replace(/\x00P(\d+)\x01/g, (_,i) => stored[+i])
}

// ══════════════════════════════════════════════════════════════
//  ICONS
// ══════════════════════════════════════════════════════════════

const I = {
  Files:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  Search:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Git:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 9v12"/><path d="M18 15v-2a3 3 0 0 0-3-3H9"/></svg>,
  Terminal: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  Timeline: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  Message:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Note:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Board:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>,
  Settings: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Plus:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Copy:     () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  Wrap:     () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>,
  Format:   () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/></svg>,
  Find:     () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Diff:     () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  X:        () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Cmd:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>,
}

// ══════════════════════════════════════════════════════════════
//  FLOATING PANEL SYSTEM
// ══════════════════════════════════════════════════════════════

function FloatingPanel({ pid, title, icon, panels, setPanels, panelDragRef, children, minW=240, minH=160, brutal=false, onClose=null, noPad=false }) {
  const p = panels[pid]
  if (!p?.visible) return null

  const bringFront = () => setPanels(ps => {
    const maxZ = Math.max(10, ...Object.values(ps).map((x:any) => x.z||0))
    return ps[pid].z >= maxZ ? ps : {...ps, [pid]: {...ps[pid], z: maxZ+1}}
  })

  const startDrag = (e, mode) => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    document.body.style.userSelect = 'none'
    panelDragRef.current = { pid, mode, sx:e.clientX, sy:e.clientY, x:p.x, y:p.y, w:p.w, h:p.h, minW, minH }
    bringFront()
  }

  const barBg   = brutal ? '#0a0a0a' : 'rgba(5,5,16,.98)'
  const panelBg = brutal ? '#ede8d5' : 'rgba(6,6,18,.97)'
  const border  = brutal ? '3px solid #0f0f0f' : '1px solid rgba(255,42,56,.14)'
  const HW = 6  // handle width
  const CW = 14 // corner handle size

  return (
    <div onMouseDown={bringFront} style={{
      position:'fixed', left:p.x-HW, top:p.y-HW,
      width:p.w+HW*2, height:p.h+HW*2,
      zIndex:p.z||10,
      pointerEvents:'none',
    }}>
      {/* Resize handles — rendered in the outer wrapper (outside overflow:hidden) */}
      {/* E  */}<div onMouseDown={e=>startDrag(e,'resize-e')}  style={{pointerEvents:'all',position:'absolute',right:0,top:CW,bottom:CW,width:HW,cursor:'ew-resize',zIndex:2}}/>
      {/* W  */}<div onMouseDown={e=>startDrag(e,'resize-w')}  style={{pointerEvents:'all',position:'absolute',left:0,top:CW,bottom:CW,width:HW,cursor:'ew-resize',zIndex:2}}/>
      {/* S  */}<div onMouseDown={e=>startDrag(e,'resize-s')}  style={{pointerEvents:'all',position:'absolute',left:CW,right:CW,bottom:0,height:HW,cursor:'ns-resize',zIndex:2}}/>
      {/* N  */}<div onMouseDown={e=>startDrag(e,'resize-n')}  style={{pointerEvents:'all',position:'absolute',left:CW,right:CW,top:0,height:HW,cursor:'ns-resize',zIndex:2}}/>
      {/* SE */}<div onMouseDown={e=>startDrag(e,'resize-se')} style={{pointerEvents:'all',position:'absolute',right:0,bottom:0,width:CW,height:CW,cursor:'se-resize',zIndex:3}}/>
      {/* SW */}<div onMouseDown={e=>startDrag(e,'resize-sw')} style={{pointerEvents:'all',position:'absolute',left:0,bottom:0,width:CW,height:CW,cursor:'sw-resize',zIndex:3}}/>
      {/* NE */}<div onMouseDown={e=>startDrag(e,'resize-ne')} style={{pointerEvents:'all',position:'absolute',right:0,top:0,width:CW,height:CW,cursor:'ne-resize',zIndex:3}}/>
      {/* NW */}<div onMouseDown={e=>startDrag(e,'resize-nw')} style={{pointerEvents:'all',position:'absolute',left:0,top:0,width:CW,height:CW,cursor:'nw-resize',zIndex:3}}/>

      {/* Actual panel (offset inward by HW) */}
      <div onMouseDown={e=>{e.stopPropagation();bringFront()}} style={{
        position:'absolute', left:HW, top:HW, right:HW, bottom:HW,
        display:'flex', flexDirection:'column', overflow:'hidden',
        background:panelBg, border, boxShadow:'0 8px 48px rgba(0,0,0,.8)',
        borderRadius: brutal ? 0 : 3,
        pointerEvents:'all',
      }}>
        {/* Title bar */}
        <div onMouseDown={e=>startDrag(e,'move')} style={{
          height:26, flexShrink:0, display:'flex', alignItems:'center',
          gap:6, padding:'0 8px', cursor:'grab', userSelect:'none',
          background:barBg, borderBottom:brutal?'2px solid rgba(255,255,255,.06)':'1px solid rgba(255,42,56,.1)',
        }}>
          {icon && <span style={{opacity:.5, fontSize:'12px'}}>{icon}</span>}
          <span style={{flex:1, fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'9px', letterSpacing:'.14em', opacity:.5, color: brutal?'#f0ece0':'#c0c8d8'}}>{title}</span>
          <div style={{display:'flex',gap:3,alignItems:'center'}}>
            <div title="Minimise" style={{width:9,height:9,borderRadius:'50%',background:'#ffbd2e',opacity:.7,cursor:'pointer'}}
              onMouseDown={e=>{e.stopPropagation(); setPanels(ps=>({...ps,[pid]:{...ps[pid],h:26}}))}}/>
            <div title="Close" style={{width:9,height:9,borderRadius:'50%',background:'#ff5f57',opacity:.7,cursor:'pointer'}}
              onMouseDown={e=>{e.stopPropagation(); onClose ? onClose() : setPanels(ps=>({...ps,[pid]:{...ps[pid],visible:false}}))}}/>
          </div>
        </div>
        {/* Body */}
        <div style={{flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0}}>
          {children}
        </div>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
//  TIMELINE PANEL — VS Code terminal style, bottom scrubber
// ══════════════════════════════════════════════════════════════

function TimelinePanel({ eventLog, brutal, onPhMsChange=null }) {
  const [phMs,    setPhMsInternal] = useState(() => Date.now())
  const [playing, setPlaying]  = useState(false)
  const [filter,  setFilter]   = useState('all')
  const [expanded,setExpanded] = useState(null)
  const rafRef   = useRef(null)
  const trackRef = useRef(null)
  const listRef  = useRef(null)

  const setPhMs = (v) => {
    const ms = typeof v === 'function' ? v(phMs) : v
    setPhMsInternal(ms)
    onPhMsChange?.(ms)
  }

  const sorted   = useMemo(() => [...eventLog].sort((a,b)=>a.ts-b.ts), [eventLog])
  const tStart   = sorted.length ? sorted[0].ts : Date.now()-10000
  const tEnd     = sorted.length ? sorted[sorted.length-1].ts+2000 : Date.now()
  const tDur     = Math.max(tEnd-tStart, 1000)
  const prog     = Math.max(0, Math.min(1, (phMs-tStart)/tDur))

  const filtered = useMemo(() => {
    if (filter === 'all') return sorted
    const tr = TL_TRACKS.find(t=>t.key===filter)
    return tr ? sorted.filter(e=>tr.types.includes(e.type)) : sorted
  }, [sorted, filter])

  const fmtRel = (ms) => {
    const diff = Date.now() - ms
    if (diff < 5000)  return 'just now'
    if (diff < 60000) return `${Math.floor(diff/1000)}s ago`
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`
    return new Date(ms).toLocaleTimeString('en', {hour12:false,hour:'2-digit',minute:'2-digit'})
  }

  const fmtT = (ms) => {
    const rel=Math.max(0,ms-tStart)
    const s=Math.floor(rel/1000),m=Math.floor(s/60)
    return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  }

  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return }
    let last = performance.now()
    const tick = now => {
      const dt=now-last; last=now
      setPhMs(p => { const n=p+dt*1.5; if (n>=tEnd){setPlaying(false);return tEnd} return n })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, tEnd])

  const scrubAt = (e) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setPhMs(tStart + r * tDur)
  }

  const text = brutal ? '#0f0f0f' : '#c0c8d8'
  const sep  = brutal ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.05)'

  const btnS:any = {
    background:'transparent', border:'none', cursor:'pointer',
    color:'#5a5a7a', fontFamily:"'JetBrains Mono',monospace",
    fontSize:'12px', padding:'0 3px', lineHeight:1, outline:'none',
    transition:'color .1s',
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'#05050f',overflow:'hidden',userSelect:'none'}}>

      {/* ── Transport + scrubber ── */}
      <div style={{flexShrink:0,borderBottom:`1px solid ${sep}`,background:'rgba(0,0,0,.3)'}}>
        <div style={{display:'flex',alignItems:'center',gap:2,padding:'3px 8px'}}>
          <button type="button" style={btnS} onClick={()=>{setPlaying(false);setPhMs(tStart)}} title="Jump to start">⏮</button>
          <button type="button" style={{...btnS,color:playing?'#ff2a38':'#10b981',fontSize:'13px'}} onClick={()=>setPlaying(p=>!p)}>{playing?'⏸':'▶'}</button>
          <button type="button" style={btnS} onClick={()=>{setPlaying(false);setPhMs(tEnd)}} title="Jump to end">⏭</button>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'9px',color:'#bb9af7',
            background:'rgba(187,154,247,.08)',border:'1px solid rgba(187,154,247,.15)',
            padding:'1px 5px',borderRadius:2,letterSpacing:'.03em',flexShrink:0,marginLeft:2}}>
            {fmtT(phMs)}
          </div>
          <div style={{flex:1}}/>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'#5a5a7a'}}>
            {filtered.length}/{sorted.length}
          </span>
        </div>

        {/* Scrubber bar */}
        <div ref={trackRef} style={{position:'relative',height:18,cursor:'crosshair',background:'rgba(0,0,0,.4)',margin:'0 0 3px'}}
          onMouseDown={e=>{scrubAt(e);const move=ev=>scrubAt(ev);const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up)};document.addEventListener('mousemove',move);document.addEventListener('mouseup',up)}}>
          {/* Event ticks */}
          {filtered.map(ev=>(
            <div key={ev.id} style={{position:'absolute',left:`${((ev.ts-tStart)/tDur)*100}%`,top:0,width:2,height:'100%',background:TL_COL[ev.type]||'#607080',opacity:.6,pointerEvents:'none',borderRadius:1}}/>
          ))}
          {/* Played region */}
          <div style={{position:'absolute',left:0,top:'40%',height:'20%',width:`${prog*100}%`,background:'rgba(255,42,56,.3)',pointerEvents:'none'}}/>
          {/* Playhead */}
          <div style={{position:'absolute',left:`${prog*100}%`,top:0,bottom:0,transform:'translateX(-50%)',pointerEvents:'none',zIndex:5}}>
            <div style={{width:2,height:'100%',background:'#ff2a38',boxShadow:'0 0 4px #ff2a38'}}/>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{display:'flex',alignItems:'center',gap:0,padding:'0 6px 4px',overflowX:'auto',scrollbarWidth:'none'}}>
          {[{key:'all',label:'ALL',color:'#8a8aa0'},...TL_TRACKS].map(tr=>(
            <button type="button" key={tr.key} onClick={()=>setFilter(f=>f===tr.key&&tr.key!=='all'?'all':tr.key)}
              style={{...btnS,fontSize:'7px',letterSpacing:'.1em',padding:'1px 5px',
                color:filter===tr.key?tr.color:'#3e3e5a',
                borderBottom:filter===tr.key?`1px solid ${tr.color}`:'1px solid transparent',
                flexShrink:0,
              }}>{tr.label}</button>
          ))}
        </div>
      </div>

      {/* ── Event list ── */}
      <div ref={listRef} style={{flex:1,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.06) transparent'}}>
        {filtered.length === 0 ? (
          <div style={{padding:'24px 12px',textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'#3e3e5a',letterSpacing:'.08em',lineHeight:2}}>
            NO EVENTS<br/><span style={{fontSize:'9px',opacity:.7}}>start editing to record history</span>
          </div>
        ) : (
          [...filtered].reverse().map(ev => {
            const col     = TL_COL[ev.type] || '#607080'
            const isSel   = expanded === ev.id
            const isPast  = ev.ts <= phMs
            return (
              <div key={ev.id}
                onClick={()=>{setExpanded(s=>s===ev.id?null:ev.id);setPhMs(ev.ts)}}
                style={{
                  display:'flex', alignItems:'center', gap:0,
                  borderLeft:`2px solid ${isSel?col:'transparent'}`,
                  background: isSel ? 'rgba(255,255,255,.04)' : 'transparent',
                  opacity: isPast ? 1 : 0.35,
                  cursor:'pointer', minHeight:24,
                }}
                onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,.03)'}}
                onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='transparent'}}
              >
                {/* Color dot */}
                <div style={{width:26,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:col,boxShadow:isSel?`0 0 5px ${col}`:'none'}}/>
                </div>
                {/* Icon + label */}
                <div style={{flex:1,minWidth:0,padding:'3px 0'}}>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{fontSize:'11px',lineHeight:1,flexShrink:0}}>{ev.icon}</span>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:isSel?col:text,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{ev.label}</span>
                  </div>
                  {isSel && (
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2}}>
                      <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',
                        letterSpacing:'.1em',color:col,opacity:.8}}>
                        {ev.type.toUpperCase().replace(/-/g,' ')}
                      </span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'8px',color:'#5a5a7a'}}>
                        {new Date(ev.ts).toLocaleTimeString('en',{hour12:false})}
                      </span>
                    </div>
                  )}
                </div>
                {/* Relative time */}
                <div style={{padding:'0 8px',flexShrink:0,fontFamily:"'JetBrains Mono',monospace",fontSize:'8px',color:'#3e3e5a',textAlign:'right'}}>
                  {fmtRel(ev.ts)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  CODE EDITOR COMPONENT
// ══════════════════════════════════════════════════════════════

function CodeEditor({ node, onChange, externalPalette }) {
  const [palette, setPalette] = useState(PALETTES[0])
  useEffect(() => { if (externalPalette) setPalette(externalPalette) }, [externalPalette?.id])
  const [showPaletteMenu, setShowPaletteMenu] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [wordWrap, setWordWrap] = useState(false)
  const [cursor, setCursor] = useState({ line:1, col:1 })
  const [toastMsg, setToastMsg] = useState('')
  const [fontSize, setFontSize] = useState(13)
  const [minimap, setMinimap] = useState(true)
  const textareaRef = useRef(null)
  const lineNumRef = useRef(null)
  const overlayRef = useRef(null)
  const [acList, setAcList] = useState([])
  const [acIdx, setAcIdx] = useState(0)
  const code = node.code || ''
  const lineH = fontSize * 1.65

  const showToast = (msg) => { setToastMsg(''); setTimeout(() => setToastMsg(msg), 10); setTimeout(() => setToastMsg(''), 1800) }
  const handleScroll = () => {
    if (lineNumRef.current && textareaRef.current) lineNumRef.current.scrollTop = textareaRef.current.scrollTop
    if (overlayRef.current && textareaRef.current) overlayRef.current.style.transform = `translateY(-${textareaRef.current.scrollTop}px)`
  }
  const isJS = node.label?.match(/\.(js|ts|jsx|tsx|mjs)$/)
  const nodeLang = detectLang(node.label || '')

  const AC_JS = ['function','const','let','var','return','if','else','for','while','switch','case',
    'class','import','export','from','default','new','this','typeof','instanceof','async','await',
    'try','catch','finally','throw','break','continue','null','undefined','true','false',
    'console.log','console.error','console.warn','console.table','console.info',
    'Math.floor','Math.ceil','Math.round','Math.random','Math.max','Math.min','Math.abs','Math.sqrt','Math.PI',
    'JSON.stringify','JSON.parse','Array.from','Array.isArray',
    'Object.keys','Object.values','Object.entries','Object.assign','Object.fromEntries',
    'parseInt','parseFloat','isNaN','String','Number','Boolean','Array','Object','Promise',
    'setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame',
    'fetch','document','window','localStorage','performance.now',
    'Promise.all','Promise.race','Promise.resolve','Promise.reject',
  ]
  const AC_PY = ['def ','class ','import ','from ','return ','if ','elif ','else:','for ','while ',
    'in ','not ','and ','or ','True','False','None','pass','break','continue','raise ',
    'try:','except ','except Exception as e:','finally:','with ','as ','yield ','lambda ','async def ',
    'print(','len(','range(','list(','dict(','set(','tuple(','str(','int(','float(','bool(',
    'type(','isinstance(','hasattr(','getattr(','enumerate(','zip(',
    'map(','filter(','sorted(','reversed(','sum(','max(','min(','abs(',
    'open(','super().__init__()','self.','__init__','__str__','__repr__','__len__',
  ]

  const computeAc = (newCode, pos) => {
    const before = newCode.slice(0, pos)
    const m = before.match(/[\w.]+$/)
    const word = m ? m[0] : ''
    if (!word) { setAcList([]); return }
    const base = isJS ? AC_JS : AC_PY
    const fileWords = [...new Set((newCode.match(/\b[a-zA-Z_]\w{2,}\b/g) || []))].filter(w => w !== word && w.length > 2)
    const all = [...base, ...fileWords]
    const wl = word.toLowerCase()
    const matches = [...new Set(all.filter(s => s.toLowerCase().startsWith(wl)))].slice(0, 9)
    setAcList(matches); setAcIdx(0)
  }

  const insertAc = (item) => {
    const ta = textareaRef.current; if (!ta) return
    const s = ta.selectionStart
    const before = code.slice(0, s)
    const word = (before.match(/[\w.]+$/) || [''])[0]
    const newCode = code.slice(0, s - word.length) + item + code.slice(s)
    onChange(newCode)
    setAcList([])
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s - word.length + item.length; ta.focus() }, 0)
  }
  const tabStr = '  ' // 2 spaces

  const handleKeyDown = (e) => {
    const ta = e.target
    const s = ta.selectionStart, en = ta.selectionEnd
    const before = code.substring(0, s)
    const after  = code.substring(en)

    // Autocomplete intercept
    if (acList.length > 0) {
      if (e.key === 'Escape') { e.preventDefault(); setAcList([]); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setAcIdx(i => (i+1) % acList.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setAcIdx(i => (i-1+acList.length) % acList.length); return }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertAc(acList[acIdx]); return }
    }

    // Tab — insert 2 spaces (Shift+Tab dedents)
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        const lineStart = before.lastIndexOf('\n') + 1
        if (code.substring(lineStart).startsWith('  ')) {
          const newCode = code.substring(0, lineStart) + code.substring(lineStart + 2)
          onChange(newCode)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = Math.max(s - 2, lineStart) }, 0)
        }
      } else {
        onChange(before + '  ' + after)
        setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2 }, 0)
      }
      return
    }

    // Enter — match current line indentation
    if (e.key === 'Enter') {
      e.preventDefault()
      const lineStart = before.lastIndexOf('\n') + 1
      const currentLine = code.substring(lineStart, s)
      const indent = currentLine.match(/^(\s*)/)[1]
      const lastChar = before.trimEnd().slice(-1)
      const extra = '{[('.includes(lastChar) ? '  ' : ''
      onChange(before + '\n' + indent + extra + after)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 1 + indent.length + extra.length }, 0)
      return
    }

    if ((e.ctrlKey||e.metaKey) && e.key==='f') { e.preventDefault(); setShowFind(v=>!v) }
    if ((e.ctrlKey||e.metaKey) && e.key==='/') { e.preventDefault(); toggleLineComment() }
    if ((e.ctrlKey||e.metaKey) && e.key==='d') { e.preventDefault(); setShowDiff(v=>!v) }
  }
  const handleCursorUpdate = (e) => {
    const ta=e.target, before=code.substring(0,ta.selectionStart)
    const nl=(before.match(/\n/g)||[]).length+1
    setCursor({line:nl, col:ta.selectionStart-before.lastIndexOf('\n')})
  }
  useEffect(() => {
    if (!showPaletteMenu) return
    const h = () => setShowPaletteMenu(false)
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [showPaletteMenu])
  const handleCopy = () => { navigator.clipboard.writeText(code).catch(()=>{}); showToast('COPIED') }
  const handleFormat = () => { const formatted = code.split('\n').map(l=>l.replace(/\s+$/,'')).join('\n').replace(/\n{3,}/g,'\n\n'); onChange(formatted); showToast('FORMATTED') }
  const handleFindReplace = () => { if (!findQuery) return; const count=(code.split(findQuery).length-1); onChange(code.split(findQuery).join(replaceQuery)); showToast(`REPLACED ${count} INSTANCES`) }
  const toggleLineComment = () => {
    const ta = textareaRef.current
    const sel0 = ta.selectionStart, sel1 = ta.selectionEnd
    const marker = isJS ? '//' : '#'
    const before = code.substring(0, sel0)
    const lineStart = before.lastIndexOf('\n') + 1
    // multi-line: cover all selected lines
    const selEnd = sel1 > sel0 ? sel1 : sel0
    const lastNl = code.indexOf('\n', selEnd)
    const lineEnd = lastNl === -1 ? code.length : lastNl
    const selected = code.substring(lineStart, lineEnd)
    const lines = selected.split('\n')
    const allCommented = lines.every(l => l.trimStart().startsWith(marker))
    const toggled = allCommented
      ? lines.map(l => l.replace(new RegExp(`^(\\s*)${marker.replace('/','\\/')}\\s?`), '$1'))
      : lines.map(l => l.replace(/^(\s*)/, `$1${marker} `))
    const newCode = code.substring(0, lineStart) + toggled.join('\n') + code.substring(lineEnd)
    onChange(newCode)
    showToast('COMMENT')
  }
  const diffLines = useMemo(() => code.split('\n').map((line,i)=>({ type:i===1&&node.modified?'add':i===2&&node.modified?'del':'ctx', text:line, num:i+1 })), [code,node.modified])
  const cssVars = { '--syn-kw':palette.kw,'--syn-str':palette.str,'--syn-cmt':palette.cmt,'--syn-num':palette.num,'--syn-fn':palette.fn,'--syn-bi':palette.bi,'--syn-op':palette.op }
  const highlighted = highlightCode(code, nodeLang)
  const activeLineY = (cursor.line - 1) * lineH
  const minimapLines = useMemo(() => code.split('\n').slice(0,50).map(l=>({len:Math.min(l.length,80),indent:l.match(/^\s*/)[0].length})), [code])
  const LIGHT_IDS = ['github','gruvlight','papercolor','flexoki']

  return (
    <div className="editor-palette-scope" style={{display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden',background:palette.bg}}
      ref={el => el && Object.entries(cssVars).forEach(([k,v])=>el.style.setProperty(k,v))}>
      {/* Toolbar */}
      <div className="ide-editor-toolbar">
        {/* Language pill */}
        {(() => {
          const langColors = { js:'#f2c12e', ts:'#4285f4', py:'#28f1c3', c:'#ff8080', cpp:'#ff8080', go:'#89ddff', md:'#c792ea', unknown:'#888' }
          const lc = langColors[nodeLang] || '#888'
          const ln = { js:'JS', ts:'TS', py:'PY', c:'C', cpp:'C++', go:'GO', md:'MD', unknown:'TXT' }[nodeLang] || nodeLang.toUpperCase()
          return (
            <span style={{padding:'1px 7px',fontSize:'9px',fontFamily:"'Oswald',sans-serif",fontWeight:700,letterSpacing:'.1em',
              background:`${lc}18`, color:lc, border:`1px solid ${lc}44`,
            }}>{ln}</span>
          )
        })()}
        <div className="ide-tb-sep"/>
        <button className="ide-tb-btn" onClick={handleCopy}><I.Copy/> COPY</button>
        <button className="ide-tb-btn" onClick={handleFormat}><I.Format/> FORMAT</button>
        <button className="ide-tb-btn" onClick={toggleLineComment} title="Ctrl+/">{isJS?'//':'#'} CMT</button>
        <div className="ide-tb-sep"/>
        <button className={`ide-tb-btn ${showFind?'active':''}`} onClick={()=>setShowFind(v=>!v)} title="Ctrl+F"><I.Find/> FIND</button>
        <button className={`ide-tb-btn ${wordWrap?'active':''}`} onClick={()=>setWordWrap(v=>!v)}><I.Wrap/> WRAP</button>
        <div className="ide-tb-sep"/>
        <button className="ide-tb-btn" onClick={()=>setFontSize(s=>Math.max(10,s-1))}>A−</button>
        <span style={{fontSize:'10px',opacity:.6,padding:'0 2px',color:palette.base,fontFamily:"'Share Tech Mono', monospace"}}>{fontSize}</span>
        <button className="ide-tb-btn" onClick={()=>setFontSize(s=>Math.min(20,s+1))}>A+</button>
        <div style={{marginLeft:'auto',position:'relative'}}>
          <button className={`ide-tb-btn ${showPaletteMenu?'active':''}`} onClick={()=>setShowPaletteMenu(v=>!v)} style={{gap:'4px'}}>
            <div style={{display:'flex',gap:'3px'}}>{palette.swatches.map((c,i)=><div key={i} style={{width:'8px',height:'8px',borderRadius:'2px',background:c}}/>)}</div>
            {palette.name}
          </button>
          {showPaletteMenu && (
            <div className="ide-palette-dropdown" onClick={e=>e.stopPropagation()}>
              <div className="ide-palette-sec">DARK</div>
              {PALETTES.filter(p=>!LIGHT_IDS.includes(p.id)).map(p=>(
                <div key={p.id} className={`ide-palette-opt ${palette.id===p.id?'active':''}`} onClick={()=>{setPalette(p);setShowPaletteMenu(false)}} style={{background:p.bg}}>
                  <div className="ide-palette-swatches">{p.swatches.map((c,i)=><div key={i} className="ide-palette-swatch" style={{background:c}}/>)}</div>
                  <span className="ide-palette-name" style={{color:p.base}}>{p.name}</span>
                </div>
              ))}
              <div className="ide-palette-sec">LIGHT</div>
              {PALETTES.filter(p=>LIGHT_IDS.includes(p.id)).map(p=>(
                <div key={p.id} className={`ide-palette-opt ${palette.id===p.id?'active':''}`} onClick={()=>{setPalette(p);setShowPaletteMenu(false)}} style={{background:p.bg}}>
                  <div className="ide-palette-swatches">{p.swatches.map((c,i)=><div key={i} className="ide-palette-swatch" style={{background:c}}/>)}</div>
                  <span className="ide-palette-name" style={{color:p.base}}>{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Find bar */}
      {showFind && (
        <div className="ide-find-bar">
          <span style={{fontSize:'9px',opacity:.5,flexShrink:0,color:palette.base}}>FIND</span>
          <input value={findQuery} onChange={e=>setFindQuery(e.target.value)} placeholder="Search..." spellCheck={false} style={{color:palette.base}} />
          <span style={{fontSize:'9px',opacity:.35,flexShrink:0,color:palette.base}}>→</span>
          <input value={replaceQuery} onChange={e=>setReplaceQuery(e.target.value)} placeholder="Replace..." spellCheck={false} style={{color:palette.base}} />
          <button className="ide-tb-btn" onClick={handleFindReplace} style={{flexShrink:0}}>REPLACE ALL</button>
          <button className="ide-tb-btn" onClick={()=>setShowFind(false)} style={{flexShrink:0,color:'#ff435a'}}>✕</button>
        </div>
      )}
      {/* Main editor area */}
      <div style={{display:'flex',flex:1,overflow:'hidden',minHeight:0}}>
        {/* Diff panel */}
        {showDiff && (
          <div style={{width:'200px',flexShrink:0,borderRight:`1px solid ${palette.lineNum}44`,overflow:'auto',background:palette.bg,display:'flex',flexDirection:'column'}}>
            <div style={{padding:'7px 10px',fontSize:'9px',opacity:.4,borderBottom:`1px solid ${palette.lineNum}44`,letterSpacing:'1px',color:palette.base}}>DIFF — WORKING TREE</div>
            <div style={{flex:1,overflow:'auto',padding:'8px 0'}}>
              {diffLines.map((dl,i)=>(
                <div key={i} className={`diff-line ${dl.type==='add'?'diff-add':dl.type==='del'?'diff-del':''}`} style={{fontSize:'10px',color:palette.base}}>
                  <span className="diff-line-num" style={{color:palette.lineNum}}>{dl.num||'+'}</span>
                  <span style={{fontFamily:"'JetBrains Mono',monospace"}}>{dl.text||' '}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Line numbers */}
        <div className="line-numbers" ref={lineNumRef} style={{background:palette.bg,color:palette.lineNum,fontSize:fontSize+'px',lineHeight:lineH+'px',overflow:'hidden',flexShrink:0,userSelect:'none',textAlign:'right',padding:`20px 8px 20px 4px`,minWidth:'36px'}}>
          {code.split('\n').map((_,i)=>(
            <div key={i} className="line-num" style={{lineHeight:lineH+'px',color:i===cursor.line-1?palette.base:palette.lineNum}}>{i+1}</div>
          ))}
        </div>
        {/* Code area */}
        <div style={{flex:1,position:'relative',overflow:'hidden'}}>
          <div className="active-line-highlight" style={{top:20+activeLineY,height:lineH,background:palette.activeLine,borderLeft:`2px solid ${palette.kw}55`,pointerEvents:'none',zIndex:1}}/>
          <div className="code-highlight-overlay" ref={overlayRef} style={{position:'absolute',top:0,left:0,right:0,padding:`20px 14px`,fontFamily:"'JetBrains Mono',monospace",fontSize:fontSize+'px',lineHeight:lineH+'px',pointerEvents:'none',color:palette.base,overflow:'hidden',whiteSpace:wordWrap?'pre-wrap':'pre'}}>
            <pre className="editor-palette-scope" style={{margin:0,fontFamily:"'JetBrains Mono',monospace",fontSize:fontSize+'px',lineHeight:lineH+'px',color:palette.base,whiteSpace:wordWrap?'pre-wrap':'pre'}} dangerouslySetInnerHTML={{__html:highlighted}}/>
          </div>
          <textarea
            ref={textareaRef}
            className="code-area"
            value={code}
            onChange={e=>{onChange(e.target.value); computeAc(e.target.value, e.target.selectionStart)}}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            onSelect={e=>{handleCursorUpdate(e)}}
            onClick={e=>{handleCursorUpdate(e)}}
            onBlur={()=>setTimeout(()=>setAcList([]),150)}
            spellCheck={false}
            style={{position:'absolute',inset:0,padding:`20px 14px`,fontFamily:"'JetBrains Mono',monospace",fontSize:fontSize+'px',lineHeight:lineH+'px',color:'transparent',caretColor:palette.fn,background:'transparent',border:'none',outline:'none',resize:'none',zIndex:2,whiteSpace:wordWrap?'pre-wrap':'pre',overflowWrap:wordWrap?'break-word':'normal',overflow:'auto'}}
          />
          {/* Autocomplete dropdown */}
          {acList.length > 0 && (
            <div style={{
              position:'absolute',
              top: Math.min((cursor.line) * lineH + 20 - (textareaRef.current?.scrollTop||0), (lineH*20)),
              left: Math.min(36 + 14 + (cursor.col - 1) * (fontSize * 0.605), '60%'),
              zIndex:20, minWidth:180, maxWidth:300,
              background:palette.bg, border:`1px solid ${palette.kw}55`,
              boxShadow:`0 6px 24px rgba(0,0,0,.7)`,
              fontFamily:"'JetBrains Mono',monospace", fontSize:(fontSize-1)+'px',
              overflow:'hidden', borderRadius:2,
            }}>
              {acList.map((item,i)=>(
                <div key={item} onMouseDown={e=>{e.preventDefault();insertAc(item)}}
                  style={{padding:'4px 10px',cursor:'pointer',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                    background:i===acIdx?palette.kw+'28':'transparent',
                    color:i===acIdx?palette.kw:palette.base,borderLeft:i===acIdx?`2px solid ${palette.kw}`:'2px solid transparent'}}>
                  {item}
                </div>
              ))}
              <div style={{padding:'2px 10px',opacity:.3,fontSize:(fontSize-3)+'px',borderTop:`1px solid ${palette.lineNum}33`}}>
                Tab/↵ insert · Esc close
              </div>
            </div>
          )}
        </div>
        {/* Minimap */}
        {minimap && (
          <div style={{width:'56px',flexShrink:0,background:palette.bg,borderLeft:`1px solid ${palette.lineNum}22`,overflow:'hidden',padding:'8px 4px',cursor:'default'}}>
            <svg width="48" height="100%" style={{display:'block',overflow:'visible'}}>
              {minimapLines.map((l,i)=>(
                <rect key={i} x={l.indent * 0.3} y={i * 3.2} width={l.len * 0.38} height={1.6} fill={palette.lineNum} opacity=".7" rx=".5"/>
              ))}
              <rect x={0} y={(cursor.line-1)*3.2} width={48} height={3.5} fill={palette.kw} opacity=".12" rx="1"/>
            </svg>
          </div>
        )}
      </div>
      {/* Status strip */}
      <div className="editor-status-strip" style={{background:palette.bg,borderTop:`1px solid ${palette.lineNum}33`,color:palette.base}}>
        <span style={{opacity:.45}}>Ln {cursor.line}:{cursor.col}</span>
        <span style={{opacity:.2}}>|</span>
        <span style={{opacity:.45}}>{code.split('\n').length}L</span>
        <span style={{opacity:.2}}>|</span>
        <span style={{color:palette.fn,opacity:.7}}>{node.type}</span>
        {node.modified && <><span style={{opacity:.2}}>|</span><span style={{color:'#ffc410',fontSize:'8px'}}>● MOD</span></>}
        <span style={{opacity:.2}}>|</span>
        <span style={{opacity:.22,fontSize:'11px'}}>^Enter RUN · ^/ CMT · ^F FIND · Tab INDENT</span>
        <span style={{marginLeft:'auto',opacity:.35}}>{palette.name}</span>
      </div>
      {toastMsg && <div className="copy-toast">{toastMsg}</div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  COMMAND PALETTE — with live theme preview
// ══════════════════════════════════════════════════════════════

const EXTENDED_CMD_ITEMS = [
  // Actions
  { icon:'F', label:'New file node',           hint:'N',          action:'new-node',    group:'GRAPH' },
  { icon:'G', label:'New class group',         hint:'G',          action:'new-group',   group:'GRAPH' },
  { icon:'J', label:'Join nodes (add edge)',   hint:'J',          action:'edge-add',    group:'GRAPH' },
  { icon:'X', label:'Cut edge',               hint:'X',          action:'edge-cut',    group:'GRAPH' },
  { icon:'▶', label:'Run active file',         hint:'Ctrl+Enter', action:'run',         group:'RUN'   },
  { icon:'T', label:'Open terminal',           hint:'`',          action:'terminal',    group:'VIEW'  },
  { icon:'B', label:'Open kanban board',       hint:'',           action:'board',       group:'VIEW'  },
  { icon:'⌚', label:'Show timeline',           hint:'',           action:'timeline',    group:'VIEW'  },
  { icon:'⎇', label:'Toggle Git panel',        hint:'',           action:'git',         group:'VIEW'  },
  { icon:'◉', label:'Toggle sidebar',          hint:'',           action:'sidebar',     group:'VIEW'  },
  { icon:'/', label:'Toggle line comment',     hint:'Ctrl+/',     action:'comment',     group:'EDIT'  },
  { icon:'⤢', label:'Toggle word wrap',        hint:'',           action:'wordwrap',    group:'EDIT'  },
  { icon:'⊞', label:'Zoom in',                hint:'',           action:'zoom-in',     group:'VIEW'  },
  { icon:'⊟', label:'Zoom out',               hint:'',           action:'zoom-out',    group:'VIEW'  },
  { icon:'⊡', label:'Reset zoom',             hint:'',           action:'zoom-reset',  group:'VIEW'  },
  { icon:'⌕', label:'Quick open file',        hint:'Ctrl+P',     action:'file-finder', group:'NAVIGATE' },
  { icon:'⊞', label:'Go to line',             hint:'Ctrl+G',     action:'jump-line',   group:'NAVIGATE' },
  { icon:'≡', label:'File outline',           hint:'Ctrl+Shift+O',action:'outline',    group:'NAVIGATE' },
  { icon:'⌕', label:'Search in files',        hint:'Ctrl+Shift+F',action:'project-search',group:'NAVIGATE' },
  { icon:'✦', label:'Zen mode',              hint:'Ctrl+Shift+Z',action:'zen',             group:'VIEW'  },
  { icon:'⬡', label:'AI Assistant',          hint:'',           action:'ai',              group:'VIEW'  },
  { icon:'⬓', label:'Split editor vertical', hint:'',           action:'split-vertical',  group:'VIEW'  },
  { icon:'⬔', label:'Split editor horizontal',hint:'',          action:'split-horizontal',group:'VIEW'  },
  { icon:'✕', label:'Close split',           hint:'',           action:'split-close',     group:'VIEW'  },
  { icon:'📁', label:'Open folder',           hint:'',           action:'open-folder', group:'FILE'  },
  { icon:'💾', label:'Save file',             hint:'Ctrl+S',     action:'save',        group:'FILE'  },
  ...PALETTES.map(p => ({
    icon:'🎨', label:`Theme: ${p.name}`,       hint:'',           action:`theme:${p.id}`, group:'THEME', palette: p,
  })),
]

function CommandPalette({ isOpen, onClose, onAction, previewPalette, onPreviewPalette }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return EXTENDED_CMD_ITEMS
    return EXTENDED_CMD_ITEMS.filter(i =>
      i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)
    )
  }, [query])

  useEffect(() => {
    if (isOpen) { setQuery(''); setFocused(0); setTimeout(() => inputRef.current?.focus(), 10) }
    else { onPreviewPalette?.(null) }
  }, [isOpen])

  useEffect(() => { setFocused(0) }, [query])

  if (!isOpen) return null

  const grouped: Record<string, typeof EXTENDED_CMD_ITEMS> = {}
  filtered.forEach(item => {
    if (!grouped[item.group]) grouped[item.group] = []
    grouped[item.group].push(item)
  })

  // Flat list for keyboard navigation
  const flatItems = filtered

  const execItem = (item: any) => {
    onPreviewPalette?.(null)
    onAction(item.action || item.label)
    onClose()
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f+1, flatItems.length-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f-1, 0)) }
    if (e.key === 'Enter' && flatItems[focused]) { execItem(flatItems[focused]) }
    if (e.key === 'Escape') { onPreviewPalette?.(null); onClose() }
  }

  // Live preview on hover for theme items
  const handleHover = (item: any, idx: number) => {
    setFocused(idx)
    if (item.palette) onPreviewPalette?.(item.palette)
    else onPreviewPalette?.(null)
  }

  return (
    <div className="ide-cmd-overlay" onClick={() => { onPreviewPalette?.(null); onClose() }}>
      <div className="ide-cmd-box" onClick={e=>e.stopPropagation()} style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        <div className="ide-cmd-input-row">
          <span className="ide-cmd-prefix">⌘</span>
          <input ref={inputRef} className="ide-cmd-input" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Type a command or theme name…" onKeyDown={handleKey} />
          {query && (
            <button style={{ background:'transparent', border:'none', color:'#6a6a8a', cursor:'pointer', fontSize:'12px', padding:'0 6px' }}
              onClick={() => setQuery('')}>✕</button>
          )}
        </div>

        <div className="ide-cmd-results" style={{ overflowY: 'auto', flex: 1 }}>
          {Object.entries(grouped).map(([group, items]) => {
            return (
              <div key={group}>
                <div style={{ padding:'4px 12px 2px', fontSize:'8px', letterSpacing:'.12em', opacity:.35, fontFamily:"'Share Tech Mono',monospace", color:'#c0c8d8' }}>
                  {group}
                </div>
                {items.map((item, _i) => {
                  const globalIdx = flatItems.indexOf(item)
                  const isFocused = globalIdx === focused
                  return (
                    <div key={item.label}
                      className={`ide-cmd-item ${isFocused ? 'focused' : ''}`}
                      onMouseEnter={() => handleHover(item, globalIdx)}
                      onMouseLeave={() => { if (item.palette) onPreviewPalette?.(null) }}
                      onClick={() => execItem(item)}
                    >
                      <div className="ide-cmd-icon">{item.icon}</div>
                      <span style={{ flex:1 }}>{item.label.replace('Theme: ','')}</span>
                      {item.palette && (
                        <span style={{ display:'flex', gap:2, marginRight:4 }}>
                          {item.palette.swatches.map((c: string, si: number) => (
                            <span key={si} style={{ width:8, height:8, borderRadius:2, background:c, display:'inline-block' }}/>
                          ))}
                        </span>
                      )}
                      {item.hint && <span className="ide-cmd-hint">{item.hint}</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ padding:'20px', textAlign:'center', opacity:.3, fontFamily:"'Share Tech Mono',monospace", fontSize:'10px', color:'#c0c8d8' }}>
              NO MATCHES
            </div>
          )}
        </div>

        <div className="ide-cmd-footer">
          <span>↑↓ navigate</span>
          <span>↵ execute</span>
          <span>hover themes to preview</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  GROUP EDITOR
// ══════════════════════════════════════════════════════════════

function GroupEditor({ group, nodes, onClose, onOpenNode }) {
  const [activeId, setActiveId] = useState(null)
  if (!group) return null
  const members = nodes.filter(n => group.nodeIds.includes(n.id))
  const accent = group.color
  const COLORS = ['#10b981','#ff435a','#ffc410','#4285f4','#28f1c3','#bb9af7','#ff1650','#5ccfe6']
  const getSynVars = (col) => ({'--syn-kw':col,'--syn-str':'#ffc410','--syn-cmt':'#5c6370','--syn-num':'#d19a66','--syn-fn':'#61afef','--syn-bi':'#56b6c2'})
  const totalLines = members.reduce((s,n)=>(n.code||'').split('\n').length+s,0)
  const scrollToFn = (id) => { setActiveId(id); document.getElementById('fn-block-'+id)?.scrollIntoView({behavior:'smooth',block:'start'}) }
  const gNum = parseInt(group.id.replace(/\D/g,''))||0
  const groupArtSrc = getPanelImg(gNum * 3 + 1)
  const sideArtSrc = getPanelImg(gNum * 3 + 7)

  return (
    <div className="grp-editor-overlay" onClick={onClose}>
      <div className="grp-editor-shell" onClick={e=>e.stopPropagation()}>
        {/* Chrome bar */}
        <div className="grp-editor-chrome">
          <div className="grp-chrome-dot" style={{background:'#ff5f57'}}/>
          <div className="grp-chrome-dot" style={{background:'#febc2e'}}/>
          <div className="grp-chrome-dot" style={{background:'#28c840',cursor:'pointer'}} onClick={onClose}/>
          <div className="grp-chrome-sep"/>
          <div className="grp-chrome-title">{group.name}</div>
          <span style={{marginLeft:'6px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'11px',letterSpacing:'.12em',padding:'1px 7px',background:accent,color:'#000'}}>CLASS</span>
          <div className="grp-chrome-meta" style={{marginLeft:'auto'}}>
            {members.length} methods · {totalLines} lines · READ-ONLY
          </div>
          <button onClick={onClose} style={{marginLeft:'12px',background:'transparent',border:'none',color:'rgba(200,200,220,.4)',cursor:'pointer',fontSize:'16px',lineHeight:1}}>✕</button>
        </div>
        <div className="grp-editor-body">
          {/* Sidebar */}
          <div className="grp-sidebar">
            <div className="grp-sidebar-hdr" style={{padding:0,position:'relative',overflow:'hidden',height:'88px',flexShrink:0}}>
              <img src={sideArtSrc} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',filter:'contrast(1.2) saturate(.4) brightness(.65)'}}/>
              <div style={{position:'absolute',inset:0,background:`linear-gradient(to bottom,rgba(5,5,13,.2) 0%,rgba(5,5,13,.88) 100%), linear-gradient(to right,rgba(5,5,13,.15) 0%,transparent 60%)`,pointerEvents:'none'}}/>
              <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'8px 14px'}}>
                <div className="grp-sidebar-sup">Class</div>
                <div className="grp-sidebar-classname" style={{color:accent}}>{group.name}</div>
              </div>
            </div>
            <div className="grp-sidebar-struct">
              <div className="grp-sidebar-struct-class" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px'}}>
                <span style={{color:'#c792ea'}}>class </span>
                <span style={{color:accent}}>{group.name}</span>
                <span style={{opacity:.4}}>:</span>
              </div>
              {members.map((n,i)=>(
                <div key={n.id} className="grp-sidebar-struct-method" onClick={()=>scrollToFn(n.id)}
                  style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:COLORS[i%COLORS.length]}}>
                  <span style={{opacity:.4}}>def </span>
                  <span>{n.label.replace('.py','').replace('.js','')}</span>
                  <span style={{opacity:.3}}>()</span>
                </div>
              ))}
            </div>
            <div className="grp-member-list">
              {members.map((n,i)=>(
                <div key={n.id} className={`grp-member-row ${activeId===n.id?'active':''}`} onClick={()=>scrollToFn(n.id)}>
                  <div className="grp-member-dot" style={{background:COLORS[i%COLORS.length]}}/>
                  <div className="grp-member-info">
                    <div className="grp-member-fname" style={{color:COLORS[i%COLORS.length]}}>{n.label}</div>
                    <div className="grp-member-ftype">{n.type}</div>
                  </div>
                  {n.modified && <div style={{width:'5px',height:'5px',borderRadius:'50%',background:'#ffc410',flexShrink:0}}/>}
                </div>
              ))}
            </div>
            <div className="grp-sidebar-stats">
              <div className="grp-stat-row"><span className="grp-stat-label">METHODS</span><span className="grp-stat-val" style={{color:accent}}>{members.length}</span></div>
              <div className="grp-stat-row"><span className="grp-stat-label">LINES</span><span className="grp-stat-val" style={{color:accent}}>{totalLines}</span></div>
              <div className="grp-stat-row"><span className="grp-stat-label">MODIFIED</span><span className="grp-stat-val" style={{color:'#ff435a'}}>{members.filter(n=>n.modified).length}</span></div>
            </div>
          </div>
          {/* Main code panel */}
          <div className="grp-main">
            <div className="grp-tabs">
              <div className="grp-tab active" style={{color:accent,borderBottom:`2px solid ${accent}`}}>ALL MEMBERS</div>
              {members.map((n,i)=>{
                const col=COLORS[i%COLORS.length]
                return (
                  <div key={n.id} className={`grp-tab ${activeId===n.id?'active':''}`}
                    style={{color:col,borderBottom:activeId===n.id?`2px solid ${col}`:'2px solid transparent'}}
                    onClick={()=>scrollToFn(n.id)}>
                    {n.label}
                  </div>
                )
              })}
            </div>
            <div className="grp-codescroll">
              {/* Manga art class banner */}
              <div className="grp-class-banner">
                <img src={groupArtSrc} alt="" className="grp-banner-art"/>
                <div className="grp-banner-scanlines"/>
                <div className="grp-banner-overlay" style={{background:`linear-gradient(to right,rgba(5,5,13,.6) 0%,transparent 50%,rgba(5,5,13,.72) 100%), linear-gradient(to bottom,rgba(5,5,13,.12) 0%,transparent 28%,rgba(5,5,13,.99) 100%)`}}/>
                <div className="grp-banner-content">
                  <div className="grp-banner-kw" style={{color:'#c792ea'}}>class</div>
                  <div className="grp-banner-title" style={{color:accent}}>{group.name}</div>
                  <div className="grp-banner-note">{members.length} methods · {totalLines} lines · read-only</div>
                </div>
                <div className="grp-banner-chips">
                  <div style={{padding:'2px 8px',border:`1px solid ${accent}55`,fontSize:'8px',color:accent,fontFamily:"'Oswald',sans-serif",fontWeight:700,letterSpacing:'.1em'}}>CLASS</div>
                  <div style={{padding:'2px 8px',border:'1px solid rgba(255,255,255,.12)',fontSize:'8px',opacity:.4,fontFamily:"'Oswald',sans-serif",fontWeight:700,letterSpacing:'.1em'}}>{members.length} METHODS</div>
                </div>
              </div>
              {members.map((n,i)=>{
                const col=COLORS[i%COLORS.length]
                const codeLines=(n.code||'# empty').split('\n')
                const hlCode=highlightCode(n.code||'# empty')
                const synVars=getSynVars(col)
                return (
                  <div key={n.id} id={'fn-block-'+n.id} className="grp-fn-section"
                    style={{borderLeftColor:activeId===n.id?col+'44':'transparent',borderLeftWidth:'3px',borderLeftStyle:'solid'}}>
                    <div className="grp-fn-header" style={{background:col+'08',borderBottom:`1px solid ${col}18`,display:'flex',alignItems:'center',gap:'8px',padding:'7px 12px'}}>
                      <div className="grp-fn-num" style={{background:col+'18',color:col}}>{String(i+1).padStart(2,'0')}</div>
                      <div className="grp-fn-name-col" style={{flex:1,minWidth:0}}>
                        <div className="grp-fn-title" style={{color:col}}>{n.label}</div>
                        <div className="grp-fn-subtitle">def {n.label.replace('.py','').replace('.js','')}(self)  ·  {codeLines.length} lines</div>
                      </div>
                      <div className="grp-fn-badge" style={{color:col,borderColor:col+'55',fontSize:'8px',padding:'2px 6px',border:'1px solid',fontFamily:"'Oswald',sans-serif",fontWeight:700,letterSpacing:'.1em'}}>{n.type.toUpperCase()}</div>
                      {n.modified && <div style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'8px',color:'#ffc410',flexShrink:0}}><div style={{width:'5px',height:'5px',borderRadius:'50%',background:'#ffc410'}}/>UNSAVED</div>}
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'8px',opacity:.3,flexShrink:0}}>{codeLines.length}L</span>
                      <button style={{padding:'2px 8px',cursor:'pointer',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.08em',background:'transparent',flexShrink:0,border:`1px solid ${col}44`,color:col}} onClick={()=>onOpenNode(n.id)}>OPEN →</button>
                    </div>
                    <div className="grp-fn-codewrap" ref={el=>{if(el)Object.entries(synVars).forEach(([k,v])=>el.style.setProperty(k,v))}}>
                      <div className="grp-fn-linenums">
                        {codeLines.map((_,li)=>(<div key={li} style={{lineHeight:'1.65',color:li===0?col+'55':'rgba(255,255,255,.1)'}}>{li+1}</div>))}
                      </div>
                      <pre className="grp-fn-code editor-palette-scope" dangerouslySetInnerHTML={{__html:hlCode}}/>
                    </div>
                  </div>
                )
              })}
              <div style={{height:'40px'}}/>
            </div>
            <div className="grp-statusbar">
              <span style={{color:accent,fontWeight:'bold'}}>{group.name}</span>
              <span style={{opacity:.25}}>·</span>
              <span>{members.length} functions</span>
              <span style={{opacity:.25}}>·</span>
              <span>{totalLines} total lines</span>
              <span style={{marginLeft:'auto',opacity:.3}}>FORBIDEN // CLASS ASSEMBLY</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MANGA NODE COMPONENT
// ══════════════════════════════════════════════════════════════

function MangaNode({
  node, groups, brutal, isJoinSelected, edgeMode, hoveredNodeId, setHoveredNodeId,
  draggingNodeRef, lastMousePos, transform, setNodeColorPicker, handleNodeClickInMode, openNodeInEditor,
  nodeRunState, onRun, onCtxMenu, wakePhysicsRef,
}) {
  const W = node.isMain ? 108 : 90
  const H = node.isMain ? 44 : 36
  const accent = ACCENTS[node.themeIdx % ACCENTS.length]
  const group = groups.find(g => g.nodeIds.includes(node.id))
  const imgSrc = getMangaImgSrc(node)
  const isHovered = hoveredNodeId === node.id
  const dimmed = hoveredNodeId && !isHovered && !edgeMode
  const runSt = nodeRunState?.[node.id]
  const isDoc = node.type === 'doc'

  const boxShadow = brutal
    ? (isJoinSelected ? `6px 6px 0 ${accent}` : isHovered ? '8px 8px 0 #0f0f0f' : '4px 4px 0 #0f0f0f')
    : (isJoinSelected ? `0 0 24px ${accent}` : isHovered ? `0 0 28px ${accent}66` : `0 0 10px ${accent}28`)

  return (
    <div
      className="mn-node"
      style={{
        left: node.x - W/2,
        top:  node.y - H/2,
        width: W, height: H,
        opacity: dimmed ? 0.22 : 1,
        zIndex: isJoinSelected || isHovered ? 10 : 1,
      }}
      onPointerEnter={() => !edgeMode && startTransition(() => setHoveredNodeId(node.id))}
      onPointerLeave={() => startTransition(() => setHoveredNodeId(null))}
      onContextMenu={e=>{e.preventDefault();e.stopPropagation();onCtxMenu?.(node.id,e.clientX,e.clientY)}}
      onPointerDown={e => {
        e.stopPropagation()
        if (edgeMode) return
        setNodeColorPicker(null)
        draggingNodeRef.current = { id:node.id, x:node.x, y:node.y, hasDragged:false }
        lastMousePos.current = { x:e.clientX, y:e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
        wakePhysicsRef?.current?.()
      }}
      onPointerMove={e => {
        if (!draggingNodeRef.current || draggingNodeRef.current.id !== node.id) return
        e.stopPropagation()
        const dx=(e.clientX-lastMousePos.current.x)/transform.scale
        const dy=(e.clientY-lastMousePos.current.y)/transform.scale
        if (Math.abs(dx)>1||Math.abs(dy)>1) draggingNodeRef.current.hasDragged=true
        draggingNodeRef.current.x+=dx; draggingNodeRef.current.y+=dy
        lastMousePos.current={x:e.clientX,y:e.clientY}
      }}
      onPointerUp={e => {
        e.stopPropagation()
        e.currentTarget.releasePointerCapture(e.pointerId)
        if (edgeMode==='join') { handleNodeClickInMode(node.id); return }
        if (!draggingNodeRef.current?.hasDragged) openNodeInEditor(node.id)
        draggingNodeRef.current = null
      }}
    >
      {/* Group label above node */}
      {group && (
        <div style={{position:'absolute',top:-18,left:0,right:0,textAlign:'center',pointerEvents:'none'}}>
          <span className="mn-group-label" style={{background:brutal?'#0f0f0f':'rgba(8,8,20,.92)',color:group.color,border:`1px solid ${group.color}44`,fontSize:'8px',fontFamily:"'JetBrains Mono',monospace"}}>
            {group.name}
          </span>
        </div>
      )}
      {/* Compact box node */}
      <div className="mn-node-frame" style={{
        border: isJoinSelected
          ? (brutal ? `2px solid ${accent}` : `1px solid ${accent}`)
          : runSt?.status==='ok' ? `1px solid #10b981`
          : runSt?.status==='error' ? `1px solid #ff435a`
          : (brutal ? `2px solid #0f0f0f` : `1px solid ${accent}44`),
        boxShadow: runSt?.status==='ok' ? `0 0 14px #10b98155`
          : runSt?.status==='error' ? `0 0 14px #ff435a55`
          : boxShadow,
        background: brutal ? '#f0ece0' : 'rgba(6,6,18,.97)',
      }}>
        {/* Left accent strip */}
        <div className="mn-node-strip" style={{background:accent, width:brutal?4:3}}/>
        {/* Tiny art icon */}
        <div className="mn-node-icon">
          <img src={imgSrc} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block',
            filter:'contrast(1.2) saturate(.5)',
            opacity: brutal ? 0.9 : 0.85,
          }}/>
        </div>
        {/* Text content */}
        <div className="mn-node-content">
          <div className="mn-node-type-row">
            <span className="mn-node-type-chip" style={{background: isDoc ? '#c792ea' : accent, color:brutal?'#0f0f0f':'#000'}}>{isDoc ? 'DOC' : node.type.slice(0,3).toUpperCase()}</span>
            {node.isMain && <span className="mn-node-main-chip" style={{color:accent,borderColor:accent}}>M</span>}
          </div>
          <div className="mn-node-label" style={{color:brutal?'#0f0f0f':'#d8dce8'}}>{node.label}</div>
        </div>
        {/* Right: run button + dot + modified */}
        <div className="mn-node-right">
          <div className="mn-node-run"
            style={{
              color: runSt?.status==='ok' ? '#10b981' : runSt?.status==='error' ? '#ff435a' : accent,
              opacity: runSt?.status==='running' ? 1 : 0.7,
            }}
            onPointerDown={e=>e.stopPropagation()}
            onClick={e=>{ e.stopPropagation(); onRun?.(node.id) }}
            title="Run (JS)"
          >
            {runSt?.status==='running' ? '⋯' : runSt?.status==='ok' ? '✓' : runSt?.status==='error' ? '✗' : '▶'}
          </div>
          <div className="mn-node-dot"
            style={{background:accent,width:6,height:6,borderRadius:brutal?0:'50%',flexShrink:0}}
            onPointerDown={e=>e.stopPropagation()}
            onClick={e=>{
              e.stopPropagation()
              const rect=e.currentTarget.getBoundingClientRect()
              setNodeColorPicker(p=>p?.nodeId===node.id?null:{nodeId:node.id,x:rect.left,y:rect.bottom+6})
            }}
          />
          {node.modified && <div className="mn-node-mod"/>}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  GRAPH MINIMAP
// ══════════════════════════════════════════════════════════════

function GraphMinimap({ nodes }) {
  if (!nodes.length) return null
  const pad=10, W=110, H=70
  const xs=nodes.map(n=>n.x), ys=nodes.map(n=>n.y)
  const minX=Math.min(...xs)-50, maxX=Math.max(...xs)+50
  const minY=Math.min(...ys)-50, maxY=Math.max(...ys)+50
  const rX=maxX-minX||1, rY=maxY-minY||1
  const toMm = (x,y) => [pad+(x-minX)/rX*(W-pad*2), pad+(y-minY)/rY*(H-pad*2)]
  return (
    <div className="ide-minimap">
      <svg width={W} height={H} style={{display:'block'}}>
        {nodes.map(n=>{const [mx,my]=toMm(n.x,n.y);return <circle key={n.id} cx={mx} cy={my} r={n.isMain?4:2.5} fill={ACCENTS[n.themeIdx%ACCENTS.length]} opacity=".75"/>})}
      </svg>
      <div className="ide-minimap-label">GRAPH OVERVIEW</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  CONVEX HULL (for group outlines)
// ══════════════════════════════════════════════════════════════

function convexHull(pts) {
  if (pts.length < 3) return pts
  pts = pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1])
  const cross = (o,a,b) => (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
  const lower=[], upper=[]
  for (const p of pts) { while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop(); lower.push(p) }
  for (const p of [...pts].reverse()) { while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop(); upper.push(p) }
  upper.pop(); lower.pop()
  return lower.concat(upper)
}

// ══════════════════════════════════════════════════════════════
//  MARKDOWN RENDERER
// ══════════════════════════════════════════════════════════════

function renderMd(raw) {
  if (!raw) return ''
  const blocks = []
  let s = raw.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_,lang,code) => {
    blocks.push(`<pre class="md-pre"><code class="md-code-block">${code.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`)
    return `\x00BLK${blocks.length-1}\x00`
  })
  s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  s = s
    .replace(/^#{3}\s+(.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1 class="md-h1">$1</h1>')
    .replace(/^---$/gm, '<hr class="md-hr"/>')
    .replace(/^&gt;\s?(.*)$/gm, '<blockquote class="md-bq">$1</blockquote>')
    .replace(/^[\-\*]\s+(.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="md-oli">$1</li>')
  s = s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="md-ic">$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="md-img" src="$2" alt="$1"/>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-a" href="$2" target="_blank" rel="noopener">$1</a>')
  s = s.split(/\n{2,}/).map(p => {
    p = p.trim()
    if (!p) return ''
    if (/^<(h[1-3]|hr|pre|blockquote|li|\x00)/.test(p)) return p
    return `<p class="md-p">${p.replace(/\n/g,'<br/>')}</p>`
  }).join('\n')
  s = s.replace(/(<li(?:\s[^>]*)?>[\s\S]*?<\/li>\n?)+/g, m => `<ul class="md-ul">${m}</ul>`)
  s = s.replace(/\x00BLK(\d+)\x00/g, (_,i) => blocks[i])
  return s
}

// ══════════════════════════════════════════════════════════════
//  PERSISTENCE
// ══════════════════════════════════════════════════════════════

const LS_KEY    = 'forbiden-ide-v1'
const NB_LS_KEY = 'forbiden-nb-v1'

const NB_TEMPLATES = {
  // ── CYBERSEC ──────────────────────────────────────────────────
  '🔐 Hash Toolkit': { lang:'python', code:
`# Hash Toolkit — MD5 / SHA family
import hashlib
text = "hello world"          # ← change this
for algo in ['md5','sha1','sha224','sha256','sha384','sha512']:
    h = hashlib.new(algo, text.encode()).hexdigest()
    print(f"{algo.upper():<10} {h}")` },
  '🔐 Base64 / Hex': { lang:'python', code:
`import base64, binascii
data = "FORBIDEN_OPERATOR"    # ← change this
b64  = base64.b64encode(data.encode()).decode()
hx   = binascii.hexlify(data.encode()).decode()
print("[Base64]  encode:", b64)
print("[Base64]  decode:", base64.b64decode(b64).decode())
print("[Hex]     encode:", hx)
print("[Hex]     decode:", binascii.unhexlify(hx).decode())` },
  '🔐 XOR Cipher': { lang:'python', code:
`# XOR cipher — CTF staple
def xor(data, key):
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))

plaintext  = b"Hello, Operator!"
key        = b"\\x2a\\x4f"          # ← change key
ciphertext = xor(plaintext, key)
print("Cipher (hex):", ciphertext.hex())
print("Decrypted:   ", xor(ciphertext, key).decode())` },
  '🔐 CIDR Calc': { lang:'python', code:
`import ipaddress
cidr = "10.0.0.0/8"           # ← change this
net  = ipaddress.ip_network(cidr, strict=False)
print(f"Network    {net.network_address}")
print(f"Broadcast  {net.broadcast_address}")
print(f"Netmask    {net.netmask}  /  Wildcard {net.hostmask}")
print(f"Num hosts  {net.num_addresses - 2:,}")
hosts = list(net.hosts())
print(f"First 5:   {', '.join(str(h) for h in hosts[:5])}")
print(f"Last  5:   {', '.join(str(h) for h in hosts[-5:])}")` },
  '🔐 JWT Decoder': { lang:'js', code:
`// Decode JWT token — inspect without verifying signature
const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0IiwibmFtZSI6Ik9wZXJhdG9yIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.sig"
// ↑ paste your JWT above
const decode = s => JSON.parse(atob(s.replace(/-/g,'+').replace(/_/g,'/')))
const [hB64, pB64] = jwt.split('.')
const header  = decode(hB64)
const payload = decode(pB64)
const exp = payload.exp ? new Date(payload.exp*1000).toISOString() : 'none'
const iat = payload.iat ? new Date(payload.iat*1000).toISOString() : 'none'
console.log("── HEADER  ──")
console.log(JSON.stringify(header, null, 2))
console.log("── PAYLOAD ──")
console.log(JSON.stringify(payload, null, 2))
console.log("── TIMING  ──")
console.log("Issued  :", iat)
console.log("Expires :", exp)
const expired = payload.exp && Date.now()/1000 > payload.exp
console.log("Status  :", expired ? "⚠ EXPIRED" : "✓ VALID (sig not verified)")` },
  '🔐 Entropy': { lang:'python', code:
`# Shannon entropy — detect encrypted / compressed / random data
import math

def entropy(data: bytes) -> float:
    if not data: return 0.0
    freq = {}
    for b in data:
        freq[b] = freq.get(b, 0) + 1
    n = len(data)
    return -sum((c/n)*math.log2(c/n) for c in freq.values())

samples = {
    "plaintext": b"Hello world, this is a normal English sentence",
    "base64"   : b"SGVsbG8gd29ybGQsIHRoaXMgaXMgYSBub3JtYWwgRW5nbGlzaA==",
    "hex_data" : bytes.fromhex("deadbeefcafebabe1337c0de" * 4),
    "xor_enc"  : bytes([i ^ 0xa5 for i in range(64)]),
}
print(f"{'Sample':<12} {'Bits':>6}  Assessment")
print("-" * 44)
for name, data in samples.items():
    e = entropy(data)
    flag = "HIGH — likely encrypted/random" if e > 7.0 else "MED  — compressed/base64" if e > 5.0 else "LOW  — plain text"
    print(f"{name:<12} {e:>5.2f}  {flag}")` },
  '🔐 ROT13 / Caesar': { lang:'js', code:
`// ROT13 & Caesar brute-force — CTF classic
const shift = (text, n) =>
  text.replace(/[a-zA-Z]/g, c => {
    const b = c <= 'Z' ? 65 : 97
    return String.fromCharCode((c.charCodeAt(0) - b + n + 26) % 26 + b)
  })

const input = "Gur dhvpx oebja sbk whzcf bire gur ynml qbt"  // ← change
console.log("Input:", input)
console.log("ROT13:", shift(input, 13))
console.log("")
console.log("Brute-force all shifts (likely hits marked with +):")
for (let s = 1; s <= 25; s++) {
  const d = shift(input, s)
  const hit = /the |and |for |ing |tion /.test(d.toLowerCase())
  console.log(\`  \${hit?'[+]':'   '} +\${String(s).padStart(2,'0')}: \${d}\`)
}` },
  // ── AI / ML ──────────────────────────────────────────────────
  '🤖 Token Counter': { lang:'js', code:
`// Token + cost estimator across major LLM providers
const text = \`Paste your prompt or context here to estimate tokens and cost across models.\`
const tokens = Math.ceil(text.length / 4)
const OUT    = 3  // assumed output multiplier
const models = [
  { name:"GPT-4o",         in:5,     out:15    },
  { name:"GPT-4o mini",    in:0.15,  out:0.6   },
  { name:"Claude S 4.6",   in:3,     out:15    },
  { name:"Claude H 4.5",   in:0.8,   out:4     },
  { name:"Gemini 1.5 Pro", in:3.5,   out:10.5  },
  { name:"Gemini Flash",   in:0.075, out:0.3   },
]
console.log(\`Input: \${text.trim().split(/\\s+/).length} words  ~\${tokens} tokens  \${text.length} chars\\n\`)
console.log(\`\${"Model".padEnd(20)} \${"per 1K reqs".padStart(12)} \${"per 100K".padStart(12)}\`)
console.log("-".repeat(46))
models.forEach(m => {
  const cost = (tokens*m.in + tokens*OUT*m.out) / 1e6
  console.log(\`\${m.name.padEnd(20)} $\${(cost*1000).toFixed(3).padStart(10)} $\${(cost*100000).toFixed(0).padStart(10)}\`)
})` },
  '🤖 Cosine Sim': { lang:'python', code:
`# Cosine similarity — quick embedding sanity check
import math
def cosine(a, b):
    dot = sum(x*y for x,y in zip(a,b))
    na  = math.sqrt(sum(x*x for x in a))
    nb  = math.sqrt(sum(x*x for x in b))
    return dot / (na * nb) if na and nb else 0.0

# Replace with real embedding vectors
v1 = [1, 0, 1, 0, 1, 0, 1, 0]
v2 = [1, 1, 0, 0, 1, 0, 0, 1]
print(f"Cosine similarity: {cosine(v1, v2):.4f}")
print("(1.0 = identical, 0.0 = orthogonal)")` },
  '🤖 JSON Extract': { lang:'js', code:
`// JSON path extractor — parse API responses
const json = {
  status: "ok",
  data: { user: { id: 42, role: "admin" }, items: [1,2,3] }
}
const get = (o, path) => path.split('.').reduce((x,k) => x?.[k], o)
console.log(JSON.stringify(json, null, 2))
console.log("---")
console.log("data.user.role →", get(json, "data.user.role"))
console.log("data.items     →", get(json, "data.items"))` },
  '🤖 Regex Tester': { lang:'python', code:
`import re

# ── Configure ──
PATTERN = r'(?P<ip>\\d{1,3}(?:\\.\\d{1,3}){3})\\s+\\[(?P<date>[^\\]]+)\\]\\s+"(?P<method>\\w+)\\s+(?P<path>\\S+)[^"]*"\\s+(?P<status>\\d{3})\\s+(?P<bytes>\\d+)'

TEST_STRINGS = [
    '10.0.0.1 [15/Jan/2024:12:34:56] "GET /api/users HTTP/1.1" 200 1234',
    '192.168.1.5 [15/Jan/2024:12:35:01] "POST /auth/login HTTP/1.1" 401 89',
    '10.0.0.2 [15/Jan/2024:12:35:10] "GET /static/app.js HTTP/1.1" 304 0',
    'not a valid log line — no match expected',
]
print(f"Pattern: {PATTERN}\\n")
for i, s in enumerate(TEST_STRINGS):
    m = re.search(PATTERN, s)
    if m:
        print(f"[{i}] MATCH ✓")
        for k, v in m.groupdict().items():
            print(f"     {k:<10} → {v}")
    else:
        print(f"[{i}] NO MATCH  \"{s[:45]}...\"")
    print()` },
  '🤖 Text Stats': { lang:'python', code:
`# Text analysis — word freq, reading time, top terms
import re
from collections import Counter

text = """
Claude is a large language model built by Anthropic. It is designed
to be helpful, harmless, and honest. Claude can write code, analyze
data, answer questions, and assist with many complex tasks.
"""  # ← paste your text

words   = re.findall(r"\\b[a-zA-Z]{3,}\\b", text.lower())
sents   = len(re.split(r'[.!?]+', text.strip()))
stop    = {'the','and','for','that','this','with','are','was','can','not','from','its','has','have','been','they'}
kwords  = [w for w in words if w not in stop]
freq    = Counter(kwords).most_common(10)
reading = max(1, round(len(words)/200))

print(f"Words:        {len(words)}")
print(f"Sentences:    {sents}")
print(f"Avg w/sent:   {len(words)/max(1,sents):.1f}")
print(f"Reading time: ~{reading} min")
print(f"\\nTop 10 keywords:")
for word, count in freq:
    bar = '█' * count
    print(f"  {word:<15} {count:>3}  {bar}")` },
  // ── DEVOPS ───────────────────────────────────────────────────
  '🐳 Log Parser': { lang:'python', code:
`import re
logs = """2024-01-15 12:34:56 ERROR [auth] Failed login: admin from 10.0.0.5
2024-01-15 12:34:57 WARN  [auth] Rate limit: 10.0.0.5 (5 req/s)
2024-01-15 12:35:01 INFO  [app]  Service started port 8080
2024-01-15 12:35:10 ERROR [db]   Connection timeout postgresql://localhost:5432"""
pat = r'(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}) (\\w+)\\s+\\[(\\w+)\\] (.+)'
for line in logs.strip().split('\\n'):
    m = re.match(pat, line)
    if m:
        ts, lvl, mod, msg = m.groups()
        print(f"[{lvl:5}] {mod:6} | {ts} | {msg[:55]}")` },
  '🐳 Cron Explainer': { lang:'js', code:
`// Cron expression decoder
const explain = expr => {
  const [min,hr,dom,mon,dow] = expr.split(' ')
  const H  = hr==='*'?'every hour':\`at \${hr}:00\`
  const M  = min==='*'?'every minute':min.startsWith('*/')?\`every \${min.slice(2)}min\`:\`min \${min}\`
  const D  = dow==='*'?'daily':{0:'Sunday',1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday','1-5':'weekdays','0,6':'weekends'}[dow]||dow
  return \`\${M}, \${H}, \${D}\`
}
const crons = ['0 * * * *','0 9 * * 1-5','*/5 * * * *','0 0 1 * *','0 2 * * 0','30 6 * * *']
crons.forEach(c => console.log(c.padEnd(17), '→', explain(c)))` },
  '🐳 ENV Redactor': { lang:'python', code:
`# Extract + redact env vars / config files
config = """
DATABASE_URL=postgresql://admin:s3cr3t@db:5432/prod
REDIS_URL=redis://localhost:6379
API_KEY=sk-proj-abc123def456ghi789
DEBUG=false
MAX_POOL=20
JWT_SECRET=my-super-secret-key
"""
SECRETS = {'KEY','SECRET','PASSWORD','TOKEN','PASS','AUTH','CRED'}
for line in config.strip().split('\\n'):
    if '=' not in line: continue
    key, _, val = line.partition('=')
    if any(s in key.upper() for s in SECRETS):
        val = val[:3] + '···' + val[-3:] if len(val) > 6 else '···'
    print(f"{key:<25} = {val}")` },
  '🐳 URL Parser': { lang:'js', code:
`// URL component parser + query string decoder
const url = "https://api.example.com:8080/v2/users?filter=active&page=2&sort=asc#results"
// ↑ paste your URL above

const u = new URL(url)
console.log("Full     :", url)
console.log("Protocol :", u.protocol)
console.log("Host     :", u.host)
console.log("Hostname :", u.hostname)
console.log("Port     :", u.port || "(default)")
console.log("Path     :", u.pathname)
console.log("Hash     :", u.hash || "(none)")
console.log("")
console.log("Query params:")
u.searchParams.forEach((v,k) => console.log(\`  \${k.padEnd(14)} = \${v}\`))
const segments = u.pathname.split('/').filter(Boolean)
console.log("")
console.log("Path segments:", segments)` },
  '🐳 JSON Diff': { lang:'js', code:
`// JSON deep diff — additions, removals, changes
function diff(a, b, path='') {
  const changes = []
  const keys = new Set([...Object.keys(a||{}), ...Object.keys(b||{})])
  for (const k of keys) {
    const p = path ? \`\${path}.\${k}\` : k
    if (!(k in (a||{})))      changes.push({ op:'+', p, v:b[k] })
    else if (!(k in (b||{}))) changes.push({ op:'-', p, v:a[k] })
    else if (typeof a[k]==='object' && a[k] && typeof b[k]==='object' && b[k])
      changes.push(...diff(a[k], b[k], p))
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      changes.push({ op:'~', p, from:a[k], to:b[k] })
  }
  return changes
}

const before = { version:"1.2", user:{name:"Alice",role:"user"}, debug:true }
const after  = { version:"1.3", user:{name:"Alice",role:"admin"}, newField:"hello" }

const changes = diff(before, after)
if (!changes.length) { console.log("Objects are identical") }
else {
  console.log(\`\${changes.length} difference(s):\`)
  changes.forEach(c => {
    if (c.op==='+') console.log(\`  + \${c.p}: \${JSON.stringify(c.v)}\`)
    if (c.op==='-') console.log(\`  - \${c.p}: \${JSON.stringify(c.v)}\`)
    if (c.op==='~') console.log(\`  ~ \${c.p}: \${JSON.stringify(c.from)} → \${JSON.stringify(c.to)}\`)
  })
}` },
  '🐳 HTTP Tester': { lang:'js', code:
`// HTTP request tester with timing + headers
const URL  = "https://httpbin.org/post"   // ← change
const OPTS = {
  method: "POST",
  headers: { "Content-Type":"application/json", "X-Operator":"forbiden" },
  body: JSON.stringify({ ping: true, ts: Date.now() }),
}

const t0 = performance.now()
try {
  const res = await fetch(URL, OPTS)
  const ms  = (performance.now() - t0).toFixed(0)
  const body = await res.json().catch(() => res.text())
  console.log(\`HTTP \${res.status} \${res.statusText}  (\${ms}ms)\`)
  console.log("")
  console.log("Response headers:")
  res.headers.forEach((v,k) => console.log(\`  \${k}: \${v}\`))
  console.log("")
  console.log("Body:", JSON.stringify(body, null, 2))
} catch(e) {
  console.log("Error:", e.message)
  console.log("(Check CORS — use httpbin.org or your own API)")
}` },
  // ── PACKAGES ─────────────────────────────────────────────────
  '📦 numpy arrays': { lang:'python', code:
`%pip install numpy
import numpy as np

a = np.array([[1,2,3],[4,5,6],[7,8,9]], dtype=float)
b = np.random.randint(1, 9, size=(3,3)).astype(float)
print("Matrix A:"); print(a)
print("\\nMatrix B (random):"); print(b)
print("\\nA @ B ="); print(a @ b)
print("\\nA stats:  mean =", a.mean().round(3), " std =", a.std().round(3))
print("A T (transpose):"); print(a.T)
vals, vecs = np.linalg.eig(a)
print("\\nEigenvalues:", vals.round(3))` },
  '📦 pandas CSV': { lang:'python', code:
`%pip install pandas
import pandas as pd
from io import StringIO

csv = """name,dept,salary,yoe
Alice,Engineering,95000,5
Bob,Engineering,88000,3
Carol,Security,92000,7
Dave,DevOps,85000,4
Eve,AI/ML,105000,6
Frank,DevOps,81000,2"""

df = pd.read_csv(StringIO(csv))
print("=== Full DataFrame ===")
print(df.to_string(index=False))
print("\\n=== Dept avg salary ===")
print(df.groupby('dept')['salary'].mean().sort_values(ascending=False).round(0).to_string())
print("\\n=== Top 3 earners ===")
print(df.nlargest(3,'salary')[['name','dept','salary']].to_string(index=False))
print("\\nCorr salary↔yoe:", df[['salary','yoe']].corr().loc['salary','yoe'].round(3))` },
}

function loadNB() {
  try {
    const d = JSON.parse(localStorage.getItem(NB_LS_KEY) || 'null')
    if (d?.cells?.length) return d.cells
  } catch {}
  return []
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (d.nodes?.length) return { nodes: d.nodes, edges: d.edges || [], groups: d.groups || [] }
    }
  } catch {}
  return { nodes: [], edges: [], groups: [] }
}

// ══════════════════════════════════════════════════════════════
//  FOLDER IMPORT PARSER
// ══════════════════════════════════════════════════════════════

function _parseImports(code) {
  const paths = []
  const res = [
    /import\s+(?:[^'";\n]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of res) {
    re.lastIndex = 0; let m
    while ((m = re.exec(code)) !== null) if (!paths.includes(m[1])) paths.push(m[1])
  }
  return paths
}

function _resolveRel(fromDir, imp) {
  const parts = (fromDir + imp).split('/')
  const out = []
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p) }
  return out.join('/')
}

function _guessType(name, code) {
  if (/^(index|main|app)\.(j|t)sx?$/.test(name)) return 'entry'
  if (/\bclass\s+\w+/.test(code)) return 'class'
  if (/\.(md|txt)$/.test(name)) return 'doc'
  if (/\.(jsx|tsx)$/.test(name) || /useState|useEffect|React/.test(code)) return 'module'
  return 'function'
}

const _TYPE_THEME = { entry:0, function:5, class:6, module:4, doc:11 }

async function parseFolderToGraph(fileList) {
  const all = await Promise.all([...fileList].map(f =>
    f.text().then(text => ({
      name: f.name,
      path: (f.webkitRelativePath || f.name).replace(/\\/g, '/'),
      text,
    }))
  ))
  const kept = all.filter(f =>
    /\.(js|ts|jsx|tsx|mjs|cjs|md)$/.test(f.name) &&
    !f.path.includes('node_modules/') &&
    !f.path.includes('.min.') &&
    !f.path.includes('/dist/')
  )
  const nodes = kept.map((f, i) => {
    const type = _guessType(f.name, f.text)
    return {
      id: 'u'+i, label: f.name, filepath: f.path, type,
      isMain: /^(index|main)\.(j|t)sx?$/.test(f.name),
      x: (Math.random()-.5)*700, y: (Math.random()-.5)*500,
      vx:0, vy:0, themeIdx: _TYPE_THEME[type]??1,
      classId:null, code: f.text, modified:false,
    }
  })
  const pathMap = {}
  kept.forEach((f, i) => { pathMap[f.path] = 'u'+i })
  const edges = [], seen = new Set()
  kept.forEach((f, i) => {
    if (f.name.endsWith('.md')) return
    const sid = 'u'+i
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')+1) : ''
    _parseImports(f.text).filter(p => p.startsWith('.')).forEach(imp => {
      const base = _resolveRel(dir, imp)
      for (const c of [base, base+'.js', base+'.ts', base+'.jsx', base+'.tsx', base+'/index.js', base+'/index.ts', base+'/index.tsx']) {
        const tid = pathMap[c]
        if (tid && tid !== sid) {
          const key = sid+'>'+tid
          if (!seen.has(key)) { seen.add(key); edges.push({id:'ue'+edges.length, source:sid, target:tid}) }
          break
        }
      }
    })
  })
  return { nodes, edges, groups:[] }
}

// ══════════════════════════════════════════════════════════════
//  NOTEBOOK — Jupyter-style cell runner
// ══════════════════════════════════════════════════════════════

const _nbBtnS:any = {
  background:'transparent', border:'1px solid rgba(255,255,255,.1)', cursor:'pointer',
  fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'9px', letterSpacing:'.1em',
  padding:'2px 7px', color:'rgba(200,200,220,.6)', lineHeight:1.6,
}

function _renderCellOutput(output:any[]) {
  return output.map((entry:any, i:number) => {
    const text:string = entry.val || ''
    if (entry.type === 'error') {
      return (
        <div key={i} style={{ color:'#ff6b7a', whiteSpace:'pre-wrap', wordBreak:'break-word',
          borderLeft:'2px solid rgba(255,67,90,.4)', paddingLeft:8, marginBottom:3, lineHeight:1.6 }}>
          {text}
        </div>
      )
    }
    // Pretty-print JSON return values / log entries that look like JSON
    if (entry.type === 'return' || entry.type === 'log') {
      const trimmed = text.trim()
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 4) {
        try {
          const parsed = JSON.parse(trimmed)
          return (
            <pre key={i} style={{ color:'#c792ea', margin:'0 0 2px', fontFamily:"'JetBrains Mono',monospace",
              fontSize:'11px', lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
              {JSON.stringify(parsed, null, 2)}
            </pre>
          )
        } catch {}
      }
    }
    const col:any = { log:'#c0c8d8', warn:'#ffc410', error:'#ff435a', info:'#4285f4', return:'#a3e8c4' }[entry.type] || '#c0c8d8'
    return <div key={i} style={{ color:col, whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.6 }}>{text}</div>
  })
}

const NB_LANG_META:any = {
  js:       { color:'#ffc410', bg:'rgba(255,196,16,.08)',  border:'rgba(255,196,16,.25)',  label:'JS',     caret:'#ffc410' },
  python:   { color:'#4fc3f7', bg:'rgba(79,195,247,.08)', border:'rgba(79,195,247,.25)',  label:'PYTHON', caret:'#4fc3f7' },
  markdown: { color:'#ce93d8', bg:'rgba(206,147,216,.08)',border:'rgba(206,147,216,.25)', label:'MD',     caret:'#ce93d8' },
}

function NoteCell({ cell, idx, brutal, onRun, onDelete, onCodeChange, onLangChange, onMoveUp, onMoveDown, onDuplicate }:any) {
  const taRef = useRef<any>(null)
  const [collapsed, setCollapsed] = useState(false)

  const meta = NB_LANG_META[cell.lang] || NB_LANG_META.js
  const LH = 19.2

  const statusAccent = cell.status === 'running' ? '#ffc410'
    : cell.status === 'ok'    ? '#10b981'
    : cell.status === 'error' ? '#ff435a'
    : meta.color

  const lineCount = (cell.code || '').split('\n').length
  const codeRows  = Math.max(3, lineCount)

  const handleKeyDown = (e:any) => {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); onRun() }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.target, s = ta.selectionStart
      onCodeChange(cell.code.slice(0,s) + '  ' + cell.code.slice(ta.selectionEnd))
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2 }, 0)
    }
  }

  const iconBtn = (icon:string, title:string, onClick:any, hoverColor = meta.color) => (
    <button key={title} title={title} onClick={onClick}
      style={{ background:'transparent', border:'none', cursor:'pointer',
        color:'rgba(200,200,220,.18)', fontSize:'11px', padding:'2px 3px', lineHeight:1,
        transition:'color .12s' }}
      onMouseEnter={e=>(e.currentTarget.style.color=hoverColor)}
      onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.18)')}>
      {icon}
    </button>
  )

  return (
    <div style={{
      borderBottom:'1px solid rgba(255,255,255,.05)',
      borderLeft:`3px solid ${statusAccent}`,
      transition:'border-color .25s, background .2s',
      background: cell.status==='running' ? 'rgba(255,196,16,.018)'
        : cell.status==='error' ? 'rgba(255,67,90,.018)'
        : cell.status==='ok'   ? 'rgba(16,185,129,.012)' : 'transparent',
    }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px',
        background:'rgba(0,0,0,.5)', cursor:'pointer', userSelect:'none' }}
        onClick={() => setCollapsed(c => !c)}>

        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'9px', minWidth:32,
          color: cell.execCount ? meta.color : 'rgba(200,200,220,.18)', letterSpacing:'.04em' }}>
          In[{cell.execCount ?? ' '}]
        </span>

        <select value={cell.lang}
          onChange={(e:any) => { e.stopPropagation(); onLangChange(e.target.value) }}
          onClick={(e:any) => e.stopPropagation()}
          style={{ background:meta.bg, border:`1px solid ${meta.border}`, color:meta.color,
            fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'8px',
            letterSpacing:'.14em', cursor:'pointer', outline:'none',
            padding:'1px 6px', borderRadius:2 }}>
          <option value="js">JS</option>
          <option value="python">PYTHON</option>
          <option value="markdown">MARKDOWN</option>
        </select>

        <span style={{ fontSize:'7px', color:'rgba(200,200,220,.18)', transition:'transform .12s',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
        <div style={{ flex:1 }}/>

        {cell.status === 'running' && (
          <span style={{ fontSize:'8px', color:'#ffc410', fontFamily:"'Share Tech Mono',monospace",
            letterSpacing:'.1em' }}>RUNNING…</span>
        )}
        {cell.execMs != null && cell.status !== 'idle' && cell.status !== 'running' && (
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'8px',
            color: cell.status==='error' ? '#ff435a' : 'rgba(200,200,220,.22)' }}>
            {cell.execMs}ms
          </span>
        )}

        {iconBtn('↑', 'Move up',   (e:any)=>{e.stopPropagation();onMoveUp()})}
        {iconBtn('↓', 'Move down', (e:any)=>{e.stopPropagation();onMoveDown()})}
        {iconBtn('⧉', 'Duplicate', (e:any)=>{e.stopPropagation();onDuplicate()})}

        <button onClick={(e:any)=>{e.stopPropagation();onRun()}} title="Run (Shift+Enter)"
          style={{ background:meta.bg, border:`1px solid ${meta.border}`, cursor:'pointer',
            color:meta.color, fontSize:'9px', padding:'2px 9px',
            fontFamily:"'Oswald',sans-serif", fontWeight:700, letterSpacing:'.1em',
            transition:'background .12s' }}
          onMouseEnter={e=>(e.currentTarget.style.background=`${meta.color}28`)}
          onMouseLeave={e=>(e.currentTarget.style.background=meta.bg)}>
          ▶ RUN
        </button>

        {iconBtn('×', 'Delete', (e:any)=>{e.stopPropagation();onDelete()}, '#ff435a')}
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        <>
          {cell.lang === 'markdown' ? (
            <div style={{ display:'flex', flexDirection:'column' }}>
              <textarea value={cell.code} onChange={(e:any)=>onCodeChange(e.target.value)}
                onKeyDown={handleKeyDown} rows={Math.max(3, lineCount)} spellCheck={false}
                placeholder="# Markdown — live preview below"
                style={{ width:'100%', boxSizing:'border-box', background:'#060613',
                  border:'none', outline:'none', resize:'none',
                  fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', lineHeight:'1.6',
                  color:'#9ba8c4', padding:'8px 12px 8px 14px', caretColor:meta.caret }}/>
              <div className="md-preview" style={{ padding:'10px 16px',
                borderTop:`1px solid ${meta.color}18`, background:'#040410',
                fontSize:'13px', minHeight:36 }}
                dangerouslySetInnerHTML={{ __html: renderMd(cell.code || '') }}/>
            </div>
          ) : (
            <CodeMirrorEditor
              compact
              minHeight="80px"
              node={{
                id: cell.id,
                label: `cell.${cell.lang === 'python' ? 'py' : cell.lang === 'typescript' ? 'ts' : cell.lang === 'markdown' ? 'md' : 'js'}`,
                code: cell.code || '',
                type: 'function',
                modified: false,
              }}
              onChange={onCodeChange}
            />
          )}

          {/* Output */}
          {cell.output.length > 0 && (
            <div style={{
              background:'#020208',
              borderTop:`1px solid ${cell.status==='error' ? 'rgba(255,67,90,.2)' : `${meta.color}18`}`,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px',
                borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                <span style={{ fontFamily:"'Oswald',sans-serif", fontSize:'8px', fontWeight:700,
                  letterSpacing:'.12em',
                  color: cell.status==='error' ? '#ff435a' : '#10b981', opacity:.7 }}>
                  Out[{cell.execCount}]
                </span>
                <div style={{flex:1}}/>
                <button onClick={()=>navigator.clipboard.writeText(cell.output.map((e:any)=>e.val).join('\n')).catch(()=>{})}
                  title="Copy" style={{ background:'transparent', border:'none', cursor:'pointer',
                    color:'rgba(200,200,220,.15)', fontSize:'10px', transition:'color .12s' }}
                  onMouseEnter={e=>(e.currentTarget.style.color='#10b981')}
                  onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.15)')}>⎘</button>
              </div>
              <div style={{ padding:'6px 12px 8px 14px', maxHeight:200, overflowY:'auto',
                fontFamily:"'JetBrains Mono',monospace", fontSize:'11px',
                scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,.06) transparent' }}>
                {_renderCellOutput(cell.output)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function NotebookPanel({ brutal }:any) {
  const [cells, setCells]         = useState<any[]>(() => loadNB())
  const [showTemplates, setShowTemplates] = useState(false)
  const execCounterRef = useRef(0)

  useEffect(() => {
    try { localStorage.setItem(NB_LS_KEY, JSON.stringify({ cells })) } catch {}
  }, [cells])

  const runCell = useCallback(async (cellId:string) => {
    const cell = cells.find((c:any) => c.id === cellId)
    if (!cell) return
    if (cell.lang === 'markdown') {
      setCells(cs => cs.map((c:any) => c.id === cellId ? { ...c, output:[], status:'ok' } : c))
      return
    }
    const execCount = ++execCounterRef.current
    const t0 = performance.now()
    setCells(cs => cs.map((c:any) => c.id === cellId ? { ...c, status:'running', output:[], execCount, execMs:null } : c))
    const cellLang = cell.lang === 'python' ? 'py' : cell.lang === 'typescript' ? 'ts' : 'js'
    const result = await runByLang(cellLang, cell.code)
    const ms = Math.round(performance.now() - t0)
    setCells(cs => cs.map((c:any) => c.id === cellId
      ? { ...c, status: result.error ? 'error' : 'ok', output: result.logs, execMs: ms }
      : c))
  }, [cells])

  const runAll = async () => { for (const cell of cells) await runCell(cell.id) }

  const addCell = (lang = 'js', code = '') => {
    const id = 'nb' + Date.now()
    const def = lang === 'python' ? '# Python\n' : lang === 'markdown' ? '## Notes\n\n' : '// JavaScript\n'
    setCells((cs:any) => [...cs, { id, lang, code: code || def, output:[], status:'idle', execCount:null, execMs:null }])
    setShowTemplates(false)
  }

  const moveCell = (idx:number, dir:-1|1) => {
    setCells((cs:any) => {
      const next = [...cs]; const t = idx + dir
      if (t < 0 || t >= next.length) return cs
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return next
    })
  }

  const domainGroups = [
    { label:'🔐 CYBERSEC', color:'#ff6b7a', keys:['🔐 Hash Toolkit','🔐 Base64 / Hex','🔐 XOR Cipher','🔐 CIDR Calc','🔐 JWT Decoder','🔐 Entropy','🔐 ROT13 / Caesar'] },
    { label:'🤖 AI / ML',  color:'#ce93d8', keys:['🤖 Token Counter','🤖 Cosine Sim','🤖 JSON Extract','🤖 Regex Tester','🤖 Text Stats'] },
    { label:'🐳 DEVOPS',   color:'#4fc3f7', keys:['🐳 Log Parser','🐳 Cron Explainer','🐳 ENV Redactor','🐳 URL Parser','🐳 JSON Diff','🐳 HTTP Tester'] },
    { label:'📦 PACKAGES', color:'#10b981', keys:['📦 numpy arrays','📦 pandas CSV'] },
  ]

  // Pick a panel image for the empty state
  const emptyArtImg = `${import.meta.env.BASE_URL}manga/0xEP007p.jpeg`

  const tbBtn = (label:string, color:string, onClick:any, extra:any = {}) => (
    <button onClick={onClick} style={{
      background:`${color}12`, border:`1px solid ${color}30`, cursor:'pointer',
      fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'8px',
      letterSpacing:'.12em', padding:'2px 8px', color, lineHeight:1.8,
      transition:'background .12s', ...extra,
    }}
    onMouseEnter={e=>(e.currentTarget.style.background=`${color}25`)}
    onMouseLeave={e=>(e.currentTarget.style.background=`${color}12`)}>
      {label}
    </button>
  )

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#05050f', overflow:'hidden' }}>

      {/* ── Toolbar ── */}
      <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', flexShrink:0,
        borderBottom:'1px solid rgba(255,255,255,.07)',
        background:'rgba(0,0,0,.6)', position:'relative' }}>

        <span style={{ fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'9px',
          letterSpacing:'.18em', color:'rgba(200,200,220,.35)', marginRight:4 }}>◎ NB</span>

        {/* Add-cell buttons — colored per language */}
        {tbBtn('+ JS',  '#ffc410', () => addCell('js'))}
        {tbBtn('+ PY',  '#4fc3f7', () => addCell('python'))}
        {tbBtn('+ MD',  '#ce93d8', () => addCell('markdown'))}

        {/* Templates */}
        <button onClick={() => setShowTemplates(s=>!s)} style={{
          background: showTemplates ? 'rgba(255,107,122,.12)' : 'transparent',
          border:'1px solid rgba(255,107,122,.22)', cursor:'pointer',
          fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'8px',
          letterSpacing:'.12em', padding:'2px 8px', color:'#ff6b7a', lineHeight:1.8,
          transition:'background .12s',
        }}>TEMPLATES ▾</button>

        {showTemplates && (
          <div style={{ position:'absolute', top:'100%', left:0, zIndex:300, minWidth:240,
            background:'#0a0a16', border:'1px solid rgba(255,107,122,.2)',
            boxShadow:'0 16px 48px rgba(0,0,0,.95)', maxHeight:400, overflowY:'auto',
            scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,.06) transparent' }}
            onMouseLeave={() => setShowTemplates(false)}>
            {domainGroups.map(grp => (
              <div key={grp.label}>
                <div style={{ padding:'5px 10px 4px', fontFamily:"'Oswald',sans-serif", fontWeight:700,
                  fontSize:'8px', letterSpacing:'.14em', color:grp.color,
                  borderBottom:'1px solid rgba(255,255,255,.05)', background:'rgba(0,0,0,.4)' }}>
                  {grp.label}
                </div>
                {grp.keys.map(k => (
                  <div key={k}
                    onClick={() => { const t=(NB_TEMPLATES as any)[k]; if(t) addCell(t.lang,t.code) }}
                    style={{ padding:'5px 14px', fontFamily:"'Share Tech Mono',monospace",
                      fontSize:'11px', color:'#a0aac0', cursor:'pointer', transition:'background .1s' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.05)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    {k}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={{ flex:1 }}/>

        {/* Cell count */}
        {cells.length > 0 && (
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'8px',
            color:'rgba(200,200,220,.2)' }}>{cells.length} cells</span>
        )}

        <div style={{ width:1, height:10, background:'rgba(255,255,255,.08)', margin:'0 3px' }}/>

        {tbBtn('▶ ALL', '#10b981', runAll)}
        <button onClick={() => setCells((cs:any) => cs.map((c:any) => ({ ...c, output:[], status:'idle', execMs:null })))}
          style={{ background:'transparent', border:'none', cursor:'pointer',
            fontFamily:"'Oswald',sans-serif", fontSize:'8px', letterSpacing:'.1em',
            color:'rgba(200,200,220,.25)', padding:'2px 5px', lineHeight:1.8 }}
          onMouseEnter={e=>(e.currentTarget.style.color='rgba(200,200,220,.6)')}
          onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.25)')}>CLR</button>
        <button onClick={() => {
          const src = cells.map((c:any) => {
            if (c.lang === 'python')   return `# ── [PYTHON] ──\n${c.code}`
            if (c.lang === 'markdown') return `<!-- [MD] -->\n${c.code}`
            return `// ── [JS] ──\n${c.code}`
          }).join('\n\n')
          const ext = cells.some((c:any) => c.lang === 'python') ? '.py' : '.js'
          const blob = new Blob([src], { type:'text/plain' })
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
          a.download = 'notebook' + ext; a.click()
        }} title="Export" style={{ background:'transparent', border:'none', cursor:'pointer',
          color:'rgba(200,200,220,.2)', fontSize:'11px', padding:'2px 4px', lineHeight:1 }}
          onMouseEnter={e=>(e.currentTarget.style.color='#4fc3f7')}
          onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.2)')}>⬇</button>
        <button onClick={() => { if (confirm('Clear all cells?')) setCells([]) }}
          title="Delete all" style={{ background:'transparent', border:'none', cursor:'pointer',
            color:'rgba(200,200,220,.12)', fontSize:'13px', padding:'0 3px', lineHeight:1 }}
          onMouseEnter={e=>(e.currentTarget.style.color='#ff435a')}
          onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.12)')}>⊖</button>
      </div>

      {/* ── Cells or empty state ── */}
      {cells.length === 0 ? (
        /* ── Empty state with manga art ── */
        <div style={{ flex:1, display:'flex', overflow:'hidden', position:'relative' }}>
          {/* Left: manga artwork */}
          <div style={{ width:'42%', flexShrink:0, position:'relative', overflow:'hidden' }}>
            <img src={emptyArtImg} alt="" style={{
              width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top',
              filter:'brightness(.55) saturate(1.3)',
            }}/>
            {/* gradient to blend into right panel */}
            <div style={{ position:'absolute', inset:0,
              background:'linear-gradient(to right, transparent 50%, #05050f 100%)' }}/>
            {/* scanlines overlay */}
            <div style={{ position:'absolute', inset:0, opacity:.15,
              backgroundImage:'repeating-linear-gradient(0deg, rgba(0,0,0,.5) 0px, rgba(0,0,0,.5) 1px, transparent 1px, transparent 3px)' }}/>
            {/* bottom label */}
            <div style={{ position:'absolute', bottom:12, left:12,
              fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'9px',
              letterSpacing:'.2em', color:'rgba(255,255,255,.35)' }}>
              NOTEBOOK // SESSION
            </div>
          </div>

          {/* Right: CTA */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', padding:'32px 28px', gap:20 }}>

            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'22px',
                letterSpacing:'.12em', color:'rgba(200,200,220,.9)', lineHeight:1.1 }}>
                NEW SESSION
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:'10px',
                color:'rgba(200,200,220,.3)', letterSpacing:'.1em', marginTop:6 }}>
                pick a cell type to begin
              </div>
            </div>

            {/* Big language buttons */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, width:'100%', maxWidth:200 }}>
              {([
                { lang:'js',       color:'#ffc410', label:'JavaScript', sub:'browser + node APIs' },
                { lang:'python',   color:'#4fc3f7', label:'Python',     sub:'native · pip install supported' },
                { lang:'markdown', color:'#ce93d8', label:'Markdown',   sub:'rich text & notes' },
              ] as const).map(item => (
                <button key={item.lang} onClick={() => addCell(item.lang as string)}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                    background:`${item.color}0e`, border:`1px solid ${item.color}30`,
                    cursor:'pointer', textAlign:'left', transition:'all .15s',
                    width:'100%' }}
                  onMouseEnter={e=>{
                    e.currentTarget.style.background=`${item.color}20`
                    e.currentTarget.style.borderColor=`${item.color}60`
                  }}
                  onMouseLeave={e=>{
                    e.currentTarget.style.background=`${item.color}0e`
                    e.currentTarget.style.borderColor=`${item.color}30`
                  }}>
                  <span style={{ fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'16px',
                    color:item.color, lineHeight:1, flexShrink:0 }}>+</span>
                  <div>
                    <div style={{ fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'11px',
                      color:item.color, letterSpacing:'.1em' }}>{item.label.toUpperCase()}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:'9px',
                      color:'rgba(200,200,220,.3)', marginTop:1 }}>{item.sub}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Templates shortcut */}
            <button onClick={() => setShowTemplates(s=>!s)}
              style={{ background:'rgba(255,107,122,.08)', border:'1px solid rgba(255,107,122,.22)',
                cursor:'pointer', padding:'6px 18px', color:'#ff6b7a',
                fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'9px',
                letterSpacing:'.14em', transition:'background .12s' }}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,107,122,.16)')}
              onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,107,122,.08)')}>
              BROWSE TEMPLATES ▾
            </button>

          </div>
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto',
          scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,.07) transparent' }}>
          {cells.map((cell:any, idx:number) => (
            <NoteCell
              key={cell.id} cell={cell} idx={idx} brutal={brutal}
              onRun={() => runCell(cell.id)}
              onDelete={() => setCells((cs:any) => cs.filter((c:any) => c.id !== cell.id))}
              onCodeChange={(code:string) => setCells((cs:any) => cs.map((c:any) => c.id === cell.id ? { ...c, code } : c))}
              onLangChange={(lang:string) => setCells((cs:any) => cs.map((c:any) => c.id === cell.id ? { ...c, lang, output:[], status:'idle' } : c))}
              onMoveUp={() => moveCell(idx, -1)}
              onMoveDown={() => moveCell(idx, 1)}
              onDuplicate={() => {
                const dup = { ...cell, id:'nb'+Date.now(), output:[], status:'idle' }
                setCells((cs:any) => { const next=[...cs]; next.splice(idx+1,0,dup); return next })
              }}
            />
          ))}
          <div style={{ height:24 }}/>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  WELCOME PANEL — NODE ROW
// ══════════════════════════════════════════════════════════════

function WelcomeNodeRow({ n, active, onClick, groups, searchQuery = '' }:any) {
  const grp = groups.find((g:any) => g.nodeIds.includes(n.id))
  const acc = grp ? grp.color : ACCENTS[n.themeIdx % ACCENTS.length]
  const typeCol:any = { entry:'#ff2a38', function:'#ffc410', class:'#10b981', module:'#4285f4', doc:'#c792ea' }
  const tCol = typeCol[n.type] || '#888'
  const label:string = n.label
  let labelEl:any = label
  if (searchQuery) {
    const idx = label.toLowerCase().indexOf(searchQuery)
    if (idx >= 0) {
      labelEl = <>{label.slice(0,idx)}<span style={{background:'rgba(255,196,16,.25)',color:'#ffc410'}}>{label.slice(idx,idx+searchQuery.length)}</span>{label.slice(idx+searchQuery.length)}</>
    }
  }
  const ctxLine = searchQuery && n.code
    ? n.code.split('\n').find((l:string)=>l.toLowerCase().includes(searchQuery)) || ''
    : ''

  return (
    <div onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:8, padding:'6px 12px',
        cursor:'pointer', borderLeft:`2px solid transparent`,
        background: active ? 'rgba(255,255,255,.05)' : 'transparent',
        transition:'all .1s',
      }}
      onMouseEnter={(e:any)=>{e.currentTarget.style.background='rgba(255,255,255,.05)';e.currentTarget.style.borderLeftColor=acc}}
      onMouseLeave={(e:any)=>{e.currentTarget.style.background=active?'rgba(255,255,255,.05)':'transparent';e.currentTarget.style.borderLeftColor='transparent'}}>
      <div style={{width:6,height:6,borderRadius:'50%',background:acc,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'13px',color:'#c0c8d8',
          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6}}>
          {labelEl}
          {n.modified && <span style={{color:'#ffc410',fontSize:'11px',flexShrink:0}}>●</span>}
          {n.isMain && <span style={{color:acc,fontSize:'10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,flexShrink:0}}>MAIN</span>}
        </div>
        {ctxLine && (
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:'rgba(200,200,220,.3)',
            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>
            {ctxLine.trim().slice(0,55)}
          </div>
        )}
      </div>
      <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.08em',
        color:tCol,opacity:.6,flexShrink:0}}>
        {n.type.slice(0,3).toUpperCase()}
      </span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  FUZZY FILE FINDER MODAL
// ══════════════════════════════════════════════════════════════

function getFileIcon(name: string) {
  const ext = (name || '').split('.').pop()?.toLowerCase()
  const map: Record<string,string> = {
    js:'⬡', mjs:'⬡', jsx:'⬡', ts:'◈', tsx:'◈',
    py:'⬟', go:'◉', rs:'◆', c:'◇', cpp:'◇', h:'◇',
    md:'⌗', json:'{}', css:'#', html:'<>', sh:'$',
    txt:'≡', yaml:'⁞', yml:'⁞', toml:'⁞',
  }
  return map[ext || ''] || '·'
}

function getFileColor(name: string) {
  const ext = (name || '').split('.').pop()?.toLowerCase()
  const map: Record<string,string> = {
    js:'#f2c12e', mjs:'#f2c12e', jsx:'#f2c12e', ts:'#4285f4', tsx:'#4285f4',
    py:'#28f1c3', go:'#89ddff', rs:'#ff8080', c:'#ff8080', cpp:'#ff8080',
    md:'#c792ea', json:'#ffc410', css:'#89b4fa', html:'#e06c75', sh:'#10b981',
  }
  return map[ext || ''] || '#888'
}

function fuzzyMatch(str: string, query: string) {
  if (!query) return true
  const s = str.toLowerCase(); const q = query.toLowerCase()
  let si = 0; let qi = 0
  while (si < s.length && qi < q.length) { if (s[si] === q[qi]) qi++; si++ }
  return qi === q.length
}

function FileFinderModal({ isOpen, onClose, onOpenFile, rootPath, recentFiles = [] }: any) {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<any[]>([])
  const [focused, setFocused] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || !rootPath) return
    const api = (window as any).electronAPI
    api?.fs?.listAllFiles?.(rootPath, 6000).then((list: any[]) => setFiles(list || [])).catch(() => {})
  }, [isOpen, rootPath])

  const filtered = useMemo(() => {
    if (!query) {
      // Show recent files first when no query
      if (recentFiles.length > 0) return recentFiles.slice(0, 20)
      return files.slice(0, 60)
    }
    const q = query.toLowerCase()
    return files
      .filter(f => fuzzyMatch(f.rel, q) || f.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const an = a.name.toLowerCase().startsWith(q) ? 0 : 1
        const bn = b.name.toLowerCase().startsWith(q) ? 0 : 1
        return an - bn || a.rel.length - b.rel.length
      })
      .slice(0, 60)
  }, [query, files, recentFiles])

  useEffect(() => { setFocused(0) }, [filtered])

  useEffect(() => {
    if (isOpen) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 40) }
  }, [isOpen])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[focused] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [focused])

  const open = (f: any) => { onOpenFile(f); onClose() }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(i => Math.min(i+1, filtered.length-1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(i => Math.max(i-1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[focused]) open(filtered[focused]) }
    else if (e.key === 'Escape') onClose()
  }

  if (!isOpen) return null
  return (
    <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,.75)',backdropFilter:'blur(6px)',display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'12vh'}}
      onClick={onClose}>
      <div style={{width:'min(620px,90vw)',background:'#0d0d1a',border:'1px solid rgba(255,42,56,.25)',boxShadow:'0 24px 80px rgba(0,0,0,.95)',overflow:'hidden',borderRadius:4}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
          <span style={{color:'#ff435a',fontSize:'14px',flexShrink:0}}>⌕</span>
          <input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={handleKey}
            placeholder="Search files by name…"
            style={{flex:1,background:'transparent',border:'none',outline:'none',fontFamily:"'JetBrains Mono',monospace",fontSize:'13px',color:'#c0c8d8'}}/>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.25)',flexShrink:0}}>Ctrl+P</span>
          {query && <button onClick={()=>setQuery('')} style={{background:'transparent',border:'none',color:'rgba(200,200,220,.3)',cursor:'pointer',fontSize:'16px',lineHeight:1,flexShrink:0}}>×</button>}
        </div>
        <div ref={listRef} style={{maxHeight:'52vh',overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent'}}>
          {!query && recentFiles.length > 0 && (
            <div style={{padding:'4px 14px 2px',fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.2)',letterSpacing:'.08em',textTransform:'uppercase'}}>Recent</div>
          )}
          {filtered.length === 0 && (
            <div style={{padding:'24px',textAlign:'center',color:'rgba(200,200,220,.25)',fontFamily:"'Share Tech Mono',monospace",fontSize:'11px'}}>
              {files.length === 0 ? 'Open a folder first (File → Open Folder)' : 'No matching files'}
            </div>
          )}
          {filtered.map((f, i) => {
            const dir = (f.rel || f.path || '').split('/').slice(0,-1).join('/')
            return (
              <div key={f.path} onClick={()=>open(f)}
                style={{display:'flex',alignItems:'center',gap:10,padding:'7px 14px',cursor:'pointer',
                  background:i===focused?'rgba(255,42,56,.1)':'transparent',
                  borderLeft:i===focused?'2px solid #ff435a':'2px solid transparent',transition:'background .08s'}}
                onMouseEnter={()=>setFocused(i)}>
                <span style={{fontSize:'12px',color:getFileColor(f.name),flexShrink:0,width:14,textAlign:'center'}}>{getFileIcon(f.name)}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px',color:'#c0c8d8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
                  {dir && <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'rgba(200,200,220,.35)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dir}/</div>}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{padding:'5px 14px',borderTop:'1px solid rgba(255,255,255,.05)',display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.2)'}}>↑↓ navigate · ↩ open · Esc close</span>
          {files.length > 0 && <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.2)',marginLeft:'auto'}}>{files.length} files indexed</span>}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  JUMP TO LINE MODAL
// ══════════════════════════════════════════════════════════════

function JumpToLineModal({ isOpen, onClose, onJump, maxLine = 9999 }: any) {
  const [val, setVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) { setVal(''); setTimeout(() => inputRef.current?.focus(), 40) }
  }, [isOpen])

  const apply = () => {
    const n = parseInt(val)
    if (!isNaN(n) && n >= 1) { onJump(n); onClose() }
  }

  if (!isOpen) return null
  return (
    <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,.6)',backdropFilter:'blur(4px)',display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'18vh'}}
      onClick={onClose}>
      <div style={{width:300,background:'#0d0d1a',border:'1px solid rgba(255,42,56,.2)',boxShadow:'0 16px 48px rgba(0,0,0,.9)',borderRadius:4,overflow:'hidden'}}
        onClick={e=>e.stopPropagation()}>
        <div style={{padding:'8px 12px',borderBottom:'1px solid rgba(255,255,255,.06)',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.12em',color:'rgba(200,200,220,.4)'}}>GO TO LINE</div>
        <div style={{padding:'10px 12px',display:'flex',gap:6}}>
          <input ref={inputRef} type="number" min={1} max={maxLine} value={val}
            onChange={e=>setVal(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter')apply(); if(e.key==='Escape')onClose() }}
            placeholder={`1 – ${maxLine}`}
            style={{flex:1,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',outline:'none',color:'#c0c8d8',fontFamily:"'JetBrains Mono',monospace",fontSize:'13px',padding:'5px 8px'}}/>
          <button onClick={apply} style={{background:'rgba(255,42,56,.15)',border:'1px solid rgba(255,42,56,.3)',color:'#ff435a',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.08em',padding:'5px 12px',cursor:'pointer'}}>GO</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  SCRIPTS PANEL (Command Runner)
// ══════════════════════════════════════════════════════════════

function ScriptsPanel({ rootPath, brutal, onRun }: any) {
  const [scripts, setScripts] = useState<{name:string,cmd:string,source:string}[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState<string|null>(null)

  useEffect(() => {
    if (!rootPath) return
    setLoading(true)
    const api = (window as any).electronAPI
    api?.tools?.getScripts?.(rootPath).then((res: any) => {
      setScripts(res?.scripts || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [rootPath])

  const text   = brutal ? '#0f0f0f' : '#c0c8d8'
  const dimText = brutal ? 'rgba(15,15,15,.4)' : 'rgba(200,200,220,.4)'

  const handleRun = (s: any) => {
    setRunning(s.name)
    setTimeout(() => setRunning(null), 1500)
    onRun?.(s.cmd)
  }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'6px 10px 4px',flexShrink:0,borderBottom:'1px solid rgba(255,255,255,.06)',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.12em',color:'#ffc410'}}>⚙ SCRIPTS</span>
        {rootPath && <button onClick={()=>{ setLoading(true); const api=(window as any).electronAPI; api?.tools?.getScripts?.(rootPath).then((r:any)=>{setScripts(r?.scripts||[]);setLoading(false)}).catch(()=>setLoading(false)) }}
          style={{marginLeft:'auto',background:'transparent',border:'1px solid rgba(255,255,255,.1)',color:dimText,fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',padding:'1px 6px',cursor:'pointer'}}>↻ RELOAD</button>}
      </div>
      <div style={{flex:1,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent',padding:'6px 8px',display:'flex',flexDirection:'column',gap:4}}>
        {!rootPath && (
          <div style={{padding:'20px',textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:dimText}}>OPEN A FOLDER TO SEE ITS SCRIPTS</div>
        )}
        {rootPath && loading && (
          <div style={{padding:'20px',textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'#ffc410',opacity:.7}}>LOADING…</div>
        )}
        {rootPath && !loading && scripts.length === 0 && (
          <div style={{padding:'20px',textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:dimText}}>NO SCRIPTS FOUND<br/><span style={{fontSize:'9px',opacity:.6}}>add scripts to package.json or a Makefile</span></div>
        )}
        {scripts.map((s, i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)',cursor:'default'}}>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'8px',color:s.source==='makefile'?'#4285f4':'#10b981',flexShrink:0,letterSpacing:'.06em',border:`1px solid`,borderColor:s.source==='makefile'?'rgba(66,133,244,.3)':'rgba(16,185,129,.3)',padding:'0 4px'}}>{s.source.toUpperCase()}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:text,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',color:dimText,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.cmd}</div>
            </div>
            <button onClick={()=>handleRun(s)}
              style={{flexShrink:0,background:running===s.name?'rgba(16,185,129,.2)':'rgba(255,196,16,.12)',border:`1px solid ${running===s.name?'rgba(16,185,129,.4)':'rgba(255,196,16,.3)'}`,
                color:running===s.name?'#10b981':'#ffc410',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.08em',
                padding:'3px 10px',cursor:'pointer',transition:'all .1s'}}>
              {running===s.name?'▶…':'▶ RUN'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  AI CHAT PANEL
// ══════════════════════════════════════════════════════════════

function renderAiMessage(text: string) {
  // Convert markdown-ish code blocks to styled spans
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_,code)=>`<pre style="background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.08);padding:8px 10px;margin:6px 0;overflow-x:auto;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.5;color:#c0c8d8">${code.trim()}</pre>`)
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,.08);padding:1px 4px;font-family:\'JetBrains Mono\',monospace;font-size:11px">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

const PROVIDER_COLORS: Record<string,string> = {
  anthropic:'#bb9af7', openai:'#10b981', gemini:'#4285f4', openrouter:'#ffc410', ollama:'#89ddff',
}
const PROVIDER_LABELS: Record<string,string> = {
  anthropic:'Anthropic', openai:'OpenAI', gemini:'Gemini', openrouter:'OpenRouter', ollama:'Ollama',
}
const DEFAULT_MODELS: Record<string,string> = {
  anthropic:'claude-haiku-4-5-20251001', openai:'gpt-4o-mini', gemini:'gemini-2.0-flash', openrouter:'openai/gpt-4o-mini', ollama:'llama3',
}

function AiChatPanel({ activeNode, explorerRoot, brutal, aiProvider, aiKeys, aiModels, onOpenSettings }: any) {
  const [messages, setMessages] = useState<{role:string,content:string}[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [includeFile, setIncludeFile] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streaming, streamingText])

  const activeKey = aiProvider === 'ollama' ? (aiKeys['ollama'] || 'http://localhost:11434') : (aiKeys[aiProvider] || '')
  const activeModel = aiModels[aiProvider] || DEFAULT_MODELS[aiProvider] || ''
  const hasKey = aiProvider === 'ollama' || !!activeKey
  const provColor = PROVIDER_COLORS[aiProvider] || '#bb9af7'

  const send = async () => {
    const q = input.trim()
    if (!q || streaming) return
    setInput('')

    const userMsg = { role: 'user', content: q }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setStreaming(true)
    setStreamingText('')

    const system = includeFile && activeNode?.code
      ? `You are an expert programmer assistant. The user has this file open:\n\nFilename: ${activeNode.label}\n\`\`\`\n${activeNode.code.slice(0, 8000)}\n\`\`\`\n\nBe concise, code-focused, and practical.`
      : `You are an expert programmer assistant. Be concise, code-focused, and practical.`

    const electronAPI = (window as any).electronAPI
    const streamUrl = electronAPI?.ai?.streamUrl?.()
    if (!streamUrl) {
      setStreaming(false)
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠ Error: stream endpoint unavailable' }])
      return
    }

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const resp = await fetch(streamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
          apiKey: activeKey,
          model: activeModel,
          system,
          provider: aiProvider,
        }),
        signal: ctrl.signal,
      })

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break
          try {
            const ev = JSON.parse(payload)
            if (ev.error) {
              setStreamingText(t => t + `\n⚠ ${ev.error}`)
            } else if (ev.token) {
              accumulated += ev.token
              setStreamingText(accumulated)
            }
          } catch {}
        }
      }

      setStreaming(false)
      setStreamingText('')
      setMessages(prev => [...prev, { role: 'assistant', content: accumulated || '(empty response)' }])
    } catch (err: any) {
      setStreaming(false)
      setStreamingText('')
      if (err?.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠ Error: ${err?.message || 'Unknown error'}` }])
      }
    }
  }

  const cancel = () => { abortRef.current?.abort(); abortRef.current = null }

  const text   = brutal ? '#0f0f0f' : '#c0c8d8'
  const dimText = brutal ? 'rgba(15,15,15,.4)' : 'rgba(200,200,220,.4)'

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'5px 10px',flexShrink:0,borderBottom:'1px solid rgba(255,255,255,.06)',display:'flex',alignItems:'center',gap:6}}>
        <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.12em',color:provColor}}>✦ AI ASSISTANT</span>
        <span style={{marginLeft:'auto',fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:dimText,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:100}}>{activeModel}</span>
        <div style={{flexShrink:0,padding:'1px 5px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.08em',
          color:provColor,border:`1px solid ${provColor}44`,background:`${provColor}12`}}>{PROVIDER_LABELS[aiProvider]||aiProvider}</div>
        <button onClick={onOpenSettings} title="Change provider/key in Settings"
          style={{background:'transparent',border:'none',color:hasKey?provColor:dimText,cursor:'pointer',fontSize:'12px',padding:'0 2px',flexShrink:0}}>⚙</button>
      </div>

      {/* No-key banner */}
      {!hasKey && (
        <div style={{padding:'8px 12px',flexShrink:0,background:'rgba(255,67,90,.08)',borderBottom:'1px solid rgba(255,67,90,.2)',
          fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'#ff435a',lineHeight:1.8}}>
          NO API KEY SET FOR {(PROVIDER_LABELS[aiProvider]||aiProvider).toUpperCase()}<br/>
          <span style={{color:'rgba(255,255,255,.4)'}}>Click ⚙ to open Settings › AI Providers</span>
        </div>
      )}

      {/* Messages */}
      <div style={{flex:1,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent',padding:'8px 0'}}>
        {messages.length === 0 && (
          <div style={{padding:'24px 14px',textAlign:'center',color:dimText,fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',lineHeight:2}}>
            ASK ANYTHING ABOUT YOUR CODE<br/>
            <span style={{fontSize:'9px',opacity:.6}}>Current file included automatically · toggle below</span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{padding:'6px 12px',borderBottom:'1px solid rgba(255,255,255,.03)'}}>
            <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.12em',marginBottom:4,
              color:m.role==='user'?'#ff435a':provColor}}>
              {m.role==='user'?'YOU':'✦ AI'}
            </div>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',lineHeight:1.6,color:text}}
              dangerouslySetInnerHTML={{__html: renderAiMessage(m.content)}}/>
          </div>
        ))}
        {streaming && (
          <div style={{padding:'6px 12px',borderBottom:'1px solid rgba(255,255,255,.03)'}}>
            <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.12em',marginBottom:4,color:provColor}}>
              ✦ AI
            </div>
            {streamingText ? (
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',lineHeight:1.6,color:text}}
                dangerouslySetInnerHTML={{__html: renderAiMessage(streamingText)}}/>
            ) : (
              <span style={{color:provColor,opacity:.5,fontFamily:"'Share Tech Mono',monospace",fontSize:'10px'}}>thinking…</span>
            )}
            <span style={{display:'inline-block',width:7,height:13,background:provColor,opacity:.8,animation:'blink 1s step-end infinite',verticalAlign:'text-bottom',marginLeft:1}}/>
          </div>
        )}
        <div ref={endRef}/>
      </div>

      {/* Input */}
      <div style={{padding:'8px',flexShrink:0,borderTop:'1px solid rgba(255,255,255,.06)',display:'flex',flexDirection:'column',gap:5}}>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:dimText}}>
            <input type="checkbox" checked={includeFile} onChange={e=>setIncludeFile(e.target.checked)} style={{width:10,height:10}}/>
            include file
          </label>
          {(messages.length > 0 || streaming) && (
            <button onClick={()=>{ cancel(); setMessages([]); setStreamingText('') }} style={{marginLeft:'auto',background:'transparent',border:'none',color:dimText,cursor:'pointer',fontFamily:"'Share Tech Mono',monospace",fontSize:'9px'}}>clear</button>
          )}
        </div>
        <div style={{display:'flex',gap:5}}>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()} }}
            placeholder="Ask about your code… (Enter to send, Shift+Enter newline)"
            rows={2}
            disabled={streaming}
            style={{flex:1,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',outline:'none',color:text,fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',padding:'5px 7px',resize:'none',lineHeight:1.4,opacity:streaming?.6:1}}
            onFocus={e=>(e.target.style.borderColor=provColor+'66')}
            onBlur={e=>(e.target.style.borderColor='rgba(255,255,255,.08)')}/>
          {streaming ? (
            <button onClick={cancel}
              style={{background:'rgba(255,67,90,.12)',border:'1px solid rgba(255,67,90,.4)',
                color:'#ff435a',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',
                letterSpacing:'.08em',padding:'0 10px',cursor:'pointer',transition:'all .12s'}}>
              ■
            </button>
          ) : (
            <button onClick={send} disabled={!input.trim()||!hasKey}
              style={{background:!hasKey?'transparent':`${provColor}22`,border:`1px solid ${!hasKey?'rgba(255,255,255,.08)':provColor+'55'}`,
                color:!hasKey?dimText:provColor,fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',
                letterSpacing:'.08em',padding:'0 10px',cursor:!hasKey?'default':'pointer',transition:'all .12s'}}>
              ▶
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MAIN IDE COMPONENT
// ══════════════════════════════════════════════════════════════

function IDE({ initialTheme = 'cyber', initialAvatar = 0 }) {
  const wsHook = useWorkspace()
  const [themeMode, setThemeMode] = useState(initialTheme)
  const brutal = themeMode === 'brutal'

  // Graph state
  const _saved = useMemo(() => loadSaved(), [])
  const nodesRef  = useRef(_saved.nodes)
  const edgesRef  = useRef(_saved.edges)
  const groupsRef = useRef(_saved.groups)
  const saveTimerRef = useRef(null)
  const [_rt, _setRt] = useState(0)
  const forceRender = useCallback(() => _setRt(t => t+1), [])

  useEffect(() => {
    if (_rt === 0) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          nodes: nodesRef.current,
          edges: edgesRef.current,
          groups: groupsRef.current,
        }))
      } catch {}
    }, 800)
  }, [_rt])

  // Canvas
  const [transform, setTransform] = useState({ x: 300, y: 220, scale: 1 })
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false)
  const lastMousePos = useRef({ x:0, y:0 })
  const draggingNodeRef  = useRef(null)
  const wakePhysicsRef   = useRef<() => void>(() => {})
  const canvasInputRef = useRef(null)
  const folderInputRef = useRef(null)

  // ── Unified floating panel system ──────────────────────────────
  const W = typeof window!=='undefined' ? window.innerWidth  : 1400
  const H = typeof window!=='undefined' ? window.innerHeight : 900
  const [editorOpen,  setEditorOpen]  = useState(true)
  const [editorW,     setEditorW]     = useState(() => Math.round(window.innerWidth * 0.65))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarW,    setSidebarW]    = useState(240)
  const [bottomOpen,  setBottomOpen]  = useState(false)
  const [bottomTab,   setBottomTab]   = useState('console')
  const [bottomH,     setBottomH]     = useState(260)
  const splitDragRef = useRef<any>(null)
  const panelDragRef = useRef(null)
  const tlDragRef    = useRef<any>(null)

  // ── Split-pane drag (editor/sidebar width) ──────────────────
  useEffect(() => {
    const onMove = (e) => {
      const d = splitDragRef.current; if (!d) return
      const dx = e.clientX - d.sx
      if (d.side === 'editor')  setEditorW(w  => Math.max(240, Math.min(window.innerWidth*0.85, d.startW - dx)))
      if (d.side === 'sidebar') setSidebarW(w => Math.max(160, Math.min(480, d.startW + dx)))
    }
    const onUp = () => { splitDragRef.current=null; document.body.style.userSelect=''; document.body.style.cursor='' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Timeline panel drag (height) ────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      const d = tlDragRef.current; if (!d) return
      const dy = e.clientY - d.sy
      setBottomH(h => Math.max(120, Math.min(window.innerHeight*0.65, d.startH - dy)))
    }
    const onUp = () => { tlDragRef.current=null; document.body.style.userSelect=''; document.body.style.cursor='' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Event log (timeline) ────────────────────────────────────
  const [eventLog, setEventLog] = useState([
    {id:1, type:'system', label:'FORBIDEN IDE started', ts:Date.now(), icon:'⚡'}
  ])
  const addEvent = useCallback((type, label, meta={}) => {
    const icons = {'node-create':'⊕','node-delete':'⊖','code-edit':'✏','edge-add':'⇢','edge-del':'⇠','run-ok':'✓','run-err':'✗','import':'⬆','group':'◈','commit':'◆','system':'⚡'}
    setEventLog(log => [{id:Date.now()+Math.random(), type, label, ts:Date.now(), icon:icons[type]||'·', meta}, ...log].slice(0,300))
  }, [])

  // ── Git panel state ─────────────────────────────────────────
  const [gitStatus, setGitStatus]       = useState(null)
  const [gitLog,    setGitLog]          = useState([])
  const [gitBranch, setGitBranch]       = useState('')
  const [gitCommitMsg, setGitCommitMsg] = useState('')
  const [gitLoading, setGitLoading]     = useState(false)

  const refreshGit = useCallback(async () => {
    const api = (window as any).electronAPI
    if (api?.git && (window as any).__forbiddenCwd) {
      const cwd = (window as any).__forbiddenCwd
      setGitLoading(true)
      try {
        const [status, log, branch] = await Promise.all([
          api.git.status(cwd),
          api.git.log(cwd),
          api.git.branch(cwd),
        ])
        setGitStatus(status)
        setGitLog(log)
        setGitBranch(branch)
      } catch { /* keep previous state */ }
      finally { setGitLoading(false) }
      return
    }
    // No native git — derive from in-memory event log
    const modNodes = nodesRef.current.filter((n:any) => n.modified)
    setGitStatus({ modified: modNodes.map((n:any) => n.label) })
    setGitLog(eventLog.filter((e:any) => e.type==='commit').slice(0,30).map((e:any) => ({
      hash: e.id.toString(16).slice(0,7),
      message: e.label,
      author: 'Operator',
      date: new Date(e.ts).toISOString(),
    })))
    setGitBranch('main')
  }, [eventLog])


  const [aiCommitLoading, setAiCommitLoading] = useState(false)

  const handleAiCommitMsg = async () => {
    const api = (window as any).electronAPI
    const cwd = (window as any).__forbiddenCwd
    if (!cwd || !api?.git) return
    const activeKey = aiProvider === 'ollama' ? (aiKeys['ollama'] || 'http://localhost:11434') : (aiKeys[aiProvider] || '')
    if (aiProvider !== 'ollama' && !activeKey) {
      setSidebarMode('settings'); setSidebarOpen(true); return
    }
    setAiCommitLoading(true)
    const diffRes = await api.git.diff(cwd, '').catch(() => ({ diff: '' }))
    const statusRes = await api.git.status(cwd).catch(() => ({ files: [] }))
    const diff = (diffRes?.diff || '').slice(0, 6000)
    const files = (statusRes?.files || []).map((f:any) => f.file || f.path || '').filter(Boolean).join(', ')
    const activeModel = aiModels[aiProvider] || DEFAULT_MODELS[aiProvider] || ''
    const result = await api.ai.chat(
      [{ role: 'user', content: `Write a concise git commit message (50 chars or less for title, then optional body) for these changes:\n\nChanged files: ${files}\n\nDiff:\n\`\`\`\n${diff}\n\`\`\`` }],
      activeKey,
      activeModel,
      'You are a git commit message writer. Output ONLY the commit message, no explanation, no quotes. Follow conventional commits format when applicable (feat/fix/refactor/docs/etc).',
      aiProvider,
    )
    setAiCommitLoading(false)
    if (result?.success && result.content) setGitCommitMsg(result.content.trim())
  }

  const handleGitCommit = async () => {
    if (!gitCommitMsg.trim()) return
    const msg = gitCommitMsg.trim()
    const api = (window as any).electronAPI
    if (api?.git && (window as any).__forbiddenCwd) {
      setGitLoading(true)
      const result = await api.git.commit((window as any).__forbiddenCwd, msg).catch((e:any) => ({ success:false, error: e.message }))
      setGitLoading(false)
      if (result.success) {
        addEvent('commit', `Commit: ${msg.slice(0,40)}`)
        setGitCommitMsg('')
        refreshGit()
      } else {
        addEvent('error', `Git commit failed: ${result.error || 'unknown error'}`)
      }
      return
    }
    addEvent('commit', `Commit: ${msg.slice(0,40)}`)
    nodesRef.current = nodesRef.current.map(n=>({...n,modified:false}))
    setGitCommitMsg('')
    forceRender({})
  }

  // ── Legacy compat shims ─────────────────────────────────────
  const [sidebarMode, setSidebarMode] = useState('files')

  // Refresh git badge when source-control sidebar opens
  useEffect(() => {
    if (sidebarOpen && sidebarMode === 'git') refreshGit()
  }, [sidebarOpen, sidebarMode])

  // Tabs & editor
  const [openTabs, setOpenTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [pinnedTabs, setPinnedTabs] = useState<Set<string>>(new Set())

  const handleDeleteNode = useCallback((nid) => {
    const deletedLabel = nodesRef.current.find(n=>n.id===nid)?.label||nid
    nodesRef.current=nodesRef.current.filter(n=>n.id!==nid)
    edgesRef.current=edgesRef.current.filter(e=>e.source!==nid&&e.target!==nid)
    setOpenTabs(t=>t.filter(tid=>tid!==nid))
    if (activeTabId===nid) setActiveTabId(null)
    forceRender({})
    wakePhysicsRef.current()
    addEvent('node-delete', `Deleted ${deletedLabel}`)
    wsHook.deleteNode(nid).catch(()=>{})
  }, [activeTabId, addEvent])
  const [globalEditorPalette, setGlobalEditorPalette] = useState(PALETTES[0])

  // Node interaction
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null)
  const [edgeMode, setEdgeMode] = useState(null) // null|'join'|'cut'
  const [joinFirstNode, setJoinFirstNode] = useState(null)
  const [nodeColorPicker, setNodeColorPicker] = useState(null)
  const [nodeCtxMenu, setNodeCtxMenu] = useState(null)   // {nodeId, x, y}

  // Modals
  const [openGroupId, setOpenGroupId] = useState(null)
  const [showCmd, setShowCmd] = useState(false)
  const [showCreateNode, setShowCreateNode] = useState(false)
  const [newNodeName, setNewNodeName] = useState('')
  const [newNodeType, setNewNodeType] = useState('function')
  const [newNodeColor, setNewNodeColor] = useState(1)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupColor, setGroupColor] = useState('#10b981')
  const [groupSelected, setGroupSelected] = useState([])

  // Board
  const [board, setBoard] = useState(INITIAL_BOARD)
  const [focusCard, setFocusCard] = useState(null)
  const [newCardCol, setNewCardCol] = useState(null)
  const [newCardTitle, setNewCardTitle] = useState('')
  const PC = { HIGH:'#ff435a', MED:'#ffc410', LOW:'#4285f4', DONE:'#10b981' }

  // Timeline
  const [playheadPos, setPlayheadPos] = useState(400)
  const [activeVersionName, setActiveVersionName] = useState('v1.4 (HEAD)')
  const [activeVersionIdx, setActiveVersionIdx] = useState(4)
  const playheadDragRef = useRef({ isDragging:false })

  // Terminal
  const eAPI = (window as any).electronAPI
  const [termCwd, setTermCwd] = useState<string>(eAPI?.homeDir ?? '~')
  const [termLines, setTermLines] = useState(() => {
    const base = [{ c:'#28f1c3', t:'[FORBIDEN] System boot v2.1.0 — Electron' }]
    if (eAPI) {
      base.push({ c:'#9494b0', t:`[SYS] Platform: ${eAPI.platform}  Home: ${eAPI.homeDir}` })
      base.push({ c:'#9494b0', t:`[CWD] ${eAPI.homeDir}` })
      base.push({ c:'#28f1c3', t:'[OK]  Native shell ready. All commands execute locally.' })
    } else {
      base.push({ c:'#ffc410', t:'[WARN] Running in browser — terminal commands are simulated.' })
      base.push({ c:'#9494b0', t:'Ready. Type `help` for commands.' })
    }
    return base
  })
  const [termInput, setTermInput] = useState('')
  const [termPalette, setTermPalette] = useState(TERM_PALETTES[1])
  const [showTermPalette, setShowTermPalette] = useState(false)
  const [activePtyId, setActivePtyId] = useState<string | null>(null)
  const termEndRef = useRef(null)

  // JS Runtime
  const [nodeRunState, setNodeRunState] = useState({})
  const [edgeDataLabels, setEdgeDataLabels] = useState({})
  const [jsLogs, setJsLogs] = useState([
    {type:'header', val:'// FORBIDEN JS Runtime ready', ts:Date.now()},
    {type:'info',   val:'// Use ▶ on any node or type JS in the REPL below', ts:Date.now()},
  ])
  const [replInput, setReplInput] = useState('')
  const [replHistory, setReplHistory] = useState([])
  const [replHistIdx, setReplHistIdx] = useState(-1)
  const [compileStdin, setCompileStdin] = useState('')
  const jsConsoleEndRef = useRef(null)

  // Markdown
  const [mdPreviewMode, setMdPreviewMode] = useState('preview')
  const [mdFontSize,    setMdFontSize]    = useState(16)

  // Floating notebook panel
  const [notebookFloating, setNotebookFloating] = useState(false)

  // File drop
  const [dragOver, setDragOver] = useState(false)
  const dragDepthRef = useRef(0)

  // File explorer
  const [explorerRoot,       setExplorerRoot]       = useState<string | null>(null)
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0)
  const [globalFontScale, setGlobalFontScale] = useState(1)

  // Chat & Notes
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([
    {id:1, from:'System', text:'Sync established. 4 nodes active.', self:false},
    {id:2, from:'Op-2', text:'Pushing DataMatrix refactor.', self:false},
    {id:3, from:'You', text:'Architecture booted. Running tests.', self:true},
  ])
  const [notesText, setNotesText] = useState('// OPERATOR NOTES\n// Sprint-01 planning\n\nTODO:\n- Finish graph force simulation\n- Wire WebSocket protocol\n- Add color palette persistence\n')
  const [searchQuery, setSearchQuery] = useState('')
  const [welcomeSearch, setWelcomeSearch] = useState('')
  const [welcomeFilter, setWelcomeFilter] = useState('all')
  const [avatarIndex, setAvatarIndex] = useState(initialAvatar)
  const chatEndRef = useRef(null)

  // ── COMPUTED ──
  const activeTabNode = nodesRef.current.find(n => n.id === activeTabId) || null
  const activeLang    = detectLang(activeTabNode?.label || '')
  const canRun        = activeTabNode && activeLang !== 'md' && activeLang !== 'unknown'
  const modifiedNodes = nodesRef.current.filter(n => n.modified)
  const nodeCount = nodesRef.current.length
  const edgeCount = edgesRef.current.length
  const openGroup = groupsRef.current.find(g => g.id === openGroupId) || null

  const visibleNodes = nodesRef.current.filter(n => {
    if (n.id==='n1' && playheadPos<100) return false
    if (n.id==='n3' && playheadPos<250) return false
    return true
  })
  const visibleEdges = edgesRef.current.filter(e =>
    visibleNodes.find(n=>n.id===e.source) && visibleNodes.find(n=>n.id===e.target)
  )
  const filteredNodes = nodesRef.current.filter(n => {
    const q = searchQuery.trim().toLowerCase()
    return !q || n.label.toLowerCase().includes(q) || (n.code||'').toLowerCase().includes(q)
  })

  // ── EFFECTS ──

  useEffect(() => { termEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [termLines])
  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [chatMessages])
  useEffect(() => { jsConsoleEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [jsLogs])

  // ── Init workspace folder on startup ────────────────────────
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.fs) return
    ;(async () => {
      const [defaultRes, savedRes] = await Promise.all([
        api.fs.ensureDefaultWorkspace(),
        api.fs.getWorkspace(),
      ])
      const folder = savedRes?.path || (defaultRes.success ? defaultRes.path : null)
      if (!folder) return
      setExplorerRoot(folder)
      ;(window as any).__forbiddenCwd = folder
      setTermCwd(folder)
      setSidebarMode('files')
    })()
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      setEdgeDataLabels(prev => {
        const next = {...prev}
        let changed = false
        Object.keys(next).forEach(k => { if (now - next[k].ts > 8000) { delete next[k]; changed = true } })
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Load workspace data from API
  useEffect(() => {
    if (wsHook.loading || wsHook.error) return
    if (wsHook.nodes.length > 0) {
      nodesRef.current = wsHook.nodes.map(n => ({
        id:n.id, label:n.label, filepath:n.filepath,
        type:n.type||'function', isMain:n.is_main,
        x:n.x||0, y:n.y||0, vx:0, vy:0,
        themeIdx:n.theme_idx||0, classId:n.class_id,
        code:'', modified:n.modified||false,
      }))
      edgesRef.current = wsHook.edges.map(e => ({id:e.id,source:e.source,target:e.target}))
      groupsRef.current = wsHook.groups.map(g => ({id:g.id,name:g.name,color:g.color,nodeIds:g.node_ids||[]}))
      forceRender({})
    }
    if (wsHook.columns.length > 0) {
      setBoard({
        cols: wsHook.columns.map(c=>({id:c.id,title:c.title,color:c.color})),
        cards: wsHook.cards.map(k=>({id:k.id,colId:k.col_id,title:k.title,priority:k.priority,tags:k.tags||[],progress:k.progress||0,due:k.due||null,assignee:k.assignee_idx??null})),
      })
    }
  }, [wsHook.loading])

  // Force simulation — stops when settled, restarts via wakePhysicsRef
  useEffect(() => {
    let rafId: number
    let idleFrames = 0
    let lastRenderMs = 0
    const FRAME_MS = 1000 / 30 // 30fps cap — halves React re-renders vs 60fps

    const tick = (now: number) => {
      // Physics runs every frame for accuracy; only re-render at 30fps
      const shouldRender = now - lastRenderMs >= FRAME_MS

      let updated = false
      const nds = nodesRef.current, eds = edgesRef.current
      for (let i=0;i<nds.length;i++) for (let j=i+1;j<nds.length;j++) {
        const dx=nds[j].x-nds[i].x, dy=nds[j].y-nds[i].y
        const distSq=dx*dx+dy*dy||1, dist=Math.sqrt(distSq), force=4200/distSq
        nds[i].vx-=(dx/dist)*force; nds[i].vy-=(dy/dist)*force
        nds[j].vx+=(dx/dist)*force; nds[j].vy+=(dy/dist)*force
      }
      eds.forEach(edge => {
        const src=nds.find(n=>n.id===edge.source), tgt=nds.find(n=>n.id===edge.target)
        if (!src||!tgt) return
        const dx=tgt.x-src.x, dy=tgt.y-src.y, dist=Math.sqrt(dx*dx+dy*dy)||1, force=(dist-110)*0.05
        src.vx+=(dx/dist)*force; src.vy+=(dy/dist)*force
        tgt.vx-=(dx/dist)*force; tgt.vy-=(dy/dist)*force
      })
      nds.forEach(n => {
        const p=n.isMain?0.2:0.005
        n.vx+=(0-n.x)*p; n.vy+=(0-n.y)*p
        n.vx*=0.8; n.vy*=0.8; n.x+=n.vx; n.y+=n.vy
        if (Math.abs(n.vx)>0.05||Math.abs(n.vy)>0.05) updated=true
      })
      if (draggingNodeRef.current) {
        const d=nds.find(n=>n.id===draggingNodeRef.current.id)
        if (d) { d.x=draggingNodeRef.current.x; d.y=draggingNodeRef.current.y; d.vx=0; d.vy=0; updated=true }
      }
      if (updated) {
        if (shouldRender) { forceRender(); lastRenderMs = now }
        idleFrames = 0
      } else idleFrames++

      // Keep running while moving or drag active; stop after 8 settled frames
      if (updated || draggingNodeRef.current || idleFrames < 8) {
        rafId = requestAnimationFrame(tick)
      }
      // RAF stops here when settled — wakePhysicsRef restarts it
    }

    wakePhysicsRef.current = () => {
      idleFrames = 0
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(rafId); wakePhysicsRef.current = () => {} }
  }, [])

  // Non-passive wheel listener for zoom
  useEffect(() => {
    const el = canvasInputRef.current
    if (!el) return
    const handler = e => {
      e.preventDefault()
      setTransform(p => ({...p, scale: Math.min(3.0, Math.max(0.3, p.scale*(e.deltaY>0?.92:1.08)))}))
    }
    el.addEventListener('wheel', handler, { passive:false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── FOLDER OPEN (sets explorer root) ─────────────────────────
  const handleOpenFolderForExplorer = useCallback(async () => {
    const api = (window as any).electronAPI
    if (!api?.dialog) return
    const folder = await api.dialog.openFolder()
    if (!folder) return
    setExplorerRoot(folder)
    ;(window as any).__forbiddenCwd = folder
    setTermCwd(folder)
    setSidebarMode('files')
    setSidebarOpen(true)
    // Clear graph so previous/hardcoded nodes don't bleed into the new folder
    nodesRef.current = []
    edgesRef.current = []
    groupsRef.current = []
    setOpenTabs([])
    setActiveTabId(null)
    forceRender({})
    // Persist so the same folder reopens on next launch
    api.fs?.saveWorkspace?.(folder)
    api.fs?.addRecentWorkspace?.(folder)
    addEvent('import', `Opened folder: ${folder.split('/').pop()}`)
  }, [addEvent])

  // Native menu events (Electron)
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.on) return
    const handleMenuOpenFolder = () => handleOpenFolderForExplorer()
    const handleMenuSaveFile = async () => {
      const node = nodesRef.current.find(n=>n.id===activeTabId)
      if (!node) return
      if (node.filepath?.startsWith('/') && api?.fs) {
        // Direct disk save — no dialog
        const res = await api.fs.writeFile(node.filepath, node.code ?? '')
        if (res.success) {
          nodesRef.current = nodesRef.current.map(n => n.id===activeTabId ? {...n, modified:false} : n)
          forceRender({})
        }
      } else {
        // Fallback: save-as dialog (unsaved / in-memory nodes)
        const res = await api.dialog?.saveFile(node.label, node.code ?? '')
        if (res?.success && res.filePath) {
          nodesRef.current = nodesRef.current.map(n => n.id===activeTabId ? {...n, filepath: res.filePath, modified:false} : n)
          forceRender({})
        }
      }
    }
    const handleMenuRunActive = () => { if (activeTabId) handleRunNode(activeTabId) }
    const handleMenuToggleTerm = () => { setBottomTab('terminal'); setBottomOpen(o => !o) }
    const handleTitleBarFolder = (e: any) => {
      const folder = e.detail
      if (!folder) return
      setExplorerRoot(folder)
      ;(window as any).__forbiddenCwd = folder
      setTermCwd(folder)
      setSidebarMode('files')
      setSidebarOpen(true)
      nodesRef.current = []
      edgesRef.current = []
      groupsRef.current = []
      setOpenTabs([])
      setActiveTabId(null)
      forceRender({})
      api.fs?.saveWorkspace?.(folder)
      api.fs?.addRecentWorkspace?.(folder)
      addEvent('import', `Opened folder: ${folder.split('/').pop()}`)
    }
    api.on('menu:open-folder', handleMenuOpenFolder)
    api.on('menu:save-file', handleMenuSaveFile)
    api.on('menu:run-active', handleMenuRunActive)
    api.on('menu:toggle-terminal', handleMenuToggleTerm)
    window.addEventListener('forbiden:open-folder', handleTitleBarFolder)
    return () => {
      api.off?.('menu:open-folder', handleMenuOpenFolder)
      api.off?.('menu:save-file', handleMenuSaveFile)
      api.off?.('menu:run-active', handleMenuRunActive)
      api.off?.('menu:toggle-terminal', handleMenuToggleTerm)
      window.removeEventListener('forbiden:open-folder', handleTitleBarFolder)
    }
  }, [activeTabId, handleOpenFolderForExplorer, addEvent])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      const tag = e.target.tagName
      const inInput = tag==='INPUT'||tag==='TEXTAREA'||e.target.contentEditable==='true'
      if ((e.metaKey||e.ctrlKey)&&e.key==='p'&&!e.shiftKey) { e.preventDefault(); setShowFileFinder(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.key==='P') { e.preventDefault(); setShowCmd(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key==='p') { e.preventDefault(); setShowCmd(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.key==='g'&&!e.shiftKey) { e.preventDefault(); setShowJumpLine(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&(e.key==='z'||e.key==='Z')) { e.preventDefault(); setZenMode(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&(e.key==='f'||e.key==='F')) { e.preventDefault(); setSidebarMode('project-search'); setSidebarOpen(true) }
      if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&(e.key==='o'||e.key==='O')) { e.preventDefault(); setSidebarMode('outline'); setSidebarOpen(true) }
      if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&(e.key==='g'||e.key==='G')) { e.preventDefault(); setSidebarMode(m=>m==='git'?m:'git'); setSidebarOpen(o=>sidebarMode==='git'?!o:true) }
      if ((e.metaKey||e.ctrlKey)&&e.key==='b'&&!e.shiftKey) { e.preventDefault(); setSidebarOpen(v=>!v) }
      if ((e.metaKey||e.ctrlKey)&&e.key==='?') { e.preventDefault(); setShowShortcuts(v=>!v) }
      if (e.key==='Escape') {
        setShowCmd(false); setShowFileFinder(false); setShowJumpLine(false); setShowShortcuts(false)
        if (zenMode) { setZenMode(false); return }
        setEdgeMode(null); setJoinFirstNode(null); setNodeColorPicker(null); setShowTermPalette(false)
        setNotebookFloating(false)
        if (!openGroupId) setActiveTabId(null)
        setOpenGroupId(null)
      }
      if (!inInput) {
        if (e.key==='n'||e.key==='N') setShowCreateNode(true)
        if (e.key==='g'||e.key==='G') { setShowCreateGroup(true); setGroupSelected([]) }
        if (e.key==='`'||e.key==='~') { setBottomTab('terminal'); setBottomOpen(o => !o) }
        if (e.key==='j'||e.key==='J') setEdgeMode(m=>m==='join'?null:'join')
        if (e.key==='x'||e.key==='X') setEdgeMode(m=>m==='cut'?null:'cut')
        if ((e.key==='Delete'||e.key==='Backspace')&&hoveredNodeId) {
          handleDeleteNode(hoveredNodeId)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openGroupId, hoveredNodeId, activeTabId])

  // ── CANVAS HANDLERS ──
  const handleCanvasPtrDown = e => {
    if (edgeMode) return
    if (e.target.closest('.mn-node')) return
    setNodeColorPicker(null)
    setIsDraggingCanvas(true)
    lastMousePos.current = { x:e.clientX, y:e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handleCanvasPtrMove = e => {
    if (!isDraggingCanvas) return
    const dx=e.clientX-lastMousePos.current.x, dy=e.clientY-lastMousePos.current.y
    setTransform(p=>({...p, x:p.x+dx, y:p.y+dy}))
    lastMousePos.current = { x:e.clientX, y:e.clientY }
  }
  const handleCanvasPtrUp = e => {
    setIsDraggingCanvas(false)
    const dr = draggingNodeRef.current
    if (dr?.hasDragged) wsHook.savePositions([{id:dr.id,x:dr.x,y:dr.y}]).catch(()=>{})
    draggingNodeRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // ── NODE / EDGE ──
  const openNodeInEditor = id => {
    setOpenTabs(t => t.includes(id)?t:[...t,id])
    setActiveTabId(id)
    setEditorCursorPos(null)
  }
  const closeTab = id => {
    if (pinnedTabs.has(id)) return // pinned tabs cannot be closed
    setOpenTabs(t => {
      const newT = t.filter(tid=>tid!==id)
      if (activeTabId===id) setActiveTabId(newT[newT.length-1]||null)
      return newT
    })
  }
  const togglePinTab = (id: string) => {
    setPinnedTabs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  // ── Format-on-save (must be declared before saveNodeToDisk uses it) ──
  const [formatOnSave, setFormatOnSave] = useState<boolean>(() => localStorage.getItem('forbiden_format_on_save') === 'true')

  // ── Disk save helper ─────────────────────────────────────────
  const saveNodeToDisk = useCallback(async (id: string, skipFormat = false) => {
    const node = nodesRef.current.find(n => n.id === id)
    if (!node) return
    const api = (window as any).electronAPI
    const fsApi = api?.fs
    if (!fsApi) return
    const fp = node.filepath
    if (!fp || !fp.startsWith('/')) return
    let code = node.code || ''
    // Format on save when enabled (and not called recursively)
    if (!skipFormat && formatOnSave && api?.tools?.formatCode) {
      const ext = (node.label || '').split('.').pop()?.toLowerCase() || ''
      const fmtLangs = ['js','mjs','jsx','ts','tsx','css','json','html','md','py','go']
      if (fmtLangs.includes(ext)) {
        const res = await api.tools.formatCode(code, ext)
        if (res?.success && res.formatted) code = res.formatted
        else if (res?.success && res.code) code = res.code
      }
    }
    const res = await fsApi.writeFile(fp, code)
    if (res.success) {
      nodesRef.current = nodesRef.current.map(n => n.id === id ? { ...n, code, modified: false } : n)
      forceRender({})
    }
  }, [forceRender, formatOnSave])

  const codeEditTimerRef = useRef({})
  const updateNodeCode = (id, code) => {
    nodesRef.current = nodesRef.current.map(n=>n.id===id?{...n,code,modified:true}:n)
    forceRender({})
    clearTimeout(codeEditTimerRef.current[id])
    codeEditTimerRef.current[id] = setTimeout(() => {
      const node = nodesRef.current.find(n=>n.id===id)
      if (node) addEvent('code-edit', `Edited ${node.label}`, {nodeId:id})
      saveNodeToDisk(id)
    }, 1500)
  }
  const handleNodeClickInMode = nodeId => {
    if (edgeMode==='join') {
      if (!joinFirstNode) { setJoinFirstNode(nodeId); return }
      if (joinFirstNode===nodeId) { setJoinFirstNode(null); return }
      const exists=edgesRef.current.find(e=>(e.source===joinFirstNode&&e.target===nodeId)||(e.source===nodeId&&e.target===joinFirstNode))
      if (!exists) {
        const tempEdge={id:'e'+Date.now(),source:joinFirstNode,target:nodeId}
        edgesRef.current=[...edgesRef.current,tempEdge]
        const srcNode=nodesRef.current.find(n=>n.id===joinFirstNode)
        const tgtNode=nodesRef.current.find(n=>n.id===nodeId)
        const srcLabel=srcNode?.label||joinFirstNode
        const tgtLabel=tgtNode?.label||nodeId
        addEvent('edge-add', `${srcLabel} → ${tgtLabel}`)
        wsHook.createEdge(joinFirstNode,nodeId).catch(()=>{})

        // ── Engine: auto-inject import in target node ──
        if (srcNode && tgtNode && srcNode.code !== undefined) {
          const srcLang = detectLang(srcNode.label)
          const tgtLang = detectLang(tgtNode.label)
          if (tgtLang !== 'md' && tgtLang !== 'unknown' && srcLang !== 'md') {
            const syms = extractSymbols(srcNode.code || '', srcLang)
            const imp  = generateImport(srcNode.label, tgtLang, syms)
            if (imp && tgtNode.code !== undefined) {
              const injected = injectImport(tgtNode.code, imp, tgtLang)
              if (injected !== tgtNode.code) {
                nodesRef.current = nodesRef.current.map(n =>
                  n.id === nodeId ? {...n, code: injected, modified: true} : n
                )
                addEvent('code-edit', `Auto-linked: ${imp}`)
              }
            }
          }
        }

        forceRender({})
      }
      setJoinFirstNode(null)
    }
  }
  const handleEdgeClick = edgeId => {
    if (edgeMode==='cut') {
      edgesRef.current=edgesRef.current.filter(e=>e.id!==edgeId); forceRender({})
      addEvent('edge-del', `Removed edge`)
      wsHook.deleteEdge(edgeId).catch(()=>{})
    }
  }
  const handleChangeNodeColor = (nodeId, colorIdx) => {
    nodesRef.current=nodesRef.current.map(n=>n.id===nodeId?{...n,themeIdx:colorIdx}:n)
    setNodeColorPicker(null); forceRender({})
  }

  // ── GROUP ──
  const dissolveGroup = gid => {
    groupsRef.current=groupsRef.current.filter(g=>g.id!==gid)
    nodesRef.current=nodesRef.current.map(n=>n.classId===gid?{...n,classId:null}:n)
    if (openGroupId===gid) setOpenGroupId(null)
    forceRender({})
    if (wsHook.workspace) wsHook.deleteGroup(gid).catch(()=>{})
  }

  // ── CREATE ──
  const handleFolderUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    e.target.value = ''
    const { nodes, edges, groups } = await parseFolderToGraph(files)
    if (!nodes.length) return
    nodesRef.current  = nodes
    edgesRef.current  = edges
    groupsRef.current = groups
    setOpenTabs([])
    setActiveTabId(null)
    addEvent('import', `Imported folder — ${nodes.length} files, ${edges.length} edges`)
    forceRender()
  }

  const handleCreateNode = async () => {
    if (!newNodeName.trim()) return
    const raw = newNodeName.trim()
    const hasExt = /\.\w{1,5}$/.test(raw)
    const isDocType = newNodeType === 'doc'
    // Auto-pick extension if none provided
    const extMap = { js:'.js', ts:'.ts', py:'.py', c:'.c', cpp:'.cpp', go:'.go', doc:'.md' }
    const autoExt = extMap[newNodeType] || '.js'
    const label = hasExt ? raw.replace(/\s+/g,'_') : raw.replace(/\s+/g,'_') + (isDocType ? '.md' : autoExt)
    const isMd = label.endsWith('.md')
    const lang = detectLang(label)
    // Use engine templates for compiled/known langs, fallback to simple comment
    let code
    if (isMd) {
      code = `# ${raw.replace(/\.\w+$/,'')}\n\n`
    } else {
      const engineCode = getDefaultCode(lang, label, newNodeType)
      code = engineCode || `// ${label}\n\n`
    }
    const x=(Math.random()-.5)*300, y=(Math.random()-.5)*300
    const tempId='n'+Date.now()

    // Determine absolute filepath — use workspace folder if available
    const workspaceFolder = (window as any).__forbiddenCwd
    const fsApi = (window as any).electronAPI?.fs
    const absolutePath = workspaceFolder ? `${workspaceFolder}/${label}` : null

    nodesRef.current=[...nodesRef.current,{
      id:tempId, label, filepath: absolutePath || label,
      type:isDocType||isMd?'doc':newNodeType, isMain:false, x, y,
      vx:0, vy:0, themeIdx:isDocType||isMd?11:newNodeColor, classId:null, code, modified:false,
    }]
    setShowCreateNode(false); setNewNodeName(''); forceRender({}); wakePhysicsRef.current()
    openNodeInEditor(tempId)
    addEvent('node-create', `Created ${label}`, {nodeId:tempId})

    // Write to disk so it appears in the file explorer
    if (absolutePath && fsApi) {
      await fsApi.writeFile(absolutePath, code)
      setExplorerRefreshKey(k => k + 1)
    }
  }
  const handleCreateGroup = () => {
    if (!groupName.trim()||groupSelected.length<2) return
    const gid='g'+Date.now()
    groupsRef.current=[...groupsRef.current,{id:gid,name:groupName.trim(),color:groupColor,nodeIds:[...groupSelected]}]
    nodesRef.current=nodesRef.current.map(n=>groupSelected.includes(n.id)?{...n,classId:gid}:n)
    setShowCreateGroup(false); setGroupName(''); setGroupSelected([]); forceRender({})
    if (wsHook.workspace) wsHook.createGroup(groupName.trim(),groupColor,[...groupSelected]).catch(()=>{})
  }

  // ── FILE DROP ──
  const handleDragEnter = (e:any) => {
    e.preventDefault()
    dragDepthRef.current++
    setDragOver(true)
  }
  const handleDragOver = (e:any) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  const handleDragLeave = (e:any) => {
    // Only hide the overlay when truly leaving the canvas (not entering a child element)
    dragDepthRef.current--
    if (dragDepthRef.current <= 0) { dragDepthRef.current = 0; setDragOver(false) }
  }

  const handleFileDrop = async (e:any) => {
    e.preventDefault()
    dragDepthRef.current = 0
    setDragOver(false)
    const files = [...e.dataTransfer.files]
    if (!files.length) return

    // ── Handle native OS folder drop (Electron) ──────────────
    // When a single folder is dropped from the OS file manager:
    const api = (window as any).electronAPI
    if (files.length === 1 && (files[0] as any).path) {
      const nativePath: string = (files[0] as any).path
      // Detect if it's a directory via the webkitRelativePath being empty and size 0
      const isNativeDir = files[0].type === '' && files[0].size === 0
      if (isNativeDir && api?.fs?.scanImports) {
        setExplorerRoot(nativePath)
        ;(window as any).__forbiddenCwd = nativePath
        setTermCwd(nativePath)
        setSidebarMode('files')
        setSidebarOpen(true)
        nodesRef.current = []
        edgesRef.current = []
        groupsRef.current = []
        setOpenTabs([])
        setActiveTabId(null)
        forceRender({})
        api.fs?.saveWorkspace?.(nativePath)
        addEvent('import', `Folder dropped: ${nativePath.split('/').pop()}`)
        await handleScanImports(nativePath)
        return
      }
    }

    const newNodes:any[] = []
    for (const file of files) {
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      const isText = /^(js|ts|jsx|tsx|mjs|cjs|py|md|txt|json|csv|html|htm|css|yaml|yml|sh|bash|xml|toml|rs|go|java|c|cpp|h|rb|php|lua|zig|kt|swift|cs|fs)$/.test(ext)
      const isImg  = /^(png|jpg|jpeg|gif|webp|svg|avif|bmp)$/.test(ext)

      if (isText) {
        let text = await file.text()

        // Format JSON nicely on drop
        if (ext === 'json') {
          try { text = JSON.stringify(JSON.parse(text), null, 2) } catch {}
        }

        // For YAML/TOML/CSV/HTML — wrap in a doc with info header so it renders usefully
        if (/^(yaml|yml)$/.test(ext)) {
          text = `<!-- YAML: ${file.name} -->\n\`\`\`yaml\n${text}\n\`\`\``
        }
        if (ext === 'csv') {
          const rows = text.trim().split('\n').slice(0, 20)
          const mdTable = rows[0]
            ? rows[0].split(',').join(' | ') + '\n' + rows[0].split(',').map(() => '---').join(' | ') + '\n' +
              rows.slice(1).map(r => r.split(',').join(' | ')).join('\n')
            : text
          text = `# ${file.name}\n\n${mdTable}`
        }

        const isMd   = /^(md|txt)$/.test(ext)
        const isPy   = ext === 'py'
        const isCode = /^(js|ts|jsx|tsx|mjs|cjs)$/.test(ext)
        const isDoc  = isMd || /^(json|yaml|yml|toml|csv|html|htm)$/.test(ext)

        const type = isMd ? 'doc'
          : isDoc ? 'doc'
          : isPy  ? 'function'
          : isCode ? _guessType(file.name, text)
          : 'function'

        const themeIdx = isPy ? 4 : isDoc ? 11 : _TYPE_THEME[type] ?? 1

        newNodes.push({
          id: 'f' + Date.now() + Math.random().toString(36).slice(2,5),
          label: file.name, filepath: file.name, type,
          isMain: /^(index|main)\.(j|t)sx?$/.test(file.name),
          x: (Math.random()-.5)*400, y: (Math.random()-.5)*300,
          vx:0, vy:0, themeIdx, classId:null, code:text, modified:false,
        })
      } else if (isImg) {
        const url  = URL.createObjectURL(file)
        const code = `# ${file.name}\n\n![${file.name}](${url})`
        newNodes.push({
          id: 'f' + Date.now() + Math.random().toString(36).slice(2,5),
          label: file.name, filepath: file.name, type:'doc',
          isMain: false, x:(Math.random()-.5)*400, y:(Math.random()-.5)*300,
          vx:0, vy:0, themeIdx:11, classId:null, code, modified:false,
        })
      }
    }

    if (newNodes.length) {
      nodesRef.current = [...nodesRef.current, ...newNodes]
      forceRender({})
      addEvent('import', `Dropped ${newNodes.length} file${newNodes.length>1?'s':''}: ${newNodes.map((n:any)=>n.label).join(', ')}`)
      // Open single file drop immediately; for .md auto-switch to preview
      if (newNodes.length === 1) {
        openNodeInEditor(newNodes[0].id)
        if (newNodes[0].type === 'doc') setMdPreviewMode('preview')
      }
    }
  }

  const trackRecentFile = useCallback((fileInfo: { path?: string; fullPath?: string; name?: string; rel?: string }) => {
    const fp = fileInfo.path || fileInfo.fullPath || ''
    if (!fp) return
    const entry = { path: fp, name: fileInfo.name || fp.split('/').pop() || fp, rel: fileInfo.rel || fp }
    setRecentFiles(prev => {
      const next = [entry, ...prev.filter(r => r.path !== fp)].slice(0, 20)
      localStorage.setItem('forbiden_recent_files', JSON.stringify(next))
      return next
    })
  }, [])

  // ── EXPLORER: open file from tree ─────────────────────────────
  const handleExplorerOpenFile = useCallback(async (node: any) => {
    const api = (window as any).electronAPI
    if (!api?.fs) return
    const ext = node.ext || node.name.split('.').pop() || ''
    const isText = /^(js|ts|jsx|tsx|mjs|cjs|py|md|txt|json|csv|html|htm|css|yaml|yml|sh|bash|c|cpp|h|hpp|go|rs|rb|java|kt|swift|cs|vue|svelte|toml|xml|env|gitignore)$/i.test(ext)
    if (!isText) { addEvent('system', `Cannot open binary: ${node.name}`); return }
    const res = await api.fs.readFile(node.path)
    if (!res.success) { addEvent('system', `Error reading ${node.name}: ${res.error}`); return }
    // Check if node already exists (by path)
    const existing = nodesRef.current.find(n => n.filepath === node.path || n.label === node.name)
    if (existing) { openNodeInEditor(existing.id); return }
    const lang = detectLang(node.name)
    const nodeType = lang === 'md' ? 'doc' : 'function'
    const newId = 'ex' + Date.now()
    nodesRef.current = [...nodesRef.current, {
      id: newId, label: node.name, filepath: node.path, type: nodeType,
      isMain: /^(index|main)\.(j|t)sx?|main\.py|main\.go$/.test(node.name),
      x: (Math.random() - .5) * 300, y: (Math.random() - .5) * 300,
      vx: 0, vy: 0, themeIdx: nodesRef.current.length % 16, classId: null,
      code: res.content, modified: false,
    }]
    forceRender({})
    openNodeInEditor(newId)
    trackRecentFile({ path: node.path, name: node.name, rel: node.path })
    addEvent('import', `Opened ${node.name}`)
  }, [openNodeInEditor, addEvent, trackRecentFile])

  // ── SCAN IMPORTS → GRAPH ──────────────────────────────────────
  const handleScanImports = useCallback(async (folderPath: string) => {
    const api = (window as any).electronAPI
    if (!api?.fs?.scanImports) { addEvent('system', 'Import scanner only available in Electron app'); return }
    addEvent('system', `Scanning imports in ${folderPath.split('/').pop()}…`)
    const res = await api.fs.scanImports(folderPath)
    if (!res.success) { addEvent('system', `Scan error: ${res.error}`); return }
    const { nodes: scanNodes, edges: scanEdges, fileCount } = res

    if (!scanNodes.length) { addEvent('system', 'No code files found'); return }

    // Map scanned nodes to graph nodes (skip if already exists)
    const existing = new Map(nodesRef.current.map(n => [n.filepath, n.id]))
    const idMap = new Map<string, string>()

    const newNodes: any[] = []
    scanNodes.forEach((sn: any, i: number) => {
      if (existing.has(sn.path)) { idMap.set(sn.id, existing.get(sn.path)!); return }
      const newId = 'scan' + Date.now() + i
      idMap.set(sn.id, newId)
      newNodes.push({
        id: newId, label: sn.label, filepath: sn.path, type: 'function',
        isMain: /^(index|main)\.(j|t)sx?|main\.py|main\.go$/.test(sn.label.split('/').pop() ?? ''),
        x: sn.x ?? (Math.random() - .5) * 600, y: sn.y ?? (Math.random() - .5) * 600,
        vx: 0, vy: 0, themeIdx: (i + nodesRef.current.length) % 16, classId: null,
        code: '', modified: false,
      })
    })

    const newEdges: any[] = []
    const edgeSet = new Set(edgesRef.current.map(e => `${e.source}>${e.target}`))
    scanEdges.forEach((se: any) => {
      const src = idMap.get(se.source), tgt = idMap.get(se.target)
      if (!src || !tgt) return
      const key = `${src}>${tgt}`
      if (!edgeSet.has(key)) { edgeSet.add(key); newEdges.push({ id: 'se' + Date.now() + Math.random(), source: src, target: tgt }) }
    })

    nodesRef.current = [...nodesRef.current, ...newNodes]
    edgesRef.current = [...edgesRef.current, ...newEdges]
    forceRender({}); wakePhysicsRef.current()
    addEvent('import', `Graph mapped: ${fileCount} files, ${newNodes.length} new nodes, ${newEdges.length} edges`)
  }, [addEvent])

  // ── BOARD ──
  const addCard = colId => {
    if (!newCardTitle.trim()) return
    const title=newCardTitle.trim()
    const newCard={id:'k'+Date.now(),colId,title,priority:'MED',tags:[],progress:0,due:'',assignee:avatarIndex}
    setBoard(b=>({...b,cards:[...b.cards,newCard]}))
    setNewCardCol(null); setNewCardTitle('')
    if (wsHook.workspace) wsHook.createCard(colId,title,{priority:'MED',assignee_idx:avatarIndex}).catch(()=>{})
  }
  const moveCard = (cardId,colId) => {
    setBoard(b=>({...b,cards:b.cards.map(c=>c.id===cardId?{...c,colId}:c)}))
    if (wsHook.workspace) wsHook.updateCard(cardId,{col_id:colId}).catch(()=>{})
  }
  const updateCard = (cardId,patch) => {
    setBoard(b=>({...b,cards:b.cards.map(c=>c.id===cardId?{...c,...patch}:c)}))
    if (wsHook.workspace) wsHook.updateCard(cardId,patch).catch(()=>{})
  }
  const deleteCard = cardId => {
    setBoard(b=>({...b,cards:b.cards.filter(c=>c.id!==cardId)}))
    setFocusCard(null)
    if (wsHook.workspace) wsHook.deleteCard(cardId).catch(()=>{})
  }

  // ── TIMELINE ──
  const handlePlayheadDown = e => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    playheadDragRef.current={isDragging:true,startX:e.clientX,startPos:playheadPos}
  }
  const handlePlayheadMove = e => {
    if (!playheadDragRef.current.isDragging) return
    const totalWidth=700, maxP=totalWidth-10
    const newPos=Math.max(0,Math.min(playheadDragRef.current.startPos+(e.clientX-playheadDragRef.current.startX),maxP))
    setPlayheadPos(newPos)
    const ver=newPos<100?'v1.0':newPos<220?'v1.1':newPos<350?'v1.2':newPos<480?'v1.3':'v1.4 (HEAD)'
    setActiveVersionName(ver)
    setActiveVersionIdx(newPos<100?0:newPos<220?1:newPos<350?2:newPos<480?3:4)
  }
  const handlePlayheadUp = e => {
    playheadDragRef.current.isDragging=false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // ── TERMINAL ──
  const handleTermInput = async e => {
    if (e.key !== 'Enter') return
    const cmd = termInput.trim(); if (!cmd) return
    setTermInput('')

    // Built-in terminal commands (always available)
    if (cmd === 'clear') { setTermLines([]); return }
    if (cmd === 'node list') {
      setTermLines(l => [...l,
        { c:'#9494b0', t:`$ ${cmd}` },
        { c:'#c0c8d8', t: nodesRef.current.map(n=>n.label).join('  ') || '(no nodes)' },
      ]); return
    }

    // Native shell (Electron)
    const api = (window as any).electronAPI
    if (api?.terminal?.exec) {
      setTermLines(l => [...l, { c:'#9494b0', t:`${termCwd} $ ${cmd}` }])

      // Handle cd locally — child_process can't persist CWD across calls
      const cdMatch = cmd.match(/^cd\s+(.*)$/)
      if (cdMatch) {
        const target = cdMatch[1].trim() || api.homeDir
        const newCwd = target === '~' ? api.homeDir
          : target.startsWith('/') ? target
          : `${termCwd}/${target}`
        // Verify with pwd
        const check = await api.terminal.exec(`cd ${JSON.stringify(newCwd)} && pwd`, termCwd)
        if (!check.stderr && check.stdout.trim()) {
          setTermCwd(check.stdout.trim())
          setTermLines(l => [...l, { c:'#28f1c3', t: check.stdout.trim() }])
        } else {
          setTermLines(l => [...l, { c:'#ff435a', t: check.stderr.trim() || `cd: no such directory: ${newCwd}` }])
        }
        return
      }

      const result = await api.terminal.exec(cmd, termCwd)
      const lines: any[] = []
      if (result.stdout.trim()) {
        result.stdout.trimEnd().split('\n').forEach((l: string) => lines.push({ c:'#c0c8d8', t: l }))
      }
      if (result.stderr.trim()) {
        result.stderr.trimEnd().split('\n').forEach((l: string) => lines.push({ c:'#ff435a', t: l }))
      }
      if (!lines.length) lines.push({ c:'#607080', t:'(no output)' })
      setTermLines(l => [...l, ...lines])
      return
    }

    // Browser fallback — simulated
    const resp: any[] = [{ c:'#9494b0', t:`$ ${cmd}` }]
    if (cmd === 'help')       resp.push({ c:'#28f1c3', t:'Install as Electron app for a real native terminal.' })
    else if (cmd === 'ls')    resp.push({ c:'#c0c8d8', t: nodesRef.current.map(n=>n.label).join('  ') })
    else if (cmd === 'edges') resp.push({ c:'#c0c8d8', t: edgesRef.current.map(e=>`${e.source}→${e.target}`).join('  ') || 'No edges.' })
    else if (cmd === 'git status') resp.push({ c: modifiedNodes.length ? '#ffc410' : '#10b981', t: modifiedNodes.length ? `${modifiedNodes.length} modified` : 'Working tree clean.' })
    else resp.push({ c:'#ff435a', t:`command not found: ${cmd}` })
    setTermLines(l => [...l, ...resp])
  }

  // ── JS RUNTIME ──
  const handleRunNode = async (nodeId) => {
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (!node) return
    const lang = detectLang(node.label || '')
    if (lang === 'md' || lang === 'unknown') return
    setNodeRunState(s => ({...s, [nodeId]: {status:'running', ms:0}}))
    addEvent('run-ok', `▶ ${node.label}`, {nodeId})

    // Prefer running in the real terminal — output appears there naturally
    if (activePtyId) {
      setBottomTab('terminal')
      setBottomOpen(true)
      const t0 = Date.now()
      const res = await runInTerminal(activePtyId, lang, node.code || '', explorerRoot || termCwd)
      const ms = Date.now() - t0
      setNodeRunState(s => ({...s, [nodeId]: {status: res.success ? 'ok' : 'error', ms}}))
      if (!res.success) {
        setBottomTab('console')
        setJsLogs(l => [...l,
          {type:'header', val:`▶  ${node.label}`, ts:Date.now(), nodeId},
          {type:'error',  val: res.error || 'Run failed', ts:Date.now(), nodeId},
        ])
      }
      return
    }

    // Fallback: capture mode → show in console panel
    setBottomTab('console')
    setBottomOpen(true)
    setJsLogs(l => {
      const header = [{type:'header', val:`▶  ${node.label}`, ts:Date.now(), nodeId}]
      if (isCompiled(lang)) header.push({type:'info', val:`⌛ Compiling…`, ts:Date.now()})
      return [...l, ...header]
    })
    const result = await runByLang(lang, node.code || '', compileStdin)
    setNodeRunState(s => ({...s, [nodeId]: {status: result.error?'error':'ok', ms: result.ms}}))
    addEvent(result.error?'run-err':'run-ok', `${result.error?'✗':'✓'} ${node.label} (${result.ms}ms)`, {nodeId})
    setJsLogs(l => [
      ...l,
      ...result.logs.map(e => ({...e, nodeId})),
      {type: result.error?'error-footer':'footer', val: result.error ? `✗ Error · ${result.ms}ms` : `✓ Done · ${result.ms}ms`, ts:Date.now(), nodeId}
    ])
  }

  const handleRunRepl = async (code) => {
    if (!code.trim()) return
    setReplHistory(h => [code, ...h.slice(0,49)])
    setReplHistIdx(-1)
    setReplInput('')
    setJsLogs(l => [...l, {type:'repl-in', val:`> ${code}`, ts:Date.now()}])
    const result = await runByLang('js', code)
    setJsLogs(l => [...l, ...result.logs])
  }

  const handleReplKey = e => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleRunRepl(replInput) }
    if (e.key==='ArrowUp') {
      e.preventDefault()
      const idx = Math.min(replHistIdx+1, replHistory.length-1)
      setReplHistIdx(idx)
      if (replHistory[idx] !== undefined) setReplInput(replHistory[idx])
    }
    if (e.key==='ArrowDown') {
      e.preventDefault()
      const idx = Math.max(replHistIdx-1, -1)
      setReplHistIdx(idx)
      setReplInput(idx === -1 ? '' : replHistory[idx] || '')
    }
  }

  // ── CMD PALETTE ──
  const [cmdPreviewPalette, setCmdPreviewPalette] = useState(null)

  // ── PHASE 2 STATE ──
  const [showFileFinder, setShowFileFinder] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  const [showJumpLine, setShowJumpLine] = useState(false)
  const [jumpLineTarget, setJumpLineTarget] = useState<number|null>(null)
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const [projectSearchResults, setProjectSearchResults] = useState<any[]>([])
  const [projectSearchLoading, setProjectSearchLoading] = useState(false)
  const projectSearchDebounce = useRef<any>(null)
  const [splitTabId, setSplitTabId] = useState<string|null>(null)
  const [splitMode, setSplitMode] = useState<'vertical'|'horizontal'>('vertical')
  const [editorCursorPos, setEditorCursorPos] = useState<{line:number,col:number}|null>(null)
  const [replaceQuery, setReplaceQuery] = useState('')
  const [replaceLoading, setReplaceLoading] = useState(false)
  const [recentFiles, setRecentFiles] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('forbiden_recent_files') || '[]') } catch { return [] }
  })

  // ── PHASE 4: AI PROVIDER STATE ──
  const [aiProvider, setAiProvider] = useState<string>(() => localStorage.getItem('forbiden_ai_provider') || 'anthropic')
  const [aiKeys, setAiKeys] = useState<Record<string,string>>(() => {
    try { return JSON.parse(localStorage.getItem('forbiden_ai_keys') || '{}') } catch { return {} }
  })
  const [aiModels, setAiModels] = useState<Record<string,string>>(() => {
    try { return JSON.parse(localStorage.getItem('forbiden_ai_models') || '{}') } catch { return {} }
  })
  const [ollamaModels, setOllamaModels] = useState<string[]>([])

  const saveAiProvider = (p: string) => { setAiProvider(p); localStorage.setItem('forbiden_ai_provider', p) }
  const saveAiKey = (provider: string, key: string) => {
    const next = { ...aiKeys, [provider]: key }
    setAiKeys(next); localStorage.setItem('forbiden_ai_keys', JSON.stringify(next))
  }
  const saveAiModel = (provider: string, model: string) => {
    const next = { ...aiModels, [provider]: model }
    setAiModels(next); localStorage.setItem('forbiden_ai_models', JSON.stringify(next))
  }
  const saveFormatOnSave = (v: boolean) => { setFormatOnSave(v); localStorage.setItem('forbiden_format_on_save', String(v)) }

  const fetchOllamaModels = async () => {
    const api = (window as any).electronAPI
    const host = aiKeys['ollama'] || 'http://localhost:11434'
    const res = await api?.ai?.ollamaModels?.(host)
    if (res?.models?.length) setOllamaModels(res.models)
  }

  // Project-wide Replace All
  const handleReplaceAll = async () => {
    if (!projectSearchQuery.trim() || !replaceQuery || !explorerRoot) return
    const api = (window as any).electronAPI
    if (!api?.fs) return
    setReplaceLoading(true)
    try {
      const byPath: Record<string, string> = {}
      projectSearchResults.forEach(r => { byPath[r.fullPath] = r.fullPath })
      let totalReplaced = 0
      for (const fullPath of Object.values(byPath)) {
        const readRes = await api.fs.readFile(fullPath)
        if (!readRes?.content) continue
        const query = projectSearchQuery.trim()
        const count = readRes.content.split(query).length - 1
        if (count > 0) {
          await api.fs.writeFile(fullPath, readRes.content.split(query).join(replaceQuery))
          totalReplaced += count
          // Update open tabs that match this file
          const openNode = nodesRef.current.find(n => n.filepath === fullPath)
          if (openNode) {
            openNode.code = readRes.content.split(query).join(replaceQuery)
            openNode.modified = true
          }
        }
      }
      addEvent('info', `Replaced ${totalReplaced} occurrence${totalReplaced !== 1 ? 's' : ''} of "${query}" → "${replaceQuery}"`)
      setProjectSearchQuery(q => q + ' ')
      setTimeout(() => setProjectSearchQuery(q => q.trim()), 50)
    } catch(e: any) {
      addEvent('error', `Replace failed: ${e?.message || e}`)
    }
    setReplaceLoading(false)
  }

  // Project-wide search debounced effect
  useEffect(() => {
    clearTimeout(projectSearchDebounce.current)
    if (!projectSearchQuery.trim() || !explorerRoot) { setProjectSearchResults([]); return }
    setProjectSearchLoading(true)
    projectSearchDebounce.current = setTimeout(async () => {
      try {
        const api = (window as any).electronAPI
        const results = await api?.fs?.searchInFiles?.(explorerRoot, projectSearchQuery.trim(), 300) || []
        setProjectSearchResults(results)
      } catch { setProjectSearchResults([]) }
      setProjectSearchLoading(false)
    }, 350)
    return () => clearTimeout(projectSearchDebounce.current)
  }, [projectSearchQuery, explorerRoot])

  // Open a workspace file in the editor
  const handleOpenWorkspaceFile = useCallback(async (fileInfo: any) => {
    const api = (window as any).electronAPI
    if (!api?.fs?.readFile) return
    try {
      const res = await api.fs.readFile(fileInfo.path || fileInfo.fullPath)
      if (res?.content === undefined) return
      const existing = nodesRef.current.find(n => n.filepath === (fileInfo.path || fileInfo.fullPath))
      trackRecentFile(fileInfo)
      if (existing) { openNodeInEditor(existing.id); return }
      const tempId = 'ws_' + Date.now()
      nodesRef.current = [...nodesRef.current, {
        id: tempId, label: fileInfo.name || fileInfo.rel?.split('/').pop() || 'file',
        filepath: fileInfo.path || fileInfo.fullPath, type: 'function',
        isMain: false, x: 0, y: 0, vx: 0, vy: 0, themeIdx: 0,
        classId: null, modified: false, code: res.content,
      }]
      forceRender({})
      openNodeInEditor(tempId)
    } catch {}
  }, [explorerRoot, trackRecentFile])

  const handleCmdAction = action => {
    if (!action) return
    // New action-based dispatch
    if (action === 'new-node') { setShowCreateNode(true) }
    else if (action === 'new-group') { setShowCreateGroup(true); setGroupSelected([]) }
    else if (action === 'run') { if (activeTabId) handleRunNode(activeTabId) }
    else if (action === 'terminal') { setBottomTab('terminal'); setBottomOpen(true) }
    else if (action === 'board') { setSidebarMode('board'); setSidebarOpen(true) }
    else if (action === 'timeline') { setBottomTab('timeline'); setBottomOpen(true) }
    else if (action === 'git') { setSidebarMode('git'); setSidebarOpen(true) }
    else if (action === 'sidebar') { setSidebarOpen(v => !v) }
    else if (action === 'edge-add') { setEdgeMode(m => m === 'join' ? null : 'join') }
    else if (action === 'edge-cut') { setEdgeMode(m => m === 'cut' ? null : 'cut') }
    else if (action === 'zoom-in') { setTransform(p => ({...p, scale: Math.min(3.0, p.scale * 1.25)})) }
    else if (action === 'zoom-out') { setTransform(p => ({...p, scale: Math.max(0.3, p.scale * 0.8)})) }
    else if (action === 'zoom-reset') { setTransform(p => ({...p, scale: 1})) }
    else if (action === 'open-folder') { handleOpenFolderForExplorer() }
    else if (action === 'save') { if (activeTabId) saveNodeToDisk(activeTabId) }
    else if (action === 'zen') { setZenMode(v => !v) }
    else if (action === 'file-finder') { setShowFileFinder(true) }
    else if (action === 'jump-line') { setShowJumpLine(true) }
    else if (action === 'project-search') { setSidebarMode('project-search'); setSidebarOpen(true) }
    else if (action === 'outline') { setSidebarMode('outline'); setSidebarOpen(true) }
    else if (action === 'ai') { setSidebarMode('ai'); setSidebarOpen(true) }
    else if (action === 'split-vertical') { if (activeTabId) { setSplitTabId(activeTabId); setSplitMode('vertical') } }
    else if (action === 'split-horizontal') { if (activeTabId) { setSplitTabId(activeTabId); setSplitMode('horizontal') } }
    else if (action === 'split-close') { setSplitTabId(null) }
    else if (action?.startsWith('theme:')) {
      const p = PALETTES.find(p => p.id === action.replace('theme:', ''))
      if (p) setGlobalEditorPalette(p)
    }
    // Legacy label fallbacks
    else if (action.includes('New file node')) { setShowCreateNode(true) }
    else if (action.includes('New doc node')) {
      const tempId='n'+Date.now()
      const x=(Math.random()-.5)*300, y=(Math.random()-.5)*300
      nodesRef.current=[...nodesRef.current,{id:tempId,label:'notes.md',filepath:'notes.md',type:'doc',isMain:false,x,y,vx:0,vy:0,themeIdx:11,classId:null,code:'# Notes\n\n',modified:false}]
      forceRender({}); openNodeInEditor(tempId)
    }
    setShowCmd(false)
  }

  // ── ICON BAR ──
  const gitChangeCount = (gitStatus as any)?.files?.length ?? 0
  const sideIconDefs = [
    { key:'files',          icon:<I.Files/>,  tip:'Files (Ctrl+Shift+E)' },
    { key:'git',            icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>, tip:'Source Control (Ctrl+Shift+G)', badge:gitChangeCount },
    { key:'project-search', icon:<I.Search/>, tip:'Search in files (Ctrl+Shift+F)', badge:0 },
    { key:'outline',        icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>, tip:'Outline (Ctrl+Shift+O)' },
    { key:'ai',             icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, tip:'AI Assistant' },
    { key:'note',           icon:<I.Note/>,  tip:'Notes' },
  ]

  // ── CHAPTER SPLASH DATA ──
  const splashImgSrc = activeTabNode ? getMangaImgSrc(activeTabNode) : null
  const chapterNum = openTabs.indexOf(activeTabId) + 1

  // ── RENDER ──
  return (
    <div className={`ide-v2-root ${brutal?'theme-brutal':'theme-cyber'}${zenMode?' ide-zen-mode':''}`}
      style={{'--ide-font-scale':globalFontScale} as any}
    >

      {/* ── ZEN MODE EDITOR OVERLAY ── */}
      {zenMode && activeTabNode && (
        <div style={{position:'fixed',inset:0,zIndex:90000,background:'#06060d',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 16px',flexShrink:0,borderBottom:'1px solid rgba(255,42,56,.1)'}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:'rgba(200,200,220,.5)',letterSpacing:'.04em'}}>{activeTabNode.label}</span>
            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
              {canRun && (
                <button onClick={()=>handleRunNode(activeTabId)} style={{background:'rgba(255,42,56,.1)',border:'1px solid rgba(255,42,56,.35)',color:'#ff2a38',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',padding:'3px 12px',cursor:'pointer',letterSpacing:'.1em',fontWeight:700}}>▶ RUN</button>
              )}
              <button onClick={()=>setZenMode(false)} style={{background:'transparent',border:'1px solid rgba(255,255,255,.1)',color:'rgba(200,200,220,.35)',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',padding:'2px 8px',cursor:'pointer',letterSpacing:'.06em'}}>ESC · EXIT ZEN</button>
            </div>
          </div>
          <div style={{flex:1,minHeight:0,overflow:'hidden',display:'flex',justifyContent:'center'}}>
            <div style={{width:'min(800px,100%)',display:'flex',flexDirection:'column',minHeight:0}}>
              <CodeMirrorEditor key={activeTabId+'_zen'} node={activeTabNode} onChange={code=>updateNodeCode(activeTabId,code)} onSave={()=>saveNodeToDisk(activeTabId)} externalPalette={globalEditorPalette} jumpToLine={jumpLineTarget??undefined} onCursorChange={(line,col)=>setEditorCursorPos({line,col})} aiProvider={aiProvider} aiKey={aiProvider==='ollama'?(aiKeys['ollama']||'http://localhost:11434'):aiKeys[aiProvider]||''} aiModel={aiModels[aiProvider]||DEFAULT_MODELS[aiProvider]||''}/>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ TITLE BAR (custom window controls, drag region) ═══════ */}
      <TitleBar brutal={brutal} activeFile={activeTabNode?.label}/>

      {/* ═══════ TOPBAR ═══════ */}
      <div className="ide-topbar">
        <span className="ide-logo">FOR<span className="ide-logo-accent">BID</span>EN<span style={{color:'#ff2a38',animation:'fblink 1.1s infinite',fontSize:'1.1rem'}}>_</span></span>
        <div className="ide-topbar-sep"/>

        {/* Active file breadcrumb + language badge */}
        <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:6,overflow:'hidden'}}>
          {activeTabNode ? (<>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px',fontWeight:500,color:brutal?'#0f0f0f':'#c0c8d8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220,opacity:.9}}>
              {activeTabNode.label}
            </div>
            {activeLang!=='unknown' && (
              <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.14em',padding:'1px 6px',background:isCompiled(activeLang)?'rgba(255,100,80,.15)':'rgba(16,185,129,.12)',color:isCompiled(activeLang)?'#ff8060':'#10b981',border:`1px solid ${isCompiled(activeLang)?'rgba(255,100,80,.3)':'rgba(16,185,129,.25)'}`,flexShrink:0}}>
                {activeLang.toUpperCase()}
              </div>
            )}
            {activeTabNode.modified && (
              <div style={{width:5,height:5,borderRadius:'50%',background:'#f2c12e',flexShrink:0}}/>
            )}
          </>) : (
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',opacity:.25,letterSpacing:'.05em'}}>no file open</div>
          )}
        </div>

        {/* Unsaved count */}
        {modifiedNodes.length>0 && (
          <div style={{background:'#f2c12e22',color:'#f2c12e',border:'1px solid #f2c12e44',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.12em',padding:'2px 6px',flexShrink:0}}>
            {modifiedNodes.length}●
          </div>
        )}

        <div className="ide-topbar-sep"/>

        {/* ▶ RUN — primary action, only when a runnable file is open */}
        {canRun && (
          <button
            className="ide-topbar-btn"
            onClick={()=>handleRunNode(activeTabId)}
            style={{
              background: isCompiled(activeLang) ? 'rgba(255,100,80,.18)' : 'rgba(16,185,129,.18)',
              color:       isCompiled(activeLang) ? '#ff8060' : '#10b981',
              border:      `1px solid ${isCompiled(activeLang)?'rgba(255,100,80,.4)':'rgba(16,185,129,.4)'}`,
              fontWeight: 700, letterSpacing: '.1em',
            }}
          >
            ▶ RUN
          </button>
        )}

        <button className="ide-topbar-btn primary" onClick={()=>setShowCreateNode(true)}>+ NODE</button>
        <button className="ide-topbar-btn" onClick={handleOpenFolderForExplorer} title="Open folder in Explorer">📂 OPEN</button>
        <button className="ide-topbar-btn" onClick={()=>folderInputRef.current?.click()} title="Import files as graph nodes">⬆ IMPORT</button>
        <input ref={folderInputRef} type="file" multiple {...{'webkitdirectory':''}} style={{display:'none'}} onChange={handleFolderUpload}/>
        <button className="ide-topbar-btn" onClick={()=>setShowFileFinder(true)} title="Quick Open file (Ctrl+P)">⌕ FILES</button>
        <button className="ide-topbar-btn" onClick={()=>setShowCmd(true)} title="Command palette (Ctrl+Shift+P)">⌘</button>
        <button className="ide-topbar-btn" onClick={()=>setZenMode(v=>!v)} title="Zen mode (Ctrl+Shift+Z)" style={zenMode?{color:'#10b981',borderColor:'rgba(16,185,129,.4)'}:{}}>ZEN</button>
        <button className="ide-topbar-btn" onClick={()=>setShowShortcuts(v=>!v)} title="Keyboard shortcuts (Ctrl+?)"
          style={showShortcuts?{color:'#ffc410',borderColor:'rgba(255,196,16,.4)'}:{}}>?</button>

        {/* Avatar → settings */}
        <div onClick={()=>{setSidebarMode('settings');setSidebarOpen(o=>sidebarMode==='settings'?!o:true)}}
          style={{cursor:'pointer',width:'30px',height:'30px',border:`2px solid ${sidebarMode==='settings'&&sidebarOpen?'#ff2a38':'rgba(255,255,255,.12)'}`,overflow:'hidden',flexShrink:0,transition:'border-color .15s'}}>
          <img src={`${import.meta.env.BASE_URL}avatars/0xAV0${String((avatarIndex%6)+1).padStart(2,'0')}s.jpeg`} alt="op" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
        </div>
      </div>

      {/* ═══════ WORKSPACE ═══════ */}
      <div className="ide-workspace" style={{flexDirection:'column'}}>
      <div className="ide-main-row">

        {/* ── ICON BAR (now toggles floating panels) ── */}
        <div className="ide-icon-bar">
          {sideIconDefs.map(def=>(
            <div key={def.key} title={def.tip}
              className={`ide-icon-btn ${sidebarMode===def.key&&sidebarOpen?'active':''}`}
              onClick={()=>{
                if (def.key==='files' && !explorerRoot) {
                  handleOpenFolderForExplorer()
                } else if (sidebarMode===def.key) {
                  setSidebarOpen(o=>!o)
                } else {
                  setSidebarMode(def.key); setSidebarOpen(true)
                }
              }}>
              {def.icon}
              {def.badge>0 && <div className="ide-icon-badge">{def.badge}</div>}
            </div>
          ))}
          <div style={{flex:1}}/>
          {/* Console — opens run output */}
          <div title="Console (run output)" className={`ide-icon-btn ${bottomOpen&&bottomTab==='console'?'active':''}`}
            onClick={()=>{ if(bottomOpen&&bottomTab==='console'){setBottomOpen(false)}else{setBottomTab('console');setBottomOpen(true)} }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="3,5 7,8 3,11"/><line x1="9" y1="11" x2="13" y2="11"/></svg>
          </div>
          {/* Notebook */}
          <div title="Notebook" className={`ide-icon-btn ${bottomOpen&&bottomTab==='notebook'?'active':''}`}
            onClick={()=>{ if(bottomOpen&&bottomTab==='notebook'){setBottomOpen(false)}else{setBottomTab('notebook');setBottomOpen(true)} }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </div>
          {/* Editor pane toggle */}
          <div title="Toggle editor" className={`ide-icon-btn ${editorOpen?'active':''}`} onClick={()=>setEditorOpen(o=>!o)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>
          </div>
          {/* Settings */}
          <div title="Settings" className={`ide-icon-btn ${sidebarMode==='settings'&&sidebarOpen?'active':''}`}
            onClick={()=>{setSidebarMode('settings');setSidebarOpen(o=>sidebarMode==='settings'?!o:true)}}>
            <I.Settings/>
          </div>
        </div>


        {/* ── SIDEBAR PANE (fixed, collapsible) ── */}
        {sidebarOpen && (<>
          <div className="ide-sidebar-pane" style={{width:sidebarW}}>
            <div className="ide-sidebar-header">
              <span className="ide-sidebar-title">
                {({'files':'EXPLORER','git':'SOURCE CONTROL','search':'SEARCH','note':'NOTES','settings':'SETTINGS','project-search':'SEARCH FILES','outline':'OUTLINE','ai':'AI ASSISTANT'} as any)[sidebarMode]||'EXPLORER'}
              </span>
              <div style={{marginLeft:'auto',display:'flex',gap:4,alignItems:'center'}}>
                {sidebarMode==='files'&&<button className="ide-btn ide-btn-sm" onClick={()=>setShowCreateNode(true)} title="New graph node">+N</button>}
                <button className="ide-sidebar-close" onClick={()=>setSidebarOpen(false)}>✕</button>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',overflowX:'hidden',display:'flex',flexDirection:'column'}}>
              {sidebarMode==='search' && (
                <div style={{padding:'6px 8px',flexShrink:0}}>
                  <input className="ide-toc-search" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search nodes…" autoFocus style={{width:'100%'}}/>
                </div>
              )}

              {/* ── FILE EXPLORER (VS Code-style) ── */}
              {sidebarMode==='files' && (
                <FileExplorer
                  rootPath={explorerRoot}
                  refreshKey={explorerRefreshKey}
                  brutal={brutal}
                  onOpenFile={handleExplorerOpenFile}
                  onOpenFolder={handleOpenFolderForExplorer}
                  onScanImports={handleScanImports}
                  onTerminalCd={(cwd)=>{
                    setTermCwd(cwd)
                    setBottomTab('terminal')
                    setBottomOpen(true)
                    setTermLines(l=>[...l,{c:'#28f1c3',t:`[cd] ${cwd}`}])
                  }}
                />
              )}

              {/* ── SOURCE CONTROL (git) ── */}
              {sidebarMode==='git' && (
                <GitPanelV2
                  cwd={explorerRoot || (window as any).__forbiddenCwd || termCwd}
                  brutal={brutal}
                  onOpenFile={handleExplorerOpenFile}
                  aiProvider={aiProvider}
                  aiKeys={aiKeys}
                  aiModels={aiModels}
                  onOpenAiSettings={()=>{ setSidebarMode('settings'); setSidebarOpen(true) }}
                />
              )}

              {/* ── GRAPH NODES LIST (search mode) ── */}
              {sidebarMode==='search' && (<>
                <div className="ide-toc-sec">{`${filteredNodes.length} RESULTS`}</div>
                {filteredNodes.map(node=>{
                  const grp=groupsRef.current.find(g=>g.nodeIds.includes(node.id))
                  const accent=grp?grp.color:ACCENTS[node.themeIdx%ACCENTS.length]
                  const ctx=searchQuery.trim()&&node.code?node.code.split('\n').find(l=>l.toLowerCase().includes(searchQuery.toLowerCase()))||'':''
                  return (
                    <div key={node.id} className={`ide-toc-item ${activeTabId===node.id?'active':''}`} onClick={()=>openNodeInEditor(node.id)}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:accent,flexShrink:0,marginTop:2}}/>
                      <div className="ide-toc-info">
                        <div className="ide-toc-name">{node.label}{node.modified&&<span className="modified-dot"/>}</div>
                        {ctx&&<div style={{fontSize:'11px',opacity:.4,fontFamily:"'JetBrains Mono',monospace",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ctx.trim()}</div>}
                        <div className="ide-toc-type" style={{color:accent}}>{node.type}</div>
                      </div>
                    </div>
                  )
                })}
                {searchQuery.trim()&&!filteredNodes.length&&(
                  <div style={{padding:'20px 10px',opacity:.3,textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'11px'}}>NO RESULTS</div>
                )}
              </>)}
              {sidebarMode==='note' && (
                <textarea style={{background:'transparent',border:'none',outline:'none',resize:'none',padding:'12px',fontFamily:"'Share Tech Mono',monospace",fontSize:'12px',lineHeight:1.7,color:brutal?'#0f0f0f':'#c0c8d8',width:'100%',height:'100%',minHeight:300}} placeholder="// scratch notes…"/>
              )}

              {/* ── PROJECT-WIDE SEARCH ── */}
              {sidebarMode==='project-search' && (
                <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
                  <div style={{padding:'6px 8px',flexShrink:0,display:'flex',flexDirection:'column',gap:4}}>
                    {/* Search input */}
                    <div style={{position:'relative'}}>
                      <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:'11px',opacity:.4,pointerEvents:'none'}}>⌕</span>
                      <input
                        value={projectSearchQuery}
                        onChange={e=>setProjectSearchQuery(e.target.value)}
                        placeholder="Search in all files…"
                        autoFocus
                        style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',outline:'none',color:'#c0c8d8',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',padding:'5px 8px 5px 26px'}}
                        onFocus={e=>(e.target.style.borderColor='rgba(255,42,56,.4)')}
                        onBlur={e=>(e.target.style.borderColor='rgba(255,255,255,.08)')}
                      />
                      {projectSearchQuery&&<button onClick={()=>setProjectSearchQuery('')} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',cursor:'pointer',color:'rgba(200,200,220,.3)',fontSize:'13px'}}>×</button>}
                    </div>
                    {/* Replace input */}
                    <div style={{display:'flex',gap:4}}>
                      <div style={{flex:1,position:'relative'}}>
                        <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:'11px',opacity:.3,pointerEvents:'none'}}>↺</span>
                        <input
                          value={replaceQuery}
                          onChange={e=>setReplaceQuery(e.target.value)}
                          placeholder="Replace with…"
                          style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',outline:'none',color:'#c0c8d8',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',padding:'5px 8px 5px 26px'}}
                          onFocus={e=>(e.target.style.borderColor='rgba(226,192,141,.35)')}
                          onBlur={e=>(e.target.style.borderColor='rgba(255,255,255,.07)')}
                        />
                      </div>
                      <button
                        onClick={handleReplaceAll}
                        disabled={replaceLoading||!projectSearchQuery.trim()||projectSearchResults.length===0}
                        title={`Replace all ${projectSearchResults.length} matches`}
                        style={{flexShrink:0,padding:'3px 8px',background:replaceLoading?'transparent':'rgba(226,192,141,.1)',border:'1px solid rgba(226,192,141,.25)',color:replaceLoading||projectSearchResults.length===0?'rgba(200,200,220,.25)':'#e2c08d',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.08em',cursor:replaceLoading||projectSearchResults.length===0?'default':'pointer',whiteSpace:'nowrap',transition:'all .1s'}}
                        onMouseEnter={e=>{ if(!replaceLoading&&projectSearchResults.length>0) (e.currentTarget as HTMLElement).style.background='rgba(226,192,141,.2)' }}
                        onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=replaceLoading?'transparent':'rgba(226,192,141,.1)' }}
                      >
                        {replaceLoading?'…':'↺ ALL'}
                      </button>
                    </div>
                  </div>
                  {projectSearchLoading && <div style={{padding:'8px 10px',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'#ffc410',opacity:.7,flexShrink:0}}>SEARCHING…</div>}
                  {!projectSearchLoading && projectSearchQuery && <div className="ide-toc-sec" style={{flexShrink:0}}>{projectSearchResults.length} MATCHES{explorerRoot?'':" · no folder open"}</div>}
                  <div style={{flex:1,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent'}}>
                    {(() => {
                      const grouped: Record<string, any[]> = {}
                      projectSearchResults.forEach(r => { ;(grouped[r.file] ??= []).push(r) })
                      return Object.entries(grouped).map(([file, hits]) => (
                        <div key={file}>
                          <div style={{padding:'4px 8px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.1em',color:'rgba(200,200,220,.4)',background:'rgba(0,0,0,.2)',borderBottom:'1px solid rgba(255,255,255,.04)',display:'flex',gap:6,alignItems:'center'}}>
                            <span style={{color:getFileColor(file.split('/').pop()||''),fontSize:'10px'}}>{getFileIcon(file.split('/').pop()||'')}</span>
                            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{file}</span>
                            <span style={{opacity:.4,flexShrink:0}}>{hits.length}</span>
                          </div>
                          {hits.map((r, i) => (
                            <div key={i} onClick={async()=>{
                              await handleOpenWorkspaceFile({path:r.fullPath,name:file.split('/').pop(),rel:file})
                              setTimeout(()=>setJumpLineTarget(r.line),200)
                            }}
                              style={{padding:'3px 12px 3px 18px',cursor:'pointer',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',color:'rgba(200,200,220,.7)',display:'flex',gap:6,alignItems:'center'}}
                              onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.05)')}
                              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                              <span style={{color:'rgba(200,200,220,.3)',flexShrink:0,minWidth:28,textAlign:'right'}}>{r.line}</span>
                              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{r.text}</span>
                            </div>
                          ))}
                        </div>
                      ))
                    })()}
                    {!projectSearchLoading && projectSearchQuery && projectSearchResults.length===0 && (
                      <div style={{padding:'20px 10px',opacity:.3,textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'11px'}}>
                        {explorerRoot ? 'NO MATCHES' : 'OPEN A FOLDER FIRST'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── FILE OUTLINE ── */}
              {sidebarMode==='outline' && (() => {
                const code = activeTabNode?.code || ''
                const label = activeTabNode?.label || ''
                const ext = (label.split('.').pop()||'').toLowerCase()
                const symbols: {name:string,line:number,type:string}[] = []
                const lines = code.split('\n')
                const FUNC_RE = /^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/
                const CLASS_RE = /^(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][\w$]*)/
                const CONST_FN_RE = /^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\(|function)/
                const PY_DEF_RE = /^(?:\s*)def\s+([a-zA-Z_][\w]*)/
                const PY_CLS_RE = /^class\s+([a-zA-Z_][\w]*)/
                const GO_FUNC_RE = /^func\s+(?:\([^)]*\)\s+)?([a-zA-Z_][\w]*)/
                lines.forEach((l, i) => {
                  if (['js','ts','jsx','tsx'].includes(ext)) {
                    let m = FUNC_RE.exec(l)||CLASS_RE.exec(l)||CONST_FN_RE.exec(l)
                    if (m) symbols.push({name:m[1],line:i+1,type:l.includes('class')?'class':'function'})
                  } else if (ext==='py') {
                    let m = PY_DEF_RE.exec(l)||PY_CLS_RE.exec(l)
                    if (m) symbols.push({name:m[1],line:i+1,type:l.trim().startsWith('class')?'class':'function'})
                  } else if (ext==='go') {
                    let m = GO_FUNC_RE.exec(l)
                    if (m) symbols.push({name:m[1],line:i+1,type:'function'})
                  }
                })
                return (
                  <div style={{flex:1,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent'}}>
                    {!activeTabNode && <div style={{padding:'20px 10px',opacity:.25,textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'11px'}}>OPEN A FILE TO SEE ITS OUTLINE</div>}
                    {activeTabNode && symbols.length===0 && <div style={{padding:'20px 10px',opacity:.25,textAlign:'center',fontFamily:"'Share Tech Mono',monospace",fontSize:'11px'}}>NO SYMBOLS FOUND</div>}
                    {symbols.map((s,i)=>(
                      <div key={i} onClick={()=>setJumpLineTarget(s.line)}
                        style={{padding:'5px 10px 5px 14px',cursor:'pointer',display:'flex',gap:8,alignItems:'center',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px'}}
                        onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.05)')}
                        onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <span style={{fontSize:'10px',color:s.type==='class'?'#4285f4':'#10b981',flexShrink:0}}>{s.type==='class'?'◇':'ƒ'}</span>
                        <span style={{color:'#c0c8d8',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</span>
                        <span style={{color:'rgba(200,200,220,.3)',fontSize:'10px',flexShrink:0}}>{s.line}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {/* ── AI CHAT ── */}
              {sidebarMode==='ai' && (
                <AiChatPanel
                  activeNode={activeTabNode} explorerRoot={explorerRoot} brutal={brutal}
                  aiProvider={aiProvider} aiKeys={aiKeys} aiModels={aiModels}
                  onOpenSettings={()=>{ setSidebarMode('settings'); setSidebarOpen(true) }}
                />
              )}

              {sidebarMode==='settings' && (
                <div style={{overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent',flex:1}}>
                  <div style={{padding:'8px'}}>
                    <div className="ide-toc-sec">THEME</div>
                    <div style={{padding:'0 8px 10px'}}>
                      <button className="ide-btn ide-btn-sm" onClick={()=>setThemeMode(t=>t==='cyber'?'brutal':'cyber')}>
                        {brutal?'→ CYBER':'→ BRUTAL'}
                      </button>
                    </div>
                    <div className="ide-toc-sec">FONT SCALE</div>
                    <div style={{padding:'4px 8px 10px',display:'flex',alignItems:'center',gap:8}}>
                      <button className="ide-btn ide-btn-sm" onClick={()=>setGlobalFontScale(s=>Math.max(.7,+(s-.05).toFixed(2)))}>A−</button>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',opacity:.6,minWidth:32,textAlign:'center'}}>{Math.round(globalFontScale*100)}%</span>
                      <button className="ide-btn ide-btn-sm" onClick={()=>setGlobalFontScale(s=>Math.min(1.5,+(s+.05).toFixed(2)))}>A+</button>
                      <button className="ide-btn ide-btn-sm" onClick={()=>setGlobalFontScale(1)} style={{opacity:.5}}>RST</button>
                    </div>
                    <div className="ide-toc-sec">EDITOR</div>
                    <div style={{padding:'0 8px 10px',display:'flex',alignItems:'center',gap:8}}>
                      <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',color:'rgba(200,200,220,.6)'}}>
                        <input type="checkbox" checked={formatOnSave} onChange={e=>saveFormatOnSave(e.target.checked)} style={{width:11,height:11}}/>
                        FORMAT ON SAVE
                      </label>
                    </div>
                    <div className="ide-toc-sec">PALETTE</div>
                    {PALETTES.map(p=>(
                      <div key={p.id} className={`ide-toc-item ${globalEditorPalette.id===p.id?'active':''}`} onClick={()=>setGlobalEditorPalette(p)} style={{gap:8}}>
                        <div style={{display:'flex',gap:3}}>{p.swatches.map((c,i)=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:c}}/>)}</div>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',color:p.base}}>{p.name}</span>
                      </div>
                    ))}
                    <div className="ide-toc-sec" style={{marginTop:8}}>AVATAR</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4,padding:'0 8px 12px'}}>
                      {[0,1,2,3,4,5].map(i=>(
                        <div key={i} onClick={()=>setAvatarIndex(i)}
                          style={{border:`2px solid ${avatarIndex===i?ACCENTS[i]:'rgba(128,128,128,.15)'}`,cursor:'pointer',overflow:'hidden',aspectRatio:'1'}}>
                          <img src={`${import.meta.env.BASE_URL}avatars/0xAV0${String(i+1).padStart(2,'0')}s.jpeg`} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                        </div>
                      ))}
                    </div>

                    {/* ── AI PROVIDERS ── */}
                    <div className="ide-toc-sec" style={{marginTop:8}}>AI PROVIDERS</div>
                    <div style={{padding:'4px 8px 6px'}}>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.4)',marginBottom:6}}>ACTIVE PROVIDER</div>
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        {[
                          {id:'anthropic',  label:'Anthropic',  color:'#bb9af7', note:'Claude models'},
                          {id:'openai',     label:'OpenAI',     color:'#10b981', note:'GPT-4o, GPT-4o-mini'},
                          {id:'gemini',     label:'Google Gemini',color:'#4285f4',note:'Gemini 2.0 Flash, 1.5 Pro'},
                          {id:'openrouter', label:'OpenRouter', color:'#ffc410', note:'100+ models, one key'},
                          {id:'ollama',     label:'Ollama (local)',color:'#89ddff',note:'Local models, no key needed'},
                        ].map(prov=>(
                          <div key={prov.id} onClick={()=>saveAiProvider(prov.id)}
                            style={{padding:'6px 10px',cursor:'pointer',background:aiProvider===prov.id?`${prov.color}14`:'transparent',
                              border:`1px solid ${aiProvider===prov.id?prov.color+'55':'rgba(255,255,255,.07)'}`,
                              display:'flex',alignItems:'center',gap:8,transition:'all .1s'}}
                            onMouseEnter={e=>(e.currentTarget.style.background=`${prov.color}0d`)}
                            onMouseLeave={e=>(e.currentTarget.style.background=aiProvider===prov.id?`${prov.color}14`:'transparent')}>
                            <div style={{width:6,height:6,borderRadius:'50%',background:aiProvider===prov.id?prov.color:'rgba(255,255,255,.2)',flexShrink:0}}/>
                            <div style={{flex:1}}>
                              <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.08em',color:aiProvider===prov.id?prov.color:'rgba(200,200,220,.7)'}}>{prov.label}</div>
                              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.3)'}}>{prov.note}</div>
                            </div>
                            {aiProvider===prov.id&&<span style={{color:prov.color,fontSize:'10px'}}>✓</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Per-provider key inputs */}
                    {(['anthropic','openai','gemini','openrouter'] as const).map(prov => {
                      const labels: Record<string,string> = { anthropic:'Anthropic API Key', openai:'OpenAI API Key', gemini:'Google AI API Key', openrouter:'OpenRouter API Key' }
                      const placeholders: Record<string,string> = { anthropic:'sk-ant-...', openai:'sk-...', gemini:'AIza...', openrouter:'sk-or-...' }
                      const colors: Record<string,string> = { anthropic:'#bb9af7', openai:'#10b981', gemini:'#4285f4', openrouter:'#ffc410' }
                      const links: Record<string,string> = {
                        anthropic:'console.anthropic.com',
                        openai:'platform.openai.com/api-keys',
                        gemini:'aistudio.google.com/app/apikey',
                        openrouter:'openrouter.ai/keys',
                      }
                      return (
                        <div key={prov} style={{padding:'0 8px 10px'}}>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:colors[prov],marginBottom:4,letterSpacing:'.06em'}}>{labels[prov]}</div>
                          <input type="password" value={aiKeys[prov]||''} onChange={e=>saveAiKey(prov,e.target.value)}
                            placeholder={placeholders[prov]}
                            style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.04)',border:`1px solid ${aiProvider===prov?colors[prov]+'44':'rgba(255,255,255,.08)'}`,
                              outline:'none',color:'#c0c8d8',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',padding:'4px 8px'}}
                            onFocus={e=>(e.target.style.borderColor=colors[prov]+'88')}
                            onBlur={e=>(e.target.style.borderColor=aiProvider===prov?colors[prov]+'44':'rgba(255,255,255,.08)')}/>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.25)',marginTop:3}}>{links[prov]}</div>
                        </div>
                      )
                    })}

                    {/* Ollama host */}
                    <div style={{padding:'0 8px 6px'}}>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'#89ddff',marginBottom:4,letterSpacing:'.06em'}}>OLLAMA HOST (optional)</div>
                      <input type="text" value={aiKeys['ollama']||''} onChange={e=>saveAiKey('ollama',e.target.value)}
                        placeholder="http://localhost:11434"
                        style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.04)',border:`1px solid ${aiProvider==='ollama'?'rgba(137,221,255,.44)':'rgba(255,255,255,.08)'}`,
                          outline:'none',color:'#c0c8d8',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',padding:'4px 8px'}}/>
                      <button onClick={fetchOllamaModels} style={{marginTop:4,width:'100%',background:'rgba(137,221,255,.08)',border:'1px solid rgba(137,221,255,.2)',
                        color:'#89ddff',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.08em',padding:'3px',cursor:'pointer'}}>
                        ↻ DETECT LOCAL MODELS
                      </button>
                      {ollamaModels.length>0 && (
                        <div style={{marginTop:4,display:'flex',flexDirection:'column',gap:2}}>
                          {ollamaModels.map(m=>(
                            <div key={m} onClick={()=>saveAiModel('ollama',m)}
                              style={{padding:'3px 8px',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',cursor:'pointer',
                                color:aiModels['ollama']===m?'#89ddff':'rgba(200,200,220,.5)',
                                background:aiModels['ollama']===m?'rgba(137,221,255,.1)':'transparent',
                                border:`1px solid ${aiModels['ollama']===m?'rgba(137,221,255,.3)':'transparent'}`}}>
                              {m}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Model selector for current provider */}
                    {aiProvider !== 'ollama' && (()=>{
                      const modelOpts: Record<string,{value:string,label:string}[]> = {
                        anthropic:[
                          {value:'claude-haiku-4-5-20251001',label:'Haiku 4.5 (fast)'},
                          {value:'claude-sonnet-4-6',label:'Sonnet 4.6'},
                          {value:'claude-opus-4-8',label:'Opus 4.8 (powerful)'},
                        ],
                        openai:[
                          {value:'gpt-4o-mini',label:'GPT-4o Mini (fast)'},
                          {value:'gpt-4o',label:'GPT-4o'},
                          {value:'gpt-4-turbo',label:'GPT-4 Turbo'},
                        ],
                        gemini:[
                          {value:'gemini-2.0-flash',label:'Gemini 2.0 Flash (fast)'},
                          {value:'gemini-1.5-pro',label:'Gemini 1.5 Pro'},
                          {value:'gemini-1.5-flash',label:'Gemini 1.5 Flash'},
                        ],
                        openrouter:[
                          {value:'openai/gpt-4o-mini',label:'GPT-4o Mini'},
                          {value:'anthropic/claude-haiku-4-5',label:'Claude Haiku'},
                          {value:'google/gemini-flash-1.5',label:'Gemini Flash'},
                          {value:'meta-llama/llama-3.1-8b-instruct:free',label:'Llama 3.1 8B (free)'},
                          {value:'mistralai/mistral-7b-instruct:free',label:'Mistral 7B (free)'},
                        ],
                      }
                      const opts = modelOpts[aiProvider] || []
                      return opts.length>0 ? (
                        <div style={{padding:'0 8px 12px'}}>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.4)',marginBottom:4,letterSpacing:'.06em'}}>MODEL</div>
                          <div style={{display:'flex',flexDirection:'column',gap:2}}>
                            {opts.map(opt=>(
                              <div key={opt.value} onClick={()=>saveAiModel(aiProvider,opt.value)}
                                style={{padding:'4px 8px',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',cursor:'pointer',
                                  color:( aiModels[aiProvider]||opts[0].value)===opt.value?'#c0c8d8':'rgba(200,200,220,.4)',
                                  background:(aiModels[aiProvider]||opts[0].value)===opt.value?'rgba(255,255,255,.06)':'transparent',
                                  border:`1px solid ${(aiModels[aiProvider]||opts[0].value)===opt.value?'rgba(255,255,255,.12)':'transparent'}`}}>
                                {opt.label}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null
                    })()}

                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Sidebar resize divider */}
          <div className="ide-split-divider"
            onMouseDown={e=>{e.preventDefault();document.body.style.userSelect='none';document.body.style.cursor='ew-resize';
              splitDragRef.current={side:'sidebar',sx:e.clientX,startW:sidebarW}}}/>
        </>)}

        {/* ── CANVAS ── */}
        <div className="ide-canvas-wrap" style={{flex:1, position:'relative'}}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleFileDrop}
        >
          {dragOver && (
            <div style={{
              position:'absolute', inset:0, zIndex:9999, pointerEvents:'none',
              background:'rgba(16,185,129,.07)', border:'2px dashed #10b981',
              display:'flex', alignItems:'center', justifyContent:'center',
              flexDirection:'column', gap:8,
            }}>
              <div style={{fontFamily:"'Bangers',sans-serif", fontSize:'2rem', letterSpacing:'.1em', color:'#10b981'}}>DROP FILES OR FOLDER</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace", fontSize:'11px', color:'#10b981', opacity:.7}}>
                Folder → auto-map imports to graph &nbsp;·&nbsp; Files: .py .js .ts .md .json .c .go…
              </div>
            </div>
          )}
          {/* Mode bar */}
          <div className="ide-mode-bar">
            <div style={{fontFamily:"'Bangers',sans-serif",fontSize:'13px',letterSpacing:'.12em',opacity:.5}}>{brutal?'MANGA // BRUTAL':'MANGA // CYBER'}</div>
            <div style={{flex:1}}/>
            <button className={`ide-mode-btn ${edgeMode==='join'?'m-join':''}`} onClick={()=>setEdgeMode(m=>m==='join'?null:'join')}>
              {edgeMode==='join'&&<span className="v-pulse green"/>}J·JOIN
            </button>
            <button className={`ide-mode-btn ${edgeMode==='cut'?'m-cut':''}`} onClick={()=>setEdgeMode(m=>m==='cut'?null:'cut')}>
              {edgeMode==='cut'&&<span className="v-pulse red"/>}X·CUT
            </button>
            <div className="ide-topbar-sep"/>
            <button className="ide-mode-btn" onClick={()=>setTransform({x:300,y:220,scale:1})}>RESET VIEW</button>
            {edgeMode==='join'&&joinFirstNode && (
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',color:'#10b981',marginLeft:6}}>
                → {nodesRef.current.find(n=>n.id===joinFirstNode)?.label}
              </div>
            )}
          </div>

          {/* Canvas input layer (captures pan + wheel) */}
          <div
            ref={canvasInputRef}
            className="ide-canvas-input-layer"
            onPointerDown={handleCanvasPtrDown}
            onPointerMove={handleCanvasPtrMove}
            onPointerUp={handleCanvasPtrUp}
            onPointerLeave={handleCanvasPtrUp}
            style={{cursor:isDraggingCanvas?'grabbing':edgeMode?'crosshair':'default'}}
          >
            {/* Transform container */}
            <div
              className="ide-canvas-graph-transform"
              style={{transform:`translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`}}
            >
              <div className="ide-canvas-graph">
                {/* Edges SVG */}
                <svg
                  style={{position:'absolute',left:-9999,top:-9999,width:19998,height:19998,overflow:'visible',pointerEvents:edgeMode==='cut'?'all':'none'}}
                >
                  <defs>
                    {visibleEdges.map(e=>{
                      const src=visibleNodes.find(n=>n.id===e.source), tgt=visibleNodes.find(n=>n.id===e.target)
                      if(!src||!tgt) return null
                      const srcAcc=ACCENTS[src.themeIdx%ACCENTS.length], tgtAcc=ACCENTS[tgt.themeIdx%ACCENTS.length]
                      return (
                        <linearGradient key={'g'+e.id} id={'grad-'+e.id} x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor={srcAcc} stopOpacity="0.55"/>
                          <stop offset="100%" stopColor={tgtAcc} stopOpacity="0.55"/>
                        </linearGradient>
                      )
                    })}
                  </defs>
                  <g transform="translate(9999,9999)">
                    {visibleEdges.map(e=>{
                      const src=visibleNodes.find(n=>n.id===e.source), tgt=visibleNodes.find(n=>n.id===e.target)
                      if(!src||!tgt) return null
                      const dx=tgt.x-src.x, dy=tgt.y-src.y
                      const len=Math.sqrt(dx*dx+dy*dy)||1
                      const bend=Math.min(len*0.38,72)
                      const c1x=src.x+bend, c1y=src.y
                      const c2x=tgt.x-bend, c2y=tgt.y
                      const isHov=hoveredEdgeId===e.id
                      const midX=(src.x+tgt.x)/2, midY=(src.y+tgt.y)/2
                      const edgeLabel=edgeDataLabels[e.id]
                      const srcAcc=ACCENTS[src.themeIdx%ACCENTS.length]
                      return (
                        <g key={e.id}>
                          <path
                            className="edge-path"
                            d={`M ${src.x} ${src.y} C ${c1x},${c1y} ${c2x},${c2y} ${tgt.x},${tgt.y}`}
                            stroke={isHov&&edgeMode==='cut'?'#ff435a':`url(#grad-${e.id})`}
                            strokeWidth={isHov?3:brutal?2:1.5}
                            opacity={isHov?1:.65}
                            style={{cursor:edgeMode==='cut'?'pointer':'default',transition:'opacity .15s'}}
                            onPointerEnter={()=>startTransition(()=>setHoveredEdgeId(e.id))}
                            onPointerLeave={()=>startTransition(()=>setHoveredEdgeId(null))}
                            onClick={()=>handleEdgeClick(e.id)}
                          />
                          {edgeLabel && (
                            <g transform={`translate(${midX},${midY})`} style={{pointerEvents:'none'}}>
                              <rect x={-edgeLabel.val.length*3-4} y={-9} width={edgeLabel.val.length*6+8} height={16}
                                rx={brutal?0:2} fill={brutal?'#0f0f0f':'rgba(3,3,15,.92)'} stroke={srcAcc} strokeWidth=".8" strokeOpacity=".7"/>
                              <text x={0} y={4} textAnchor="middle"
                                fontFamily="'Share Tech Mono',monospace" fontSize="8" fill={srcAcc} opacity=".95">
                                {edgeLabel.val}
                              </text>
                            </g>
                          )}
                        </g>
                      )
                    })}
                  </g>
                </svg>

                {/* Group hulls */}
                {groupsRef.current.map(grp=>{
                  const grpNodes=visibleNodes.filter(n=>grp.nodeIds.includes(n.id))
                  if (grpNodes.length<2) return null
                  const pts=grpNodes.map(n=>[n.x,n.y])
                  const hull=convexHull(pts)
                  if (hull.length<2) return null
                  const pad=brutal?54:48
                  const expanded=hull.map(([x,y])=>{
                    const cx=hull.reduce((s,[px])=>s+px,0)/hull.length
                    const cy=hull.reduce((s,[,py])=>s+py,0)/hull.length
                    const dx=x-cx, dy=y-cy, dist=Math.sqrt(dx*dx+dy*dy)||1
                    return [x+(dx/dist)*pad, y+(dy/dist)*pad]
                  })
                  const pointsStr=expanded.map(p=>p.join(',')).join(' ')
                  return (
                    <div key={grp.id} style={{position:'absolute',left:0,top:0,pointerEvents:'none'}}>
                      <svg style={{position:'absolute',left:-9999,top:-9999,width:19998,height:19998,overflow:'visible',pointerEvents:'none'}}>
                        <g transform="translate(9999,9999)">
                          <polygon points={pointsStr} className="group-hull"
                            stroke={grp.color} strokeWidth={brutal?2.5:1.5} strokeOpacity=".45"
                            fill={grp.color} fillOpacity=".07"
                            strokeDasharray={brutal?"6 3":"5 3"}/>
                        </g>
                      </svg>
                      {/* Group label — positioned at hull centroid */}
                      {(() => {
                        const cx=expanded.reduce((s,[x])=>s+x,0)/expanded.length
                        const cy=Math.min(...expanded.map(([,y])=>y))-14
                        return (
                          <div style={{position:'absolute',left:9999+cx,top:9999+cy,transform:'translateX(-50%)',pointerEvents:'auto',cursor:'pointer',zIndex:2}}
                            onClick={()=>setOpenGroupId(grp.id)}>
                            <span className="mn-group-label" style={{background:brutal?'#0f0f0f':'rgba(5,5,12,.92)',color:grp.color,border:`1px solid ${grp.color}44`}}>
                              {grp.name}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}

                {/* Nodes */}
                {visibleNodes.map(node=>(
                  <MangaNode
                    key={node.id}
                    node={node}
                    groups={groupsRef.current}
                    brutal={brutal}
                    isJoinSelected={joinFirstNode===node.id}
                    edgeMode={edgeMode}
                    hoveredNodeId={hoveredNodeId}
                    setHoveredNodeId={setHoveredNodeId}
                    draggingNodeRef={draggingNodeRef}
                    lastMousePos={lastMousePos}
                    transform={transform}
                    setNodeColorPicker={setNodeColorPicker}
                    handleNodeClickInMode={handleNodeClickInMode}
                    openNodeInEditor={openNodeInEditor}
                    nodeRunState={nodeRunState}
                    onRun={handleRunNode}
                    onCtxMenu={(nid,x,y)=>{setNodeCtxMenu({nodeId:nid,x,y});setNodeColorPicker(null)}}
                    wakePhysicsRef={wakePhysicsRef}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Canvas decorations (not transformed) */}
          <div className="ide-canvas-chapter" style={{pointerEvents:'none'}}>CHAPTER {nodeCount} · {activeVersionName}</div>
          <div className="ide-canvas-watermark">FORBIDEN</div>
          <GraphMinimap nodes={visibleNodes}/>
        </div>

        {/* ── EDITOR SPLIT PANE ── */}
        {editorOpen && (<>
          {/* Resize divider - left edge of editor */}
          <div className="ide-split-divider"
            onMouseDown={e=>{e.preventDefault();document.body.style.userSelect='none';document.body.style.cursor='ew-resize';
              splitDragRef.current={side:'editor',sx:e.clientX,startW:editorW}}}/>
          {/* Editor pane */}
          <div className="ide-editor-pane" style={{width:editorW,flexShrink:0}}>
            {/* Drag bar */}
            <div style={{height:20,flexShrink:0,display:'flex',alignItems:'center',
              justifyContent:'space-between',padding:'0 8px',
              background:brutal?'#0a0a0a':'rgba(6,6,16,.98)',
              borderBottom:brutal?'2px solid rgba(255,255,255,.07)':'1px solid rgba(255,42,56,.12)',
              userSelect:'none'}}>
              <span style={{fontSize:'8px',letterSpacing:'.1em',opacity:.3,fontFamily:"'Oswald',sans-serif"}}>EDITOR</span>
              <div style={{display:'flex',gap:3}}>
                {['#ff5f57','#ffbd2e','#28c840'].map((c,i)=>(
                  <div key={i} style={{width:9,height:9,borderRadius:'50%',background:c,opacity:.6}}/>
                ))}
              </div>
            </div>
          {activeTabId && activeTabNode ? (
            <>
              {/* Chapter splash */}
              <div className="ide-chapter-splash">
                {splashImgSrc && <img src={splashImgSrc} alt=""/>}
                <div className="ide-splash-overlay"/>
                <div className="ide-splash-meta">
                  <span className="ide-splash-chapter">CHAPTER {chapterNum}</span>
                  <h2 className="ide-splash-title">{activeTabNode.label.replace(/\.\w+$/,'')}</h2>
                  <div className="ide-splash-info">{activeTabNode.type.toUpperCase()} · {(activeTabNode.code||'').split('\n').length} LINES · {activeTabNode.label.match(/\.(\w+)$/)?.[1]?.toUpperCase()||'FILE'}{activeTabNode.modified?' · MOD':''}</div>
                </div>
              </div>
              {/* Tabs + run button */}
              <div className="ide-file-tabs">
                {openTabs.map(id=>{
                  const n=nodesRef.current.find(nd=>nd.id===id)
                  if (!n) return null
                  const isPinned = pinnedTabs.has(id)
                  return (
                    <div key={id} className={`ide-file-tab ${activeTabId===id?'active':''} ${isPinned?'pinned':''}`}
                      onClick={()=>setActiveTabId(id)}
                      onDoubleClick={()=>togglePinTab(id)}
                      title={isPinned?'Pinned (double-click to unpin)':'Double-click to pin'}>
                      {isPinned && <span style={{fontSize:'8px',marginRight:3,opacity:.6}}>📌</span>}
                      {n.label}
                      {n.modified&&<span className="modified-dot"/>}
                      {!isPinned && <span className="ide-tab-close" onClick={e=>{e.stopPropagation();closeTab(id)}}><I.X/></span>}
                    </div>
                  )
                })}
                <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:4,padding:'0 6px',flexShrink:0}}>
                  {/* Jump to line button */}
                  <button onClick={()=>setShowJumpLine(true)} title="Jump to line (Ctrl+G)"
                    style={{padding:'1px 7px',cursor:'pointer',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',background:'transparent',color:'rgba(200,200,220,.35)',border:'1px solid rgba(255,255,255,.08)',transition:'all .12s'}}
                    onMouseEnter={e=>(e.currentTarget.style.color='#c0c8d8')}
                    onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.35)')}>:N</button>
                  {/* Split editor buttons */}
                  {activeTabId && (
                    <>
                      <button onClick={()=>{ if(splitTabId===activeTabId){setSplitTabId(null)}else{setSplitTabId(activeTabId);setSplitMode('vertical')} }}
                        title={splitTabId===activeTabId?'Close split':'Split vertical'}
                        style={{padding:'1px 7px',cursor:'pointer',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',transition:'all .12s',
                          background:splitTabId===activeTabId?'rgba(16,185,129,.15)':'transparent',
                          color:splitTabId===activeTabId?'#10b981':'rgba(200,200,220,.35)',
                          border:`1px solid ${splitTabId===activeTabId?'rgba(16,185,129,.35)':'rgba(255,255,255,.08)'}`}}
                        onMouseEnter={e=>(e.currentTarget.style.color=splitTabId===activeTabId?'#10b981':'#c0c8d8')}
                        onMouseLeave={e=>(e.currentTarget.style.color=splitTabId===activeTabId?'#10b981':'rgba(200,200,220,.35)')}>⬓</button>
                    </>
                  )}
                  {activeTabNode?.type==='doc' ? (
                    <>
                      {['edit','split','preview'].map(m=>(
                        <button key={m} onClick={()=>setMdPreviewMode(m)}
                          style={{padding:'2px 7px',cursor:'pointer',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.1em',
                            background:mdPreviewMode===m?'#c792ea':'transparent',
                            color:mdPreviewMode===m?'#000':'rgba(200,200,220,.4)',
                            border:'1px solid rgba(200,100,255,.25)',transition:'all .12s'}}>
                          {m.toUpperCase()}
                        </button>
                      ))}
                      <div style={{width:1,height:12,background:'rgba(255,255,255,.1)',margin:'0 3px'}}/>
                      <button onClick={()=>setMdFontSize(s=>Math.max(11,s-1))} title="Decrease text size"
                        style={{padding:'1px 6px',cursor:'pointer',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',
                          background:'transparent',color:'rgba(200,200,220,.4)',border:'1px solid rgba(255,255,255,.1)',
                          lineHeight:1.4,transition:'all .12s'}}
                        onMouseEnter={e=>(e.currentTarget.style.color='#c792ea')}
                        onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.4)')}>A-</button>
                      <button onClick={()=>setMdFontSize(s=>Math.min(26,s+1))} title="Increase text size"
                        style={{padding:'1px 6px',cursor:'pointer',fontFamily:"'JetBrains Mono',monospace",fontSize:'13px',
                          background:'transparent',color:'rgba(200,200,220,.4)',border:'1px solid rgba(255,255,255,.1)',
                          lineHeight:1.4,transition:'all .12s'}}
                        onMouseEnter={e=>(e.currentTarget.style.color='#c792ea')}
                        onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.4)')}>A+</button>
                    </>
                  ) : (
                    <button onClick={()=>handleRunNode(activeTabId)}
                      title={`Run (Ctrl+Enter)${isCompiled(detectLang(activeTabNode?.label||''))?' — compile & run locally':''}`}
                      style={{padding:'2px 10px',cursor:'pointer',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.1em',
                        background:nodeRunState[activeTabId]?.status==='ok'?'#10b981':nodeRunState[activeTabId]?.status==='error'?'#ff435a':'transparent',
                        color:nodeRunState[activeTabId]?.status?'#000':isCompiled(detectLang(activeTabNode?.label||''))?'#ff8080':brutal?'#f2c12e':'#ff2a38',
                        border:`1px solid ${nodeRunState[activeTabId]?.status==='ok'?'#10b981':nodeRunState[activeTabId]?.status==='error'?'#ff435a':isCompiled(detectLang(activeTabNode?.label||''))?'rgba(255,128,128,.4)':brutal?'#f2c12e':'rgba(255,42,56,.4)'}`,
                        transition:'all .15s'}}>
                      {nodeRunState[activeTabId]?.status==='running'?'⋯'
                        :nodeRunState[activeTabId]?.status==='ok'?`✓ ${nodeRunState[activeTabId].ms}ms`
                        :nodeRunState[activeTabId]?.status==='error'?'✗ ERR'
                        :isCompiled(detectLang(activeTabNode?.label||''))?`▶ ${detectLang(activeTabNode?.label||'').toUpperCase()}`:'▶ RUN'}
                    </button>
                  )}
                </div>
              </div>
              {/* Editor / Markdown Preview */}
              <div className="ide-code-wrap" style={{display:'flex',flexDirection:splitTabId?(splitMode==='horizontal'?'column':'row'):'column',overflow:'hidden'}} onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();handleRunNode(activeTabId)}}}>
                {/* Primary editor pane */}
                <div style={{flex:1,overflow:'hidden',position:'relative',display:'flex',flexDirection:'column'}}>
                  {activeTabNode?.type==='doc' && mdPreviewMode==='split' ? (
                    <div style={{display:'flex',height:'100%',overflow:'hidden'}}>
                      <div style={{flex:1,overflow:'hidden',borderRight:'1px solid rgba(255,255,255,.08)'}}>
                        <CodeMirrorEditor key={activeTabId+'_s'} node={activeTabNode} onChange={code=>updateNodeCode(activeTabId,code)} onSave={()=>saveNodeToDisk(activeTabId)} externalPalette={globalEditorPalette}/>
                      </div>
                      <div style={{flex:1,overflow:'auto',padding:'12px 16px',fontSize:mdFontSize+'px'}} className="md-preview"
                        dangerouslySetInnerHTML={{__html: renderMd(activeTabNode.code||'')}}/>
                    </div>
                  ) : activeTabNode?.type==='doc' && mdPreviewMode==='preview' ? (
                    <div className="md-preview" style={{fontSize:mdFontSize+'px'}} dangerouslySetInnerHTML={{__html: renderMd(activeTabNode.code||'')}}/>
                  ) : (
                    <CodeMirrorEditor
                      key={activeTabId}
                      node={activeTabNode}
                      onChange={code=>updateNodeCode(activeTabId,code)}
                      onSave={()=>saveNodeToDisk(activeTabId)}
                      externalPalette={globalEditorPalette}
                      jumpToLine={jumpLineTarget??undefined}
                      onCursorChange={(line,col)=>setEditorCursorPos({line,col})}
                      aiProvider={aiProvider}
                      aiKey={aiProvider==='ollama'?(aiKeys['ollama']||'http://localhost:11434'):aiKeys[aiProvider]||''}
                      aiModel={aiModels[aiProvider]||DEFAULT_MODELS[aiProvider]||''}
                    />
                  )}
                </div>

                {/* Split pane */}
                {splitTabId && (() => {
                  const splitNode = nodesRef.current.find(n=>n.id===splitTabId)
                  return splitNode ? (
                    <>
                      <div style={{
                        [splitMode==='horizontal'?'height':'width']:'1px',
                        background:'rgba(255,255,255,.1)',flexShrink:0,
                        cursor:splitMode==='horizontal'?'row-resize':'col-resize'
                      }}/>
                      <div style={{flex:1,overflow:'hidden',position:'relative',display:'flex',flexDirection:'column'}}>
                        <div style={{display:'flex',alignItems:'center',padding:'2px 8px',background:'rgba(0,0,0,.25)',flexShrink:0,gap:6,borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',opacity:.5,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{splitNode.label}</span>
                          <button onClick={()=>setSplitTabId(null)} style={{background:'transparent',border:'none',color:'rgba(200,200,220,.3)',cursor:'pointer',fontSize:'11px',padding:'0 2px',lineHeight:1}} title="Close split">✕</button>
                        </div>
                        <CodeMirrorEditor
                          key={splitTabId+'_split'}
                          node={splitNode}
                          onChange={code=>updateNodeCode(splitTabId,code)}
                          onSave={()=>saveNodeToDisk(splitTabId)}
                          externalPalette={globalEditorPalette}
                          onCursorChange={(line,col)=>setEditorCursorPos({line,col})}
                          aiProvider={aiProvider}
                          aiKey={aiProvider==='ollama'?(aiKeys['ollama']||'http://localhost:11434'):aiKeys[aiProvider]||''}
                          aiModel={aiModels[aiProvider]||DEFAULT_MODELS[aiProvider]||''}
                        />
                      </div>
                    </>
                  ) : null
                })()}
              </div>
            </>
          ) : (
            <div className="ide-welcome idw-splash">

              {/* ── 3-panel manga stage (full-bleed background) ── */}
              <div className="idw-manga-stage">
                <div className="idw-mp idw-mp-a">
                  <img src={getPanelImg(2)} alt="" loading="lazy"/>
                  <div className="idw-mp-overlay"/>
                </div>
                <div className="idw-mp idw-mp-b">
                  <img src={getPanelImg(6)} alt="" loading="lazy"/>
                  <div className="idw-mp-overlay"/>
                </div>
                <div className="idw-mp idw-mp-c">
                  <img src={getPanelImg(11)} alt="" loading="lazy"/>
                  <div className="idw-mp-overlay"/>
                </div>
                <div className="idw-global-veil"/>
                <div className="idw-halftone"/>
                <div className="idw-scanlines"/>
              </div>

              {/* ── SVG speed lines ── */}
              <svg className="idw-speedlines" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
                {Array.from({length:32}).map((_:any,i:number)=>{
                  const a=(i/32)*Math.PI*2
                  const cx=130,cy=210
                  return <line key={i}
                    x1={cx} y1={cy}
                    x2={cx+Math.cos(a)*1200} y2={cy+Math.sin(a)*1200}
                    stroke={brutal?'rgba(15,15,15,.042)':'rgba(255,255,255,.042)'}
                    strokeWidth="1.3"
                  />
                })}
              </svg>

              {/* ── Hero text ── */}
              <div className="idw-hero">
                <div className="idw-hero-tag" style={{color:brutal?'#f2c12e':'#ff2a38',borderColor:brutal?'rgba(242,193,46,.55)':'rgba(255,42,56,.55)'}}>
                  FORBIDEN <span style={{opacity:.45}}>//</span> NGO
                </div>
                <div className="idw-hero-chapter">
                  CHAPTER {nodeCount} · {edgeCount>0?`${edgeCount} LINKS`:'ORIGIN'}
                </div>
                <div className="idw-hero-title">
                  SELECT<br/>A NODE
                </div>
                <div className="idw-hero-sub">Each panel is a chapter.</div>
                <button className="idw-hero-cta" style={{
                  background:brutal?'#f2c12e':'rgba(255,42,56,.13)',
                  color:brutal?'#0f0f0f':'#ff2a38',
                  border:brutal?'2.5px solid #0f0f0f':'1px solid rgba(255,42,56,.5)',
                }} onClick={()=>setShowCreateNode(true)}>
                  + CREATE NODE
                </button>
              </div>

              {/* ── Manga SFX decoration ── */}
              <div className="idw-sfx" style={{color:brutal?'rgba(15,15,15,.055)':'rgba(255,255,255,.038)'}}>
                KLIK!
              </div>

              {/* ── Floating node browser ── */}
              {(() => {
                const allTypes = ['all','entry','function','class','module','doc']
                const typeColors:any = {entry:'#ff2a38',function:'#ffc410',class:'#10b981',module:'#4285f4',doc:'#c792ea',default:'#888'}
                const wq = welcomeSearch.trim().toLowerCase()
                const allNodes = nodesRef.current
                const typeFiltered = welcomeFilter==='all' ? allNodes : allNodes.filter((n:any)=>n.type===welcomeFilter)
                const displayNodes = wq
                  ? typeFiltered.filter((n:any)=>n.label.toLowerCase().includes(wq)||(n.code||'').toLowerCase().includes(wq))
                  : typeFiltered
                const typeCounts:any = {}
                allNodes.forEach((n:any)=>{ typeCounts[n.type]=(typeCounts[n.type]||0)+1 })
                const usedTypes = allTypes.filter(t=>t==='all'||(typeCounts[t]||0)>0)
                const grouped = groupsRef.current.length>0 && !wq && welcomeFilter==='all'
                const ungroupedNodes = grouped ? displayNodes.filter((n:any)=>!groupsRef.current.some((g:any)=>g.nodeIds.includes(n.id))) : []
                return (
                <div className="idw-browser">

                  {/* ── Browser header ── */}
                  <div className="idw-browser-hdr">
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span className="idw-browser-title" style={{color:brutal?'#f2c12e':'#ff2a38'}}>FILES</span>
                      <div style={{flex:1}}/>
                      <button className="ide-btn ide-btn-sm" onClick={()=>setShowCreateNode(true)}>+ NODE</button>
                      <button className="ide-btn ide-btn-sm" onClick={()=>folderInputRef.current?.click()}>⬆</button>
                    </div>
                    <div className="idw-browser-stats">
                      <span>{nodeCount} NODES</span>
                      <span style={{opacity:.28}}>·</span>
                      <span>{edgeCount} EDGES</span>
                      {groupsRef.current.length>0&&<><span style={{opacity:.28}}>·</span><span>{groupsRef.current.length} GRP</span></>}
                      <div style={{flex:1}}/>
                      {modifiedNodes.length>0&&<span style={{color:'#ffc410'}}>{modifiedNodes.length} MOD</span>}
                    </div>
                  </div>

                  {/* ── Search ── */}
                  <div style={{padding:'6px 10px 3px',flexShrink:0}}>
                    <div style={{position:'relative'}}>
                      <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:'10px',opacity:.3,pointerEvents:'none'}}>⌕</span>
                      <input
                        value={welcomeSearch}
                        onChange={(e:any)=>setWelcomeSearch(e.target.value)}
                        placeholder="Search files and code…"
                        style={{
                          width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',
                          outline:'none',color:'#c0c8d8',fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',
                          padding:'5px 8px 5px 24px',transition:'border-color .15s',
                        }}
                        onFocus={(e:any)=>(e.target.style.borderColor=brutal?'rgba(242,193,46,.5)':'rgba(255,42,56,.4)')}
                        onBlur={(e:any)=>(e.target.style.borderColor='rgba(255,255,255,.08)')}
                      />
                      {welcomeSearch&&(
                        <button onClick={()=>setWelcomeSearch('')} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',cursor:'pointer',color:'rgba(200,200,220,.3)',fontSize:'12px',lineHeight:1}}>×</button>
                      )}
                    </div>
                  </div>

                  {/* ── Filter chips ── */}
                  {!wq && (
                    <div style={{display:'flex',gap:3,padding:'3px 10px 5px',flexShrink:0,flexWrap:'wrap'}}>
                      {usedTypes.map(t=>{
                        const active = welcomeFilter===t
                        const col = typeColors[t]||typeColors.default
                        return (
                          <button key={t} onClick={()=>setWelcomeFilter(t)}
                            style={{
                              background: active?`${col}22`:'transparent',
                              border:`1px solid ${active?col:`${col}30`}`,
                              color: active?col:`rgba(200,200,220,.3)`,
                              fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.08em',
                              padding:'2px 7px',cursor:'pointer',transition:'all .12s',
                            }}>
                            {t==='all'?`ALL (${allNodes.length})`:t.toUpperCase()+(typeCounts[t]?` (${typeCounts[t]})`:'') }
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* ── Node list ── */}
                  <div style={{flex:1,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent'}}>

                    {!wq && openTabs.length>0 && welcomeFilter==='all' && (
                      <>
                        <div style={{padding:'4px 10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.14em',color:'rgba(200,200,220,.3)',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                          RECENT
                        </div>
                        {openTabs.slice(0,4).map((tid:any)=>{
                          const n=nodesRef.current.find((n:any)=>n.id===tid)
                          if(!n) return null
                          const grp=groupsRef.current.find((g:any)=>g.nodeIds.includes(n.id))
                          const acc=grp?grp.color:ACCENTS[n.themeIdx%ACCENTS.length]
                          return (
                            <div key={n.id} onClick={()=>openNodeInEditor(n.id)}
                              style={{display:'flex',alignItems:'center',gap:8,padding:'5px 12px',cursor:'pointer',
                                background:activeTabId===n.id?'rgba(255,255,255,.05)':'transparent',transition:'background .1s'}}
                              onMouseEnter={(e:any)=>(e.currentTarget.style.background='rgba(255,255,255,.05)')}
                              onMouseLeave={(e:any)=>(e.currentTarget.style.background=activeTabId===n.id?'rgba(255,255,255,.05)':'transparent')}>
                              <div style={{width:5,height:5,borderRadius:'50%',background:acc,flexShrink:0}}/>
                              <span style={{flex:1,fontFamily:"'Share Tech Mono',monospace",fontSize:'12px',color:'#c0c8d8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                {n.label}{n.modified&&<span style={{color:'#ffc410',marginLeft:4}}>●</span>}
                              </span>
                              <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',color:acc,opacity:.55,letterSpacing:'.07em',flexShrink:0}}>
                                {n.type.slice(0,3).toUpperCase()}
                              </span>
                            </div>
                          )
                        })}
                      </>
                    )}

                    {wq && (
                      <div style={{padding:'3px 10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.16em',color:'rgba(200,200,220,.28)',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                        {displayNodes.length} RESULTS FOR "{wq.toUpperCase()}"
                      </div>
                    )}

                    {grouped ? (<>
                      {groupsRef.current.map((g:any)=>{
                        const gNodes=displayNodes.filter((n:any)=>g.nodeIds.includes(n.id))
                        if(!gNodes.length) return null
                        return (
                          <div key={g.id}>
                            <div style={{padding:'5px 10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',letterSpacing:'.12em',
                              color:g.color,borderBottom:'1px solid rgba(255,255,255,.04)',display:'flex',alignItems:'center',gap:6}}>
                              <div style={{width:4,height:4,borderRadius:'50%',background:g.color}}/>
                              {g.name.toUpperCase()}
                              <span style={{opacity:.4,fontWeight:400,marginLeft:'auto'}}>{gNodes.length}</span>
                            </div>
                            {gNodes.map((n:any)=><WelcomeNodeRow key={n.id} n={n} active={activeTabId===n.id} onClick={()=>openNodeInEditor(n.id)} groups={groupsRef.current}/>)}
                          </div>
                        )
                      })}
                      {ungroupedNodes.length>0&&(<>
                        <div style={{padding:'4px 10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.14em',
                          color:'rgba(200,200,220,.28)',borderBottom:'1px solid rgba(255,255,255,.04)',display:'flex',alignItems:'center',gap:6}}>
                          UNGROUPED <span style={{opacity:.4,fontWeight:400,marginLeft:'auto'}}>{ungroupedNodes.length}</span>
                        </div>
                        {ungroupedNodes.map((n:any)=><WelcomeNodeRow key={n.id} n={n} active={activeTabId===n.id} onClick={()=>openNodeInEditor(n.id)} groups={groupsRef.current}/>)}
                      </>)}
                    </>) : (
                      <>
                        {!wq&&(
                          <div style={{padding:'4px 10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.14em',color:'rgba(200,200,220,.3)',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                            {welcomeFilter==='all'?`ALL FILES (${displayNodes.length})`:welcomeFilter.toUpperCase()+` (${displayNodes.length})`}
                          </div>
                        )}
                        {displayNodes.map((n:any)=><WelcomeNodeRow key={n.id} n={n} active={activeTabId===n.id} onClick={()=>openNodeInEditor(n.id)} groups={groupsRef.current} searchQuery={wq}/>)}
                      </>
                    )}

                    {displayNodes.length===0&&(
                      <div style={{padding:'32px 16px',textAlign:'center',opacity:.2,fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',lineHeight:2}}>
                        {wq?'NO MATCHES':'NO NODES YET'}<br/>
                        <span style={{fontSize:'9px',opacity:.6}}>
                          {wq?'try a different search':'+NODE · ⬆ FOLDER · DROP FILES ON CANVAS'}
                        </span>
                      </div>
                    )}
                    <div style={{height:12}}/>
                  </div>

                  {/* ── Bottom bar ── */}
                  <div style={{padding:'6px 10px',flexShrink:0,borderTop:'1px solid rgba(255,255,255,.06)',
                    display:'flex',alignItems:'center',gap:5,background:'rgba(0,0,0,.25)'}}>
                    <button className="ide-btn ide-btn-sm" onClick={()=>setNotebookFloating(f=>!f)}
                      style={{color:notebookFloating?'#c792ea':'',borderColor:notebookFloating?'rgba(199,146,234,.3)':''}}>
                      ◎ NOTE
                    </button>
                    <button className="ide-btn ide-btn-sm" onClick={()=>{setBottomTab('timeline');setBottomOpen(true)}}>⎔ TL</button>
                    <div style={{flex:1}}/>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'7px',opacity:.15,letterSpacing:'.08em'}}>
                      DROP ON CANVAS
                    </span>
                  </div>
                </div>
                )
              })()}
            </div>
          )}
          </div>
        </>)}
      </div>

      </div>{/* ide-main-row */}

      {/* ── FLOATING NOTEBOOK PANEL (centered modal) ── */}
      {notebookFloating && (
        <>
          {/* Backdrop */}
          <div onClick={()=>setNotebookFloating(false)}
            style={{position:'fixed',inset:0,zIndex:99,background:'rgba(0,0,0,.55)',backdropFilter:'blur(2px)'}}/>
          {/* Panel */}
          <div style={{
            position:'fixed',
            top:'50%', left:'50%',
            transform:'translate(-50%,-50%)',
            zIndex:100,
            width:'min(860px, 90vw)',
            height:'min(680px, 85vh)',
            display:'flex', flexDirection:'column', overflow:'hidden',
            background:'#07070f',
            border:'1px solid rgba(199,146,234,.25)',
            boxShadow:'0 24px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(199,146,234,.08)',
            animation:'nbFadeIn .18s cubic-bezier(.2,.8,.4,1)',
          }}>
            {/* Title bar */}
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 12px',flexShrink:0,
              borderBottom:'1px solid rgba(255,255,255,.07)',background:'rgba(0,0,0,.6)',userSelect:'none'}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c792ea" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'11px',letterSpacing:'.15em',color:'#c792ea'}}>NOTEBOOK</span>
              <span style={{opacity:.22,fontSize:'9px',fontFamily:"'Share Tech Mono',monospace"}}>Shift+Enter runs · Tab indents · Esc closes</span>
              <button onClick={()=>setNotebookFloating(false)}
                style={{marginLeft:'auto',background:'transparent',border:'none',cursor:'pointer',
                  color:'rgba(200,200,220,.3)',fontSize:'16px',lineHeight:1,padding:'2px 6px',transition:'color .12s'}}
                onMouseEnter={e=>(e.currentTarget.style.color='#ff435a')}
                onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.3)')}>✕</button>
            </div>
            <NotebookPanel brutal={false}/>
          </div>
        </>
      )}

      {/* ── BOTTOM PANEL (Timeline / Console / Git) ── */}
      {bottomOpen && (
        <div className="ide-bottom-panel" style={{height:bottomH}}>
          {/* Resize drag handle */}
          <div className="ide-bottom-resize"
            onMouseDown={e=>{e.preventDefault();document.body.style.userSelect='none';document.body.style.cursor='ns-resize';
              tlDragRef.current={sy:e.clientY,startH:bottomH}}}/>
          {/* Tab bar */}
          <div className="ide-bottom-tabbar">
            {[
              {key:'console',  label:'▶ CONSOLE'},
              {key:'terminal', label:'$ TERMINAL'},
              {key:'scripts',  label:'⚙ SCRIPTS'},
              {key:'notebook', label:'◎ NOTEBOOK'},
              {key:'timeline', label:'⎔ TIMELINE'},
            ].map(t=>(
              <button key={t.key}
                className={`ide-bottom-tab ${bottomTab===t.key?'active':''}`}
                onClick={()=>setBottomTab(t.key)}>
                {t.label}
              </button>
            ))}
            <div style={{flex:1}}/>
            {/* resize hint */}
            <span style={{fontSize:'9px',opacity:.2,fontFamily:"'Share Tech Mono',monospace",alignSelf:'center',marginRight:6,userSelect:'none'}}>drag to resize</span>
            <button className="ide-bottom-close" onClick={()=>setBottomOpen(false)}>✕</button>
          </div>
          {/* Content */}
          <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',minHeight:0}}>
            {bottomTab==='terminal' && (
              <XTermPanel
                cwd={termCwd}
                palette={termPalette}
                onCwdChange={setTermCwd}
                onActivePtyChange={setActivePtyId}
              />
            )}
            {bottomTab==='scripts' && (
              <ScriptsPanel rootPath={explorerRoot} brutal={brutal}
                onRun={(cmd)=>{
                  setBottomTab('terminal')
                  setBottomOpen(true)
                  // Give terminal tab time to mount, then inject command
                  setTimeout(() => {
                    if (activePtyId) {
                      const api = (window as any).electronAPI
                      api?.runInTerminal?.(activePtyId, 'sh', cmd, explorerRoot)
                    }
                  }, 300)
                }}/>
            )}
            {bottomTab==='timeline' && (
              <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',minHeight:0}}>
                <TimelinePanel eventLog={eventLog} brutal={brutal}/>
              </div>
            )}
            {bottomTab==='notebook' && <NotebookPanel brutal={brutal}/>}
            {bottomTab==='console' && (<>
        {/* ── Console toolbar ── */}
        <div style={{display:'flex',alignItems:'center',gap:4,padding:'2px 8px',flexShrink:0,borderBottom:'1px solid rgba(255,255,255,.05)',background:'rgba(0,0,0,.25)'}}>
          <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.12em',color:'#5a5a7a',flex:1}}>OUTPUT</span>
          {jsLogs.length > 0 && (
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'9px',color:'#3e3e5a'}}>{jsLogs.filter(e=>e.type==='error'||e.type==='compile-err'||e.type==='run-err').length > 0 && <span style={{color:'#ff435a',marginRight:6}}>✕ {jsLogs.filter(e=>e.type==='error'||e.type==='compile-err'||e.type==='run-err').length}</span>}{jsLogs.filter(e=>e.type==='warn'||e.type==='compile-warn').length > 0 && <span style={{color:'#ffc410',marginRight:6}}>⚠ {jsLogs.filter(e=>e.type==='warn'||e.type==='compile-warn').length}</span>}</span>
          )}
          <button title="Clear console" onMouseDown={()=>setJsLogs([])} style={{background:'transparent',border:'none',color:'#3e3e5a',cursor:'pointer',padding:'2px 4px',fontSize:'11px',lineHeight:1,transition:'color .1s'}} onMouseEnter={e=>(e.currentTarget.style.color='#ff435a')} onMouseLeave={e=>(e.currentTarget.style.color='#3e3e5a')}>⊘</button>
        </div>
        {/* ── Log entries ── */}
        <div style={{flex:1,overflowY:'auto',padding:'4px 0',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',lineHeight:1.6,scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.08) transparent'}}>
          {jsLogs.length === 0 && (
            <div style={{padding:'20px 12px',color:'#3e3e5a',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',textAlign:'center',letterSpacing:'.06em'}}>
              RUN A FILE TO SEE OUTPUT
            </div>
          )}
          {jsLogs.map((entry,i)=>{
            const isSep    = entry.type==='compile-sep'||entry.type==='run-sep'
            const isHeader = entry.type==='header'
            const isFooter = entry.type==='footer'||entry.type==='error-footer'
            const isError  = entry.type==='error'||entry.type==='compile-err'||entry.type==='run-err'
            const isWarn   = entry.type==='warn'||entry.type==='compile-warn'
            const isOk     = entry.type==='compile-ok'||entry.type==='footer'
            const col = isError ? '#ff435a' : isWarn ? '#e2c08d' : isOk ? '#73c991'
              : entry.type==='return' ? '#bb9af7' : entry.type==='info' ? '#5ccfe6'
              : entry.type==='repl-in' ? '#10b981' : entry.type==='header' ? '#c0c8d8'
              : '#c0c8d8'
            const icon = isError ? '✕' : isWarn ? '⚠' : isOk ? '✓'
              : entry.type==='return' ? '←' : entry.type==='repl-in' ? '>' : ''
            if (isSep) return (
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px 3px',opacity:.5}}>
                <div style={{height:1,flex:1,background:'rgba(255,255,255,.07)'}}/>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'#5a5a7a',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{entry.val}</span>
                <div style={{height:1,flex:1,background:'rgba(255,255,255,.07)'}}/>
              </div>
            )
            if (isHeader) return (
              <div key={i} style={{padding:'4px 12px 2px',borderTop:'1px solid rgba(255,255,255,.06)',marginTop:i>0?4:0}}>
                <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.1em',color:'#8a8aa0'}}>{entry.val}</span>
              </div>
            )
            return (
              <div key={i} style={{
                display:'flex',alignItems:'flex-start',gap:0,padding:'0 12px',
                borderLeft: isError ? '2px solid rgba(255,67,90,.45)' : isWarn ? '2px solid rgba(226,192,141,.35)' : '2px solid transparent',
                background: isError ? 'rgba(255,67,90,.04)' : 'transparent',
              }}>
                {icon && <span style={{color:col,opacity:.6,fontSize:'10px',marginRight:6,flexShrink:0,marginTop:1,lineHeight:'1.6em'}}>{icon}</span>}
                <span style={{color:col,whiteSpace:'pre-wrap',wordBreak:'break-all',flex:1,lineHeight:'1.6em'}}>{entry.val}</span>
              </div>
            )
          })}
          <div ref={jsConsoleEndRef}/>
        </div>
        {/* ── stdin (compiled langs only) ── */}
        {(()=>{
          const activeNode = nodesRef.current.find(n=>n.id===activeTabId)
          const activeLang = detectLang(activeNode?.label||'')
          if (!isCompiled(activeLang)) return null
          return (
            <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderTop:'1px solid rgba(255,128,128,.1)',flexShrink:0,background:'rgba(255,80,80,.03)'}}>
              <span style={{color:'#ff6060',fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',letterSpacing:'.06em',flexShrink:0,opacity:.6}}>STDIN</span>
              <input value={compileStdin} onChange={e=>setCompileStdin(e.target.value)}
                style={{flex:1,background:'transparent',border:'none',outline:'none',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:'#c0c8d8',caretColor:'#ff6060'}}
                placeholder={`feed input to ${activeLang.toUpperCase()}…`} spellCheck={false}/>
              {compileStdin&&<button onMouseDown={()=>setCompileStdin('')} style={{fontSize:'9px',opacity:.35,cursor:'pointer',background:'none',border:'none',color:'inherit'}}>✕</button>}
            </div>
          )
        })()}
        {/* ── REPL ── */}
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderTop:'1px solid rgba(255,255,255,.06)',flexShrink:0,background:'rgba(0,0,0,.2)'}}>
          <span style={{color:'#10b981',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',flexShrink:0,opacity:.7}}>{'>'}</span>
          <input value={replInput} onChange={e=>setReplInput(e.target.value)} onKeyDown={handleReplKey}
            style={{flex:1,background:'transparent',border:'none',outline:'none',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:'#c0c8d8',caretColor:'#10b981'}}
            placeholder="eval JS…" spellCheck={false}/>
        </div>
            </>)}
          </div>
        </div>
      )}



      {/* ═══════ STATUS BAR ═══════ */}
      {/* ═══════ STATUS BAR ═══════ */}
      <div className="ide-status-bar">
        <div className="ide-status-badge" style={{background:brutal?'#c8001a':'#ff2a38',color:'#fff'}}>FORBIDEN</div>
        <span style={{color:'#10b981'}}>● LOCAL</span>
        {gitBranch && (
          <span
            title="Source Control (Ctrl+Shift+G)"
            onClick={()=>{ setSidebarMode('git'); setSidebarOpen(o=>sidebarMode==='git'?!o:true) }}
            style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',padding:'0 4px',borderRadius:2,transition:'background .12s'}}
            onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.08)')}
            onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="6" y1="3" x2="6" y2="15"/>
              <circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>
              <path d="M18 9a9 9 0 01-9 9"/>
            </svg>
            <span style={{opacity:.8}}>{gitBranch}</span>
            {gitChangeCount>0 && <span style={{color:'#e2c08d',fontSize:'9px'}}>+{gitChangeCount}</span>}
          </span>
        )}
        {editorCursorPos && activeTabId && (<>
          <span style={{opacity:.2}}>|</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'9px',opacity:.6}}>Ln {editorCursorPos.line}, Col {editorCursorPos.col}</span>
        </>)}
        <span style={{opacity:.2}}>|</span>
        <span>{nodeCount} nodes · {edgeCount} edges</span>
        {groupsRef.current.length>0 && <><span style={{opacity:.2}}>|</span><span>{groupsRef.current.length} classes</span></>}
        {edgeMode && <><span style={{opacity:.2}}>|</span><span style={{color:edgeMode==='join'?'#10b981':'#ff435a'}}>{edgeMode==='join'?'JOIN MODE':'CUT MODE'}</span></>}
        <span style={{marginLeft:'auto',opacity:.3}}>⌘P · N NEW · J JOIN · X CUT · ` TERMINAL</span>
      </div>

      {/* ═══════ OVERLAYS ═══════ */}

      {/* Board overlay */}
      {sidebarMode==='board' && (
        <div className="ide-board-overlay" onClick={()=>setSidebarMode('files')}>
          <div className="ide-board-shell" onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:10,flexShrink:0,borderBottom:brutal?'3px solid #0f0f0f':'1px solid rgba(255,42,56,.15)'}}>
              <span style={{fontFamily:"'Bangers',sans-serif",fontSize:'1.3rem',letterSpacing:'.1em',color:brutal?'#f2c12e':'#ff2a38'}}>MISSION BOARD</span>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',opacity:.4}}>{board.cards.length} tasks</span>
              <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                <button className="ide-btn ide-btn-sm" onClick={()=>{setNewCardCol(board.cols[0]?.id);setNewCardTitle('')}}>+ TASK</button>
                <button onClick={()=>setSidebarMode('files')} style={{background:'transparent',border:'none',color:'rgba(200,200,220,.4)',cursor:'pointer',fontSize:'1.1rem'}}>✕</button>
              </div>
            </div>
            {/* Columns */}
            <div className="board-cols">
              {board.cols.map(col=>(
                <div key={col.id} className="board-col">
                  <div className="board-col-hdr" style={{color:col.color,borderBottom:brutal?`3px solid ${col.color}`:`1px solid ${col.color}44`}}>
                    <span>{col.title}</span>
                    <span style={{opacity:.5,fontFamily:"'Share Tech Mono',monospace"}}>{board.cards.filter(c=>c.colId===col.id).length}</span>
                  </div>
                  <div className="board-col-cards">
                    {board.cards.filter(c=>c.colId===col.id).map(card=>(
                      <div key={card.id} className="board-card" onClick={()=>setFocusCard(card)}>
                        <div className="board-card-accent" style={{background:PC[card.priority]||'#4a4a6a'}}/>
                        <div className="board-card-title">{card.title}</div>
                        <div className="board-card-meta">
                          <span className="board-priority" style={{background:(PC[card.priority]||'#4a4a6a')+'22',color:PC[card.priority]||'#c0c8d8',fontSize:'10px',fontFamily:"'Oswald',sans-serif",fontWeight:700,letterSpacing:'.08em'}}>{card.priority}</span>
                          {card.tags?.slice(0,2).map(t=><span key={t} className="board-tag" style={{color:'rgba(200,200,220,.5)',borderColor:'rgba(255,255,255,.08)',fontFamily:"'Share Tech Mono',monospace",fontSize:'10px',padding:'1px 4px'}}>{t}</span>)}
                        </div>
                        {card.progress>0 && (
                          <div className="board-progress">
                            <div className="board-progress-bar" style={{width:card.progress+'%',background:PC[card.priority]||'#10b981'}}/>
                          </div>
                        )}
                      </div>
                    ))}
                    {newCardCol===col.id ? (
                      <div style={{padding:'5px'}}>
                        <input value={newCardTitle} onChange={e=>setNewCardTitle(e.target.value)} placeholder="Task title..."
                          onKeyDown={e=>{if(e.key==='Enter')addCard(col.id);if(e.key==='Escape')setNewCardCol(null)}}
                          autoFocus style={{width:'100%',background:'transparent',border:brutal?'2px solid #0f0f0f':'1px solid rgba(255,42,56,.2)',outline:'none',color:brutal?'#0f0f0f':'#c0c8d8',fontFamily:"'Share Tech Mono',monospace",fontSize:'12px',padding:'5px 7px'}}/>
                      </div>
                    ) : (
                      <div className="board-add-card" onClick={()=>{setNewCardCol(col.id);setNewCardTitle('')}}>+ ADD TASK</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Card detail */}
      {focusCard && (
        <div className="board-card-detail-overlay" onClick={()=>setFocusCard(null)}>
          <div className="board-card-detail-box" onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <div style={{width:8,height:8,background:PC[focusCard.priority]||'#4a4a6a',borderRadius:brutal?0:'50%'}}/>
              <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'11px',color:PC[focusCard.priority],letterSpacing:'.1em'}}>{focusCard.priority}</span>
              <button onClick={()=>setFocusCard(null)} style={{marginLeft:'auto',background:'transparent',border:'none',cursor:'pointer',color:'rgba(200,200,220,.35)',fontSize:'1rem'}}>✕</button>
            </div>
            <div style={{fontFamily:"'Bangers',sans-serif",fontSize:'1.1rem',letterSpacing:'.06em',marginBottom:8,color:brutal?'#0f0f0f':'#f4f0e8'}}>{focusCard.title}</div>
            {focusCard.due && <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'11px',opacity:.5,marginBottom:8}}>DUE {focusCard.due}</div>}
            {focusCard.progress>0 && (
              <div style={{marginBottom:10}}>
                <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'11px',letterSpacing:'.12em',opacity:.4,marginBottom:4}}>PROGRESS</div>
                <div style={{height:4,background:'rgba(128,128,128,.15)',borderRadius:2}}>
                  <div style={{width:focusCard.progress+'%',height:'100%',background:PC[focusCard.priority]||'#10b981',borderRadius:2,transition:'width .3s'}}/>
                </div>
              </div>
            )}
            {/* Move to col */}
            <div>
              <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'11px',letterSpacing:'.12em',opacity:.4,marginBottom:5}}>MOVE TO</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                {board.cols.map(col=>(
                  <button key={col.id} onClick={()=>{moveCard(focusCard.id,col.id);setFocusCard(null)}}
                    className="ide-btn ide-btn-sm" style={{color:col.color,borderColor:col.color+'44'}}>
                    {col.title}
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:'flex',gap:5,marginTop:10}}>
              <button className="ide-btn ide-btn-sm" style={{color:'#ff435a'}} onClick={()=>deleteCard(focusCard.id)}>DELETE</button>
            </div>
          </div>
        </div>
      )}

      {/* Group editor */}
      {openGroupId && openGroup && (
        <GroupEditor
          group={openGroup}
          nodes={nodesRef.current}
          onClose={()=>setOpenGroupId(null)}
          onOpenNode={id=>{setOpenGroupId(null);openNodeInEditor(id)}}
        />
      )}

      {/* Command palette */}
      <CommandPalette isOpen={showCmd} onClose={()=>{setShowCmd(false);setCmdPreviewPalette(null)}} onAction={handleCmdAction} previewPalette={cmdPreviewPalette} onPreviewPalette={p=>{setCmdPreviewPalette(p);if(p)setGlobalEditorPalette(p)}}/>

      {/* File finder (Ctrl+P) */}
      <FileFinderModal isOpen={showFileFinder} onClose={()=>setShowFileFinder(false)} onOpenFile={handleOpenWorkspaceFile} rootPath={explorerRoot} recentFiles={recentFiles}/>

      {/* Jump to line (Ctrl+G) */}
      <JumpToLineModal isOpen={showJumpLine} onClose={()=>setShowJumpLine(false)} onJump={line=>setJumpLineTarget(line)} maxLine={activeTabNode?.code?.split('\n').length||9999}/>

      {/* ── KEYBOARD SHORTCUTS OVERLAY ── */}
      {showShortcuts && (
        <div style={{position:'fixed',inset:0,zIndex:95000,background:'rgba(0,0,0,.6)',backdropFilter:'blur(4px)',display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'60px'}}
          onClick={()=>setShowShortcuts(false)}>
          <div style={{background:brutal?'#f0ece0':'#0d0d1a',border:`1px solid ${brutal?'#0f0f0f':'rgba(255,196,16,.25)'}`,
            width:'min(780px,96vw)',maxHeight:'80vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,.7)'}}
            onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',padding:'10px 16px',borderBottom:`1px solid ${brutal?'#0f0f0f':'rgba(255,255,255,.07)'}`,flexShrink:0}}>
              <span style={{fontFamily:"'Bangers',sans-serif",fontSize:'1.3rem',letterSpacing:'.12em',color:brutal?'#0f0f0f':'#ffc410'}}>KEYBOARD SHORTCUTS</span>
              <span style={{marginLeft:10,fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:'rgba(200,200,220,.3)'}}>Ctrl+? to toggle · Esc to close</span>
              <button onClick={()=>setShowShortcuts(false)} style={{marginLeft:'auto',background:'transparent',border:'none',color:'rgba(200,200,220,.4)',cursor:'pointer',fontSize:'1.1rem',lineHeight:1}}>✕</button>
            </div>
            {/* Grid of sections */}
            <div style={{overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,.07) transparent',padding:'12px 16px',
              display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'12px 20px'}}>
              {([
                { group:'NAVIGATION', color:'#4285f4', items:[
                  ['Ctrl+P',        'Quick open file'],
                  ['Ctrl+G',        'Go to line'],
                  ['Ctrl+Shift+F',  'Search in files'],
                  ['Ctrl+Shift+O',  'File outline'],
                  ['Ctrl+B',        'Toggle sidebar'],
                ]},
                { group:'EDITOR', color:'#10b981', items:[
                  ['Ctrl+S',        'Save file'],
                  ['Ctrl+/',        'Toggle comment'],
                  ['Ctrl+F',        'Find in file'],
                  ['Ctrl+Enter',    'Run file'],
                  ['Ctrl+Z',        'Undo'],
                  ['Ctrl+Shift+Z',  'Redo'],
                ]},
                { group:'PANELS & VIEW', color:'#ffc410', items:[
                  ['Ctrl+Shift+P',  'Command palette'],
                  ['Ctrl+Shift+Z',  'Zen / focus mode'],
                  ['Ctrl+?',        'Shortcuts cheatsheet'],
                  ['`  (backtick)', 'Toggle terminal'],
                  ['Ctrl+Shift+E',  'Explorer sidebar'],
                ]},
                { group:'AI', color:'#bb9af7', items:[
                  ['Sidebar ✦ icon','Open AI chat'],
                  ['⚙ in AI panel', 'Change provider/key'],
                  ['✦ AI in git',   'Generate commit msg'],
                  ['Settings panel','Manage API keys'],
                ]},
                { group:'SPLIT EDITOR', color:'#89ddff', items:[
                  ['⬓ tab button',  'Split/unsplit editor'],
                  ['Cmd palette',   'Split vertical'],
                  ['Cmd palette',   'Split horizontal'],
                  ['✕ in split',    'Close split pane'],
                ]},
                { group:'GIT', color:'#ff435a', items:[
                  ['Git panel',     'Stage / unstage files'],
                  ['Ctrl+Enter',    'Commit (in msg box)'],
                  ['✦ AI button',   'Generate commit msg'],
                  ['Push / Pull',   'Sync with remote'],
                ]},
                { group:'GRAPH CANVAS', color:'#f2c12e', items:[
                  ['N',             'New node'],
                  ['J',             'Join / edge mode'],
                  ['X',             'Cut edge mode'],
                  ['Scroll',        'Zoom in/out'],
                  ['Drag node',     'Move node'],
                  ['Drag canvas',   'Pan view'],
                ]},
                { group:'TERMINAL', color:'#28f1c3', items:[
                  ['Any command',   'Full PTY shell'],
                  ['New tab +',     'Open another terminal'],
                  ['Clear button',  'Clear terminal output'],
                  ['⚙ palette btn', 'Change terminal theme'],
                ]},
              ] as {group:string,color:string,items:[string,string][]}[]).map(sec=>(
                <div key={sec.group}>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'9px',letterSpacing:'.14em',
                    color:sec.color,marginBottom:6,paddingBottom:3,borderBottom:`1px solid ${sec.color}33`}}>{sec.group}</div>
                  {sec.items.map(([key,label])=>(
                    <div key={key+label} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',
                        background:brutal?'rgba(0,0,0,.08)':'rgba(255,255,255,.06)',
                        border:`1px solid ${brutal?'rgba(0,0,0,.15)':'rgba(255,255,255,.1)'}`,
                        padding:'1px 5px',color:brutal?'#0f0f0f':'#c0c8d8',flexShrink:0,whiteSpace:'nowrap'}}>{key}</span>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'9px',color:brutal?'rgba(15,15,15,.55)':'rgba(200,200,220,.5)',lineHeight:1.3}}>{label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create node modal — redesigned */}
      {showCreateNode && (() => {
        const EXT_MAP: Record<string,string> = { entry:'.js', function:'.js', class:'.ts', module:'.ts', doc:'.md' }
        const LANG_ICONS: Record<string,string> = { entry:'⬡', function:'ƒ', class:'◇', module:'⬡', doc:'⌗' }
        const acc = ACCENTS[newNodeColor]
        const suggestedExt = (() => {
          const n = newNodeName.trim()
          if (n.includes('.')) return ''
          return EXT_MAP[newNodeType] || '.js'
        })()
        const previewName = newNodeName.trim() ? newNodeName.trim() + (newNodeName.includes('.') ? '' : suggestedExt) : 'untitled' + suggestedExt
        return (
          <div className="ide-overlay" onClick={()=>setShowCreateNode(false)}>
            <div className="ide-modal" onClick={e=>e.stopPropagation()} style={{width:380,maxWidth:'90vw'}}>
              {/* Header */}
              <div className="ide-modal-hdr" style={{borderBottom:`1px solid ${acc}22`}}>
                <span className="ide-modal-title" style={{color:acc}}>NEW NODE</span>
                <button onClick={()=>setShowCreateNode(false)} style={{background:'transparent',border:'none',color:'rgba(200,200,220,.3)',cursor:'pointer',fontSize:'1rem',lineHeight:1}}>✕</button>
              </div>
              <div className="ide-modal-body" style={{gap:14}}>

                {/* File name + live preview */}
                <div>
                  <div className="ide-modal-label">FILE NAME</div>
                  <div style={{position:'relative'}}>
                    <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:'13px',opacity:.5,pointerEvents:'none',color:acc}}>{LANG_ICONS[newNodeType]||'ƒ'}</span>
                    <input className="ide-modal-input" value={newNodeName} onChange={e=>setNewNodeName(e.target.value)}
                      placeholder={`my_${newNodeType}`} autoFocus
                      style={{paddingLeft:28}}
                      onKeyDown={e=>{if(e.key==='Enter')handleCreateNode();if(e.key==='Escape')setShowCreateNode(false)}}/>
                  </div>
                  <div style={{marginTop:4,fontSize:'9px',fontFamily:"'JetBrains Mono',monospace",opacity:.4,paddingLeft:2,color:acc}}>
                    → {previewName}
                  </div>
                </div>

                {/* Type selector */}
                <div>
                  <div className="ide-modal-label">TYPE</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5}}>
                    {[
                      {t:'entry',    desc:'App entry point'},
                      {t:'function', desc:'JS/TS function'},
                      {t:'class',    desc:'Class / struct'},
                      {t:'module',   desc:'Module / lib'},
                      {t:'doc',      desc:'Markdown notes'},
                    ].map(({t,desc})=>(
                      <button key={t} onClick={()=>setNewNodeType(t)}
                        style={{padding:'7px 6px',border:`1px solid ${newNodeType===t?acc:brutal?'rgba(0,0,0,.2)':'rgba(255,255,255,.1)'}`,background:newNodeType===t?acc+'18':'transparent',cursor:'pointer',
                          display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'all .12s',borderRadius:brutal?0:3,
                          color:newNodeType===t?acc:brutal?'#0f0f0f':'rgba(200,200,220,.7)'}}>
                        <span style={{fontSize:'13px',lineHeight:1}}>{LANG_ICONS[t]}</span>
                        <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'8px',letterSpacing:'.12em'}}>{t.toUpperCase()}</span>
                        <span style={{fontSize:'7px',opacity:.5,fontFamily:"'Share Tech Mono',monospace"}}>{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent color */}
                <div>
                  <div className="ide-modal-label">ACCENT</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {ACCENTS.map((c,i)=>(
                      <div key={i} onClick={()=>setNewNodeColor(i)} title={c}
                        style={{width:20,height:20,background:c,cursor:'pointer',
                          outline:`2px solid ${newNodeColor===i?'#fff':'transparent'}`,outlineOffset:2,
                          borderRadius:brutal?0:4,transition:'all .1s',
                          transform:newNodeColor===i?'scale(1.2)':'scale(1)'}}/>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{display:'flex',gap:7,paddingTop:4,borderTop:`1px solid ${brutal?'rgba(0,0,0,.1)':'rgba(255,255,255,.06)'}`}}>
                  <button className="ide-btn primary" style={{flex:1,background:acc,borderColor:acc,color:'#000'}} onClick={handleCreateNode}>
                    CREATE
                  </button>
                  <button className="ide-btn" onClick={()=>setShowCreateNode(false)}>CANCEL</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Create group modal */}
      {showCreateGroup && (
        <div className="ide-overlay" onClick={()=>setShowCreateGroup(false)}>
          <div className="ide-modal" onClick={e=>e.stopPropagation()}>
            <div className="ide-modal-hdr">
              <span className="ide-modal-title">NEW CLASS</span>
              <button onClick={()=>setShowCreateGroup(false)} style={{background:'transparent',border:'none',color:'rgba(200,200,220,.4)',cursor:'pointer',fontSize:'1.1rem'}}>✕</button>
            </div>
            <div className="ide-modal-body">
              <div>
                <div className="ide-modal-label">CLASS NAME</div>
                <input className="ide-modal-input" value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="MyClass" autoFocus/>
              </div>
              <div>
                <div className="ide-modal-label">COLOR</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {ACCENTS.slice(0,8).map((c)=>(
                    <div key={c} onClick={()=>setGroupColor(c)}
                      style={{width:18,height:18,background:c,cursor:'pointer',border:`2px solid ${groupColor===c?'#fff':'transparent'}`,borderRadius:brutal?0:'50%'}}/>
                  ))}
                </div>
              </div>
              <div>
                <div className="ide-modal-label">SELECT METHODS (min 2)</div>
                <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:160,overflowY:'auto'}}>
                  {nodesRef.current.map(n=>(
                    <div key={n.id} onClick={()=>setGroupSelected(s=>s.includes(n.id)?s.filter(id=>id!==n.id):[...s,n.id])}
                      style={{display:'flex',alignItems:'center',gap:7,padding:'4px 8px',cursor:'pointer',border:`1px solid ${groupSelected.includes(n.id)?groupColor:'rgba(255,255,255,.08)'}`,background:groupSelected.includes(n.id)?groupColor+'12':'transparent',transition:'all .12s'}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:groupSelected.includes(n.id)?groupColor:'rgba(200,200,220,.25)'}}/>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:'12px'}}>{n.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display:'flex',gap:7}}>
                <button className="ide-btn primary" style={{flex:1}} onClick={handleCreateGroup} disabled={!groupName.trim()||groupSelected.length<2}>CREATE</button>
                <button className="ide-btn" onClick={()=>setShowCreateGroup(false)}>CANCEL</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Node color picker (portal) */}
      {nodeColorPicker && (
        <>
          <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setNodeColorPicker(null)}/>
          <div className="ide-color-picker" style={{top:nodeColorPicker.y,left:nodeColorPicker.x}}>
            {ACCENTS.map((c,i)=>(
              <div key={i} className={`ide-color-swatch ${nodesRef.current.find(n=>n.id===nodeColorPicker.nodeId)?.themeIdx===i?'selected':''}`}
                style={{background:c,borderRadius:brutal?0:'50%'}}
                onClick={()=>handleChangeNodeColor(nodeColorPicker.nodeId,i)}/>
            ))}
          </div>
        </>
      )}


      {/* ── NODE CONTEXT MENU ── */}
      {nodeCtxMenu && (() => {
        const node = nodesRef.current.find(n=>n.id===nodeCtxMenu.nodeId)
        if (!node) { setNodeCtxMenu(null); return null }
        const accent = ACCENTS[node.themeIdx%ACCENTS.length]
        const items = [
          { label:'Open in Editor', icon:'✏', action:()=>{ openNodeInEditor(node.id); setNodeCtxMenu(null) } },
          { label:`Run (${langLabel(detectLang(node.label))})`, icon:'▶', action:()=>{ handleRunNode(node.id); setNodeCtxMenu(null) }, show: (() => { const l=detectLang(node.label); return l!=='md'&&l!=='unknown' })() },
          { sep:true },
          { label:'Rename',         icon:'Aa', action:()=>{ const name=prompt('Rename node:',node.label); if(name?.trim()){const n2=nodesRef.current.find(x=>x.id===node.id);if(n2){n2.label=name.trim();forceRender({})}} setNodeCtxMenu(null) } },
          { label:'Change Color',   icon:'◉', action:()=>{ const rect={left:nodeCtxMenu.x,bottom:nodeCtxMenu.y}; setNodeColorPicker({nodeId:node.id,x:nodeCtxMenu.x,y:nodeCtxMenu.y}); setNodeCtxMenu(null) } },
          { label:'Duplicate',      icon:'⊕', action:()=>{
              const copy={...node,id:'n'+Date.now(),x:node.x+80,y:node.y+80,label:node.label+'_copy',modified:false}
              nodesRef.current=[...nodesRef.current,copy]
              addEvent('node-create',`Duplicated ${node.label}`)
              forceRender({}); openNodeInEditor(copy.id); setNodeCtxMenu(null)
          }},
          { label:node.isMain?'Unset Main':'Set as Main', icon:'★', action:()=>{
              nodesRef.current=nodesRef.current.map(n=>({...n,isMain:n.id===node.id?!n.isMain:false}))
              forceRender({}); setNodeCtxMenu(null)
          }},
          { sep:true },
          { label:'Delete Node',    icon:'⊖', danger:true, action:()=>{ handleDeleteNode(node.id); setNodeCtxMenu(null) } },
        ].filter(it => it.sep || it.show !== false)

        return (
          <>
            <div style={{position:'fixed',inset:0,zIndex:9996}} onContextMenu={e=>e.preventDefault()} onClick={()=>setNodeCtxMenu(null)}/>
            <div style={{
              position:'fixed', left:nodeCtxMenu.x, top:nodeCtxMenu.y, zIndex:9997,
              background:brutal?'#0f0f0f':'rgba(6,6,20,.98)',
              border:brutal?`2px solid ${accent}`:`1px solid ${accent}44`,
              boxShadow:`0 8px 40px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.04)`,
              borderRadius:brutal?0:4, minWidth:180, overflow:'hidden',
              fontFamily:"'Share Tech Mono',monospace",
            }}>
              {/* Header */}
              <div style={{padding:'7px 10px',borderBottom:`1px solid ${accent}33`,
                background:`linear-gradient(90deg,${accent}18,transparent)`,display:'flex',gap:6,alignItems:'center'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:accent,flexShrink:0}}/>
                <span style={{fontSize:'10px',fontWeight:700,fontFamily:"'Oswald',sans-serif",
                  letterSpacing:'.1em',color:accent,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {node.label}
                </span>
                <span style={{fontSize:'8px',opacity:.4,marginLeft:'auto',flexShrink:0}}>{node.type.toUpperCase()}</span>
              </div>
              {/* Items */}
              {items.map((it,i) => it.sep
                ? <div key={i} style={{height:1,background:'rgba(255,255,255,.06)',margin:'2px 0'}}/>
                : (
                  <div key={i} onClick={it.action} style={{
                    display:'flex',alignItems:'center',gap:8,padding:'7px 12px',cursor:'pointer',
                    color:it.danger?'#ff435a':brutal?'#f0ece0':'#c0c8d8',fontSize:'11px',
                    transition:'background .1s',
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background=it.danger?'rgba(255,67,90,.12)':'rgba(255,255,255,.06)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{width:14,textAlign:'center',opacity:.7,fontSize:'12px'}}>{it.icon}</span>
                    {it.label}
                  </div>
                )
              )}
            </div>
          </>
        )
      })()}

      {/* Term palette close */}
      {showTermPalette && <div style={{position:'fixed',inset:0,zIndex:97}} onClick={()=>setShowTermPalette(false)}/>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════

export default function IDEPage() {
  return <IDE initialTheme="cyber" initialAvatar={0}/>
}
