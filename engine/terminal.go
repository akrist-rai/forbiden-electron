package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"time"
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

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "sh", "-c", req.Cmd)
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
