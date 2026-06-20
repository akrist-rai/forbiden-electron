import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TermPalette } from './types'

export interface TermLine {
  c: string
  t: string
}

export interface JsLog {
  type: 'header' | 'info' | 'log' | 'warn' | 'error' | 'result'
  val: string
  ts: number
}

// Default FORBINDEN terminal palette — matches TERM_PALETTES[1] in IDE
const DEFAULT_TERM_PALETTE: TermPalette = {
  id: 'forbinden',
  name: 'FORBINDEN',
  bg: '#080810',
  text: '#c0c8d8',
  prompt: '#10b981',
  dim: '#3e3e5a',
  error: '#ff435a',
  warn: '#ffc410',
  info: '#28f1c3',
  border: '#1a1a2c',
  cursor: '#10b981',
  selection: 'rgba(16,185,129,0.15)',
}

interface TerminalState {
  termCwd: string
  termLines: TermLine[]
  termInput: string
  termPalette: TermPalette
  showTermPalette: boolean
  activePtyId: string | null
  // REPL / JS console
  jsLogs: JsLog[]
  replInput: string
  replHistory: string[]
  replHistIdx: number
  compileStdin: string
  // Markdown preview
  mdPreviewMode: string
  mdFontSize: number
  // Actions
  setTermCwd: (cwd: string) => void
  appendTermLine: (line: TermLine) => void
  setTermLines: (lines: TermLine[]) => void
  setTermInput: (input: string) => void
  setTermPalette: (palette: TermPalette) => void
  setShowTermPalette: (show: boolean) => void
  setActivePtyId: (id: string | null) => void
  appendJsLog: (log: JsLog) => void
  setJsLogs: (logs: JsLog[]) => void
  setReplInput: (input: string) => void
  pushReplHistory: (cmd: string) => void
  setReplHistIdx: (idx: number) => void
  setCompileStdin: (stdin: string) => void
  setMdPreviewMode: (mode: string) => void
  setMdFontSize: (size: number) => void
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set) => ({
      termCwd: '~',
      termLines: [{ c: '#28f1c3', t: '[FORBIDEN] System boot v2.1.0 — Electron' }],
      termInput: '',
      termPalette: DEFAULT_TERM_PALETTE,
      showTermPalette: false,
      activePtyId: null,
      jsLogs: [
        { type: 'header', val: '// FORBIDEN JS Runtime ready', ts: Date.now() },
        { type: 'info', val: '// Use ▶ on any node or type JS in the REPL below', ts: Date.now() },
      ],
      replInput: '',
      replHistory: [],
      replHistIdx: -1,
      compileStdin: '',
      mdPreviewMode: 'preview',
      mdFontSize: 16,

      setTermCwd: (cwd) => set({ termCwd: cwd }),
      appendTermLine: (line) =>
        set((s) => ({ termLines: [...s.termLines.slice(-500), line] })),
      setTermLines: (lines) => set({ termLines: lines }),
      setTermInput: (input) => set({ termInput: input }),
      setTermPalette: (palette) => set({ termPalette: palette }),
      setShowTermPalette: (show) => set({ showTermPalette: show }),
      setActivePtyId: (id) => set({ activePtyId: id }),
      appendJsLog: (log) =>
        set((s) => ({ jsLogs: [...s.jsLogs.slice(-499), log] })),
      setJsLogs: (logs) => set({ jsLogs: logs }),
      setReplInput: (input) => set({ replInput: input }),
      pushReplHistory: (cmd) =>
        set((s) => ({
          replHistory: [cmd, ...s.replHistory.slice(0, 99)],
          replHistIdx: -1,
        })),
      setReplHistIdx: (idx) => set({ replHistIdx: idx }),
      setCompileStdin: (stdin) => set({ compileStdin: stdin }),
      setMdPreviewMode: (mode) => set({ mdPreviewMode: mode }),
      setMdFontSize: (size) => set({ mdFontSize: size }),
    }),
    {
      name: 'forbiden-terminal-v1',
      partialize: (s) => ({ termPalette: s.termPalette }),
    }
  )
)
