import { create } from 'zustand'

export interface GitFileStatus {
  file?: string
  path?: string
  status: string
}

export interface GitStatus {
  files?: GitFileStatus[]
  modified?: string[]
}

export interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
}

interface GitState {
  gitStatus: GitStatus | null
  gitLog: GitCommit[]
  gitBranch: string
  gitCommitMsg: string
  gitLoading: boolean
  aiCommitLoading: boolean
  // Actions
  setGitStatus: (status: GitStatus | null) => void
  setGitLog: (log: GitCommit[]) => void
  setGitBranch: (branch: string) => void
  setGitCommitMsg: (msg: string) => void
  setGitLoading: (loading: boolean) => void
  setAiCommitLoading: (loading: boolean) => void
  refresh: (cwd: string) => Promise<void>
}

export const useGitStore = create<GitState>()((set) => ({
  gitStatus: null,
  gitLog: [],
  gitBranch: '',
  gitCommitMsg: '',
  gitLoading: false,
  aiCommitLoading: false,

  setGitStatus: (status) => set({ gitStatus: status }),
  setGitLog: (log) => set({ gitLog: log }),
  setGitBranch: (branch) => set({ gitBranch: branch }),
  setGitCommitMsg: (msg) => set({ gitCommitMsg: msg }),
  setGitLoading: (loading) => set({ gitLoading: loading }),
  setAiCommitLoading: (loading) => set({ aiCommitLoading: loading }),

  refresh: async (cwd) => {
    const api = (window as any).electronAPI
    if (!api?.git || !cwd) return
    set({ gitLoading: true })
    try {
      const [status, log, branch] = await Promise.all([
        api.git.status(cwd),
        api.git.log(cwd),
        api.git.branch(cwd),
      ])
      set({ gitStatus: status, gitLog: log, gitBranch: branch })
    } catch {
      // keep previous state on error
    } finally {
      set({ gitLoading: false })
    }
  },
}))
