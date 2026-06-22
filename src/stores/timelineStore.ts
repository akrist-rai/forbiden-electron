import { create } from 'zustand'
import type { TimelineEvent } from './types'

const EVENT_ICONS: Record<string, string> = {
  'node-create': '⊕',
  'node-delete': '⊖',
  'code-edit': '✏',
  'edge-add': '⇢',
  'edge-del': '⇠',
  'run-ok': '✓',
  'run-err': '✗',
  import: '⬆',
  group: '◈',
  commit: '◆',
  system: '⚡',
}

interface TimelineState {
  eventLog: TimelineEvent[]
  playheadPos: number
  activeVersionName: string
  activeVersionIdx: number
  // Actions
  addEvent: (type: string, label: string, meta?: Record<string, unknown>) => void
  clearEvents: () => void
  setPlayheadPos: (pos: number) => void
  setActiveVersionName: (name: string) => void
  setActiveVersionIdx: (idx: number) => void
}

export const useTimelineStore = create<TimelineState>()((set) => ({
  eventLog: [
    { id: Date.now(), type: 'system', label: 'SANCTION IDE started', ts: Date.now(), icon: '⚡' },
  ],
  playheadPos: 400,
  activeVersionName: 'v1.4 (HEAD)',
  activeVersionIdx: 4,

  addEvent: (type, label, meta = {}) =>
    set((s) => ({
      eventLog: [
        {
          id: Date.now() + Math.random(),
          type,
          label,
          ts: Date.now(),
          icon: EVENT_ICONS[type] || '·',
          meta,
        },
        ...s.eventLog,
      ].slice(0, 300),
    })),

  clearEvents: () => set({ eventLog: [] }),
  setPlayheadPos: (pos) => set({ playheadPos: pos }),
  setActiveVersionName: (name) => set({ activeVersionName: name }),
  setActiveVersionIdx: (idx) => set({ activeVersionIdx: idx }),
}))
