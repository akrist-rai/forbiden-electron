package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

// ── Workspace config paths ─────────────────────────────────────

func configDir() string {
	if d := os.Getenv("XDG_CONFIG_HOME"); d != "" {
		return filepath.Join(d, "sanction")
	}
	if h := os.Getenv("HOME"); h != "" {
		return filepath.Join(h, ".config", "sanction")
	}
	return filepath.Join("/tmp", "sanction")
}

func workspaceFile() string { return filepath.Join(configDir(), "workspace.json") }
func recentFile() string    { return filepath.Join(configDir(), "recent-workspaces.json") }

// ── Workspace handlers ─────────────────────────────────────────

func handleWorkspaceGet(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(workspaceFile())
	if err != nil {
		jsonResp(w, map[string]any{"path": nil})
		return
	}
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		jsonResp(w, map[string]any{"path": nil})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func handleWorkspaceSave(w http.ResponseWriter, r *http.Request) {
	var req struct {
		WorkspacePath string `json:"workspacePath"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	os.MkdirAll(configDir(), 0755)
	data, _ := json.Marshal(map[string]string{"path": req.WorkspacePath})
	if err := os.WriteFile(workspaceFile(), data, 0644); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleWorkspaceRecentGet(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(recentFile())
	if err != nil {
		jsonResp(w, []string{})
		return
	}
	var list []string
	if err := json.Unmarshal(data, &list); err != nil {
		jsonResp(w, []string{})
		return
	}
	jsonResp(w, list)
}

func handleWorkspaceRecentAdd(w http.ResponseWriter, r *http.Request) {
	var req struct {
		WorkspacePath string `json:"workspacePath"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	var list []string
	if data, err := os.ReadFile(recentFile()); err == nil {
		json.Unmarshal(data, &list)
	}
	filtered := list[:0]
	for _, p := range list {
		if p != req.WorkspacePath {
			filtered = append(filtered, p)
		}
	}
	list = append([]string{req.WorkspacePath}, filtered...)
	if len(list) > 10 {
		list = list[:10]
	}
	os.MkdirAll(configDir(), 0755)
	data, _ := json.Marshal(list)
	os.WriteFile(recentFile(), data, 0644)
	jsonResp(w, map[string]any{"success": true})
}

func handleWorkspaceEnsureDefault(w http.ResponseWriter, r *http.Request) {
	home, _ := os.UserHomeDir()
	docs := filepath.Join(home, "Documents")
	base := home
	if info, err := os.Stat(docs); err == nil && info.IsDir() {
		base = docs
	}
	ws := filepath.Join(base, "SANCTION")
	os.MkdirAll(ws, 0755)
	mainJS := filepath.Join(ws, "main.js")
	if _, err := os.Stat(mainJS); os.IsNotExist(err) {
		os.WriteFile(mainJS, []byte("// SANCTION entry point\nconsole.log('ready')\n"), 0644)
	}
	jsonResp(w, map[string]any{"success": true, "path": ws})
}
