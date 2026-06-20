// ══════════════════════════════════════════════════════════════
//  FORBIDEN ENGINE  — language detection + execution bridge
//  Heavy ops run via Tauri IPC (Rust). PTY injection via Go WS.
// ══════════════════════════════════════════════════════════════
import { api } from './api'

export type Lang = 'js' | 'ts' | 'jsx' | 'tsx' | 'py' | 'c' | 'cpp' | 'go' | 'md' | 'unknown'

export interface RunResult {
  logs: Array<{ type: string; val: string; ts: number }>
  error: Error | null
  ms: number
  retValStr?: string
}

// ── Language Detection ─────────────────────────────────────────
export function detectLang(filename: string): Lang {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  const map: Record<string, Lang> = {
    js: 'js', mjs: 'js', cjs: 'js',
    jsx: 'jsx', ts: 'ts', tsx: 'tsx',
    py: 'py', pyw: 'py',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
    go: 'go', md: 'md', mdx: 'md',
  }
  return map[ext] ?? 'unknown'
}

export function langLabel(lang: Lang): string {
  const m: Record<Lang, string> = {
    js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX',
    py: 'Python', c: 'C', cpp: 'C++', go: 'Go', md: 'Markdown', unknown: 'Text',
  }
  return m[lang]
}

export function isCompiled(lang: Lang): boolean {
  return lang === 'c' || lang === 'cpp' || lang === 'go'
}

// ── Symbol Extraction ──────────────────────────────────────────
export function extractSymbols(code: string, lang: Lang): string[] {
  const syms: string[] = []
  if (lang === 'js' || lang === 'ts' || lang === 'jsx' || lang === 'tsx') {
    for (const m of code.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^(?:export\s+)?class\s+(\w+)/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^(?:export\s+)?(?:interface|type)\s+(\w+)/gm)) syms.push(m[1])
  }
  if (lang === 'py') {
    for (const m of code.matchAll(/^(?:async\s+)?def\s+([a-zA-Z_]\w*)/gm)) if (!m[1].startsWith('_')) syms.push(m[1])
    for (const m of code.matchAll(/^class\s+([A-Za-z_]\w*)/gm)) syms.push(m[1])
  }
  if (lang === 'go') {
    for (const m of code.matchAll(/^func\s+(?:\(\w+\s+\*?\w+\)\s+)?([A-Z]\w*)/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^type\s+([A-Z]\w*)/gm)) syms.push(m[1])
  }
  return [...new Set(syms)].slice(0, 12)
}

// ── Import Generation ──────────────────────────────────────────
export function generateImport(sourceFile: string, targetLang: Lang, symbols: string[]): string | null {
  const base        = sourceFile.replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9_]/g, '_')
  const originalBase = sourceFile.replace(/\.\w+$/, '')
  const topSyms     = symbols.slice(0, 5)
  switch (targetLang) {
    case 'js': case 'ts': case 'jsx': case 'tsx':
      return topSyms.length ? `import { ${topSyms.join(', ')} } from './${sourceFile}'` : `import './${sourceFile}'`
    case 'py':
      return topSyms.length ? `from ${base} import ${topSyms.join(', ')}` : `import ${base}`
    case 'c':   return `#include "${originalBase}.h"`
    case 'cpp': return `#include "${originalBase}.hpp"`
    case 'go':  return `// import "./${originalBase}"  // add to import block`
    default:    return `// depends on: ${sourceFile}`
  }
}

// ── Import Injection ───────────────────────────────────────────
export function injectImport(code: string, importLine: string, lang: Lang): string {
  if (code.includes(importLine)) return code
  const lines = code.split('\n')
  if (lang === 'js' || lang === 'ts' || lang === 'jsx' || lang === 'tsx') {
    let last = -1
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (t.startsWith('import ') || t.startsWith('// import') || t.includes('require(')) last = i
    }
    lines.splice(last + 1, 0, importLine)
  } else if (lang === 'py') {
    let last = -1
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (t.startsWith('import ') || t.startsWith('from ')) last = i
    }
    lines.splice(last + 1, 0, importLine)
  } else {
    lines.unshift(importLine)
  }
  return lines.join('\n')
}

// ── Default Code Templates ─────────────────────────────────────
export function getDefaultCode(lang: Lang, label: string, nodeType = 'function'): string {
  const name = label.replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9_]/g, '_') || 'module'
  if (lang === 'c') {
    return nodeType === 'class'
      ? [`#include <stdio.h>`, `#include <stdlib.h>`, ``,
         `typedef struct ${name} { int id; char name[64]; } ${name};`,
         `void ${name}_print(const ${name}* s) { printf("${name}[%d]: %s\\n", s->id, s->name); }`,
         `int main(void) { ${name} obj = {1, "test"}; ${name}_print(&obj); return 0; }`].join('\n')
      : [`#include <stdio.h>`, `void ${name}_run(void) { printf("${name}: running\\n"); }`,
         `int main(void) { ${name}_run(); return 0; }`].join('\n')
  }
  if (lang === 'cpp') {
    return nodeType === 'class'
      ? [`#include <iostream>`, `#include <string>`, ``,
         `class ${name} {`, `public:`,
         `    ${name}(int id, const std::string& n) : id_(id), name_(n) {}`,
         `    void print() const { std::cout << "${name}[" << id_ << "]: " << name_ << std::endl; }`,
         `private: int id_; std::string name_;`, `};`,
         `int main() { ${name} obj(1, "test"); obj.print(); return 0; }`].join('\n')
      : [`#include <iostream>`, `void ${name}_run() { std::cout << "${name}: running" << std::endl; }`,
         `int main() { ${name}_run(); return 0; }`].join('\n')
  }
  if (lang === 'go') {
    const cap = name.charAt(0).toUpperCase() + name.slice(1)
    return nodeType === 'class'
      ? [`package main`, `import "fmt"`,
         `type ${cap} struct { ID int; Name string }`,
         `func New${cap}(id int, name string) *${cap} { return &${cap}{ID: id, Name: name} }`,
         `func (s *${cap}) Print() { fmt.Printf("${cap}[%d]: %s\\n", s.ID, s.Name) }`,
         `func main() { obj := New${cap}(1, "test"); obj.Print() }`].join('\n')
      : [`package main`, `import "fmt"`,
         `func ${name}Run() { fmt.Println("${name}: running") }`,
         `func main() { ${name}Run() }`].join('\n')
  }
  return ''
}

// ── Run via Tauri native command ─────────────────────────────
import { invoke } from '@tauri-apps/api/core'

async function captureRun(lang: string, code: string, stdin = ''): Promise<RunResult> {
  const t0 = performance.now()
  try {
    const result = await invoke<any>('run_code', {
      lang,
      code,
      stdin: stdin || null,
      cwd: null,
    })
    return {
      logs:  result.logs  ?? [],
      error: result.error ? new Error(result.error) : null,
      ms:    result.ms    ?? Math.round(performance.now() - t0),
    }
  } catch (e: any) {
    return {
      logs:  [{ type: 'error', val: String(e?.message ?? e), ts: Date.now() }],
      error: e instanceof Error ? e : new Error(String(e)),
      ms:    Math.round(performance.now() - t0),
    }
  }
}

// ── Terminal injection (run in attached terminal via PTY write) ──
export async function runInTerminal(
  ptyId: string | null,
  lang: Lang,
  code: string,
  cwd = '',
): Promise<{ success: boolean; error?: string }> {
  if (!ptyId) return { success: false, error: 'No active terminal' }
  try {
    // PTY injection still goes via Go engine (only remaining Go responsibility)
    const result = await api?.pty?.write(ptyId, code + '\n')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: String(e?.message ?? e) }
  }
}

// ── Unified runner — capture mode (for output panel fallback) ──
export function runByLang(lang: Lang, code: string, stdin = ''): Promise<RunResult> {
  switch (lang) {
    case 'js':  case 'jsx': case 'ts': case 'tsx':
    case 'py':  case 'c':   case 'cpp': case 'go':
      return captureRun(lang, code, stdin)
    default:
      return Promise.resolve({
        logs: [{ type: 'error', val: `Cannot run language: ${lang}`, ts: Date.now() }],
        error: new Error(`unsupported: ${lang}`),
        ms: 0,
      })
  }
}
