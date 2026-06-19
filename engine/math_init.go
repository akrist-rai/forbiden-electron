package main

import "math"

// Called from init() in main.go
func import_math() {
	cosApprox = math.Cos
	sinApprox = math.Sin
}

// Also add missing field to handleRunCode
var _ = func() bool { return true }
