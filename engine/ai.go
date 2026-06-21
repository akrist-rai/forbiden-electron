package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── AI proxy ───────────────────────────────────────────────────

func handleAiChat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider string           `json:"provider"`
		APIKey   string           `json:"apiKey"`
		Model    string           `json:"model"`
		System   string           `json:"system"`
		Messages []map[string]any `json:"messages"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	var apiURL string
	var body map[string]any
	headers := map[string]string{"Content-Type": "application/json"}

	switch req.Provider {
	case "anthropic", "":
		if req.APIKey == "" {
			jsonResp(w, map[string]any{"success": false, "error": "No API key"})
			return
		}
		model := req.Model
		if model == "" {
			model = "claude-haiku-4-5-20251001"
		}
		body = map[string]any{"model": model, "max_tokens": 4096, "messages": req.Messages}
		if req.System != "" {
			body["system"] = req.System
		}
		apiURL = "https://api.anthropic.com/v1/messages"
		headers["x-api-key"] = req.APIKey
		headers["anthropic-version"] = "2023-06-01"

	case "openai", "openrouter":
		if req.APIKey == "" {
			jsonResp(w, map[string]any{"success": false, "error": "No API key"})
			return
		}
		base := "https://api.openai.com/v1"
		if req.Provider == "openrouter" {
			base = "https://openrouter.ai/api/v1"
		}
		model := req.Model
		if model == "" {
			model = "gpt-4o-mini"
		}
		body = map[string]any{"model": model, "messages": req.Messages}
		apiURL = base + "/chat/completions"
		headers["Authorization"] = "Bearer " + req.APIKey

	case "gemini":
		if req.APIKey == "" {
			jsonResp(w, map[string]any{"success": false, "error": "No API key"})
			return
		}
		model := req.Model
		if model == "" {
			model = "gemini-2.0-flash"
		}
		contents := make([]map[string]any, 0, len(req.Messages))
		for _, msg := range req.Messages {
			role := "user"
			if msg["role"] == "assistant" {
				role = "model"
			}
			contents = append(contents, map[string]any{
				"role":  role,
				"parts": []map[string]any{{"text": msg["content"]}},
			})
		}
		body = map[string]any{"contents": contents}
		if req.System != "" {
			body["systemInstruction"] = map[string]any{
				"parts": []map[string]any{{"text": req.System}},
			}
		}
		apiURL = fmt.Sprintf(
			"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
			model, req.APIKey,
		)

	default:
		jsonResp(w, map[string]any{"success": false, "error": "Unknown provider"})
		return
	}

	bodyBytes, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(r.Context(), "POST", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	for k, v := range headers {
		httpReq.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	var data map[string]any
	json.NewDecoder(resp.Body).Decode(&data)

	var content string
	switch req.Provider {
	case "anthropic", "":
		if arr, ok := data["content"].([]any); ok && len(arr) > 0 {
			if obj, ok := arr[0].(map[string]any); ok {
				content, _ = obj["text"].(string)
			}
		}
	case "openai", "openrouter":
		if choices, ok := data["choices"].([]any); ok && len(choices) > 0 {
			if choice, ok := choices[0].(map[string]any); ok {
				if msg, ok := choice["message"].(map[string]any); ok {
					content, _ = msg["content"].(string)
				}
			}
		}
	case "gemini":
		if candidates, ok := data["candidates"].([]any); ok && len(candidates) > 0 {
			if c, ok := candidates[0].(map[string]any); ok {
				if cont, ok := c["content"].(map[string]any); ok {
					if parts, ok := cont["parts"].([]any); ok && len(parts) > 0 {
						if part, ok := parts[0].(map[string]any); ok {
							content, _ = part["text"].(string)
						}
					}
				}
			}
		}
	}
	jsonResp(w, map[string]any{"success": true, "content": content})
}

// ── Ollama models ──────────────────────────────────────────────

func handleOllamaModels(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Host string `json:"host"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	host := req.Host
	if host == "" {
		host = "http://localhost:11434"
	}
	host = strings.TrimRight(host, "/")
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(host + "/api/tags")
	if err != nil {
		jsonResp(w, map[string]any{"success": false, "error": err.Error(), "models": []any{}})
		return
	}
	defer resp.Body.Close()
	var data map[string]any
	json.NewDecoder(resp.Body).Decode(&data)
	models, _ := data["models"].([]any)
	if models == nil {
		models = []any{}
	}
	jsonResp(w, map[string]any{"success": true, "models": models})
}

// ── AI SSE streaming ───────────────────────────────────────────

func sseWrite(w io.Writer, flusher http.Flusher, data string) {
	fmt.Fprintf(w, "data: %s\n\n", data)
	flusher.Flush()
}

func handleAiStream(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider string           `json:"provider"`
		Key      string           `json:"key"`
		Model    string           `json:"model"`
		System   string           `json:"system"`
		Messages []map[string]any `json:"messages"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", 400)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", 500)
		return
	}

	sendErr := func(msg string) {
		b, _ := json.Marshal(map[string]any{"error": msg})
		sseWrite(w, flusher, string(b))
		sseWrite(w, flusher, "[DONE]")
	}

	provider := req.Provider
	if provider == "" {
		provider = "anthropic"
	}

	var apiURL string
	body := map[string]any{}
	headers := map[string]string{"Content-Type": "application/json"}

	switch provider {
	case "anthropic":
		if req.Key == "" {
			sendErr("No API key")
			return
		}
		model := req.Model
		if model == "" {
			model = "claude-haiku-4-5-20251001"
		}
		body = map[string]any{
			"model": model, "max_tokens": 4096,
			"messages": req.Messages, "stream": true,
		}
		if req.System != "" {
			body["system"] = req.System
		}
		apiURL = "https://api.anthropic.com/v1/messages"
		headers["x-api-key"] = req.Key
		headers["anthropic-version"] = "2023-06-01"

	case "openai", "openrouter":
		if req.Key == "" {
			sendErr("No API key")
			return
		}
		base := "https://api.openai.com/v1"
		if provider == "openrouter" {
			base = "https://openrouter.ai/api/v1"
		}
		model := req.Model
		if model == "" {
			model = "gpt-4o-mini"
		}
		body = map[string]any{"model": model, "messages": req.Messages, "stream": true}
		apiURL = base + "/chat/completions"
		headers["Authorization"] = "Bearer " + req.Key

	case "gemini":
		if req.Key == "" {
			sendErr("No API key")
			return
		}
		model := req.Model
		if model == "" {
			model = "gemini-2.0-flash"
		}
		contents := make([]map[string]any, 0, len(req.Messages))
		for _, msg := range req.Messages {
			role := "user"
			if msg["role"] == "assistant" {
				role = "model"
			}
			contents = append(contents, map[string]any{
				"role":  role,
				"parts": []map[string]any{{"text": msg["content"]}},
			})
		}
		body = map[string]any{"contents": contents}
		if req.System != "" {
			body["systemInstruction"] = map[string]any{"parts": []map[string]any{{"text": req.System}}}
		}
		apiURL = fmt.Sprintf(
			"https://generativelanguage.googleapis.com/v1beta/models/%s:streamGenerateContent?key=%s&alt=sse",
			model, req.Key,
		)

	default:
		sendErr("Unknown provider: " + provider)
		return
	}

	bodyBytes, _ := json.Marshal(body)
	upReq, err := http.NewRequestWithContext(r.Context(), "POST", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		sendErr(err.Error())
		return
	}
	for k, v := range headers {
		upReq.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(upReq)
	if err != nil {
		sendErr(err.Error())
		return
	}
	defer resp.Body.Close()

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := line[6:]
		if payload == "[DONE]" {
			break
		}

		var chunk map[string]any
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			continue
		}

		var token string
		switch provider {
		case "anthropic":
			// event: content_block_delta → delta.text
			if delta, ok := chunk["delta"].(map[string]any); ok {
				token, _ = delta["text"].(string)
			}
		case "openai", "openrouter":
			if choices, ok := chunk["choices"].([]any); ok && len(choices) > 0 {
				if choice, ok := choices[0].(map[string]any); ok {
					if delta, ok := choice["delta"].(map[string]any); ok {
						token, _ = delta["content"].(string)
					}
				}
			}
		case "gemini":
			if candidates, ok := chunk["candidates"].([]any); ok && len(candidates) > 0 {
				if c, ok := candidates[0].(map[string]any); ok {
					if cont, ok := c["content"].(map[string]any); ok {
						if parts, ok := cont["parts"].([]any); ok && len(parts) > 0 {
							if part, ok := parts[0].(map[string]any); ok {
								token, _ = part["text"].(string)
							}
						}
					}
				}
			}
		}

		if token != "" {
			b, _ := json.Marshal(map[string]any{"token": token})
			sseWrite(w, flusher, string(b))
		}
	}

	sseWrite(w, flusher, "[DONE]")
}
