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

// ── PTY session registry ───────────────────────────────────────

type PTYSession struct {
	ptmx ptyHandle
	mu   sync.Mutex
}

var (
	ptyMu sync.RWMutex
	ptys  = map[string]*PTYSession{}

	wsUpgrader = websocket.Upgrader{
		ReadBufferSize:  8192,
		WriteBufferSize: 8192,
		CheckOrigin:     func(_ *http.Request) bool { return true },
	}

	cosApprox func(float64) float64
	sinApprox func(float64) float64
)

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

	if v := q.Get("cols"); v != "" { fmt.Sscan(v, &cols) }
	if v := q.Get("rows"); v != "" { fmt.Sscan(v, &rows) }
	if v := q.Get("cwd"); v != "" {
		if _, err := os.Stat(v); err == nil { cwd = v }
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil { return }
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
			if err != nil { break }
		}
		wsMu.Lock()
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"exit"}`))
		wsMu.Unlock()
	}()

	for {
		mt, data, err := conn.ReadMessage()
		if err != nil { break }
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
	w.Header().Set("Content-Type", "application/json")
	if sess == nil {
		json.NewEncoder(w).Encode(map[string]any{"success": false, "error": "session not found"})
		return
	}
	sess.mu.Lock()
	sess.ptmx.WriteString(req.Text)
	sess.mu.Unlock()
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

// ── Run inject (PTY injection only) ───────────────────────────

func handleRun(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PtyID string `json:"ptyId"`
		Lang  string `json:"lang"`
		Code  string `json:"code"`
		Cwd   string `json:"cwd"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	w.Header().Set("Content-Type", "application/json")
	ptyMu.RLock()
	sess := ptys[req.PtyID]
	ptyMu.RUnlock()
	if sess == nil {
		json.NewEncoder(w).Encode(map[string]any{"success": false, "error": "no active terminal"})
		return
	}
	// Inject the code as a command line
	cmd := strings.TrimSpace(req.Code)
	sess.mu.Lock()
	sess.ptmx.WriteString(cmd + "\n")
	sess.mu.Unlock()
	json.NewEncoder(w).Encode(map[string]any{"success": true, "injected": true})
}

// ── AI streaming SSE proxy ────────────────────────────────────

var watchSkipDirs = map[string]bool{
	"node_modules": true, ".git": true, ".next": true,
	"dist": true, "build": true, "out": true, ".cache": true,
	"__pycache__": true, "target": true, ".venv": true, "venv": true,
}

func handleWsWatch(w http.ResponseWriter, r *http.Request) {
	root := r.URL.Query().Get("root")
	if root == "" { http.Error(w, "root param required", 400); return }

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil { return }
	defer conn.Close()

	watcher, err := fsnotify.NewWatcher()
	if err != nil { return }
	defer watcher.Close()

	filepath.WalkDir(root, func(path string, d os.DirEntry, _ error) error {
		if d == nil { return nil }
		if d.IsDir() {
			if watchSkipDirs[d.Name()] { return filepath.SkipDir }
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
			if _, _, err := conn.ReadMessage(); err != nil { return }
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
			if !ok { return }
			if event.Has(fsnotify.Chmod) { continue }
			if event.Has(fsnotify.Create) {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					watcher.Add(event.Name)
				}
			}
			mu.Lock()
			if debounce != nil { debounce.Stop() }
			debounce = time.AfterFunc(80*time.Millisecond, notify)
			mu.Unlock()
		case _, ok := <-watcher.Errors:
			if !ok { return }
		}
	}
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions { w.WriteHeader(204); return }
		next.ServeHTTP(w, r)
	})
}

func findPort(start int) int {
	for p := start; p < start+200; p++ {
		l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil { l.Close(); return p }
	}
	return start
}

func init() { import_math() }

func main() {
	os.Setenv("PATH", extendedPath())
	port := findPort(49373)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "pid": os.Getpid()})
	})
	mux.HandleFunc("/ws/pty", handleWsPTY)
	mux.HandleFunc("/ws/watch", handleWsWatch)
	mux.HandleFunc("/api/pty/write", handlePtyWrite)
	mux.HandleFunc("/api/run", handleRun)

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	server := &http.Server{
		Addr:              addr,
		Handler:           cors(mux),
		ReadTimeout:       120 * time.Second,
		WriteTimeout:      120 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
	}

	fmt.Printf("READY:%d\n", port)
	os.Stdout.Sync()

	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
