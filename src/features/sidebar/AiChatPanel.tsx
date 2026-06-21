import { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useAiStore } from '../../stores/aiStore'
import { api } from '../../lib/api'

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#bb9af7', openai: '#10b981', gemini: '#4285f4', openrouter: '#ffc410', ollama: '#89ddff',
}
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini', openrouter: 'OpenRouter', ollama: 'Ollama',
}
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001', openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash',
  openrouter: 'openai/gpt-4o-mini', ollama: 'llama3',
}
const MAX_CONTEXT = 8000

function renderAiMessage(text: string) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
      `<pre><button class="ac-copy-btn">⎘</button>${code.trim()}</pre>`)
    .replace(/`([^`]+)`/g, '<code class="ac-inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

interface Message { role: string; content: string }

interface Props {
  activeNode: { label: string; code: string } | null
  explorerRoot: string | null
  onOpenSettings: () => void
}

export default function AiChatPanel({ activeNode, explorerRoot: _explorerRoot, onOpenSettings }: Props) {
  const brutal      = useUIStore(s => s.themeMode === 'brutal')
  const aiProvider  = useAiStore(s => s.aiProvider)
  const aiKeys      = useAiStore(s => s.aiKeys)
  const aiModels    = useAiStore(s => s.aiModels)

  const [messages, setMessages]           = useState<Message[]>([])
  const [input, setInput]                 = useState('')
  const [streaming, setStreaming]         = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [includeFile, setIncludeFile]     = useState(true)
  const endRef   = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streaming, streamingText])

  const activeKey   = aiProvider === 'ollama' ? (aiKeys['ollama'] || 'http://localhost:11434') : (aiKeys[aiProvider] || '')
  const activeModel = aiModels[aiProvider] || DEFAULT_MODELS[aiProvider] || ''
  const hasKey      = aiProvider === 'ollama' || !!activeKey
  const provColor   = PROVIDER_COLORS[aiProvider] || '#bb9af7'
  const textColor   = brutal ? '#0f0f0f' : '#c0c8d8'
  const dimColor    = brutal ? 'rgba(15,15,15,.4)' : 'rgba(200,200,220,.4)'
  const contextChars = includeFile && activeNode?.code
    ? Math.min(activeNode.code.length, MAX_CONTEXT) : 0

  // Handle copy-button clicks inside dangerouslySetInnerHTML
  const handleMessagesClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const btn = (e.target as HTMLElement).closest('.ac-copy-btn') as HTMLElement | null
    if (!btn) return
    const pre = btn.closest('pre')
    if (!pre) return
    const code = Array.from(pre.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent ?? '')
      .join('')
      .trimStart()
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = '✓'
      btn.classList.add('copied')
      setTimeout(() => { btn.textContent = '⎘'; btn.classList.remove('copied') }, 1500)
    })
  }, [])

  const send = async () => {
    const q = input.trim()
    if (!q || streaming) return
    setInput('')

    const userMsg: Message = { role: 'user', content: q }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setStreaming(true)
    setStreamingText('')

    const system = includeFile && activeNode?.code
      ? `You are an expert programmer assistant. The user has this file open:\n\nFilename: ${activeNode.label}\n\`\`\`\n${activeNode.code.slice(0, MAX_CONTEXT)}\n\`\`\`\n\nBe concise, code-focused, and practical.`
      : 'You are an expert programmer assistant. Be concise, code-focused, and practical.'

    const streamUrl = api.ai?.streamUrl?.()
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
        body: JSON.stringify({ messages: newMsgs, key: activeKey, model: activeModel, system, provider: aiProvider }),
        signal: ctrl.signal,
      })
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const reader  = resp.body.getReader()
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

  // All dynamic colors injected as CSS custom props on root — no per-element inline styles needed
  const cssVars = {
    '--ac-prov':    provColor,
    '--ac-prov-12': `${provColor}12`,
    '--ac-prov-22': `${provColor}22`,
    '--ac-prov-44': `${provColor}44`,
    '--ac-prov-55': `${provColor}55`,
    '--ac-prov-66': `${provColor}66`,
    '--ac-text':    textColor,
    '--ac-dim':     dimColor,
  } as React.CSSProperties

  return (
    // eslint-disable-next-line react/forbid-dom-props
    <div className="ac-root" style={cssVars}>

      {/* Header */}
      <div className="ac-header">
        <span className="ac-title">✦ AI ASSISTANT</span>
        <span className="ac-model-label">{activeModel}</span>
        <div className="ac-provider-badge">
          {PROVIDER_LABELS[aiProvider] || aiProvider}
        </div>
        <button type="button" className={`ac-settings-btn${hasKey ? '' : ' no-key'}`}
          onClick={onOpenSettings} title="Change provider/key in Settings">⚙</button>
      </div>

      {/* No-key banner */}
      {!hasKey && (
        <div className="ac-no-key">
          NO API KEY SET FOR {(PROVIDER_LABELS[aiProvider] || aiProvider).toUpperCase()}<br/>
          <span className="ac-no-key-hint">Click ⚙ to open Settings › AI Providers</span>
        </div>
      )}

      {/* Messages */}
      <div className="ac-messages" onClick={handleMessagesClick}>
        {messages.length === 0 && (
          <div className="ac-empty">
            ASK ANYTHING ABOUT YOUR CODE<br/>
            <span className="ac-empty-hint">Current file included automatically · toggle below</span>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="ac-msg">
            <div className={`ac-msg-role ${m.role === 'user' ? 'user' : 'ai'}`}>
              {m.role === 'user' ? 'YOU' : '✦ AI'}
            </div>
            <div className="ac-msg-body"
              dangerouslySetInnerHTML={{ __html: renderAiMessage(m.content) }}/>
          </div>
        ))}

        {streaming && (
          <div className="ac-msg">
            <div className="ac-msg-role ai">✦ AI</div>
            {streamingText
              ? <div className="ac-msg-body" dangerouslySetInnerHTML={{ __html: renderAiMessage(streamingText) }}/>
              : <span className="ac-thinking">thinking…</span>
            }
            <span className="ac-blink-cursor"/>
          </div>
        )}
        <div ref={endRef}/>
      </div>

      {/* Footer */}
      <div className="ac-footer">
        <div className="ac-footer-top">
          <label className="ac-include-label">
            <input type="checkbox" checked={includeFile} onChange={e => setIncludeFile(e.target.checked)}/>
            include file
          </label>
          {(messages.length > 0 || streaming) && (
            <button type="button" className="ac-clear-btn"
              onClick={() => { cancel(); setMessages([]); setStreamingText('') }}>
              clear
            </button>
          )}
        </div>

        {includeFile && activeNode && (
          <div className="ac-context-bar">
            {contextChars.toLocaleString()} / {MAX_CONTEXT.toLocaleString()} chars
          </div>
        )}

        <div className="ac-input-row">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask about your code… (Enter to send, Shift+Enter newline)"
            rows={2}
            disabled={streaming}
            className={`ac-textarea${streaming ? ' is-streaming' : ''}`}
          />
          {streaming ? (
            <button type="button" className="ac-cancel-btn" onClick={cancel}>■</button>
          ) : (
            <button type="button" className={`ac-send-btn${!hasKey ? ' disabled' : ''}`}
              onClick={send} disabled={!input.trim() || !hasKey}>
              ▶
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
