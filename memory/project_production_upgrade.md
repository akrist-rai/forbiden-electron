---
name: project-production-upgrade
description: Production refactor status — Zustand stores, monolith extraction, Go fsnotify, Vite/Electron hardening
metadata:
  type: project
---

Full production upgrade in progress. Plan file: `/home/akrist/.claude/plans/lets-move-into-prodiction-toasty-boot.md`

**Why:** User requested making FORBIDEN lightning fast, reliable, and robust — full latitude given.

**How to apply:** Continue from where we left off — next is extracting CodeEditor, then GraphCanvas/EditorPane extraction.

## Completed

**Phase 1 — Zustand stores** (`src/stores/`): All 9 stores created and type-checked.
- graphStore, editorStore, uiStore, terminalStore, gitStore, aiStore, workspaceStore, boardStore, timelineStore
- uiStore/editorStore: Setter<T> pattern for updater functions
- editorStore: setOpenTabsDirect, setActiveTabId supports updaters

**Phase 2 — All leaf components + sidebar panels extracted** (`src/features/`):
- `features/graph/`: convexHull.ts, MangaNode.tsx (React.memo), GraphMinimap.tsx
- `features/modals/`: CommandPalette.tsx (PALETTES inlined, no previewPalette prop), GroupEditor.tsx, FileFinderModal.tsx, JumpToLineModal.tsx
- `features/sidebar/`: ScriptsPanel.tsx (reads workspaceStore/uiStore directly), AiChatPanel.tsx (reads aiStore/uiStore directly)
- `features/timeline/`: TimelinePanel.tsx
- `features/floating/`: FloatingPanel.tsx (created but FloatingPanel not yet wired in JSX)
- `src/constants/accents.ts`: ACCENTS, TL_TRACKS, TL_COL
- `src/vite-env.d.ts`: adds import.meta.env types

**Phase 2 — Hook extraction** (`src/hooks/`): 5 hooks extracted.
- useSplitDrag, useWorkspaceInit, useKeyboardShortcuts, useMenuEvents, useFileWatcher

**Phase 2 — Zustand wiring**: ALL 8 stores wired into IDE monolith.
- useUIStore, useEditorStore, useWorkspaceStore, useAiStore (session 1)
- useTerminalStore, useGitStore, useBoardStore, useTimelineStore (session 2)
- Compat shims: board={cols,cards}/setBoard, setTermLines (functional updater), setJsLogs, setReplHistory
- addEvent now from timelineStore (old useCallback removed)
- refreshGit kept as local async function (uses gitStore setters)
- cmdPreviewPalette removed — CommandPalette manages preview state internally

**Phase 2 — Monolith shrinkage**:
- Original: 6015 lines, 135 useState calls
- Current: 4859 lines, 24 useState calls
- Eliminated: 1156 lines, 111 useState calls (82% reduction)
- Modules: 107 → 125 (18 new feature modules)

**Phase 4 — Go engine fsnotify**: handleWsWatch replaced with fsnotify. ReadHeaderTimeout: 5s added.

**Phase 5 — Vite + Electron hardening**: 
- vite.config.ts: chunkSizeWarningLimit 600, worker format es, manualChunks vendor-react/codemirror/xterm/zustand
- electron/main.js: CSP, setPermissionRequestHandler, will-navigate guard, security flags

## Pending

**Phase 2 — Wire graphStore**: nodeRunState, edgeDataLabels still as useState (2 calls)

**Phase 2 — Extract remaining inline panels**:
- `NotebookPanel` + `NoteCell` — large, still inline in monolith (~300 lines)
- `CodeEditor` — large, still inline (~300 lines with CodeMirror)
- `WelcomeNodeRow` — small inline component
- Sidebar panel sections (outline, notes, project-search) — still inline JSX in monolith

**Phase 3 — Physics Web Worker**: `src/features/graph/GraphPhysicsWorker.ts` + `useGraphPhysics.ts` hook.
Canvas transform isolation: move transform to ref+DOM during pan, commit to store on pointerUp.

## Key facts
- IDE monolith: `src/pages/IDE/index.tsx`, 4859 lines (was 6015), `// @ts-nocheck` at line 1
- aiStore export: `useAiStore` (lowercase 'i', NOT useAIStore)
- Go engine port: 49373 (default), printed as `READY:<port>` on stdout
- getFileIcon + getFileColor still defined inline in monolith (used at line ~4230 in IDE JSX)
- getMangaImgSrc + getPanelImg + highlightCode still defined in monolith (used in IDE JSX)
- Build: main chunk 295KB, vendor-codemirror 744KB (needs lazy loading), vendor-xterm 385KB
- FileExplorer already manages its own WS for file watching (line 347-356)
- FloatingPanel extracted but not yet wired in IDE JSX (ready for future use)
- ACCENTS/TL_TRACKS/TL_COL still defined in monolith at lines 38-53 (TL_TRACKS/TL_COL can be removed when remaining TimelinePanel usages are cleaned up)
