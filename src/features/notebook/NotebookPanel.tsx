// @ts-nocheck
import { useState, useRef, useEffect, useCallback } from 'react'
import { renderMd } from '../../lib/renderMd'
import { runByLang } from '../../lib/engine'
import CodeMirrorEditor from '../../components/CodeMirrorEditor'

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
        print(f"[{i}] NO MATCH  \\"{s[:45]}...\\"")
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

const _nbBtnS: any = {
  background:'transparent', border:'1px solid rgba(255,255,255,.1)', cursor:'pointer',
  fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'9px', letterSpacing:'.1em',
  padding:'2px 7px', color:'rgba(200,200,220,.6)', lineHeight:1.6,
}

function _renderCellOutput(output: any[]) {
  return output.map((entry: any, i: number) => {
    const text: string = entry.val || ''
    if (entry.type === 'error') {
      return (
        <div key={i} style={{ color:'#ff6b7a', whiteSpace:'pre-wrap', wordBreak:'break-word',
          borderLeft:'2px solid rgba(255,67,90,.4)', paddingLeft:8, marginBottom:3, lineHeight:1.6 }}>
          {text}
        </div>
      )
    }
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
    const col: any = { log:'#c0c8d8', warn:'#ffc410', error:'#ff435a', info:'#4285f4', return:'#a3e8c4' }[entry.type] || '#c0c8d8'
    return <div key={i} style={{ color:col, whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.6 }}>{text}</div>
  })
}

const NB_LANG_META: any = {
  js:       { color:'#ffc410', bg:'rgba(255,196,16,.08)',  border:'rgba(255,196,16,.25)',  label:'JS',     caret:'#ffc410' },
  python:   { color:'#4fc3f7', bg:'rgba(79,195,247,.08)', border:'rgba(79,195,247,.25)',  label:'PYTHON', caret:'#4fc3f7' },
  markdown: { color:'#ce93d8', bg:'rgba(206,147,216,.08)',border:'rgba(206,147,216,.25)', label:'MD',     caret:'#ce93d8' },
}

function NoteCell({ cell, idx, onRun, onDelete, onCodeChange, onLangChange, onMoveUp, onMoveDown, onDuplicate }: any) {
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

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); onRun() }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.target, s = ta.selectionStart
      onCodeChange(cell.code.slice(0,s) + '  ' + cell.code.slice(ta.selectionEnd))
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2 }, 0)
    }
  }

  const iconBtn = (icon: string, title: string, onClick: any, hoverColor = meta.color) => (
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
          onChange={(e: any) => { e.stopPropagation(); onLangChange(e.target.value) }}
          onClick={(e: any) => e.stopPropagation()}
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

        {iconBtn('↑', 'Move up',   (e: any)=>{e.stopPropagation();onMoveUp()})}
        {iconBtn('↓', 'Move down', (e: any)=>{e.stopPropagation();onMoveDown()})}
        {iconBtn('⧉', 'Duplicate', (e: any)=>{e.stopPropagation();onDuplicate()})}

        <button onClick={(e: any)=>{e.stopPropagation();onRun()}} title="Run (Shift+Enter)"
          style={{ background:meta.bg, border:`1px solid ${meta.border}`, cursor:'pointer',
            color:meta.color, fontSize:'9px', padding:'2px 9px',
            fontFamily:"'Oswald',sans-serif", fontWeight:700, letterSpacing:'.1em',
            transition:'background .12s' }}
          onMouseEnter={e=>(e.currentTarget.style.background=`${meta.color}28`)}
          onMouseLeave={e=>(e.currentTarget.style.background=meta.bg)}>
          ▶ RUN
        </button>

        {iconBtn('×', 'Delete', (e: any)=>{e.stopPropagation();onDelete()}, '#ff435a')}
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        <>
          {cell.lang === 'markdown' ? (
            <div style={{ display:'flex', flexDirection:'column' }}>
              <textarea value={cell.code} onChange={(e: any)=>onCodeChange(e.target.value)}
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
                <button onClick={()=>navigator.clipboard.writeText(cell.output.map((e: any)=>e.val).join('\n')).catch(()=>{})}
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

export default function NotebookPanel() {
  const [cells, setCells]         = useState<any[]>(() => loadNB())
  const [showTemplates, setShowTemplates] = useState(false)
  const execCounterRef = useRef(0)

  useEffect(() => {
    try { localStorage.setItem(NB_LS_KEY, JSON.stringify({ cells })) } catch {}
  }, [cells])

  const runCell = useCallback(async (cellId: string) => {
    const cell = cells.find((c: any) => c.id === cellId)
    if (!cell) return
    if (cell.lang === 'markdown') {
      setCells(cs => cs.map((c: any) => c.id === cellId ? { ...c, output:[], status:'ok' } : c))
      return
    }
    const execCount = ++execCounterRef.current
    const t0 = performance.now()
    setCells(cs => cs.map((c: any) => c.id === cellId ? { ...c, status:'running', output:[], execCount, execMs:null } : c))
    const cellLang = cell.lang === 'python' ? 'py' : cell.lang === 'typescript' ? 'ts' : 'js'
    const result = await runByLang(cellLang, cell.code)
    const ms = Math.round(performance.now() - t0)
    setCells(cs => cs.map((c: any) => c.id === cellId
      ? { ...c, status: result.error ? 'error' : 'ok', output: result.logs, execMs: ms }
      : c))
  }, [cells])

  const runAll = async () => { for (const cell of cells) await runCell(cell.id) }

  const addCell = (lang = 'js', code = '') => {
    const id = 'nb' + Date.now()
    const def = lang === 'python' ? '# Python\n' : lang === 'markdown' ? '## Notes\n\n' : '// JavaScript\n'
    setCells((cs: any) => [...cs, { id, lang, code: code || def, output:[], status:'idle', execCount:null, execMs:null }])
    setShowTemplates(false)
  }

  const moveCell = (idx: number, dir: -1|1) => {
    setCells((cs: any) => {
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

  const emptyArtImg = `${import.meta.env.BASE_URL}manga/0xEP007p.jpeg`

  const tbBtn = (label: string, color: string, onClick: any, extra: any = {}) => (
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

        {tbBtn('+ JS',  '#ffc410', () => addCell('js'))}
        {tbBtn('+ PY',  '#4fc3f7', () => addCell('python'))}
        {tbBtn('+ MD',  '#ce93d8', () => addCell('markdown'))}

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

        {cells.length > 0 && (
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'8px',
            color:'rgba(200,200,220,.2)' }}>{cells.length} cells</span>
        )}

        <div style={{ width:1, height:10, background:'rgba(255,255,255,.08)', margin:'0 3px' }}/>

        {tbBtn('▶ ALL', '#10b981', runAll)}
        <button onClick={() => setCells((cs: any) => cs.map((c: any) => ({ ...c, output:[], status:'idle', execMs:null })))}
          style={{ background:'transparent', border:'none', cursor:'pointer',
            fontFamily:"'Oswald',sans-serif", fontSize:'8px', letterSpacing:'.1em',
            color:'rgba(200,200,220,.25)', padding:'2px 5px', lineHeight:1.8 }}
          onMouseEnter={e=>(e.currentTarget.style.color='rgba(200,200,220,.6)')}
          onMouseLeave={e=>(e.currentTarget.style.color='rgba(200,200,220,.25)')}>CLR</button>
        <button onClick={() => {
          const src = cells.map((c: any) => {
            if (c.lang === 'python')   return `# ── [PYTHON] ──\n${c.code}`
            if (c.lang === 'markdown') return `<!-- [MD] -->\n${c.code}`
            return `// ── [JS] ──\n${c.code}`
          }).join('\n\n')
          const ext = cells.some((c: any) => c.lang === 'python') ? '.py' : '.js'
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
        <div style={{ flex:1, display:'flex', overflow:'hidden', position:'relative' }}>
          <div style={{ width:'42%', flexShrink:0, position:'relative', overflow:'hidden' }}>
            <img src={emptyArtImg} alt="" style={{
              width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top',
              filter:'brightness(.55) saturate(1.3)',
            }}/>
            <div style={{ position:'absolute', inset:0,
              background:'linear-gradient(to right, transparent 50%, #05050f 100%)' }}/>
            <div style={{ position:'absolute', inset:0, opacity:.15,
              backgroundImage:'repeating-linear-gradient(0deg, rgba(0,0,0,.5) 0px, rgba(0,0,0,.5) 1px, transparent 1px, transparent 3px)' }}/>
            <div style={{ position:'absolute', bottom:12, left:12,
              fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:'9px',
              letterSpacing:'.2em', color:'rgba(255,255,255,.35)' }}>
              NOTEBOOK // SESSION
            </div>
          </div>

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
          {cells.map((cell: any, idx: number) => (
            <NoteCell
              key={cell.id} cell={cell} idx={idx}
              onRun={() => runCell(cell.id)}
              onDelete={() => setCells((cs: any) => cs.filter((c: any) => c.id !== cell.id))}
              onCodeChange={(code: string) => setCells((cs: any) => cs.map((c: any) => c.id === cell.id ? { ...c, code } : c))}
              onLangChange={(lang: string) => setCells((cs: any) => cs.map((c: any) => c.id === cell.id ? { ...c, lang, output:[], status:'idle' } : c))}
              onMoveUp={() => moveCell(idx, -1)}
              onMoveDown={() => moveCell(idx, 1)}
              onDuplicate={() => {
                const dup = { ...cell, id:'nb'+Date.now(), output:[], status:'idle' }
                setCells((cs: any) => { const next=[...cs]; next.splice(idx+1,0,dup); return next })
              }}
            />
          ))}
          <div style={{ height:24 }}/>
        </div>
      )}
    </div>
  )
}
