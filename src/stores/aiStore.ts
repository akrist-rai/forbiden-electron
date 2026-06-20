import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../lib/api'

export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  openrouter: 'openai/gpt-4o-mini',
  ollama: 'llama3',
}

interface AiState {
  aiProvider: string
  aiKeys: Record<string, string>
  aiModels: Record<string, string>
  ollamaModels: string[]
  // Actions
  setAiProvider: (provider: string) => void
  setAiKey: (provider: string, key: string) => void
  setAiModel: (provider: string, model: string) => void
  setOllamaModels: (models: string[]) => void
  fetchOllamaModels: () => Promise<void>
  getActiveKey: () => string
  getActiveModel: () => string
}

export const useAiStore = create<AiState>()(
  persist(
    (set, get) => ({
      aiProvider: 'anthropic',
      aiKeys: {},
      aiModels: {},
      ollamaModels: [],

      setAiProvider: (provider) => set({ aiProvider: provider }),

      setAiKey: (provider, key) =>
        set((s) => ({ aiKeys: { ...s.aiKeys, [provider]: key } })),

      setAiModel: (provider, model) =>
        set((s) => ({ aiModels: { ...s.aiModels, [provider]: model } })),

      setOllamaModels: (models) => set({ ollamaModels: models }),

      fetchOllamaModels: async () => {
        const { aiKeys } = get()
        const host = aiKeys['ollama'] || 'http://localhost:11434'
        const res = await api.ai?.ollamaModels?.(host) as { models?: string[] } | undefined
        if (res?.models?.length) set({ ollamaModels: res.models })
      },

      getActiveKey: () => {
        const { aiProvider, aiKeys } = get()
        return aiProvider === 'ollama'
          ? aiKeys['ollama'] || 'http://localhost:11434'
          : aiKeys[aiProvider] || ''
      },

      getActiveModel: () => {
        const { aiProvider, aiModels } = get()
        return aiModels[aiProvider] || DEFAULT_MODELS[aiProvider] || ''
      },
    }),
    {
      name: 'forbiden-ai-v1',
      partialize: (s) => ({
        aiProvider: s.aiProvider,
        aiKeys: s.aiKeys,
        aiModels: s.aiModels,
      }),
    }
  )
)
