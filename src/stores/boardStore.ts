import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { KanbanCol, KanbanCard } from './types'

const INITIAL_COLS: KanbanCol[] = [
  { id: 'c1', title: 'BACKLOG', color: '#4a4a6a' },
  { id: 'c2', title: 'TO DO', color: '#4285f4' },
  { id: 'c3', title: 'IN PROGRESS', color: '#ffc410' },
  { id: 'c4', title: 'REVIEW', color: '#ff435a' },
  { id: 'c5', title: 'DONE', color: '#10b981' },
]

const INITIAL_CARDS: KanbanCard[] = [
  { id: 'k1', colId: 'c3', title: 'Build graph force simulation', priority: 'HIGH', tags: ['core', 'physics'], progress: 70, due: 'Mar 12', assignee: 0 },
  { id: 'k2', colId: 'c2', title: 'WebSocket sync protocol', priority: 'HIGH', tags: ['backend', 'net'], progress: 0, due: 'Mar 18', assignee: 1 },
  { id: 'k3', colId: 'c2', title: 'Class grouping thread UI', priority: 'MED', tags: ['ui', 'graph'], progress: 20, due: 'Mar 15', assignee: 0 },
  { id: 'k5', colId: 'c4', title: 'Syntax highlight engine', priority: 'MED', tags: ['editor', 'parser'], progress: 90, due: 'Mar 10', assignee: 0 },
  { id: 'k6', colId: 'c5', title: 'Babel JSX setup', priority: 'DONE', tags: ['infra'], progress: 100, due: 'Feb 28', assignee: 1 },
  { id: 'k7', colId: 'c5', title: 'Boot sequence modal', priority: 'DONE', tags: ['ui'], progress: 100, due: 'Feb 25', assignee: 0 },
  { id: 'k8', colId: 'c3', title: 'Color palette engine', priority: 'MED', tags: ['editor', 'ui'], progress: 45, due: 'Mar 14', assignee: 2 },
]

interface BoardState {
  cols: KanbanCol[]
  cards: KanbanCard[]
  focusCard: string | null
  newCardCol: string | null
  newCardTitle: string
  // Actions
  addCol: (col: KanbanCol) => void
  updateCol: (id: string, patch: Partial<KanbanCol>) => void
  deleteCol: (id: string) => void
  addCard: (card: KanbanCard) => void
  updateCard: (id: string, patch: Partial<KanbanCard>) => void
  moveCard: (id: string, colId: string) => void
  deleteCard: (id: string) => void
  setFocusCard: (id: string | null) => void
  setNewCardCol: (colId: string | null) => void
  setNewCardTitle: (title: string) => void
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      cols: INITIAL_COLS,
      cards: INITIAL_CARDS,
      focusCard: null,
      newCardCol: null,
      newCardTitle: '',

      addCol: (col) => set((s) => ({ cols: [...s.cols, col] })),
      updateCol: (id, patch) =>
        set((s) => ({ cols: s.cols.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteCol: (id) =>
        set((s) => ({
          cols: s.cols.filter((c) => c.id !== id),
          cards: s.cards.filter((k) => k.colId !== id),
        })),

      addCard: (card) => set((s) => ({ cards: [...s.cards, card] })),
      updateCard: (id, patch) =>
        set((s) => ({ cards: s.cards.map((k) => (k.id === id ? { ...k, ...patch } : k)) })),
      moveCard: (id, colId) =>
        set((s) => ({ cards: s.cards.map((k) => (k.id === id ? { ...k, colId } : k)) })),
      deleteCard: (id) => set((s) => ({ cards: s.cards.filter((k) => k.id !== id) })),

      setFocusCard: (id) => set({ focusCard: id }),
      setNewCardCol: (colId) => set({ newCardCol: colId }),
      setNewCardTitle: (title) => set({ newCardTitle: title }),
    }),
    {
      name: 'sanction-board-v1',
      partialize: (s) => ({ cols: s.cols, cards: s.cards }),
    }
  )
)
