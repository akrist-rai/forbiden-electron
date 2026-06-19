package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ─────────────────────────────────────────────────────────────────────────────
//  PTY session registry
// ─────────────────────────────────────────────────────────────────────────────

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
)

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

func ok200(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func errJSON(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func decode(r *http.Request, v any) error {
	return json.NewDecoder(r.Body).Decode(v)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func extendedPath() string {
	home, _ := os.UserHomeDir()
	extras := []string{
		"/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin",
		"/snap/bin",
		"/opt/homebrew/bin", "/opt/homebrew/sbin",
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, "go", "bin"),
		filepath.Join(home, ".cargo", "bin"),
		filepath.Join(home, ".bun", "bin"),
		"/usr/local/go/bin",
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

func lookBin(names ...string) string {
	path := extendedPath()
	for _, name := range names {
		for _, dir := range strings.Split(path, string(os.PathListSeparator)) {
			if dir == "" {
				continue
			}
			candidates := []string{filepath.Join(dir, name)}
			if runtime.GOOS == "windows" {
				candidates = append(candidates, filepath.Join(dir, name+".exe"), filepath.Join(dir, name+".cmd"))
			}
			for _, c := range candidates {
				if info, err := os.Stat(c); err == nil && !info.IsDir() && info.Mode()&0111 != 0 {
					return c
				}
			}
		}
	}
	return ""
}

func configDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".config", "forbiden")
	}
	return filepath.Join(dir, "forbiden")
}

func runGit(args []string, cwd string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "PATH="+extendedPath())
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return strings.TrimSpace(stdout.String()), fmt.Errorf("%s", msg)
	}
	return strings.TrimSpace(stdout.String()), nil
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

// ─────────────────────────────────────────────────────────────────────────────
//  WebSocket PTY handler
// ─────────────────────────────────────────────────────────────────────────────

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

	env := append(os.Environ(),
		"PATH="+extendedPath(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)
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

	// PTY output → WebSocket (binary frames for correct terminal encoding)
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

	// WebSocket → PTY input / resize control
	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if mt == websocket.TextMessage {
			// Try control message first
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
		// Raw terminal input (text or binary)
		ptmx.Write(data)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
//  Filesystem handlers
// ─────────────────────────────────────────────────────────────────────────────

var (
	fsIgnore    = map[string]bool{".git": true, "node_modules": true, ".DS_Store": true, "__pycache__": true, "dist": true, ".next": true, "build": true, "vendor": true, "venv": true, ".venv": true, ".cache": true, "coverage": true, ".parcel-cache": true, "out": true, "release": true, "target": true}
	codeExtScan = map[string]bool{"js": true, "jsx": true, "ts": true, "tsx": true, "mjs": true, "cjs": true, "py": true, "c": true, "cpp": true, "h": true, "hpp": true, "go": true, "vue": true, "svelte": true, "rs": true, "rb": true, "java": true, "kt": true, "swift": true, "cs": true}
)

type FSNode struct {
	Name     string    `json:"name"`
	Path     string    `json:"path"`
	Type     string    `json:"type"`
	Ext      string    `json:"ext,omitempty"`
	Children []*FSNode `json:"children,omitempty"`
}

func buildTree(p string, depth, maxDepth int) *FSNode {
	info, err := os.Stat(p)
	name := filepath.Base(p)
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(p)), ".")
	if err != nil {
		return &FSNode{Name: name, Path: p, Type: "file", Ext: ext}
	}
	if !info.IsDir() {
		return &FSNode{Name: name, Path: p, Type: "file", Ext: ext}
	}
	node := &FSNode{Name: name, Path: p, Type: "dir", Children: []*FSNode{}}
	if depth >= maxDepth {
		return node
	}
	entries, err := os.ReadDir(p)
	if err != nil {
		return node
	}
	for _, e := range entries {
		if fsIgnore[e.Name()] || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		child := buildTree(filepath.Join(p, e.Name()), depth+1, maxDepth)
		node.Children = append(node.Children, child)
	}
	sort.Slice(node.Children, func(i, j int) bool {
		di, dj := node.Children[i].Type == "dir", node.Children[j].Type == "dir"
		if di != dj {
			return di
		}
		return node.Children[i].Name < node.Children[j].Name
	})
	return node
}

func handleFsTree(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath string `json:"rootPath"`
		MaxDepth int    `json:"maxDepth"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if req.MaxDepth == 0 {
		req.MaxDepth = 6
	}
	tree := buildTree(req.RootPath, 0, req.MaxDepth)
	ok200(w, map[string]any{"success": true, "tree": tree})
}

func handleFsRead(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FilePath string `json:"filePath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	data, err := os.ReadFile(req.FilePath)
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true, "content": string(data)})
}

func handleFsWrite(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if err := os.MkdirAll(filepath.Dir(req.FilePath), 0755); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	if err := os.WriteFile(req.FilePath, []byte(req.Content), 0644); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleFsCreateFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FilePath string `json:"filePath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if _, err := os.Stat(req.FilePath); err == nil {
		ok200(w, map[string]any{"success": false, "error": "File already exists"})
		return
	}
	os.MkdirAll(filepath.Dir(req.FilePath), 0755)
	if err := os.WriteFile(req.FilePath, []byte{}, 0644); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleFsCreateDir(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FolderPath string `json:"folderPath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if err := os.MkdirAll(req.FolderPath, 0755); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleFsDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ItemPath string `json:"itemPath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if err := os.RemoveAll(req.ItemPath); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleFsRename(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OldPath string `json:"oldPath"`
		NewPath string `json:"newPath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if err := os.Rename(req.OldPath, req.NewPath); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, info.Mode())
	})
}

func handleFsCopyFolder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SrcPath  string `json:"srcPath"`
		DestPath string `json:"destPath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if err := copyDir(req.SrcPath, req.DestPath); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleFsCopyFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SrcPath  string `json:"srcPath"`
		DestPath string `json:"destPath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	data, err := os.ReadFile(req.SrcPath)
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	if err := os.WriteFile(req.DestPath, data, 0644); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleFsListAll(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath string `json:"rootPath"`
		MaxFiles int    `json:"maxFiles"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if req.MaxFiles == 0 {
		req.MaxFiles = 5000
	}
	ignored := map[string]bool{"node_modules": true, ".git": true, "dist": true, "build": true, ".next": true, "__pycache__": true, ".venv": true, "venv": true, ".cache": true, "coverage": true, "target": true}
	type FileEntry struct {
		Path string `json:"path"`
		Rel  string `json:"rel"`
		Name string `json:"name"`
	}
	var results []FileEntry
	var walk func(dir, rel string)
	walk = func(dir, rel string) {
		if len(results) >= req.MaxFiles {
			return
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), ".") || ignored[e.Name()] {
				continue
			}
			full := filepath.Join(dir, e.Name())
			relPath := e.Name()
			if rel != "" {
				relPath = rel + "/" + e.Name()
			}
			if e.IsDir() {
				walk(full, relPath)
			} else {
				results = append(results, FileEntry{Path: full, Rel: relPath, Name: e.Name()})
				if len(results) >= req.MaxFiles {
					return
				}
			}
		}
	}
	walk(req.RootPath, "")
	ok200(w, results)
}

func handleFsSearch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath   string `json:"rootPath"`
		Query      string `json:"query"`
		MaxResults int    `json:"maxResults"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if len(req.Query) < 2 {
		ok200(w, []any{})
		return
	}
	if req.MaxResults == 0 {
		req.MaxResults = 300
	}
	textExts := map[string]bool{".js": true, ".ts": true, ".tsx": true, ".jsx": true, ".py": true, ".go": true, ".c": true, ".cpp": true, ".h": true, ".md": true, ".json": true, ".css": true, ".html": true, ".txt": true, ".yaml": true, ".yml": true, ".toml": true, ".rs": true, ".rb": true, ".sh": true}
	ignored := map[string]bool{"node_modules": true, ".git": true, "dist": true, "build": true, "__pycache__": true, ".venv": true, "venv": true, "coverage": true}
	lower := strings.ToLower(req.Query)

	type SearchResult struct {
		File     string `json:"file"`
		FullPath string `json:"fullPath"`
		Line     int    `json:"line"`
		Text     string `json:"text"`
		Col      int    `json:"col"`
	}
	var results []SearchResult

	var walk func(dir, rel string)
	walk = func(dir, rel string) {
		if len(results) >= req.MaxResults {
			return
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), ".") || ignored[e.Name()] {
				continue
			}
			full := filepath.Join(dir, e.Name())
			relPath := e.Name()
			if rel != "" {
				relPath = rel + "/" + e.Name()
			}
			if e.IsDir() {
				walk(full, relPath)
			} else {
				ext := strings.ToLower(filepath.Ext(e.Name()))
				if !textExts[ext] {
					continue
				}
				data, err := os.ReadFile(full)
				if err != nil {
					continue
				}
				for i, line := range strings.Split(string(data), "\n") {
					lowerLine := strings.ToLower(line)
					if col := strings.Index(lowerLine, lower); col >= 0 {
						text := strings.TrimSpace(line)
						if len(text) > 200 {
							text = text[:200]
						}
						results = append(results, SearchResult{File: relPath, FullPath: full, Line: i + 1, Text: text, Col: col})
						if len(results) >= req.MaxResults {
							return
						}
					}
				}
			}
		}
	}
	walk(req.RootPath, "")
	ok200(w, results)
}

func handleFsGetScripts(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath string `json:"rootPath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	type Script struct {
		Name string `json:"name"`
		Cmd  string `json:"cmd"`
	}
	// Try package.json
	pkgPath := filepath.Join(req.RootPath, "package.json")
	if data, err := os.ReadFile(pkgPath); err == nil {
		var pkg struct {
			Name    string            `json:"name"`
			Scripts map[string]string `json:"scripts"`
		}
		if json.Unmarshal(data, &pkg) == nil && len(pkg.Scripts) > 0 {
			scripts := []Script{}
			for name, cmd := range pkg.Scripts {
				scripts = append(scripts, Script{Name: name, Cmd: cmd})
			}
			sort.Slice(scripts, func(i, j int) bool { return scripts[i].Name < scripts[j].Name })
			ok200(w, map[string]any{"success": true, "scripts": scripts, "type": "npm", "name": pkg.Name})
			return
		}
	}
	// Try Makefile
	mkPath := filepath.Join(req.RootPath, "Makefile")
	if data, err := os.ReadFile(mkPath); err == nil {
		re := regexp.MustCompile(`(?m)^([a-zA-Z][a-zA-Z0-9_-]*):`)
		matches := re.FindAllSubmatch(data, -1)
		scripts := []Script{}
		for _, m := range matches {
			name := string(m[1])
			scripts = append(scripts, Script{Name: name, Cmd: "make " + name})
		}
		if len(scripts) > 0 {
			ok200(w, map[string]any{"success": true, "scripts": scripts, "type": "make", "name": "Makefile"})
			return
		}
	}
	ok200(w, map[string]any{"success": false, "scripts": []Script{}, "type": "none"})
}

// ─────────────────────────────────────────────────────────────────────────────
//  Workspace persistence
// ─────────────────────────────────────────────────────────────────────────────

func workspaceFile() string {
	return filepath.Join(configDir(), "workspace.json")
}

func recentFile() string {
	return filepath.Join(configDir(), "recent-workspaces.json")
}

func handleFsGetWorkspace(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(workspaceFile())
	if err != nil {
		ok200(w, map[string]any{"path": nil})
		return
	}
	var v map[string]any
	json.Unmarshal(data, &v)
	ok200(w, v)
}

func handleFsSaveWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		WorkspacePath string `json:"workspacePath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	os.MkdirAll(configDir(), 0755)
	data, _ := json.Marshal(map[string]string{"path": req.WorkspacePath})
	os.WriteFile(workspaceFile(), data, 0644)
	ok200(w, map[string]any{"success": true})
}

func handleFsGetRecentWorkspaces(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(recentFile())
	if err != nil {
		ok200(w, []string{})
		return
	}
	var list []string
	json.Unmarshal(data, &list)
	if len(list) > 10 {
		list = list[:10]
	}
	ok200(w, list)
}

func handleFsAddRecentWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		WorkspacePath string `json:"workspacePath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	data, _ := os.ReadFile(recentFile())
	var list []string
	json.Unmarshal(data, &list)
	filtered := []string{req.WorkspacePath}
	for _, p := range list {
		if p != req.WorkspacePath {
			filtered = append(filtered, p)
		}
	}
	if len(filtered) > 10 {
		filtered = filtered[:10]
	}
	os.MkdirAll(configDir(), 0755)
	out, _ := json.Marshal(filtered)
	os.WriteFile(recentFile(), out, 0644)
	ok200(w, map[string]any{"success": true})
}

var defaultWsFiles = map[string]string{
	"main.js": `// FORBIDEN — Main entry point
const PROJECT = 'FORBIDEN NGO'
const VERSION  = '2.1.0'
const MODULES  = ['utils', 'DataPipeline', 'graph']

console.log(` + "`" + `[BOOT] ${PROJECT} v${VERSION}` + "`" + `)
MODULES.forEach(m => console.log(` + "`" + `  ↳ loading: ${m}` + "`" + `))

const uptime = performance.now().toFixed(2)
console.log(` + "`" + `[READY] Runtime up — ${uptime}ms` + "`" + `)`,

	"utils.js": `// Utility helpers
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
function randomId(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase()
}
console.log(capitalize('forbiden'))
console.log('ID:', randomId())`,
}

func handleFsEnsureDefaultWorkspace(w http.ResponseWriter, r *http.Request) {
	home, _ := os.UserHomeDir()
	docsDir := filepath.Join(home, "Documents")
	baseDir := home
	if info, err := os.Stat(docsDir); err == nil && info.IsDir() {
		baseDir = docsDir
	}
	wsDir := filepath.Join(baseDir, "FORBIDEN")
	if err := os.MkdirAll(wsDir, 0755); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	for name, content := range defaultWsFiles {
		fp := filepath.Join(wsDir, name)
		if _, err := os.Stat(fp); os.IsNotExist(err) {
			os.WriteFile(fp, []byte(content), 0644)
		}
	}
	ok200(w, map[string]any{"success": true, "path": wsDir})
}

// ─────────────────────────────────────────────────────────────────────────────
//  Import graph scanner
// ─────────────────────────────────────────────────────────────────────────────

func handleFsScanImports(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath string `json:"rootPath"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}

	ignored := map[string]bool{"node_modules": true, ".git": true, "dist": true, "build": true, ".next": true, "__pycache__": true, ".venv": true, "venv": true, ".cache": true, "coverage": true, "vendor": true}

	var files []string
	filepath.Walk(req.RootPath, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			if info != nil && info.IsDir() && (ignored[info.Name()] || strings.HasPrefix(info.Name(), ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(p)), ".")
		if codeExtScan[ext] {
			files = append(files, p)
		}
		return nil
	})

	jsImportRe := regexp.MustCompile(`(?:import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))`)
	pyImportRe := regexp.MustCompile(`(?m)^(?:from\s+([\w.]+)\s+import|import\s+([\w.,\s]+))`)
	cIncludeRe := regexp.MustCompile(`#include\s+"([^"]+)"`)
	goImportRe := regexp.MustCompile(`(?m)^\s+"([^"]+)"`)

	colors := []string{"#10b981", "#ff435a", "#ffc410", "#4285f4", "#28f1c3", "#bb9af7", "#ff1650", "#5ccfe6", "#ffbd5e", "#e36209", "#72f1b8", "#ff8080", "#89ddff", "#e5c07b", "#4ec9b0", "#c792ea"}

	type GraphNode struct {
		ID       string  `json:"id"`
		Label    string  `json:"label"`
		Path     string  `json:"path"`
		Ext      string  `json:"ext"`
		Type     string  `json:"type"`
		ThemeIdx int     `json:"themeIdx"`
		X        float64 `json:"x"`
		Y        float64 `json:"y"`
	}
	type GraphEdge struct {
		ID     string `json:"id"`
		Source string `json:"source"`
		Target string `json:"target"`
	}

	nodes := make([]GraphNode, 0, len(files))
	for i, f := range files {
		rel, _ := filepath.Rel(req.RootPath, f)
		ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(f)), ".")
		n := len(files)
		angle := float64(i) / float64(n) * 2 * 3.14159265
		radius := float64(200)
		if n*20 < 200 {
			radius = float64(n * 20)
		}
		_ = colors
		nodes = append(nodes, GraphNode{
			ID:       "fi" + strconv.Itoa(i),
			Label:    rel,
			Path:     f,
			Ext:      ext,
			Type:     "function",
			ThemeIdx: i % len(colors),
			X:        radius * mathCos(angle),
			Y:        radius * mathSin(angle),
		})
	}

	byRel := map[string]string{}
	byBase := map[string]string{}
	byNoExt := map[string]string{}
	for _, n := range nodes {
		byRel[n.Label] = n.ID
		byBase[filepath.Base(n.Label)] = n.ID
		base := filepath.Base(n.Label)
		noExt := strings.TrimSuffix(base, filepath.Ext(base))
		byNoExt[noExt] = n.ID
	}

	extractImports := func(filePath, ext string) []string {
		data, err := os.ReadFile(filePath)
		if err != nil {
			return nil
		}
		src := string(data)
		var imps []string
		switch ext {
		case "js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte":
			for _, m := range jsImportRe.FindAllStringSubmatch(src, -1) {
				if m[1] != "" {
					imps = append(imps, m[1])
				}
				if m[2] != "" {
					imps = append(imps, m[2])
				}
			}
		case "py":
			for _, m := range pyImportRe.FindAllStringSubmatch(src, -1) {
				if m[1] != "" {
					imps = append(imps, m[1])
				}
			}
		case "c", "cpp", "h", "hpp":
			for _, m := range cIncludeRe.FindAllStringSubmatch(src, -1) {
				imps = append(imps, m[1])
			}
		case "go":
			for _, m := range goImportRe.FindAllStringSubmatch(src, -1) {
				imps = append(imps, m[1])
			}
		}
		return imps
	}

	edges := []GraphEdge{}
	edgeSet := map[string]bool{}

	for _, node := range nodes {
		imps := extractImports(node.Path, node.Ext)
		for _, imp := range imps {
			base := filepath.Base(imp)
			noExt := strings.TrimSuffix(base, filepath.Ext(base))
			var targetID string
			if strings.HasPrefix(imp, ".") {
				dir := filepath.Dir(node.Path)
				resolved := filepath.Join(dir, imp)
				rel, _ := filepath.Rel(req.RootPath, resolved)
				for _, cand := range []string{rel, rel + ".js", rel + ".ts", rel + ".tsx", rel + ".jsx", rel + ".py", rel + ".go", rel + "/index.js", rel + "/index.ts"} {
					if id, ok := byRel[cand]; ok {
						targetID = id
						break
					}
				}
			}
			if targetID == "" {
				if id, ok := byBase[base]; ok {
					targetID = id
				} else if id, ok := byNoExt[noExt]; ok {
					targetID = id
				}
			}
			if targetID != "" && targetID != node.ID {
				key := node.ID + ">" + targetID
				if !edgeSet[key] {
					edgeSet[key] = true
					edges = append(edges, GraphEdge{ID: "ei" + strconv.Itoa(len(edges)), Source: node.ID, Target: targetID})
				}
			}
		}
	}

	ok200(w, map[string]any{"success": true, "nodes": nodes, "edges": edges, "rootPath": req.RootPath, "fileCount": len(files)})
}

// tiny math helpers (avoid importing math to reduce binary size)
func mathCos(x float64) float64 {
	// Use standard library via init
	return cosApprox(x)
}
func mathSin(x float64) float64 {
	return sinApprox(x)
}

var cosApprox func(float64) float64
var sinApprox func(float64) float64

// ─────────────────────────────────────────────────────────────────────────────
//  Code formatter
// ─────────────────────────────────────────────────────────────────────────────

func handleFsFormatCode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
		Lang string `json:"lang"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}

	extMap := map[string]string{"js": "js", "mjs": "js", "jsx": "jsx", "ts": "ts", "tsx": "tsx", "css": "css", "json": "json", "html": "html", "md": "md", "py": "py", "go": "go"}
	ext, ok := extMap[req.Lang]
	if !ok {
		ok200(w, map[string]any{"success": false, "error": "No formatter for " + req.Lang})
		return
	}

	tmp, err := os.CreateTemp("", "forbiden_fmt_*."+ext)
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	tmpPath := tmp.Name()
	tmp.WriteString(req.Code)
	tmp.Close()
	defer os.Remove(tmpPath)

	var cmdStr string
	switch req.Lang {
	case "go":
		cmdStr = "gofmt -w " + tmpPath
	case "py":
		cmdStr = "black " + tmpPath + " 2>&1 || autopep8 --in-place " + tmpPath
	default:
		cmdStr = "npx --yes prettier --write " + tmpPath
	}

	cmd := exec.Command("sh", "-c", cmdStr)
	cmd.Env = append(os.Environ(), "PATH="+extendedPath())
	var errBuf bytes.Buffer
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		ok200(w, map[string]any{"success": false, "error": errBuf.String()})
		return
	}

	result, err := os.ReadFile(tmpPath)
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true, "code": string(result)})
}

// ─────────────────────────────────────────────────────────────────────────────
//  Git handlers
// ─────────────────────────────────────────────────────────────────────────────

func handleGitStatus(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	porcelain, err1 := runGit([]string{"status", "--porcelain"}, req.Cwd)
	branch, err2 := runGit([]string{"branch", "--show-current"}, req.Cwd)
	if err1 != nil && err2 != nil {
		ok200(w, map[string]any{"branch": "", "files": []any{}, "raw": "", "error": err1.Error()})
		return
	}
	if branch == "" {
		branch = "main"
	}
	type FileStat struct {
		State string `json:"state"`
		Path  string `json:"path"`
	}
	var files []FileStat
	for _, line := range strings.Split(porcelain, "\n") {
		if len(line) < 3 {
			continue
		}
		files = append(files, FileStat{State: strings.TrimSpace(line[:2]), Path: strings.TrimSpace(line[3:])})
	}
	ok200(w, map[string]any{"branch": branch, "files": files, "raw": porcelain})
}

func handleGitLog(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	out, err := runGit([]string{"log", "--oneline", "--decorate", "-30"}, req.Cwd)
	if err != nil {
		ok200(w, []any{})
		return
	}
	type Commit struct {
		Hash    string `json:"hash"`
		Message string `json:"message"`
	}
	var commits []Commit
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, " ", 2)
		if len(parts) == 2 {
			commits = append(commits, Commit{Hash: parts[0], Message: parts[1]})
		}
	}
	ok200(w, commits)
}

func handleGitLogGraph(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd   string `json:"cwd"`
		Limit int    `json:"limit"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if req.Limit == 0 {
		req.Limit = 60
	}
	out, err := runGit([]string{"log", `--pretty=format:%H|%P|%D|%s|%an|%ar`, fmt.Sprintf("-%d", req.Limit), "--all"}, req.Cwd)
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error(), "commits": []any{}})
		return
	}
	type Commit struct {
		Hash    string   `json:"hash"`
		Parents []string `json:"parents"`
		Refs    []string `json:"refs"`
		Subject string   `json:"subject"`
		Author  string   `json:"author"`
		Reltime string   `json:"reltime"`
	}
	var commits []Commit
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 6)
		for len(parts) < 6 {
			parts = append(parts, "")
		}
		var parents []string
		if strings.TrimSpace(parts[1]) != "" {
			for _, p := range strings.Fields(parts[1]) {
				if p != "" {
					parents = append(parents, p)
				}
			}
		}
		var refs []string
		if strings.TrimSpace(parts[2]) != "" {
			for _, ref := range strings.Split(parts[2], ",") {
				if r := strings.TrimSpace(ref); r != "" {
					refs = append(refs, r)
				}
			}
		}
		commits = append(commits, Commit{
			Hash:    strings.TrimSpace(parts[0]),
			Parents: parents,
			Refs:    refs,
			Subject: strings.TrimSpace(parts[3]),
			Author:  strings.TrimSpace(parts[4]),
			Reltime: strings.TrimSpace(parts[5]),
		})
	}
	ok200(w, map[string]any{"success": true, "commits": commits})
}

func handleGitBranch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	out, err := runGit([]string{"branch", "--show-current"}, req.Cwd)
	if err != nil {
		ok200(w, "main")
		return
	}
	ok200(w, out)
}

func handleGitBranches(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	out, err := runGit([]string{"branch", "-a"}, req.Cwd)
	if err != nil {
		ok200(w, []string{})
		return
	}
	var branches []string
	for _, b := range strings.Split(out, "\n") {
		name := strings.TrimSpace(strings.TrimPrefix(b, "*"))
		if name != "" {
			branches = append(branches, name)
		}
	}
	ok200(w, branches)
}

func handleGitCommit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd     string `json:"cwd"`
		Message string `json:"message"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if _, err := runGit([]string{"add", "-A"}, req.Cwd); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	out, err := runGit([]string{"commit", "-m", req.Message}, req.Cwd)
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true, "output": out})
}

func handleGitStage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd   string   `json:"cwd"`
		Files []string `json:"files"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	args := append([]string{"add", "--"}, req.Files...)
	if _, err := runGit(args, req.Cwd); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleGitUnstage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd   string   `json:"cwd"`
		Files []string `json:"files"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	args := append([]string{"restore", "--staged", "--"}, req.Files...)
	if _, err := runGit(args, req.Cwd); err != nil {
		args2 := append([]string{"reset", "HEAD", "--"}, req.Files...)
		if _, err2 := runGit(args2, req.Cwd); err2 != nil {
			ok200(w, map[string]any{"success": false, "error": err2.Error()})
			return
		}
	}
	ok200(w, map[string]any{"success": true})
}

func handleGitCheckout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd    string `json:"cwd"`
		Branch string `json:"branch"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if _, err := runGit([]string{"checkout", req.Branch}, req.Cwd); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleGitPush(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	out, err := runGit([]string{"push"}, req.Cwd)
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true, "output": out})
}

func handleGitPull(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	out, err := runGit([]string{"pull"}, req.Cwd)
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true, "output": out})
}

func handleGitStash(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if _, err := runGit([]string{"stash"}, req.Cwd); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleGitStashPop(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if _, err := runGit([]string{"stash", "pop"}, req.Cwd); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleGitInit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if _, err := runGit([]string{"init"}, req.Cwd); err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	ok200(w, map[string]any{"success": true})
}

func handleGitDiscard(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd  string `json:"cwd"`
		File string `json:"file"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if _, err := runGit([]string{"restore", "--", req.File}, req.Cwd); err != nil {
		if _, err2 := runGit([]string{"checkout", "--", req.File}, req.Cwd); err2 != nil {
			ok200(w, map[string]any{"success": false, "error": err2.Error()})
			return
		}
	}
	ok200(w, map[string]any{"success": true})
}

func handleGitDiff(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd  string `json:"cwd"`
		File string `json:"file"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	args := []string{"diff", "HEAD"}
	if req.File != "" {
		args = append(args, "--", req.File)
	}
	out, err := runGit(args, req.Cwd)
	if err != nil {
		args2 := []string{"diff"}
		if req.File != "" {
			args2 = append(args2, "--", req.File)
		}
		out, err = runGit(args2, req.Cwd)
	}
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error(), "diff": ""})
		return
	}
	ok200(w, map[string]any{"success": true, "diff": out})
}

func handleGitBlame(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd  string `json:"cwd"`
		File string `json:"file"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	out, err := runGit([]string{"blame", "--line-porcelain", req.File}, req.Cwd)
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error(), "lines": []any{}})
		return
	}

	type BlameLine struct {
		Hash    string `json:"hash"`
		Author  string `json:"author"`
		Time    string `json:"time"`
		Subject string `json:"subject"`
		Line    int    `json:"line"`
		Content string `json:"content"`
	}
	var lines []BlameLine
	var cur BlameLine

	scanner := bufio.NewScanner(strings.NewReader(out))
	hashRe := regexp.MustCompile(`^[0-9a-f]{40}`)
	for scanner.Scan() {
		line := scanner.Text()
		if hashRe.MatchString(line) {
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				lineNum, _ := strconv.Atoi(parts[2])
				cur = BlameLine{Hash: parts[0], Line: lineNum}
			}
		} else if strings.HasPrefix(line, "author ") {
			cur.Author = line[7:]
		} else if strings.HasPrefix(line, "author-time ") {
			ts, _ := strconv.ParseInt(line[12:], 10, 64)
			cur.Time = time.Unix(ts, 0).Format("2006-01-02")
		} else if strings.HasPrefix(line, "summary ") {
			cur.Subject = line[8:]
		} else if strings.HasPrefix(line, "\t") {
			cur.Content = line[1:]
			lines = append(lines, cur)
			cur = BlameLine{}
		}
	}
	ok200(w, map[string]any{"success": true, "lines": lines})
}

// ─────────────────────────────────────────────────────────────────────────────
//  Run: inject command into attached PTY terminal
// ─────────────────────────────────────────────────────────────────────────────

func langExt(lang string) string {
	m := map[string]string{"js": ".js", "ts": ".ts", "jsx": ".jsx", "tsx": ".tsx", "py": ".py", "c": ".c", "cpp": ".cpp", "go": ".go"}
	if e, ok := m[lang]; ok {
		return e
	}
	return ".txt"
}

func buildRunCmd(lang, filePath string) string {
	switch lang {
	case "js", "jsx":
		if bin := lookBin("bun"); bin != "" {
			return "bun run " + filePath
		}
		if bin := lookBin("node"); bin != "" {
			return bin + " " + filePath
		}
	case "ts", "tsx":
		if bin := lookBin("bun"); bin != "" {
			return "bun run " + filePath
		}
		if bin := lookBin("npx"); bin != "" {
			return "npx ts-node " + filePath
		}
	case "py":
		if bin := lookBin("python3", "python3.12", "python3.11", "python3.10", "python"); bin != "" {
			return bin + " " + filePath
		}
	case "c":
		out := strings.TrimSuffix(filePath, ".c")
		if bin := lookBin("gcc", "clang", "cc"); bin != "" {
			return bin + " -o " + out + " " + filePath + " -lm && " + out
		}
	case "cpp":
		out := strings.TrimSuffix(filePath, ".cpp")
		if bin := lookBin("g++", "clang++", "c++"); bin != "" {
			return bin + " -o " + out + " " + filePath + " && " + out
		}
	case "go":
		if bin := lookBin("go"); bin != "" {
			return bin + " run " + filePath
		}
	}
	return ""
}

func handleRun(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PtyID string `json:"ptyId"`
		Lang  string `json:"lang"`
		Code  string `json:"code"`
		Cwd   string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}

	// For shell lang, inject the code directly as-is (it's already a command)
	if req.Lang == "sh" || req.Lang == "shell" || req.Lang == "bash" {
		cmd := strings.TrimSpace(req.Code)
		if req.PtyID != "" {
			ptyMu.RLock()
			sess := ptys[req.PtyID]
			ptyMu.RUnlock()
			if sess != nil {
				sess.mu.Lock()
				sess.ptmx.WriteString(cmd + "\n")
				sess.mu.Unlock()
				ok200(w, map[string]any{"success": true, "injected": true, "cmd": cmd})
				return
			}
		}
		ok200(w, map[string]any{"success": false, "error": "no active terminal session"})
		return
	}

	// Save code to temp file
	tmp, err := os.CreateTemp("", "forbiden_*"+langExt(req.Lang))
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	tmpPath := tmp.Name()
	tmp.WriteString(req.Code)
	tmp.Close()

	cmd := buildRunCmd(req.Lang, tmpPath)
	if cmd == "" {
		os.Remove(tmpPath)
		ok200(w, map[string]any{"success": false, "error": "no runtime found for " + req.Lang})
		return
	}

	// Inject into PTY
	if req.PtyID != "" {
		ptyMu.RLock()
		sess := ptys[req.PtyID]
		ptyMu.RUnlock()
		if sess != nil {
			sess.mu.Lock()
			sess.ptmx.WriteString(cmd + "\n")
			sess.mu.Unlock()
			ok200(w, map[string]any{"success": true, "injected": true, "cmd": cmd})
			return
		}
	}

	ok200(w, map[string]any{"success": false, "error": "no active terminal session"})
}

// Direct PTY write — injects raw text (e.g., a full shell command)
func handlePtyWrite(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID   string `json:"id"`
		Text string `json:"text"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	ptyMu.RLock()
	sess := ptys[req.ID]
	ptyMu.RUnlock()
	if sess == nil {
		ok200(w, map[string]any{"success": false, "error": "session not found"})
		return
	}
	sess.mu.Lock()
	sess.ptmx.WriteString(req.Text)
	sess.mu.Unlock()
	ok200(w, map[string]any{"success": true})
}

// Capture-mode run (returns logs, used for output panel fallback)
func handleRunCode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Lang  string `json:"lang"`
		Code  string `json:"code"`
		Stdin string `json:"stdin"`
		Cwd   string `json:"cwd"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}

	tmp, err := os.CreateTemp("", "forbiden_*"+langExt(req.Lang))
	if err != nil {
		ok200(w, map[string]any{"error": err.Error(), "ms": 0, "logs": []any{}})
		return
	}
	tmpPath := tmp.Name()
	tmp.WriteString(req.Code)
	tmp.Close()
	defer os.Remove(tmpPath)

	cmdStr := buildRunCmd(req.Lang, tmpPath)
	if cmdStr == "" {
		ok200(w, map[string]any{
			"logs": []map[string]any{{"type": "error", "val": "no runtime found for " + req.Lang, "ts": time.Now().UnixMilli()}},
			"error": "unsupported", "ms": 0,
		})
		return
	}

	t0 := time.Now()
	cmd := exec.Command("sh", "-c", cmdStr)
	cmd.Env = append(os.Environ(), "PATH="+extendedPath())
	if req.Cwd != "" {
		cmd.Dir = req.Cwd
	}

	type LogEntry struct {
		Type string `json:"type"`
		Val  string `json:"val"`
		Ts   int64  `json:"ts"`
	}
	var logs []LogEntry

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf
	if req.Stdin != "" {
		cmd.Stdin = strings.NewReader(req.Stdin)
	}

	runErr := cmd.Run()
	ms := time.Since(t0).Milliseconds()

	for _, line := range strings.Split(stdoutBuf.String(), "\n") {
		if line != "" {
			logs = append(logs, LogEntry{Type: "log", Val: line, Ts: time.Now().UnixMilli()})
		}
	}
	for _, line := range strings.Split(stderrBuf.String(), "\n") {
		if line != "" {
			logs = append(logs, LogEntry{Type: "error", Val: line, Ts: time.Now().UnixMilli()})
		}
	}

	errMsg := ""
	if runErr != nil {
		errMsg = runErr.Error()
	}
	ok200(w, map[string]any{"logs": logs, "error": errMsg, "ms": ms})
}

// ─────────────────────────────────────────────────────────────────────────────
//  AI proxy handlers
// ─────────────────────────────────────────────────────────────────────────────

func handleAIChat(w http.ResponseWriter, r *http.Request) {
	var req map[string]any
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}

	provider, _ := req["provider"].(string)
	apiKey, _ := req["apiKey"].(string)
	model, _ := req["model"].(string)
	system, _ := req["system"].(string)
	messages := req["messages"]

	var url string
	var body any
	headers := map[string]string{"Content-Type": "application/json"}

	switch provider {
	case "anthropic", "":
		if apiKey == "" {
			ok200(w, map[string]any{"success": false, "error": "No Anthropic API key"})
			return
		}
		if model == "" {
			model = "claude-haiku-4-5-20251001"
		}
		url = "https://api.anthropic.com/v1/messages"
		headers["x-api-key"] = apiKey
		headers["anthropic-version"] = "2023-06-01"
		b := map[string]any{"model": model, "max_tokens": 4096, "messages": messages}
		if system != "" {
			b["system"] = system
		}
		body = b

	case "openai", "openrouter":
		if apiKey == "" {
			ok200(w, map[string]any{"success": false, "error": "No API key"})
			return
		}
		if model == "" {
			model = "gpt-4o-mini"
		}
		base := "https://api.openai.com/v1"
		if provider == "openrouter" {
			base = "https://openrouter.ai/api/v1"
			if model == "gpt-4o-mini" {
				model = "openai/gpt-4o-mini"
			}
		}
		url = base + "/chat/completions"
		headers["Authorization"] = "Bearer " + apiKey
		msgs := []any{}
		if system != "" {
			msgs = append(msgs, map[string]any{"role": "system", "content": system})
		}
		if ms, ok := messages.([]any); ok {
			msgs = append(msgs, ms...)
		}
		body = map[string]any{"model": model, "messages": msgs}

	case "gemini":
		if apiKey == "" {
			ok200(w, map[string]any{"success": false, "error": "No Gemini API key"})
			return
		}
		if model == "" {
			model = "gemini-2.0-flash"
		}
		url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey
		var contents []any
		if ms, ok := messages.([]any); ok {
			for _, m := range ms {
				msg := m.(map[string]any)
				role := "user"
				if msg["role"] == "assistant" {
					role = "model"
				}
				contents = append(contents, map[string]any{"role": role, "parts": []any{map[string]any{"text": msg["content"]}}})
			}
		}
		b := map[string]any{"contents": contents}
		if system != "" {
			b["systemInstruction"] = map[string]any{"parts": []any{map[string]any{"text": system}}}
		}
		body = b

	case "ollama":
		if model == "" {
			model = "llama3"
		}
		host := apiKey
		if host == "" {
			host = "http://localhost:11434"
		}
		url = host + "/api/chat"
		msgs := []any{}
		if system != "" {
			msgs = append(msgs, map[string]any{"role": "system", "content": system})
		}
		if ms, ok := messages.([]any); ok {
			msgs = append(msgs, ms...)
		}
		body = map[string]any{"model": model, "messages": msgs, "stream": false}

	default:
		ok200(w, map[string]any{"success": false, "error": "Unknown provider: " + provider})
		return
	}

	bodyBytes, _ := json.Marshal(body)
	httpReq, _ := http.NewRequest("POST", url, bytes.NewReader(bodyBytes))
	for k, v := range headers {
		httpReq.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		ok200(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var data map[string]any
	json.Unmarshal(respBody, &data)

	if resp.StatusCode >= 400 {
		msg := ""
		if e, ok := data["error"].(map[string]any); ok {
			msg, _ = e["message"].(string)
		}
		if msg == "" {
			msg = resp.Status
		}
		ok200(w, map[string]any{"success": false, "error": msg})
		return
	}

	var content string
	switch provider {
	case "anthropic", "":
		if c, ok := data["content"].([]any); ok && len(c) > 0 {
			if m, ok := c[0].(map[string]any); ok {
				content, _ = m["text"].(string)
			}
		}
	case "openai", "openrouter":
		if c, ok := data["choices"].([]any); ok && len(c) > 0 {
			if m, ok := c[0].(map[string]any); ok {
				if msg, ok := m["message"].(map[string]any); ok {
					content, _ = msg["content"].(string)
				}
			}
		}
	case "gemini":
		if c, ok := data["candidates"].([]any); ok && len(c) > 0 {
			if m, ok := c[0].(map[string]any); ok {
				if cont, ok := m["content"].(map[string]any); ok {
					if parts, ok := cont["parts"].([]any); ok && len(parts) > 0 {
						if p, ok := parts[0].(map[string]any); ok {
							content, _ = p["text"].(string)
						}
					}
				}
			}
		}
	case "ollama":
		if m, ok := data["message"].(map[string]any); ok {
			content, _ = m["content"].(string)
		}
	}

	ok200(w, map[string]any{"success": true, "content": content})
}

func handleAIOllamaModels(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Host string `json:"host"`
	}
	if err := decode(r, &req); err != nil {
		errJSON(w, err.Error(), 400)
		return
	}
	if req.Host == "" {
		req.Host = "http://localhost:11434"
	}
	resp, err := http.Get(req.Host + "/api/tags")
	if err != nil {
		ok200(w, map[string]any{"success": false, "models": []string{}})
		return
	}
	defer resp.Body.Close()
	var data map[string]any
	json.NewDecoder(resp.Body).Decode(&data)
	var models []string
	if ms, ok := data["models"].([]any); ok {
		for _, m := range ms {
			if mm, ok := m.(map[string]any); ok {
				if name, ok := mm["name"].(string); ok {
					models = append(models, name)
				}
			}
		}
	}
	ok200(w, map[string]any{"success": true, "models": models})
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────────────────────────

func init() {
	// Wire up math functions using standard library
	import_math()
}

func main() {
	// Extend PATH for all subprocess calls
	os.Setenv("PATH", extendedPath())

	port := findPort(49373)

	mux := http.NewServeMux()

	// Status
	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		ok200(w, map[string]any{"ok": true, "pid": os.Getpid()})
	})

	// PTY WebSocket
	mux.HandleFunc("/ws/pty", handleWsPTY)

	// Filesystem
	mux.HandleFunc("/api/fs/tree", handleFsTree)
	mux.HandleFunc("/api/fs/read", handleFsRead)
	mux.HandleFunc("/api/fs/write", handleFsWrite)
	mux.HandleFunc("/api/fs/create-file", handleFsCreateFile)
	mux.HandleFunc("/api/fs/create-dir", handleFsCreateDir)
	mux.HandleFunc("/api/fs/delete", handleFsDelete)
	mux.HandleFunc("/api/fs/rename", handleFsRename)
	mux.HandleFunc("/api/fs/copy-folder", handleFsCopyFolder)
	mux.HandleFunc("/api/fs/copy-file", handleFsCopyFile)
	mux.HandleFunc("/api/fs/list-all", handleFsListAll)
	mux.HandleFunc("/api/fs/search", handleFsSearch)
	mux.HandleFunc("/api/fs/scan-imports", handleFsScanImports)
	mux.HandleFunc("/api/fs/get-scripts", handleFsGetScripts)
	mux.HandleFunc("/api/fs/format-code", handleFsFormatCode)
	mux.HandleFunc("/api/fs/get-workspace", handleFsGetWorkspace)
	mux.HandleFunc("/api/fs/save-workspace", handleFsSaveWorkspace)
	mux.HandleFunc("/api/fs/get-recent-workspaces", handleFsGetRecentWorkspaces)
	mux.HandleFunc("/api/fs/add-recent-workspace", handleFsAddRecentWorkspace)
	mux.HandleFunc("/api/fs/ensure-default-workspace", handleFsEnsureDefaultWorkspace)

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

	// Run
	mux.HandleFunc("/api/run", handleRun)
	mux.HandleFunc("/api/run/code", handleRunCode)
	mux.HandleFunc("/api/pty/write", handlePtyWrite)

	// AI
	mux.HandleFunc("/api/ai/chat", handleAIChat)
	mux.HandleFunc("/api/ai/ollama-models", handleAIOllamaModels)

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	server := &http.Server{
		Addr:         addr,
		Handler:      cors(mux),
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
	}

	// Signal readiness to parent process BEFORE blocking
	fmt.Printf("READY:%d\n", port)
	os.Stdout.Sync()

	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
