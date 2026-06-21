//go:build android

package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"unsafe"
)

// androidPTY wraps the master side of a /dev/ptmx PTY pair.
// Android's kernel is Linux so /dev/ptmx and /dev/pts/* work identically
// to a desktop Linux kernel — creack/pty just doesn't list "android" in
// its build tags, so we reimplement the small subset we need here.
type androidPTY struct{ master *os.File }

func (p *androidPTY) Read(b []byte) (int, error)        { return p.master.Read(b) }
func (p *androidPTY) Write(b []byte) (int, error)       { return p.master.Write(b) }
func (p *androidPTY) WriteString(s string) (int, error) { return p.master.WriteString(s) }
func (p *androidPTY) Close() error                       { return p.master.Close() }

type winsize struct{ Row, Col, Xpixel, Ypixel uint16 }

const (
	tiocgptn   uintptr = 0x80045430 // get slave PTY index
	tiocsptlck uintptr = 0x40045431 // unlock slave PTY
	tiocswinsz uintptr = 0x5414     // set window size
)

func (p *androidPTY) Resize(cols, rows int) error {
	ws := winsize{Row: uint16(rows), Col: uint16(cols)}
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, p.master.Fd(), tiocswinsz, uintptr(unsafe.Pointer(&ws)))
	if errno != 0 {
		return errno
	}
	return nil
}

func startTerminal(cols, rows int, cwd string, env []string) (ptyHandle, func(), error) {
	master, err := os.OpenFile("/dev/ptmx", os.O_RDWR, 0)
	if err != nil {
		return nil, nil, fmt.Errorf("open /dev/ptmx: %w", err)
	}

	// Unlock the slave side.
	unlock := 0
	syscall.Syscall(syscall.SYS_IOCTL, master.Fd(), tiocsptlck, uintptr(unsafe.Pointer(&unlock)))

	// Read the slave PTY index number.
	var n uint32
	if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, master.Fd(), tiocgptn, uintptr(unsafe.Pointer(&n))); errno != 0 {
		master.Close()
		return nil, nil, fmt.Errorf("TIOCGPTN: %w", errno)
	}
	slavePath := fmt.Sprintf("/dev/pts/%d", n)

	slave, err := os.OpenFile(slavePath, os.O_RDWR, 0)
	if err != nil {
		master.Close()
		return nil, nil, fmt.Errorf("open slave %s: %w", slavePath, err)
	}
	defer slave.Close() // child inherits; parent closes its copy after Start

	// Set initial terminal size.
	ws := winsize{Row: uint16(rows), Col: uint16(cols)}
	syscall.Syscall(syscall.SYS_IOCTL, master.Fd(), tiocswinsz, uintptr(unsafe.Pointer(&ws)))

	cmd := exec.Command(androidShell())
	cmd.Dir = cwd
	cmd.Env = env
	cmd.Stdin = slave
	cmd.Stdout = slave
	cmd.Stderr = slave
	// Setsid creates a new session; Setctty+Ctty:1 makes stdout (the slave fd)
	// the controlling terminal in the child process.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setctty: true, Ctty: 1}

	if err := cmd.Start(); err != nil {
		master.Close()
		return nil, nil, err
	}

	cleanup := func() {
		master.Close()
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		cmd.Wait()
	}
	return &androidPTY{master}, cleanup, nil
}

// androidShell returns the best available shell on this Android device.
// Termux provides a rich bash environment if installed; otherwise we fall
// back to the minimal system shells.
func androidShell() string {
	for _, sh := range []string{
		"/data/data/com.termux/files/usr/bin/bash",
		"/system/bin/bash",
		"/system/bin/sh",
	} {
		if _, err := os.Stat(sh); err == nil {
			return sh
		}
	}
	return "/system/bin/sh"
}
