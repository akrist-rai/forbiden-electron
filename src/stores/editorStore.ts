import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Palette, SplitMode } from './types'

type Setter<T> = T | ((prev: T) => T)
const upd = <T>(val: Setter<T>, prev: T): T =>
  typeof val === 'function' ? (val as (p: T) => T)(prev) : val

// Default FORBINDEN palette — matches PALETTES[0] in IDE
const DEFAULT_PALETTE: Palette = {
  id: 'forbinden',
  name: 'FORBINDEN',
  bg: '#0b0b0f',
  base: '#c0c8d8',
  lineNum: '#2e2e42',
  activeLine: 'rgba(255,255,255,0.035)',
  kw: '#ff435a',
  str: '#ffc410',
  cmt: '#3e3e5a',
  num: '#4285f4',
  fn: '#10b981',
  bi: '#28f1c3',
  op: '#6a6a8a',
  swatches: ['#ff435a', '#ffc410', '#10b981', '#28f1c3'],
}

interface EditorState {
  openTabs: string[]
  activeTabId: string | null
  pinnedTabs: string[]
  splitTabId: string | null
  splitMode: SplitMode
  globalEditorPalette: Palette
  formatOnSave: boolean
  jumpLineTarget: number | null
  editorCursorPos: { line: number; col: number } | null
  // Actions
  openTab: (id: string) => void
  closeTab: (id: string) => void
  setActiveTabId: (id: string | null | ((prev: string | null) => string | null)) => void
  setOpenTabsDirect: (tabs: string[]) => void
  togglePinTab: (id: string) => void
  setSplitTabId: (id: string | null) => void
  setSplitMode: (mode: SplitMode) => void
  setGlobalEditorPalette: (palette: Palette) => void
  setFormatOnSave: (value: boolean) => void
  setJumpLineTarget: (line: number | null) => void
  setEditorCursorPos: (pos: { line: number; col: number } | null) => void
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      openTabs: [],
      activeTabId: null,
      pinnedTabs: [],
      splitTabId: null,
      splitMode: 'vertical',
      globalEditorPalette: DEFAULT_PALETTE,
      formatOnSave: false,
      jumpLineTarget: null,
      editorCursorPos: null,

      openTab: (id) =>
        set((s) => ({
          openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
          activeTabId: id,
        })),

      closeTab: (id) =>
        set((s) => {
          const tabs = s.openTabs.filter((t) => t !== id)
          const activeTabId =
            s.activeTabId === id ? (tabs[tabs.length - 1] ?? null) : s.activeTabId
          return {
            openTabs: tabs,
            activeTabId,
            pinnedTabs: s.pinnedTabs.filter((t) => t !== id),
            splitTabId: s.splitTabId === id ? null : s.splitTabId,
          }
        }),

      setActiveTabId: (id) => set((s) => ({ activeTabId: upd(id, s.activeTabId) })),
      setOpenTabsDirect: (tabs) => set({ openTabs: tabs }),

      togglePinTab: (id) =>
        set((s) => ({
          pinnedTabs: s.pinnedTabs.includes(id)
            ? s.pinnedTabs.filter((t) => t !== id)
            : [...s.pinnedTabs, id],
        })),

      setSplitTabId: (id) => set({ splitTabId: id }),
      setSplitMode: (mode) => set({ splitMode: mode }),
      setGlobalEditorPalette: (palette) => set({ globalEditorPalette: palette }),
      setFormatOnSave: (value) => set({ formatOnSave: value }),
      setJumpLineTarget: (line) => set({ jumpLineTarget: line }),
      setEditorCursorPos: (pos) => set({ editorCursorPos: pos }),
    }),
    {
      name: 'forbiden-editor-v1',
      partialize: (s) => ({
        openTabs: s.openTabs,
        activeTabId: s.activeTabId,
        pinnedTabs: s.pinnedTabs,
        globalEditorPalette: s.globalEditorPalette,
        formatOnSave: s.formatOnSave,
      }),
    }
  )
)
