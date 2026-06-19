// ══════════════════════════════════════════════════════════════
//  FORBIDEN ENGINE  — language detection + native execution
//  All languages run via Electron IPC → local toolchain.
//  No external services.
// ══════════════════════════════════════════════════════════════

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
    jsx: 'jsx',
    ts: 'ts',
    tsx: 'tsx',
    py: 'py', pyw: 'py',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
    go: 'go',
    md: 'md', mdx: 'md',
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
    for (const m of code.matchAll(/^(?:async\s+)?def\s+([a-zA-Z_]\w*)/gm))
      if (!m[1].startsWith('_')) syms.push(m[1])
    for (const m of code.matchAll(/^class\s+([A-Za-z_]\w*)/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^([A-Z_][A-Z0-9_]{2,})\s*=/gm)) syms.push(m[1])
  }

  if (lang === 'c' || lang === 'cpp') {
    for (const m of code.matchAll(/^[\w\s\*]+\s+(\w+)\s*\([^;]*\)\s*\{/gm)) {
      const name = m[1]
      if (!['main', 'if', 'for', 'while', 'switch', 'else'].includes(name)) syms.push(name)
    }
    for (const m of code.matchAll(/^(?:struct|class|enum)\s+(\w+)/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^typedef\s+(?:struct|enum)\s*\{[^}]*\}\s*(\w+)/gms)) syms.push(m[1])
  }

  if (lang === 'go') {
    for (const m of code.matchAll(/^func\s+(?:\(\w+\s+\*?\w+\)\s+)?([A-Z]\w*)/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^type\s+([A-Z]\w*)/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^var\s+([A-Z]\w*)/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^const\s+([A-Z]\w*)/gm)) syms.push(m[1])
  }

  return [...new Set(syms)].slice(0, 12)
}

// ── Import Generation ──────────────────────────────────────────
export function generateImport(sourceFile: string, targetLang: Lang, symbols: string[]): string | null {
  const base = sourceFile.replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9_]/g, '_')
  const originalBase = sourceFile.replace(/\.\w+$/, '')
  const topSyms = symbols.slice(0, 5)

  switch (targetLang) {
    case 'js': case 'ts': case 'jsx': case 'tsx':
      return topSyms.length
        ? `import { ${topSyms.join(', ')} } from './${sourceFile}'`
        : `import './${sourceFile}'`
    case 'py':
      return topSyms.length
        ? `from ${base} import ${topSyms.join(', ')}`
        : `import ${base}`
    case 'c':
      return `#include "${originalBase}.h"`
    case 'cpp':
      return `#include "${originalBase}.hpp"`
    case 'go':
      return `// import "./${originalBase}"  // add to import block`
    default:
      return `// depends on: ${sourceFile}`
  }
}

// ── Import Injection ───────────────────────────────────────────
export function injectImport(code: string, importLine: string, lang: Lang): string {
  if (code.includes(importLine.replace(/\/\/ /g, ''))) return code
  if (code.includes(importLine)) return code

  const lines = code.split('\n')

  if (lang === 'js' || lang === 'ts' || lang === 'jsx' || lang === 'tsx') {
    let last = -1
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (t.startsWith('import ') || t.startsWith('// import') || t.includes("require(")) last = i
    }
    lines.splice(last + 1, 0, importLine)
  } else if (lang === 'py') {
    let last = -1
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (t.startsWith('import ') || t.startsWith('from ')) last = i
    }
    lines.splice(last + 1, 0, importLine)
  } else if (lang === 'c' || lang === 'cpp') {
    let last = -1
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (t.startsWith('#include') || t.startsWith('#ifndef') || t.startsWith('#pragma')) last = i
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
    if (nodeType === 'class') {
      return [
        `#include <stdio.h>`, `#include <stdlib.h>`, ``,
        `typedef struct ${name} { int id; char name[64]; } ${name};`,
        ``, `${name}* ${name}_create(int id, const char* n) {`,
        `    ${name}* self = malloc(sizeof(${name}));`,
        `    self->id = id; snprintf(self->name, 64, "%s", n); return self;`,
        `}`,
        `void ${name}_print(const ${name}* self) { printf("${name}[%d]: %s\\n", self->id, self->name); }`,
        `void ${name}_free(${name}* self) { free(self); }`,
        ``, `int main(void) {`,
        `    ${name}* obj = ${name}_create(1, "test");`,
        `    ${name}_print(obj); ${name}_free(obj); return 0;`,
        `}`,
      ].join('\n')
    }
    return [
      `#include <stdio.h>`, `#include <stdlib.h>`, ``,
      `void ${name}_run(void) { printf("${name}: running\\n"); }`,
      ``, `int main(void) { ${name}_run(); return 0; }`,
    ].join('\n')
  }

  if (lang === 'cpp') {
    if (nodeType === 'class') {
      return [
        `#include <iostream>`, `#include <string>`, ``,
        `class ${name} {`, `public:`,
        `    ${name}(int id, const std::string& n) : id_(id), name_(n) {}`,
        `    void print() const { std::cout << "${name}[" << id_ << "]: " << name_ << std::endl; }`,
        `private: int id_; std::string name_;`, `};`,
        ``, `int main() { ${name} obj(1, "test"); obj.print(); return 0; }`,
      ].join('\n')
    }
    return [
      `#include <iostream>`, ``,
      `void ${name}_run() { std::cout << "${name}: running" << std::endl; }`,
      ``, `int main() { ${name}_run(); return 0; }`,
    ].join('\n')
  }

  if (lang === 'go') {
    if (nodeType === 'class') {
      const cap = name.charAt(0).toUpperCase() + name.slice(1)
      return [
        `package main`, ``, `import "fmt"`, ``,
        `type ${cap} struct { ID int; Name string }`,
        ``, `func New${cap}(id int, name string) *${cap} { return &${cap}{ID: id, Name: name} }`,
        `func (s *${cap}) Print() { fmt.Printf("${cap}[%d]: %s\\n", s.ID, s.Name) }`,
        ``, `func main() { obj := New${cap}(1, "test"); obj.Print() }`,
      ].join('\n')
    }
    return [
      `package main`, ``, `import "fmt"`, ``,
      `func ${name}Run() { fmt.Println("${name}: running") }`,
      ``, `func main() { ${name}Run() }`,
    ].join('\n')
  }

  return ''
}

// ── Native execution via Electron IPC ─────────────────────────
async function ipcRun(lang: string, code: string, stdin = ''): Promise<RunResult> {
  const api = (window as any).electronAPI
  if (!api?.run?.code) {
    return {
      logs: [
        { type: 'error', val: 'Native execution requires the Electron app.', ts: Date.now() },
        { type: 'info',  val: 'Run with: npm run electron:dev', ts: Date.now() },
      ],
      error: new Error('Not in Electron'),
      ms: 0,
    }
  }
  const t0 = performance.now()
  try {
    const result = await api.run.code(lang, code, stdin)
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

export const runJS  = (code: string, stdin = '') => ipcRun('js',  code, stdin)
export const runJSX = (code: string, stdin = '') => ipcRun('jsx', code, stdin)
export const runTS  = (code: string, stdin = '') => ipcRun('ts',  code, stdin)
export const runTSX = (code: string, stdin = '') => ipcRun('tsx', code, stdin)
export const runPython = (code: string, stdin = '') => ipcRun('py',  code, stdin)
export const runC   = (code: string, stdin = '') => ipcRun('c',   code, stdin)
export const runCpp = (code: string, stdin = '') => ipcRun('cpp', code, stdin)
export const runGo  = (code: string, stdin = '') => ipcRun('go',  code, stdin)

// Unified runner — dispatches by Lang
export function runByLang(lang: Lang, code: string, stdin = ''): Promise<RunResult> {
  switch (lang) {
    case 'js':  return runJS(code, stdin)
    case 'jsx': return runJSX(code, stdin)
    case 'ts':  return runTS(code, stdin)
    case 'tsx': return runTSX(code, stdin)
    case 'py':  return runPython(code, stdin)
    case 'c':   return runC(code, stdin)
    case 'cpp': return runCpp(code, stdin)
    case 'go':  return runGo(code, stdin)
    default:
      return Promise.resolve({
        logs: [{ type: 'error', val: `Cannot run language: ${lang}`, ts: Date.now() }],
        error: new Error(`unsupported: ${lang}`),
        ms: 0,
      })
  }
}
