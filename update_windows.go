//go:build windows

package main

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) showSystemError(title, message string) {
	if a == nil || a.ctx == nil {
		return
	}
	_, _ = runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.ErrorDialog,
		Title:   title,
		Message: message,
	})
}

func startWindowsUpdaterPowerShell(ps1Path string, pid int, oldExePath, newExePath, backupExePath string) error {
	args := []string{
		"-NoProfile",
		"-ExecutionPolicy", "Bypass",
		"-File", ps1Path,
		"-ProcId", strconv.Itoa(pid),
		"-OldExe", oldExePath,
		"-NewExe", newExePath,
		"-BackupExe", backupExePath,
	}
	cmd := exec.Command("powershell.exe", args...)
	cmd.Stdout = nil
	cmd.Stderr = nil
	return cmd.Start()
}

func writeUpdateScript(downloadsDir, latestTag string) (string, error) {
	updateDir := filepath.Join(downloadsDir, "LocalShare-Update", sanitizePathPart(latestTag))
	if err := os.MkdirAll(updateDir, 0o755); err != nil {
		return "", err
	}
	ps1Path := filepath.Join(updateDir, "apply-update.ps1")

	// A self-contained script: waits for process exit, backs up current exe (if backup not exists), replaces, restarts.
	// On any failure it shows a system message box.
	// NOTE: Use $ProcId (avoid conflict with PowerShell automatic variable $PID).
	script := strings.TrimSpace(`
param(
  [Parameter(Mandatory=$true)][int]$ProcId,
  [Parameter(Mandatory=$true)][string]$OldExe,
  [Parameter(Mandatory=$true)][string]$NewExe,
  [Parameter(Mandatory=$true)][string]$BackupExe
)

$ErrorActionPreference = 'Stop'

function Show-Error([string]$Title, [string]$Message) {
  try {
		Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue | Out-Null
		[System.Windows.Forms.MessageBox]::Show($Message, $Title, 'OK', 'Error') | Out-Null
  } catch {
    # ignore
  }
}

try {
	if (-not $ProcId) { throw 'ProcId 为空' }
  Wait-Process -Id $ProcId -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 250

  if (-not (Test-Path -LiteralPath $NewExe)) { throw ('更新文件不存在：' + $NewExe) }
  if (-not (Test-Path -LiteralPath $OldExe)) { throw ('原程序不存在：' + $OldExe) }

  if (-not (Test-Path -LiteralPath $BackupExe)) {
    try { Copy-Item -LiteralPath $OldExe -Destination $BackupExe -Force } catch {}
  }

  Move-Item -LiteralPath $NewExe -Destination $OldExe -Force
  Start-Process -FilePath $OldExe
} catch {
	$nl = [Environment]::NewLine
	$msg = "更新失败：" + $_.Exception.Message + $nl + $nl + "原程序：" + $OldExe + $nl + "新版本：" + $NewExe + $nl + "备份：" + $BackupExe
  Show-Error 'LocalShare 更新失败' $msg
}
`) + "\r\n"

	// PowerShell 5.1 may treat script files without BOM as ANSI.
	// UTF-8 with BOM is the most reliable choice across locales.
	data := []byte(script)
	data = bytes.ReplaceAll(data, []byte("\r\n"), []byte("\n"))
	data = bytes.ReplaceAll(data, []byte("\n"), []byte("\r\n"))
	utf8bom := []byte{0xEF, 0xBB, 0xBF}
	data = append(utf8bom, data...)
	if err := os.WriteFile(ps1Path, data, 0o644); err != nil {
		return "", err
	}
	return ps1Path, nil
}
