package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
)

// ── Git helpers ────────────────────────────────────────────────

func runGit(args []string, cwd string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "PATH="+extendedPath())
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("%s", strings.TrimSpace(string(ee.Stderr)))
		}
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// ── Git handlers ───────────────────────────────────────────────

func handleGitStatus(w http.ResponseWriter, r *http.Request) {
	var req struct{ Cwd string `json:"cwd"` }
	json.NewDecoder(r.Body).Decode(&req)
	porcelain, _ := runGit([]string{"status", "--porcelain"}, req.Cwd)
	branch, err := runGit([]string{"branch", "--show-current"}, req.Cwd)
	if err != nil || branch == "" {
		branch = "main"
	}
	files := []map[string]any{}
	for _, l := range strings.Split(porcelain, "\n") {
		if len(l) > 2 {
			files = append(files, map[string]any{
				"state": l[:2],
				"path":  strings.TrimSpace(l[3:]),
			})
		}
	}
	jsonResp(w, map[string]any{"branch": branch, "files": files, "raw": porcelain})
}

func handleGitLog(w http.ResponseWriter, r *http.Request) {
	var req struct{ Cwd string `json:"cwd"` }
	json.NewDecoder(r.Body).Decode(&req)
	out, _ := runGit([]string{"log", "--oneline", "--decorate", "-30"}, req.Cwd)
	commits := []map[string]any{}
	for _, l := range strings.Split(out, "\n") {
		if l == "" {
			continue
		}
		parts := strings.SplitN(l, " ", 2)
		entry := map[string]any{"hash": parts[0], "message": ""}
		if len(parts) > 1 {
			entry["message"] = parts[1]
		}
		commits = append(commits, entry)
	}
	jsonResp(w, commits)
}

func handleGitLogGraph(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd   string `json:"cwd"`
		Limit *int   `json:"limit"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	n := 60
	if req.Limit != nil {
		n = *req.Limit
	}
	out, err := runGit([]string{
		"log",
		"--pretty=format:%H|%P|%D|%s|%an|%ar",
		fmt.Sprintf("-%d", n),
		"--all",
	}, req.Cwd)
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error(), "commits": []any{}})
		return
	}
	commits := []map[string]any{}
	for _, l := range strings.Split(out, "\n") {
		if l == "" {
			continue
		}
		p := strings.SplitN(l, "|", 6)
		for len(p) < 6 {
			p = append(p, "")
		}
		parents := []string{}
		for _, s := range strings.Fields(p[1]) {
			if s != "" {
				parents = append(parents, s)
			}
		}
		refs := []string{}
		for _, s := range strings.Split(p[2], ",") {
			if t := strings.TrimSpace(s); t != "" {
				refs = append(refs, t)
			}
		}
		commits = append(commits, map[string]any{
			"hash": p[0], "parents": parents, "refs": refs,
			"subject": p[3], "author": p[4], "reltime": p[5],
		})
	}
	jsonResp(w, map[string]any{"success": true, "commits": commits})
}

func handleGitBranch(w http.ResponseWriter, r *http.Request) {
	var req struct{ Cwd string `json:"cwd"` }
	json.NewDecoder(r.Body).Decode(&req)
	branch, err := runGit([]string{"branch", "--show-current"}, req.Cwd)
	if err != nil || branch == "" {
		branch = "main"
	}
	jsonResp(w, branch)
}

func handleGitBranches(w http.ResponseWriter, r *http.Request) {
	var req struct{ Cwd string `json:"cwd"` }
	json.NewDecoder(r.Body).Decode(&req)
	out, _ := runGit([]string{"branch", "-a"}, req.Cwd)
	branches := []string{}
	for _, l := range strings.Split(out, "\n") {
		b := strings.TrimSpace(strings.TrimPrefix(l, "*"))
		b = strings.TrimSpace(b)
		if b != "" {
			branches = append(branches, b)
		}
	}
	jsonResp(w, branches)
}

func handleGitCommit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd     string `json:"cwd"`
		Message string `json:"message"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	out, err := runGit([]string{"commit", "-m", req.Message}, req.Cwd)
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true, "output": out})
}

func handleGitStage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd   string   `json:"cwd"`
		Files []string `json:"files"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	args := append([]string{"add", "--"}, req.Files...)
	if _, err := runGit(args, req.Cwd); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleGitUnstage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd   string   `json:"cwd"`
		Files []string `json:"files"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	args := append([]string{"restore", "--staged", "--"}, req.Files...)
	if _, err := runGit(args, req.Cwd); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleGitCheckout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd    string `json:"cwd"`
		Branch string `json:"branch"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if _, err := runGit([]string{"checkout", req.Branch}, req.Cwd); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleGitPush(w http.ResponseWriter, r *http.Request) {
	var req struct{ Cwd string `json:"cwd"` }
	json.NewDecoder(r.Body).Decode(&req)
	out, err := runGit([]string{"push"}, req.Cwd)
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true, "output": out})
}

func handleGitPull(w http.ResponseWriter, r *http.Request) {
	var req struct{ Cwd string `json:"cwd"` }
	json.NewDecoder(r.Body).Decode(&req)
	out, err := runGit([]string{"pull"}, req.Cwd)
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true, "output": out})
}

func handleGitStash(w http.ResponseWriter, r *http.Request) {
	var req struct{ Cwd string `json:"cwd"` }
	json.NewDecoder(r.Body).Decode(&req)
	if _, err := runGit([]string{"stash"}, req.Cwd); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleGitStashPop(w http.ResponseWriter, r *http.Request) {
	var req struct{ Cwd string `json:"cwd"` }
	json.NewDecoder(r.Body).Decode(&req)
	if _, err := runGit([]string{"stash", "pop"}, req.Cwd); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleGitInit(w http.ResponseWriter, r *http.Request) {
	var req struct{ Cwd string `json:"cwd"` }
	json.NewDecoder(r.Body).Decode(&req)
	if _, err := runGit([]string{"init"}, req.Cwd); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleGitDiscard(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd  string `json:"cwd"`
		File string `json:"file"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if _, err := runGit([]string{"restore", "--", req.File}, req.Cwd); err != nil {
		if _, err2 := runGit([]string{"checkout", "--", req.File}, req.Cwd); err2 != nil {
			jsonResp(w, map[string]any{"success": false, "error": err2.Error()})
			return
		}
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleGitDiff(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd    string `json:"cwd"`
		File   string `json:"file"`
		Staged bool   `json:"staged"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	var out string
	var err error
	if req.Staged {
		if req.File == "" {
			out, err = runGit([]string{"diff", "--cached"}, req.Cwd)
		} else {
			out, err = runGit([]string{"diff", "--cached", "--", req.File}, req.Cwd)
		}
	} else if req.File == "" {
		out, err = runGit([]string{"diff", "HEAD"}, req.Cwd)
		if err != nil {
			out, err = runGit([]string{"diff"}, req.Cwd)
		}
	} else {
		out, err = runGit([]string{"diff", "HEAD", "--", req.File}, req.Cwd)
		if err != nil {
			out, err = runGit([]string{"diff", "--", req.File}, req.Cwd)
		}
	}
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error(), "diff": ""})
		return
	}
	jsonResp(w, map[string]any{"success": true, "diff": out})
}

func handleGitBlame(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd  string `json:"cwd"`
		File string `json:"file"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	out, err := runGit([]string{"blame", "--line-porcelain", req.File}, req.Cwd)
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error(), "lines": []any{}})
		return
	}
	jsonResp(w, map[string]any{"success": true, "raw": out})
}

func handleGitStashList(w http.ResponseWriter, r *http.Request) {
	var req struct{ Cwd string `json:"cwd"` }
	json.NewDecoder(r.Body).Decode(&req)
	out, _ := runGit([]string{"stash", "list", "--pretty=format:%gd|%s|%cr"}, req.Cwd)
	stashes := []map[string]any{}
	for _, l := range strings.Split(out, "\n") {
		if l == "" {
			continue
		}
		p := strings.SplitN(l, "|", 3)
		for len(p) < 3 {
			p = append(p, "")
		}
		stashes = append(stashes, map[string]any{"ref": p[0], "message": p[1], "date": p[2]})
	}
	jsonResp(w, map[string]any{"success": true, "stashes": stashes})
}

func handleGitCreateBranch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd    string `json:"cwd"`
		Branch string `json:"branch"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if _, err := runGit([]string{"checkout", "-b", req.Branch}, req.Cwd); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}

func handleGitDeleteBranch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cwd    string `json:"cwd"`
		Branch string `json:"branch"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if _, err := runGit([]string{"branch", "-d", req.Branch}, req.Cwd); err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	jsonResp(w, map[string]any{"success": true})
}
