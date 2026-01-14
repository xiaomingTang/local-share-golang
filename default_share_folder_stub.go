//go:build !windows

package main

import (
	"os"
	"path/filepath"
)

func defaultShareFolder() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	p := filepath.Join(home, "Downloads")
	if st, statErr := os.Stat(p); statErr == nil && st.IsDir() {
		return p
	}
	if st, statErr := os.Stat(home); statErr == nil && st.IsDir() {
		return home
	}
	return ""
}
