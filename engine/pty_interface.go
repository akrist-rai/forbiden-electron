package main

// ptyHandle abstracts PTY I/O so main.go has no platform-specific code.
type ptyHandle interface {
	Read(p []byte) (int, error)
	Write(p []byte) (int, error)
	WriteString(s string) (int, error)
	Close() error
	Resize(cols, rows int) error
}
