package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
)

// ── Terminal shell exec ────────────────────────────────────────

func handleTerminalExec(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cmd string `json:"cmd"`
		Cwd string `json:"cwd"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	cwd := req.Cwd
	if cwd == "" {
		cwd, _ = os.Getwd()
	}

	var stdout, stderr bytes.Buffer
	cmd := exec.Command("sh", "-c", req.Cmd)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "PATH="+extendedPath())
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	cmd.Run()

	jsonResp(w, map[string]any{
		"stdout": stdout.String(),
		"stderr": stderr.String(),
	})
}
