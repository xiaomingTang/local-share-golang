//go:build windows

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"golang.org/x/sys/windows"
)

var singleInstanceMutex windows.Handle

type instanceInfo struct {
	Port int `json:"port"`
}

func tryAcquireSingleInstance(appID string) (primary bool, release func(), err error) {
	name := "Local\\" + sanitizeMutexName(appID)
	ptr, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return false, nil, err
	}
	h, err := windows.CreateMutex(nil, false, ptr)
	// 注意：在 Go 的 syscall 封装里，CreateMutex 可能会在“句柄创建成功但对象已存在”时
	// 返回 err=ERROR_ALREADY_EXISTS。此时不应视为失败，而应当走“次实例”分支。
	if err != nil && !errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		return false, nil, err
	}
	already := windows.GetLastError() == windows.ERROR_ALREADY_EXISTS || errors.Is(err, windows.ERROR_ALREADY_EXISTS)
	if already {
		_ = windows.CloseHandle(h)
		return false, func() {}, nil
	}

	singleInstanceMutex = h
	return true, func() {
		if singleInstanceMutex != 0 {
			_ = windows.CloseHandle(singleInstanceMutex)
			singleInstanceMutex = 0
		}
	}, nil
}

func sanitizeMutexName(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "app"
	}
	// Mutex 名称不宜包含反斜杠等特殊字符。
	replacer := strings.NewReplacer("\\", "_", "/", "_", ":", "_", " ", "_")
	return replacer.Replace(s)
}

func instanceInfoPath(appID string) (string, error) {
	dir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	p := filepath.Join(dir, "LocalShare", appID, "instance.json")
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return "", err
	}
	return p, nil
}

func writeInstanceInfo(appID string, info instanceInfo) error {
	p, err := instanceInfoPath(appID)
	if err != nil {
		return err
	}
	data, err := json.Marshal(info)
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}

func readInstanceInfo(appID string) (instanceInfo, error) {
	p, err := instanceInfoPath(appID)
	if err != nil {
		return instanceInfo{}, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return instanceInfo{}, err
	}
	var info instanceInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return instanceInfo{}, err
	}
	return info, nil
}

func startInstanceIPC(appID string) (net.Listener, func(), error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, nil, err
	}
	addr := ln.Addr().String()
	_, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		_ = ln.Close()
		return nil, nil, err
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		_ = ln.Close()
		return nil, nil, err
	}
	if err := writeInstanceInfo(appID, instanceInfo{Port: port}); err != nil {
		_ = ln.Close()
		return nil, nil, err
	}
	cleanup := func() {
		_ = ln.Close()
	}
	return ln, cleanup, nil
}

func notifyExistingInstance(appID string, sharePath string) error {
	sharePath = strings.TrimSpace(sharePath)
	sharePath = strings.Trim(sharePath, "\"")

	var lastErr error
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		info, err := readInstanceInfo(appID)
		if err != nil {
			lastErr = err
			time.Sleep(100 * time.Millisecond)
			continue
		}
		if info.Port <= 0 {
			lastErr = errors.New("invalid ipc port")
			time.Sleep(100 * time.Millisecond)
			continue
		}

		conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", info.Port), 300*time.Millisecond)
		if err != nil {
			lastErr = err
			time.Sleep(100 * time.Millisecond)
			continue
		}
		_, _ = conn.Write([]byte(sharePath))
		_ = conn.Close()
		return nil
	}
	if lastErr == nil {
		lastErr = errors.New("notify timeout")
	}
	return lastErr
}
