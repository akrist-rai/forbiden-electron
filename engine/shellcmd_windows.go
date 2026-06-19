//go:build windows

package main

import "os/exec"

func shellCommand(s string) *exec.Cmd {
	return exec.Command("cmd.exe", "/c", s)
}
