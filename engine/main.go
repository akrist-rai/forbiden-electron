package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/gorilla/websocket"
)

// ── Shared helpers ─────────────────────────────────────────────

var skipDirs = map[string]bool{
	"node_modules": true, ".git": true, "dist": true, "build": true,
	".next": true, "__pycache__": true, ".venv": true, "venv": true,
	".cache": true, "coverage": true, "target": true, "out": true, "vendor": true,
}

func shouldIgnore(name string) bool {
	return skipDirs[name] || (len(name) > 0 && name[0] == '.')
}

func jsonResp(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// decodeJSON decodes r.Body into v; writes a 400 and returns false on error.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		http.Error(w, "bad request: "+err.Error(), http.StatusBadRequest)
		return false
	}
	return true
}

// ── PTY session registry ───────────────────────────────────────

type PTYSession struct {
	ptmx     ptyHandle
	mu       sync.Mutex
	lastUsed time.Time
}

var (
	ptyMu sync.RWMutex
	ptys  = map[string]*PTYSession{}

	wsUpgrader = websocket.Upgrader{
		ReadBufferSize:  8192,
		WriteBufferSize: 8192,
		CheckOrigin:     func(_ *http.Request) bool { return true },
	}
)

// startPTYIdleReaper periodically evicts PTY sessions idle for >30 minutes.
func startPTYIdleReaper() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			cutoff := time.Now().Add(-30 * time.Minute)
			ptyMu.Lock()
			for id, sess := range ptys {
				if sess.lastUsed.Before(cutoff) {
					delete(ptys, id)
				}
			}
			ptyMu.Unlock()
		}
	}()
}

func extendedPath() string {
	home, _ := os.UserHomeDir()
	extras := []string{
		"/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin",
		"/snap/bin", "/opt/homebrew/bin", "/opt/homebrew/sbin",
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, "go", "bin"),
		filepath.Join(home, ".cargo", "bin"),
		filepath.Join(home, ".bun", "bin"),
	}
	existing := strings.Split(os.Getenv("PATH"), string(os.PathListSeparator))
	seen := map[string]bool{}
	result := []string{}
	for _, p := range append(existing, extras...) {
		if p != "" && !seen[p] {
			seen[p] = true
			result = append(result, p)
		}
	}
	return strings.Join(result, string(os.PathListSeparator))
}

// ── WebSocket PTY ──────────────────────────────────────────────

func handleWsPTY(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	id := q.Get("id")
	cols, rows := 80, 24
	cwd, _ := os.UserHomeDir()

	if v := q.Get("cols"); v != "" {
		fmt.Sscan(v, &cols)
	}
	if v := q.Get("rows"); v != "" {
		fmt.Sscan(v, &rows)
	}
	if v := q.Get("cwd"); v != "" {
		if _, err := os.Stat(v); err == nil {
			cwd = v
		}
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	env := append(os.Environ(), "PATH="+extendedPath(), "TERM=xterm-256color", "COLORTERM=truecolor")
	ptmx, cleanup, err := startTerminal(cols, rows, cwd, env)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("\x1b[31mFailed to start PTY: "+err.Error()+"\x1b[0m\r\n"))
		return
	}
	defer cleanup()

	if id != "" {
		ptyMu.Lock()
		ptys[id] = &PTYSession{ptmx: ptmx}
		ptyMu.Unlock()
		defer func() {
			ptyMu.Lock()
			delete(ptys, id)
			ptyMu.Unlock()
		}()
	}

	var wsMu sync.Mutex

	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				wsMu.Lock()
				conn.WriteMessage(websocket.BinaryMessage, buf[:n])
				wsMu.Unlock()
			}
			if err != nil {
				break
			}
		}
		wsMu.Lock()
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"exit"}`))
		wsMu.Unlock()
	}()

	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if mt == websocket.TextMessage {
			var ctrl struct {
				Type string `json:"type"`
				Cols int    `json:"cols"`
				Rows int    `json:"rows"`
				Data string `json:"data"`
			}
			if json.Unmarshal(data, &ctrl) == nil && ctrl.Type != "" {
				switch ctrl.Type {
				case "resize":
					ptmx.Resize(ctrl.Cols, ctrl.Rows)
					continue
				case "input":
					ptmx.WriteString(ctrl.Data)
					continue
				}
			}
		}
		ptmx.Write(data)
	}
}

// ── PTY write ──────────────────────────────────────────────────

func handlePtyWrite(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID   string `json:"id"`
		Text string `json:"text"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	ptyMu.RLock()
	sess := ptys[req.ID]
	ptyMu.RUnlock()
	if sess == nil {
		jsonResp(w, map[string]any{"success": false, "error": "session not found"})
		return
	}
	sess.mu.Lock()
	sess.ptmx.WriteString(req.Text)
	sess.lastUsed = time.Now()
	sess.mu.Unlock()
	jsonResp(w, map[string]any{"success": true})
}

// ── Run inject (save to temp file, inject run command into PTY) ─

func handleRun(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PtyID string `json:"ptyId"`
		Lang  string `json:"lang"`
		Code  string `json:"code"`
		Cwd   string `json:"cwd"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	ptyMu.RLock()
	sess := ptys[req.PtyID]
	ptyMu.RUnlock()
	if sess == nil {
		jsonResp(w, map[string]any{"success": false, "error": "no active terminal"})
		return
	}

	extMap := map[string]string{
		"js": "js", "jsx": "jsx", "ts": "ts", "tsx": "tsx",
		"py": "py", "go": "go", "c": "c", "cpp": "cpp",
	}
	ext := extMap[req.Lang]
	if ext == "" {
		// Unknown lang — fall back to pasting the code directly
		sess.mu.Lock()
		sess.ptmx.WriteString(strings.TrimSpace(req.Code) + "\n")
		sess.mu.Unlock()
		jsonResp(w, map[string]any{"success": true})
		return
	}

	tmp, err := os.CreateTemp("", fmt.Sprintf("forbiden_run_*.%s", ext))
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	tmpPath := tmp.Name()
	tmp.WriteString(req.Code)
	tmp.Close()

	cmdStr := buildRunCmd(req.Lang, tmpPath)
	if cmdStr == "" {
		os.Remove(tmpPath)
		jsonResp(w, map[string]any{"success": false, "error": "unsupported language: " + req.Lang})
		return
	}

	// Append cleanup so temp file is removed after execution
	cleanup := fmt.Sprintf("; rm -f %s", tmpPath)
	if req.Lang == "c" || req.Lang == "cpp" {
		outFile := strings.TrimSuffix(tmpPath, filepath.Ext(tmpPath)) + ".out"
		cleanup = fmt.Sprintf("; rm -f %s %s", tmpPath, outFile)
	}

	fullCmd := cmdStr + cleanup
	if req.Cwd != "" {
		fullCmd = fmt.Sprintf("cd %s && %s", filepath.Clean(req.Cwd), fullCmd)
	}

	sess.mu.Lock()
	sess.ptmx.WriteString(fullCmd + "\n")
	sess.mu.Unlock()
	jsonResp(w, map[string]any{"success": true})
}

// ── File watcher WebSocket ─────────────────────────────────────

func handleWsWatch(w http.ResponseWriter, r *http.Request) {
	root := r.URL.Query().Get("root")
	if root == "" {
		http.Error(w, "root param required", 400)
		return
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return
	}
	defer watcher.Close()

	filepath.WalkDir(root, func(path string, d os.DirEntry, _ error) error {
		if d == nil {
			return nil
		}
		if d.IsDir() {
			if skipDirs[d.Name()] {
				return filepath.SkipDir
			}
			watcher.Add(path)
		}
		return nil
	})

	var (
		debounce *time.Timer
		mu       sync.Mutex
	)

	closed := make(chan struct{})
	go func() {
		defer close(closed)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	notify := func() {
		data, _ := json.Marshal(map[string]string{"type": "change"})
		conn.WriteMessage(websocket.TextMessage, data)
	}

	for {
		select {
		case <-closed:
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if event.Has(fsnotify.Chmod) {
				continue
			}
			if event.Has(fsnotify.Create) {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					watcher.Add(event.Name)
				}
			}
			mu.Lock()
			if debounce != nil {
				debounce.Stop()
			}
			debounce = time.AfterFunc(80*time.Millisecond, notify)
			mu.Unlock()
		case _, ok := <-watcher.Errors:
			if !ok {
				return
			}
		}
	}
}

// ── CORS middleware ────────────────────────────────────────────

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func findPort(start int) int {
	for p := start; p < start+200; p++ {
		l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			l.Close()
			return p
		}
	}
	return start
}

func main() {
	os.Setenv("PATH", extendedPath())
	startPTYIdleReaper()
	port := findPort(49373)

	mux := http.NewServeMux()

	// Status
	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		jsonResp(w, map[string]any{"ok": true, "pid": os.Getpid()})
	})

	// PTY + file watch (WebSocket)
	mux.HandleFunc("/ws/pty", handleWsPTY)
	mux.HandleFunc("/ws/watch", handleWsWatch)
	mux.HandleFunc("/api/pty/write", handlePtyWrite)
	mux.HandleFunc("/api/run", handleRun)

	// Filesystem
	mux.HandleFunc("/api/fs/tree", handleFsTree)
	mux.HandleFunc("/api/fs/read", handleFsRead)
	mux.HandleFunc("/api/fs/write", handleFsWrite)
	mux.HandleFunc("/api/fs/create-file", handleFsCreateFile)
	mux.HandleFunc("/api/fs/create-dir", handleFsCreateDir)
	mux.HandleFunc("/api/fs/delete", handleFsDelete)
	mux.HandleFunc("/api/fs/rename", handleFsRename)
	mux.HandleFunc("/api/fs/copy-file", handleFsCopyFile)
	mux.HandleFunc("/api/fs/copy-folder", handleFsCopyFolder)
	mux.HandleFunc("/api/fs/list-all", handleFsListAll)
	mux.HandleFunc("/api/fs/search", handleFsSearch)
	mux.HandleFunc("/api/fs/scan-imports", handleFsScanImports)
	mux.HandleFunc("/api/fs/get-scripts", handleFsGetScripts)
	mux.HandleFunc("/api/fs/format", handleFsFormat)

	// Git
	mux.HandleFunc("/api/git/status", handleGitStatus)
	mux.HandleFunc("/api/git/log", handleGitLog)
	mux.HandleFunc("/api/git/log-graph", handleGitLogGraph)
	mux.HandleFunc("/api/git/branch", handleGitBranch)
	mux.HandleFunc("/api/git/branches", handleGitBranches)
	mux.HandleFunc("/api/git/commit", handleGitCommit)
	mux.HandleFunc("/api/git/stage", handleGitStage)
	mux.HandleFunc("/api/git/unstage", handleGitUnstage)
	mux.HandleFunc("/api/git/checkout", handleGitCheckout)
	mux.HandleFunc("/api/git/push", handleGitPush)
	mux.HandleFunc("/api/git/pull", handleGitPull)
	mux.HandleFunc("/api/git/stash", handleGitStash)
	mux.HandleFunc("/api/git/stash-pop", handleGitStashPop)
	mux.HandleFunc("/api/git/init", handleGitInit)
	mux.HandleFunc("/api/git/discard", handleGitDiscard)
	mux.HandleFunc("/api/git/diff", handleGitDiff)
	mux.HandleFunc("/api/git/blame", handleGitBlame)
	mux.HandleFunc("/api/git/stash-list", handleGitStashList)
	mux.HandleFunc("/api/git/create-branch", handleGitCreateBranch)
	mux.HandleFunc("/api/git/delete-branch", handleGitDeleteBranch)
	mux.HandleFunc("/api/git/fetch", handleGitFetch)
	mux.HandleFunc("/api/git/remote-list", handleGitRemoteList)
	mux.HandleFunc("/api/git/reset-soft", handleGitResetSoft)
	mux.HandleFunc("/api/git/ahead-behind", handleGitAheadBehind)

	// Code execution
	mux.HandleFunc("/api/code/run", handleCodeRun)

	// AI
	mux.HandleFunc("/api/ai/chat", handleAiChat)
	mux.HandleFunc("/api/ai/stream", handleAiStream)
	mux.HandleFunc("/api/ai/ollama-models", handleOllamaModels)

	// Workspace
	mux.HandleFunc("/api/workspace/get", handleWorkspaceGet)
	mux.HandleFunc("/api/workspace/save", handleWorkspaceSave)
	mux.HandleFunc("/api/workspace/recent-get", handleWorkspaceRecentGet)
	mux.HandleFunc("/api/workspace/recent-add", handleWorkspaceRecentAdd)
	mux.HandleFunc("/api/workspace/ensure-default", handleWorkspaceEnsureDefault)

	// Terminal
	mux.HandleFunc("/api/terminal/exec", handleTerminalExec)

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	server := &http.Server{
		Handler:           cors(mux),
		ReadTimeout:       120 * time.Second,
		WriteTimeout:      120 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Bind the port FIRST so it is accepting connections before we signal ready.
	// This eliminates the race where the frontend calls /api/status before the
	// engine's ListenAndServe has had a chance to bind.
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("READY:%d\n", port)
	os.Stdout.Sync()

	if err := server.Serve(listener); err != nil {
		log.Fatal(err)
	}
}
