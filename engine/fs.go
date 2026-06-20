package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// ── Filesystem handlers ────────────────────────────────────────

type FsNode struct {
	Name     string   `json:"name"`
	Path     string   `json:"path"`
	Kind     string   `json:"type"`
	Ext      string   `json:"ext,omitempty"`
	Children []FsNode `json:"children,omitempty"`
}

func buildTree(p string, depth, maxDepth int) FsNode {
	name := filepath.Base(p)
	ext := strings.ToLower(filepath.Ext(p))
	info, err := os.Stat(p)
	if err != nil || !info.IsDir() {
		return FsNode{Name: name, Path: p, Kind: "file", Ext: ext}
	}
	node := FsNode{Name: name, Path: p, Kind: "dir"}
	if depth < maxDepth {
		entries, err := os.ReadDir(p)
		if err == nil {
			var dirs, files []FsNode
			for _, e := range entries {
				if shouldIgnore(e.Name()) {
					continue
				}
				child := buildTree(filepath.Join(p, e.Name()), depth+1, maxDepth)
				if e.IsDir() {
					dirs = append(dirs, child)
				} else {
					files = append(files, child)
				}
			}
			node.Children = append(dirs, files...)
		}
	}
	if node.Children == nil {
		node.Children = []FsNode{}
	}
	return node
}

func handleFsTree(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath string `json:"rootPath"`
		MaxDepth *int   `json:"maxDepth"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	maxDepth := 6
	if req.MaxDepth != nil {
		maxDepth = *req.MaxDepth
	}
	tree := buildTree(req.RootPath, 0, maxDepth)
	jsonResp(w, map[string]any{"success": true, "tree": tree})
}

func handleFsRead(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FilePath string `json:"filePath"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	content, err := os.ReadFile(req.FilePath)
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	if !utf8.Valid(content) {
		jsonResp(w, map[string]any{"success": false, "error": "file is binary"})
		return
	}
	jsonResp(w, map[string]any{"success": true, "content": string(content)})
}

func handleFsWrite(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if dir := filepath.Dir(req.FilePath); dir != "" {
		os.MkdirAll(dir, 0755)
	}
	if err := os.WriteFile(req.FilePath, []byte(req.Content), 0644); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleFsCreateFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FilePath string `json:"filePath"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if _, err := os.Stat(req.FilePath); err == nil {
		jsonResp(w, map[string]any{"success": false, "error": "File already exists"})
		return
	}
	if dir := filepath.Dir(req.FilePath); dir != "" {
		os.MkdirAll(dir, 0755)
	}
	if err := os.WriteFile(req.FilePath, []byte{}, 0644); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleFsCreateDir(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FolderPath string `json:"folderPath"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if err := os.MkdirAll(req.FolderPath, 0755); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleFsDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ItemPath string `json:"itemPath"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	info, err := os.Stat(req.ItemPath)
	var rerr error
	if err == nil && info.IsDir() {
		rerr = os.RemoveAll(req.ItemPath)
	} else {
		rerr = os.Remove(req.ItemPath)
	}
	if rerr != nil {
		jsonResp(w, map[string]any{"success": false, "error": rerr.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleFsRename(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OldPath string `json:"oldPath"`
		NewPath string `json:"newPath"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if err := os.Rename(req.OldPath, req.NewPath); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleFsCopyFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SrcPath  string `json:"srcPath"`
		DestPath string `json:"destPath"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	data, err := os.ReadFile(req.SrcPath)
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	if err := os.WriteFile(req.DestPath, data, 0644); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleFsCopyFolder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SrcPath  string `json:"srcPath"`
		DestPath string `json:"destPath"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	var copyDir func(src, dst string) error
	copyDir = func(src, dst string) error {
		if err := os.MkdirAll(dst, 0755); err != nil {
			return err
		}
		entries, err := os.ReadDir(src)
		if err != nil {
			return err
		}
		for _, e := range entries {
			sp := filepath.Join(src, e.Name())
			dp := filepath.Join(dst, e.Name())
			if e.IsDir() {
				if err := copyDir(sp, dp); err != nil {
					return err
				}
			} else {
				data, err := os.ReadFile(sp)
				if err != nil {
					return err
				}
				if err := os.WriteFile(dp, data, 0644); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := copyDir(req.SrcPath, req.DestPath); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleFsListAll(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath string `json:"rootPath"`
		MaxFiles *int   `json:"maxFiles"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	limit := 5000
	if req.MaxFiles != nil {
		limit = *req.MaxFiles
	}
	results := []map[string]any{}
	var walk func(dir, rel string)
	walk = func(dir, rel string) {
		if len(results) >= limit {
			return
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range entries {
			n := e.Name()
			if shouldIgnore(n) {
				continue
			}
			full := filepath.Join(dir, n)
			relPath := n
			if rel != "" {
				relPath = rel + "/" + n
			}
			if e.IsDir() {
				walk(full, relPath)
			} else {
				results = append(results, map[string]any{"path": full, "rel": relPath, "name": n})
			}
		}
	}
	walk(req.RootPath, "")
	jsonResp(w, results)
}

func handleFsSearch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath   string `json:"rootPath"`
		Query      string `json:"query"`
		MaxResults *int   `json:"maxResults"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if len(req.Query) < 2 {
		jsonResp(w, []any{})
		return
	}
	limit := 300
	if req.MaxResults != nil {
		limit = *req.MaxResults
	}
	lower := strings.ToLower(req.Query)
	textExts := map[string]bool{
		".js": true, ".ts": true, ".tsx": true, ".jsx": true,
		".py": true, ".go": true, ".c": true, ".cpp": true,
		".h": true, ".md": true, ".json": true, ".css": true,
		".html": true, ".txt": true, ".yaml": true, ".yml": true,
		".toml": true, ".rs": true, ".sh": true,
	}
	results := []map[string]any{}
	var walk func(dir, rel string)
	walk = func(dir, rel string) {
		if len(results) >= limit {
			return
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range entries {
			n := e.Name()
			if shouldIgnore(n) {
				continue
			}
			full := filepath.Join(dir, n)
			relPath := n
			if rel != "" {
				relPath = rel + "/" + n
			}
			if e.IsDir() {
				walk(full, relPath)
			} else {
				ext := strings.ToLower(filepath.Ext(n))
				if !textExts[ext] {
					continue
				}
				data, err := os.ReadFile(full)
				if err != nil {
					continue
				}
				for i, line := range strings.Split(string(data), "\n") {
					ll := strings.ToLower(line)
					col := strings.Index(ll, lower)
					if col >= 0 {
						text := strings.TrimSpace(line)
						if len(text) > 200 {
							text = text[:200]
						}
						results = append(results, map[string]any{
							"file": relPath, "fullPath": full,
							"line": i + 1, "text": text, "col": col,
						})
						if len(results) >= limit {
							return
						}
					}
				}
			}
		}
	}
	walk(req.RootPath, "")
	jsonResp(w, results)
}

func handleFsGetScripts(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath string `json:"rootPath"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	data, err := os.ReadFile(filepath.Join(req.RootPath, "package.json"))
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "scripts": []any{}, "type": "none"})
		return
	}
	var pkg map[string]any
	if err := json.Unmarshal(data, &pkg); err != nil {
		jsonResp(w, map[string]any{"success": false, "scripts": []any{}, "type": "none"})
		return
	}
	scripts, ok := pkg["scripts"].(map[string]any)
	if !ok {
		jsonResp(w, map[string]any{"success": false, "scripts": []any{}, "type": "none"})
		return
	}
	list := make([]map[string]any, 0, len(scripts))
	for k, v := range scripts {
		list = append(list, map[string]any{"name": k, "cmd": v, "source": "npm"})
	}
	name, _ := pkg["name"].(string)
	jsonResp(w, map[string]any{"success": true, "scripts": list, "type": "npm", "name": name})
}

func handleFsFormat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
		Lang string `json:"lang"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	extMap := map[string]string{
		"go": "go", "py": "py", "js": "js", "jsx": "js",
		"ts": "ts", "tsx": "ts", "css": "css", "json": "json", "html": "html",
	}
	ext, ok := extMap[req.Lang]
	if !ok {
		jsonResp(w, map[string]any{"success": false, "error": "No formatter"})
		return
	}
	tmp, err := os.CreateTemp("", "forbiden_fmt_*."+ext)
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
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
	if err := cmd.Run(); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": "Format failed"})
		return
	}
	result, err := os.ReadFile(tmpPath)
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true, "code": string(result)})
}

func handleFsScanImports(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath string `json:"rootPath"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	codeExts := map[string]bool{
		"js": true, "jsx": true, "ts": true, "tsx": true, "py": true,
		"go": true, "c": true, "cpp": true, "h": true, "hpp": true,
		"rs": true, "rb": true, "java": true, "kt": true, "swift": true, "cs": true,
	}
	var files []string
	filepath.WalkDir(req.RootPath, func(path string, d os.DirEntry, err error) error {
		if err != nil || d == nil {
			return nil
		}
		n := d.Name()
		if d.IsDir() {
			if shouldIgnore(n) {
				return filepath.SkipDir
			}
			return nil
		}
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(n), "."))
		if codeExts[ext] {
			files = append(files, path)
		}
		return nil
	})
	n := len(files)
	nodes := make([]map[string]any, n)
	for i, f := range files {
		rel, _ := filepath.Rel(req.RootPath, f)
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(f), "."))
		angle := float64(i) / float64(max(n, 1)) * 2 * math.Pi
		radius := 200.0
		nodes[i] = map[string]any{
			"id": fmt.Sprintf("fi%d", i), "label": rel, "path": f,
			"ext": ext, "type": "function", "themeIdx": i % 16,
			"x": radius * math.Cos(angle), "y": radius * math.Sin(angle),
		}
	}
	jsonResp(w, map[string]any{
		"success": true, "nodes": nodes, "edges": []any{},
		"rootPath": req.RootPath, "fileCount": n,
	})
}
