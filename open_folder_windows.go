//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func openFolderInOS(path string) error {
	path = strings.TrimSpace(path)
	path = strings.Trim(path, "\"")
	if path == "" {
		return nil
	}

	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	st, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return errors.New("文件夹不存在（可能已被删除）")
		}
		return err
	}

	if st.IsDir() {
		return exec.Command("explorer.exe", abs).Start()
	}

	// 不是目录时，定位到该文件。
	cmd := exec.Command("explorer.exe", "/select,"+abs)
	if err := cmd.Start(); err != nil {
		return err
	}
	return nil
}
