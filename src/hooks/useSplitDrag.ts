import { useEffect, useRef } from 'react'

interface SplitDragState {
  side: 'editor' | 'sidebar' | 'bottom'
  sx: number
  sy?: number
  startW: number
  startH?: number
}

interface Options {
  setEditorW: (fn: (w: number) => number) => void
  setSidebarW: (fn: (w: number) => number) => void
  setBottomH: (fn: (h: number) => number) => void
}

export function useSplitDrag({ setEditorW, setSidebarW, setBottomH }: Options) {
  const splitDragRef = useRef<SplitDragState | null>(null)
  const tlDragRef = useRef<{ sy: number; startH: number } | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = splitDragRef.current
      if (!d) return
      const dx = e.clientX - d.sx
      if (d.side === 'editor')  setEditorW(w  => Math.max(240, Math.min(window.innerWidth * 0.85, d.startW - dx)))
      if (d.side === 'sidebar') setSidebarW(w => Math.max(160, Math.min(480, d.startW + dx)))
    }
    const onUp = () => {
      splitDragRef.current = null
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [setEditorW, setSidebarW])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = tlDragRef.current
      if (!d) return
      const dy = e.clientY - d.sy
      setBottomH(h => Math.max(120, Math.min(window.innerHeight * 0.65, d.startH - dy)))
    }
    const onUp = () => {
      tlDragRef.current = null
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [setBottomH])

  return { splitDragRef, tlDragRef }
}
