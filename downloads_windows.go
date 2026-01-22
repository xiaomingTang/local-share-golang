//go:build windows

package main

import (
	"errors"
	"os"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// getDownloadsDirWindows returns the actual Downloads folder configured in Windows.
// This supports users moving Downloads to another drive.
func getDownloadsDirWindows() (string, error) {
	// User Shell Folders values are often REG_EXPAND_SZ.
	const userShellFolders = `Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders`
	const downloadsGUID = `{374DE290-123F-4565-9164-39C4925E467B}`

	k, err := registry.OpenKey(registry.CURRENT_USER, userShellFolders, registry.QUERY_VALUE)
	if err != nil {
		return "", err
	}
	defer k.Close()

	v, _, err := k.GetStringValue(downloadsGUID)
	if err != nil {
		// Fallback to literal name on some systems.
		v2, _, err2 := k.GetStringValue("Downloads")
		if err2 != nil {
			return "", err
		}
		v = v2
	}

	v = strings.TrimSpace(v)
	if v == "" {
		return "", errors.New("downloads path empty")
	}
	// Expand %USERPROFILE% etc.
	expanded := os.ExpandEnv(v)
	return expanded, nil
}
