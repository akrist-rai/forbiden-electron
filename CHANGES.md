# FORBIDEN IDE — Change Log

## Phase 1 — 2026-06-19

**Research basis:** Scraped Reddit/HN/GitHub issues + competitive analysis (Zed, Cursor, JetBrains, Helix, Sublime). Top unmet demand: visual git graph (11M abandoned extension), live command palette, recent projects, multi-editor innovations.

---

### 1. Visual Git Commit Graph (`GitPanelV2.tsx`)
- Added CHANGES | HISTORY tab switcher to Git panel
- `CommitGraph` component renders SVG branch lanes with bezier curves
- Lane-assignment algorithm (computeLanes) handles branches and merges
- Colored dots per lane (16-color palette), ring overlay for tagged commits
- Click a dot/row to expand commit detail strip (hash, author, reltime, refs)
- Ref badges: HEAD (red), branch (green), tag (yellow)
- New IPC: `git-log-graph` returns commits with `parents[]`, `refs[]`, author, reltime

### 2. Enhanced Command Palette (`IDE/index.tsx`)
- 40+ commands organized by group (GRAPH, RUN, VIEW, EDIT, FILE, THEME)
- Live theme preview: hovering any theme item instantly applies it to the editor
- Real-time search filtering across command labels and groups
- Group headers separate commands visually
- Color swatch dots shown inline for each theme item
- Escape restores previous theme if previewing
- Action-based dispatch (replaces label-string matching)

### 3. Recent Projects in TitleBar (`TitleBar.tsx`, `main.js`, `preload.js`)
- File > Open Recent shows last 10 opened folders
- Persisted in `recent-workspaces.json` in Electron userData
- Auto-updates when any folder is opened via dialog or custom event
- New IPCs: `fs:getRecentWorkspaces`, `fs:addRecentWorkspace`

---

## Phase 2 — 2026-06-19

**Focus:** Core editing power — navigation, search, focus mode.

### 1. Fuzzy File Finder (`IDE/index.tsx`, `main.js`, `preload.js`)
- `Ctrl+P` opens `FileFinderModal` — fuzzy-searches all files in workspace
- Loads full file list via new IPC `fs:listAllFiles` (walks dir, excludes node_modules/.git/dist etc.)
- Fuzzy match + smart sort: exact name prefix first, then by path length
- Arrow keys navigate, Enter opens, Escape closes
- File icons and colors per language extension
- "⌕ FILES" button added to topbar; also accessible from command palette

### 2. Jump to Line (`IDE/index.tsx`, `CodeMirrorEditor.tsx`)
- `Ctrl+G` opens `JumpToLineModal` with a number input
- `jumpToLine` prop added to `CodeMirrorEditor` — triggers `EditorView.scrollIntoView` centered
- `:N` button added in editor tab toolbar
- Works in both main editor and Zen Mode

### 3. Zen / Focus Mode (`IDE/index.tsx`, `ide.css`)
- `Ctrl+Shift+Z` or "ZEN" button in topbar toggles Zen Mode
- Full-screen editor overlay: hides topbar, sidebar, terminal, icon bar
- Max-width 800px centered — distraction-free writing
- Escape key exits Zen Mode
- Works with all editor themes, line jump, and save

### 4. Project-wide Search (`IDE/index.tsx`, `main.js`, `preload.js`)
- New sidebar panel mode: "SEARCH FILES" (⌕ icon in icon bar, or `Ctrl+Shift+F`)
- Debounced live search via new IPC `fs:searchInFiles` (350ms delay)
- Results grouped by file with match count per file
- Click any result → opens file and jumps to that exact line
- File icons colored by language, line numbers shown per match

### 5. File Outline Panel (`IDE/index.tsx`)
- New sidebar mode: "OUTLINE" (≡ icon, or `Ctrl+Shift+O`)
- Regex-based symbol extraction for JS/TS/Python/Go: functions and classes
- Shows symbol name, type badge (◇ class / ƒ function), and line number
- Click any symbol → jumps to that line in the editor

### 6. New IPCs (`main.js`, `preload.js`)
- `fs:listAllFiles` — recursively lists files, skips ignored dirs
- `fs:searchInFiles` — searches text in all text files, returns {file, line, text, col}
- `git:blame` — parses `git blame --line-porcelain` output (for future use)

### 7. Keyboard Shortcuts Updated
- `Ctrl+P` → File Finder (was: Command Palette)
- `Ctrl+Shift+P` → Command Palette
- `Ctrl+G` → Jump to Line
- `Ctrl+Shift+Z` → Zen Mode toggle
- `Ctrl+Shift+F` → Project Search (opens sidebar)
- `Ctrl+Shift+O` → File Outline (opens sidebar)
- `Ctrl+B` → Toggle Sidebar
