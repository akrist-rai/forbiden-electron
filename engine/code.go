package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ── Code execution ─────────────────────────────────────────────

func findExec(candidates []string) string {
	for _, c := range candidates {
		if _, err := exec.LookPath(c); err == nil {
			return c
		}
	}
	return ""
}

func buildRunCmd(lang, file string) string {
	switch lang {
	case "js", "jsx":
		if b := findExec([]string{"bun"}); b != "" {
			return "bun run " + file
		}
		if n := findExec([]string{"node"}); n != "" {
			return "node " + file
		}
	case "ts", "tsx":
		if b := findExec([]string{"bun"}); b != "" {
			return "bun run " + file
		}
	case "py":
		if p := findExec([]string{"python3", "python"}); p != "" {
			return p + " " + file
		}
	case "go":
		return "go run " + file
	case "c":
		out := strings.TrimSuffix(file, filepath.Ext(file)) + ".out"
		if cc := findExec([]string{"gcc", "clang", "cc"}); cc != "" {
			return fmt.Sprintf("%s -o %s %s -lm && %s", cc, out, file, out)
		}
	case "cpp":
		out := strings.TrimSuffix(file, filepath.Ext(file)) + ".out"
		if cc := findExec([]string{"g++", "clang++", "c++"}); cc != "" {
			return fmt.Sprintf("%s -o %s %s && %s", cc, out, file, out)
		}
	}
	return ""
}

func handleCodeRun(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Lang  string `json:"lang"`
		Code  string `json:"code"`
		Stdin string `json:"stdin"`
		Cwd   string `json:"cwd"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	extMap := map[string]string{
		"js": "js", "jsx": "jsx", "ts": "ts", "tsx": "tsx",
		"py": "py", "go": "go", "c": "c", "cpp": "cpp",
	}
	ext, ok := extMap[req.Lang]
	if !ok {
		ext = "txt"
	}

	tmp, err := os.CreateTemp("", fmt.Sprintf("forbiden_run_*.%s", ext))
	if err != nil {
		jsonResp(w, map[string]any{"logs": []any{}, "error": err.Error(), "ms": 0})
		return
	}
	tmpPath := tmp.Name()
	tmp.WriteString(req.Code)
	tmp.Close()
	defer os.Remove(tmpPath)

	// For compiled languages, also clean up the binary
	if req.Lang == "c" || req.Lang == "cpp" {
		defer os.Remove(strings.TrimSuffix(tmpPath, filepath.Ext(tmpPath)) + ".out")
	}

	cmdStr := buildRunCmd(req.Lang, tmpPath)
	if cmdStr == "" {
		jsonResp(w, map[string]any{
			"logs":  []any{map[string]any{"type": "error", "val": "no runtime for " + req.Lang, "ts": 0}},
			"error": "unsupported", "ms": 0,
		})
		return
	}

	t0 := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sh", "-c", cmdStr)
	// Build clean env: extend PATH, but strip PYTHONHOME/PYTHONPATH so the
	// system Python can always find its own stdlib (AppImage sets them to
	// the squashfs mount, which doesn't contain Python → "Failed to import encodings").
	baseEnv := os.Environ()
	env := make([]string, 0, len(baseEnv)+1)
	for _, e := range baseEnv {
		if strings.HasPrefix(e, "PYTHONHOME=") || strings.HasPrefix(e, "PYTHONPATH=") {
			continue
		}
		if strings.HasPrefix(e, "PATH=") {
			continue // replaced below
		}
		env = append(env, e)
	}
	env = append(env, "PATH="+extendedPath())
	cmd.Env = env
	if req.Cwd != "" {
		cmd.Dir = req.Cwd
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if req.Stdin != "" {
		cmd.Stdin = strings.NewReader(req.Stdin)
	}

	runErr := cmd.Run()
	ms := time.Since(t0).Milliseconds()

	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		jsonResp(w, map[string]any{
			"logs":  []any{map[string]any{"type": "run-err", "val": "execution timed out after 30s", "ts": 0}},
			"error": "timeout", "ms": ms,
		})
		return
	}
	_ = runErr

	logs := []map[string]any{}
	for _, l := range strings.Split(stdout.String(), "\n") {
		if l != "" {
			logs = append(logs, map[string]any{"type": "log", "val": l, "ts": 0})
		}
	}
	for _, l := range strings.Split(stderr.String(), "\n") {
		if l != "" {
			logs = append(logs, map[string]any{"type": "error", "val": l, "ts": 0})
		}
	}
	jsonResp(w, map[string]any{"logs": logs, "error": nil, "ms": ms})
}
