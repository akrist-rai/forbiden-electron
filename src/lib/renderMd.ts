export function renderMd(raw: string): string {
  if (!raw) return ''
  const blocks: string[] = []
  let s = raw.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_: string, _lang: string, code: string) => {
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
  s = s.split(/\n{2,}/).map((p: string) => {
    p = p.trim()
    if (!p) return ''
    if (/^<(h[1-3]|hr|pre|blockquote|li|\x00)/.test(p)) return p
    return `<p class="md-p">${p.replace(/\n/g,'<br/>')}</p>`
  }).join('\n')
  s = s.replace(/(<li(?:\s[^>]*)?>[\s\S]*?<\/li>\n?)+/g, (m: string) => `<ul class="md-ul">${m}</ul>`)
  s = s.replace(/\x00BLK(\d+)\x00/g, (_: string, i: string) => blocks[Number(i)])
  return s
}
