import { useState, useRef, useEffect } from 'react'
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
  anthropic: 'claude-haiku-4-5-20251001', openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash', openrouter: 'openai/gpt-4o-mini', ollama: 'llama3',
}

function renderAiMessage(text: string) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_,code) =>
      `<pre style="background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.08);padding:8px 10px;margin:6px 0;overflow-x:auto;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.5;color:#c0c8d8">${code.trim()}</pre>`)
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,.08);padding:1px 4px;font-family:\'JetBrains Mono\',monospace;font-size:11px">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

interface Message { role: string; content: string }

interface Props {
  activeNode: { label: string; code: string } | null
  explorerRoot: string | null
  onOpenSettings: () => void
}

export default function AiChatPanel({ activeNode, explorerRoot, onOpenSettings }: Props) {
  const brutal     = useUIStore(s => s.themeMode === 'brutal')
  const aiProvider = useAiStore(s => s.aiProvider)
  const aiKeys     = useAiStore(s => s.aiKeys)
  const aiModels   = useAiStore(s => s.aiModels)

  const [messages, setMessages]       = useState<Message[]>([])
  const [input, setInput]             = useState('')
  const [streaming, setStreaming]     = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [includeFile, setIncludeFile] = useState(true)
  const endRef  = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streaming, streamingText])

  const activeKey  = aiProvider === 'ollama' ? (aiKeys['ollama'] || 'http://localhost:11434') : (aiKeys[aiProvider] || '')
  const activeModel = aiModels[aiProvider] || DEFAULT_MODELS[aiProvider] || ''
  const hasKey     = aiProvider === 'ollama' || !!activeKey
  const provColor  = PROVIDER_COLORS[aiProvider] || '#bb9af7'
  const text       = brutal ? '#0f0f0f' : '#c0c8d8'
  const dimText    = brutal ? 'rgba(15,15,15,.4)' : 'rgba(200,200,220,.4)'

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
      ? `You are an expert programmer assistant. The user has this file open:\n\nFilename: ${activeNode.label}\n\`\`\`\n${activeNode.code.slice(0, 8000)}\n\`\`\`\n\nBe concise, code-focused, and practical.`
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
              {m.role==='user' ? 'YOU' : '✦ AI'}
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
            <input type="checkbox" checked={includeFile} onChange={e => setIncludeFile(e.target.checked)} style={{width:10,height:10}}/>
            include file
          </label>
          {(messages.length > 0 || streaming) && (
            <button onClick={() => { cancel(); setMessages([]); setStreamingText('') }}
              style={{marginLeft:'auto',background:'transparent',border:'none',color:dimText,cursor:'pointer',fontFamily:"'Share Tech Mono',monospace",fontSize:'9px'}}>
              clear
            </button>
          )}
        </div>
        <div style={{display:'flex',gap:5}}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask about your code… (Enter to send, Shift+Enter newline)"
            rows={2}
            disabled={streaming}
            style={{flex:1,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',outline:'none',color:text,fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',padding:'5px 7px',resize:'none',lineHeight:1.4,opacity:streaming?.6:1}}
            onFocus={e => (e.target.style.borderColor = provColor + '66')}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,.08)')}/>
          {streaming ? (
            <button onClick={cancel}
              style={{background:'rgba(255,67,90,.12)',border:'1px solid rgba(255,67,90,.4)',
                color:'#ff435a',fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:'10px',
                letterSpacing:'.08em',padding:'0 10px',cursor:'pointer',transition:'all .12s'}}>
              ■
            </button>
          ) : (
            <button onClick={send} disabled={!input.trim() || !hasKey}
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
