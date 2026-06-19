//go:build !windows

package main

import (
	"os"
	"os/exec"
	"runtime"

	"github.com/creack/pty"
)

type unixPTY struct{ f *os.File }

func (p *unixPTY) Read(b []byte) (int, error)        { return p.f.Read(b) }
func (p *unixPTY) Write(b []byte) (int, error)       { return p.f.Write(b) }
func (p *unixPTY) WriteString(s string) (int, error) { return p.f.WriteString(s) }
func (p *unixPTY) Close() error                       { return p.f.Close() }
func (p *unixPTY) Resize(cols, rows int) error {
	return pty.Setsize(p.f, &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)})
}

// startTerminal launches a shell in a PTY and returns the handle plus a cleanup func.
func startTerminal(cols, rows int, cwd string, env []string) (ptyHandle, func(), error) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		if runtime.GOOS == "darwin" {
			shell = "/bin/zsh"
		} else {
			shell = "/bin/bash"
		}
	}
	cmd := exec.Command(shell)
	cmd.Dir = cwd
	cmd.Env = env

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
	if err != nil {
		return nil, nil, err
	}
	cleanup := func() {
		ptmx.Close()
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		cmd.Wait()
	}
	return &unixPTY{ptmx}, cleanup, nil
}
