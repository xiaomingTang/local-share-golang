//go:build windows

package main

import (
	"path/filepath"
	"strings"
	"syscall"
)

func isHiddenName(name string) bool {
	return strings.HasPrefix(name, ".") && name != "." && name != ".."
}

func isHiddenPath(dirPath string, name string) bool {
	// Dotfiles are treated as hidden too.
	if isHiddenName(name) {
		return true
	}

	full := filepath.Join(dirPath, name)
	p, err := syscall.UTF16PtrFromString(full)
	if err != nil {
		return false
	}
	attrs, err := syscall.GetFileAttributes(p)
	if err != nil {
		return false
	}

	const fileAttributeHidden = 0x2
	const fileAttributeSystem = 0x4
	return attrs&(fileAttributeHidden|fileAttributeSystem) != 0
}
