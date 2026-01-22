//go:build !windows

package main

import "errors"

func (a *App) showSystemError(title, message string) {
	_ = title
	_ = message
}

func startWindowsUpdaterPowerShell(ps1Path string, pid int, oldExePath, newExePath, backupExePath string) error {
	return errors.New("当前仅支持 Windows 自动更新")
}

func writeUpdateScript(downloadsDir, latestTag string) (string, error) {
	return "", errors.New("当前仅支持 Windows 自动更新")
}
