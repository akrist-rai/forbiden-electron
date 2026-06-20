import { useEffect, useRef } from 'react'
import { api } from '../lib/api'

interface Options {
  explorerRoot: string | null
  onChanged: () => void
}

export function useFileWatcher({ explorerRoot, onChanged }: Options) {
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!explorerRoot) return

    const watchUrl = api?.watch?.wsUrl?.(explorerRoot)
    if (!watchUrl) return

    const ws = new WebSocket(watchUrl)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'change') onChanged()
      } catch {
        onChanged()
      }
    }
    ws.onerror = () => { try { ws.close() } catch {} }

    return () => {
      try { ws.close() } catch {}
      wsRef.current = null
    }
  }, [explorerRoot])
}
