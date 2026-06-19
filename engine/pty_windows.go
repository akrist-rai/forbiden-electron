//go:build windows

package main

import (
	gopty "github.com/aymanbagabas/go-pty"
)

type winPTY struct{ p gopty.Pty }

func (p *winPTY) Read(b []byte) (int, error)        { return p.p.Read(b) }
func (p *winPTY) Write(b []byte) (int, error)       { return p.p.Write(b) }
func (p *winPTY) WriteString(s string) (int, error) { return p.p.Write([]byte(s)) }
func (p *winPTY) Close() error                       { return p.p.Close() }
func (p *winPTY) Resize(cols, rows int) error        { return p.p.Resize(cols, rows) }

// startTerminal launches PowerShell inside a Windows ConPTY and returns a cleanup func.
func startTerminal(cols, rows int, cwd string, env []string) (ptyHandle, func(), error) {
	pt, err := gopty.New()
	if err != nil {
		return nil, nil, err
	}
	if err := pt.Resize(cols, rows); err != nil {
		pt.Close()
		return nil, nil, err
	}
	cmd := pt.Command("powershell.exe", "-NoLogo")
	cmd.Dir = cwd
	cmd.Env = env
	if err := cmd.Start(); err != nil {
		pt.Close()
		return nil, nil, err
	}
	cleanup := func() {
		pt.Close()
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		cmd.Wait()
	}
	return &winPTY{pt}, cleanup, nil
}
