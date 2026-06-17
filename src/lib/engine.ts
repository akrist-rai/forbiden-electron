// ══════════════════════════════════════════════════════════════
//  FORBIDEN ENGINE  — core language-aware processing
//  Supports: js, ts, py, c, cpp, go
//  Compiled languages (c/cpp/go) execute via Wandbox API
// ══════════════════════════════════════════════════════════════

export type Lang = 'js' | 'ts' | 'py' | 'c' | 'cpp' | 'go' | 'md' | 'unknown'

export interface RunResult {
  logs: Array<{ type: string; val: string; ts: number }>
  error: Error | null
  ms: number
}

// ── Language Detection ─────────────────────────────────────────
export function detectLang(filename: string): Lang {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  const map: Record<string, Lang> = {
    js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
    ts: 'ts', tsx: 'ts',
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
    js: 'JavaScript', ts: 'TypeScript', py: 'Python',
    c: 'C', cpp: 'C++', go: 'Go', md: 'Markdown', unknown: 'Text',
  }
  return m[lang]
}

export function isCompiled(lang: Lang): boolean {
  return lang === 'c' || lang === 'cpp' || lang === 'go'
}

// ── Symbol Extraction ──────────────────────────────────────────
export function extractSymbols(code: string, lang: Lang): string[] {
  const syms: string[] = []

  if (lang === 'js' || lang === 'ts') {
    for (const m of code.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^(?:export\s+)?class\s+(\w+)/gm)) syms.push(m[1])
    for (const m of code.matchAll(/^(?:export\s+)?(?:interface|type)\s+(\w+)/gm)) syms.push(m[1])
  }

  if (lang === 'py') {
    for (const m of code.matchAll(/^(?:async\s+)?def\s+([a-zA-Z_]\w*)/gm))
      if (!m[1].startsWith('_')) syms.push(m[1])
    for (const m of code.matchAll(/^class\s+([A-Za-z_]\w*)/gm)) syms.push(m[1])
    // Module-level assignments
    for (const m of code.matchAll(/^([A-Z_][A-Z0-9_]{2,})\s*=/gm)) syms.push(m[1])
  }

  if (lang === 'c' || lang === 'cpp') {
    // Named functions at top level (not static local)
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
    case 'js': case 'ts':
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

  if (lang === 'js' || lang === 'ts') {
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
        `#include <stdio.h>`,
        `#include <stdlib.h>`,
        ``,
        `typedef struct ${name} {`,
        `    int id;`,
        `    char name[64];`,
        `} ${name};`,
        ``,
        `${name}* ${name}_create(int id, const char* n) {`,
        `    ${name}* self = malloc(sizeof(${name}));`,
        `    self->id = id;`,
        `    snprintf(self->name, 64, "%s", n);`,
        `    return self;`,
        `}`,
        ``,
        `void ${name}_print(const ${name}* self) {`,
        `    printf("${name}[%d]: %s\\n", self->id, self->name);`,
        `}`,
        ``,
        `void ${name}_free(${name}* self) { free(self); }`,
        ``,
        `int main(void) {`,
        `    ${name}* obj = ${name}_create(1, "test");`,
        `    ${name}_print(obj);`,
        `    ${name}_free(obj);`,
        `    return 0;`,
        `}`,
      ].join('\n')
    }
    return [
      `#include <stdio.h>`,
      `#include <stdlib.h>`,
      ``,
      `/* ${name} — functions */`,
      ``,
      `void ${name}_run(void) {`,
      `    printf("${name}: running\\n");`,
      `}`,
      ``,
      `int main(void) {`,
      `    ${name}_run();`,
      `    return 0;`,
      `}`,
    ].join('\n')
  }

  if (lang === 'cpp') {
    if (nodeType === 'class') {
      return [
        `#include <iostream>`,
        `#include <string>`,
        ``,
        `class ${name} {`,
        `public:`,
        `    ${name}(int id, const std::string& name)`,
        `        : id_(id), name_(name) {}`,
        ``,
        `    void print() const {`,
        `        std::cout << "${name}[" << id_ << "]: " << name_ << std::endl;`,
        `    }`,
        ``,
        `    int id() const { return id_; }`,
        `    const std::string& name() const { return name_; }`,
        ``,
        `private:`,
        `    int id_;`,
        `    std::string name_;`,
        `};`,
        ``,
        `int main() {`,
        `    ${name} obj(1, "test");`,
        `    obj.print();`,
        `    return 0;`,
        `}`,
      ].join('\n')
    }
    return [
      `#include <iostream>`,
      `#include <string>`,
      ``,
      `// ${name}`,
      ``,
      `void ${name}_run() {`,
      `    std::cout << "${name}: running" << std::endl;`,
      `}`,
      ``,
      `int main() {`,
      `    ${name}_run();`,
      `    return 0;`,
      `}`,
    ].join('\n')
  }

  if (lang === 'go') {
    if (nodeType === 'class') {
      const cap = name.charAt(0).toUpperCase() + name.slice(1)
      return [
        `package main`,
        ``,
        `import "fmt"`,
        ``,
        `// ${cap} — struct with methods`,
        `type ${cap} struct {`,
        `\tID   int`,
        `\tName string`,
        `}`,
        ``,
        `func New${cap}(id int, name string) *${cap} {`,
        `\treturn &${cap}{ID: id, Name: name}`,
        `}`,
        ``,
        `func (s *${cap}) Print() {`,
        `\tfmt.Printf("${cap}[%d]: %s\\n", s.ID, s.Name)`,
        `}`,
        ``,
        `func (s *${cap}) String() string {`,
        `\treturn fmt.Sprintf("${cap}(%d, %s)", s.ID, s.Name)`,
        `}`,
        ``,
        `func main() {`,
        `\tobj := New${cap}(1, "test")`,
        `\tobj.Print()`,
        `}`,
      ].join('\n')
    }
    return [
      `package main`,
      ``,
      `import "fmt"`,
      ``,
      `func ${name}Run() {`,
      `\tfmt.Println("${name}: running")`,
      `}`,
      ``,
      `func main() {`,
      `\t${name}Run()`,
      `}`,
    ].join('\n')
  }

  return ''
}

// ── Native execution via Electron IPC ────────────────────────
// Falls back to Wandbox when running in a browser (non-Electron).

async function nativeRun(lang: 'c' | 'cpp' | 'go' | 'py', code: string, stdin = ''): Promise<RunResult> {
  const api = (window as any).electronAPI
  if (!api?.run?.code) return wandboxFallback(lang, code, stdin)

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

export function runC(code: string, stdin = ''): Promise<RunResult> {
  return nativeRun('c', code, stdin)
}

export function runCpp(code: string, stdin = ''): Promise<RunResult> {
  return nativeRun('cpp', code, stdin)
}

export function runGo(code: string, stdin = ''): Promise<RunResult> {
  return nativeRun('go', code, stdin)
}

export function runPyNative(code: string, stdin = ''): Promise<RunResult> {
  return nativeRun('py', code, stdin)
}

// ── Wandbox fallback (web / no local toolchain) ───────────────
const WANDBOX = 'https://wandbox.org/api/compile.json'

async function wandboxFallback(
  lang: 'c' | 'cpp' | 'go' | 'py',
  code: string,
  stdin = '',
): Promise<RunResult> {
  const cfgMap: Record<string, { compiler: string; options: string; label: string }> = {
    c:   { compiler: 'gcc-head',  options: '-O0 -std=c11 -lm -Wall', label: 'gcc · C11'    },
    cpp: { compiler: 'gcc-head',  options: '-O0 -std=c++17 -Wall',    label: 'g++ · C++17'  },
    go:  { compiler: 'go-head',   options: '',                         label: 'go'           },
    py:  { compiler: 'cpython-3.12.0', options: '',                   label: 'python 3.12'  },
  }
  const cfg = cfgMap[lang]
  const t0 = performance.now()
  const logs: RunResult['logs'] = []
  const ts = () => Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 20000)

  try {
    const resp = await fetch(WANDBOX, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compiler: cfg.compiler, code, options: cfg.options, stdin, save: false }),
      signal: ctl.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) throw new Error(`Wandbox HTTP ${resp.status}`)

    const data: any = await resp.json()
    const compErr = (data.compiler_error  || '').trim()
    const compOut = (data.compiler_output || '').trim()
    const progOut = (data.program_output  || '').trim()
    const progErr = (data.program_error   || '').trim()

    logs.push({ type: 'compile-sep', val: `── ${cfg.label} (wandbox) ──`, ts: ts() })
    if (compOut) compOut.split('\n').filter(Boolean).forEach((l: string) => logs.push({ type: 'compile-warn', val: l, ts: ts() }))
    if (compErr) {
      compErr.split('\n').filter(Boolean).forEach((l: string) => logs.push({ type: 'compile-err', val: l, ts: ts() }))
      return { logs, error: new Error(compErr.split('\n')[0]), ms: Math.round(performance.now() - t0) }
    }
    logs.push({ type: 'compile-ok', val: `✓ compiled in ${Math.round(performance.now() - t0)}ms`, ts: ts() })
    if (progOut || progErr) {
      logs.push({ type: 'run-sep', val: '── output ──', ts: ts() })
      progOut.split('\n').filter(Boolean).forEach((l: string) => logs.push({ type: 'log',     val: l, ts: ts() }))
      progErr.split('\n').filter(Boolean).forEach((l: string) => logs.push({ type: 'run-err', val: l, ts: ts() }))
    }
    const exitCode = data.status ?? 0
    logs.push({ type: exitCode === 0 ? 'return' : 'run-err', val: `exit: ${exitCode}`, ts: ts() })
    return { logs, error: exitCode !== 0 ? new Error(`exit ${exitCode}`) : null, ms: Math.round(performance.now() - t0) }
  } catch (e: any) {
    clearTimeout(timer)
    const msg    = String(e?.message ?? e)
    const isTout = e?.name === 'AbortError'
    logs.push({ type: 'compile-err', val: isTout ? 'timed out after 20s' : `error: ${msg}`, ts: ts() })
    logs.push({ type: 'info',        val: 'wandbox.org requires internet · install toolchain for offline use', ts: ts() })
    return { logs, error: e instanceof Error ? e : new Error(msg), ms: Math.round(performance.now() - t0) }
  }
}
