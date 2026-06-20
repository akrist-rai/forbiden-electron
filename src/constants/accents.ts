export const ACCENTS = [
  '#10b981','#ff435a','#ffc410','#4285f4','#28f1c3','#bb9af7',
  '#ff1650','#5ccfe6','#ffbd5e','#e36209','#72f1b8','#ff8080',
  '#89ddff','#e5c07b','#4ec9b0','#c792ea',
]

export const TL_TRACKS = [
  { key:'create', types:['node-create'],         label:'CREATE', color:'#10b981', icon:'⊕' },
  { key:'edit',   types:['code-edit'],            label:'EDIT',   color:'#ffc410', icon:'✏' },
  { key:'run',    types:['run-ok','run-err'],     label:'RUN',    color:'#4285f4', icon:'▶' },
  { key:'edge',   types:['edge-add','edge-del'],  label:'EDGE',   color:'#bb9af7', icon:'⇢' },
  { key:'import', types:['import','group'],       label:'IMPORT', color:'#c792ea', icon:'⬆' },
  { key:'commit', types:['commit'],               label:'COMMIT', color:'#ff2a38', icon:'◆' },
  { key:'sys',    types:['system','node-delete'], label:'SYSTEM', color:'#607080', icon:'⚡' },
]

export const TL_COL: Record<string, string> = {
  'node-create':'#10b981','node-delete':'#ff435a','code-edit':'#ffc410',
  'edge-add':'#4285f4','edge-del':'#bb9af7','run-ok':'#10b981','run-err':'#ff435a',
  'import':'#c792ea','group':'#c792ea','commit':'#ff2a38','system':'#607080',
}
