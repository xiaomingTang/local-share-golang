//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

const (
	// 使用当前用户范围注册表（无需管理员权限），HKCU\Software\Classes 会合并到 HKCR 视图。
	contextMenuKey           = `Software\Classes\Directory\shell\ShareFolder`
	commandKey               = `Software\Classes\Directory\shell\ShareFolder\command`
	contextMenuKeyBackground = `Software\Classes\Directory\Background\shell\ShareFolder`
	commandKeyBackground     = `Software\Classes\Directory\Background\shell\ShareFolder\command`
	contextMenuDisplayName   = "共享此文件夹"
)

func (a *App) CheckContextMenuExists() (ContextMenuStatus, error) {
	exists, err := checkRegKeyExists(contextMenuKey)
	if err != nil {
		return ContextMenuStatus{}, err
	}
	if exists {
		return ContextMenuStatus{Exists: true}, nil
	}
	exists, err = checkRegKeyExists(contextMenuKeyBackground)
	if err != nil {
		return ContextMenuStatus{}, err
	}
	return ContextMenuStatus{Exists: exists}, nil
}

func (a *App) SetContextMenuEnabled(enable bool) error {
	if enable {
		return addContextMenu()
	}
	return removeContextMenu()
}

func checkRegKeyExists(key string) (bool, error) {
	k, err := registry.OpenKey(registry.CURRENT_USER, key, registry.QUERY_VALUE)
	if err == nil {
		_ = k.Close()
		return true, nil
	}
	if err == registry.ErrNotExist {
		return false, nil
	}
	return false, err
}

func addContextMenu() error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	exePath, err = filepath.Abs(exePath)
	if err != nil {
		return err
	}

	resolvedExePath := resolveContextMenuExePath(exePath)

	// 直接使用 exe 自带图标，避免额外 ico 文件的分发/路径问题。
	// 注意：注册表值里需要带引号以兼容路径含空格。
	iconValue := fmt.Sprintf(`"%s",0`, resolvedExePath)
	command := fmt.Sprintf(`"%s" --share="%%1"`, resolvedExePath)
	commandBackground := fmt.Sprintf(`"%s" --share="%%V"`, resolvedExePath)
	appendLaunchLogf("contextmenu write exe=%q resolved=%q", exePath, resolvedExePath)

	if err := ensureKeyStringValue(contextMenuKey, "", contextMenuDisplayName); err != nil {
		return err
	}
	if err := ensureKeyStringValue(contextMenuKeyBackground, "", contextMenuDisplayName); err != nil {
		return err
	}
	if err := ensureKeyStringValue(contextMenuKey, "Icon", iconValue); err != nil {
		return err
	}
	if err := ensureKeyStringValue(contextMenuKeyBackground, "Icon", iconValue); err != nil {
		return err
	}
	if err := ensureKeyStringValue(commandKey, "", command); err != nil {
		return err
	}
	if err := ensureKeyStringValue(commandKeyBackground, "", commandBackground); err != nil {
		return err
	}

	return nil
}

func ensureKeyStringValue(subKey string, valueName string, value string) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, subKey, registry.SET_VALUE|registry.CREATE_SUB_KEY)
	if err != nil {
		return err
	}
	defer func() { _ = k.Close() }()
	return k.SetStringValue(valueName, value)
}

func resolveContextMenuExePath(exePath string) string {
	// Wails dev 通常运行的是 *-dev.exe。
	// 但 Explorer 右键触发时环境不同，dev 版本未必能稳定启动；
	// 如果同目录下存在非 dev 的 .exe（wails build 输出），优先使用它。
	base := strings.TrimSuffix(filepath.Base(exePath), filepath.Ext(exePath))
	if !strings.HasSuffix(strings.ToLower(base), "-dev") {
		return exePath
	}
	stableBase := strings.TrimSuffix(base, "-dev")
	stablePath := filepath.Join(filepath.Dir(exePath), stableBase+filepath.Ext(exePath))
	if st, err := os.Stat(stablePath); err == nil && !st.IsDir() {
		return stablePath
	}
	return exePath
}

func removeContextMenu() error {
	// 删除顺序：先删子 key（command），再删父 key（ShareFolder）。
	// 注意：DeleteKey 目标不存在时会返回 ErrNotExist，视为成功。
	for _, k := range []string{commandKey, contextMenuKey, commandKeyBackground, contextMenuKeyBackground} {
		err := registry.DeleteKey(registry.CURRENT_USER, k)
		if err == nil || err == registry.ErrNotExist {
			continue
		}
		return err
	}
	return nil
}
