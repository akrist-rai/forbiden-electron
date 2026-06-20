import type { Lang } from './engine'

const PY_KW   = /\b(def|class|import|from|return|if|elif|else|for|while|in|not|and|or|True|False|None|pass|break|continue|try|except|finally|with|as|yield|lambda|self|raise|del|global|nonlocal|assert|async|await)\b/g
const JS_KW   = /\b(function|const|let|var|return|if|else|for|while|in|of|class|import|export|from|default|new|this|true|false|null|undefined|try|catch|finally|async|await|typeof|instanceof|break|continue|switch|case|throw|delete|void|static|extends|super)\b/g
const SYS_KW  = /\b(int|long|short|char|double|float|bool|void|unsigned|signed|struct|enum|union|typedef|public|private|protected|namespace|template|typename|auto|register|volatile|const|extern|static|inline|virtual|override|final|nullptr|printf|scanf|malloc|free|sizeof|NULL)\b/g
const GO_KW   = /\b(func|package|import|return|if|else|for|range|switch|case|default|break|continue|var|const|type|struct|interface|map|chan|go|defer|select|fallthrough|nil|true|false|make|new|len|cap|append|copy|delete|close|panic|recover|error|string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|any|fmt|os|io)\b/g
const BUILTINS = /\b(len|range|type|str|int|float|list|dict|set|tuple|map|filter|zip|enumerate|open|super|object|bool|abs|max|min|sum|sorted|reversed|console|Math|JSON|Array|Object|Promise|setTimeout|clearTimeout|setInterval|parseInt|parseFloat|isNaN|fetch|document|window|print|input|repr|println|Println|Printf|Fprintf|Sprintf)\b/g
const STRINGS  = /("""[\s\S]*?"""|'''[\s\S]*?'''|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g
const COMMENTS = /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/)/gm
const NUMBERS  = /(?<![a-zA-Z_$])\b(0x[\da-fA-F]+|0o[0-7]+|0b[01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b(?![a-zA-Z_])/g
const FUNCS    = /\b([a-zA-Z_$]\w*)(?=\s*\()/g
const PREPROC  = /^(#\s*(?:include|define|ifndef|ifdef|endif|pragma|undef|if|elif|else)\b.*)$/gm

export function highlightCode(code: string, lang: Lang | null = null): string {
  if (!code) return ''
  let html = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const stored: string[] = []
  const ph = (n: number) => '\x00P' + n + '\x01'
  const store = (cls: string, content: string) => {
    stored.push(`<span class="${cls}">${content}</span>`)
    return ph(stored.length - 1)
  }

  html = html.replace(PREPROC,  m  => store('syn-builtin',  m))
  html = html.replace(COMMENTS, m  => store('syn-comment',  m))
  html = html.replace(STRINGS,  m  => store('syn-string',   m))
  html = html.replace(FUNCS,   (_, fn) => store('syn-function', fn))
  if (lang === 'go') {
    html = html.replace(GO_KW, m => store('syn-keyword', m))
  } else {
    html = html.replace(PY_KW,  m => store('syn-keyword', m))
    html = html.replace(JS_KW,  m => store('syn-keyword', m))
    html = html.replace(SYS_KW, m => store('syn-keyword', m))
    html = html.replace(GO_KW,  m => store('syn-keyword', m))
  }
  html = html.replace(BUILTINS, m => store('syn-builtin', m))
  html = html.replace(NUMBERS,  m => store('syn-number',  m))
  return html.replace(/\x00P(\d+)\x01/g, (_, i) => stored[+i])
}
