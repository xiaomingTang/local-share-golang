//go:build windows

package main

import (
	"errors"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Windows Known Folder: Downloads
// https://learn.microsoft.com/windows/win32/shell/knownfolderid
var folderIDDownloads = windows.GUID{Data1: 0x374de290, Data2: 0x123f, Data3: 0x4565, Data4: [8]byte{0x91, 0x64, 0x39, 0xc4, 0x92, 0x5e, 0x46, 0x7b}}

func defaultShareFolder() string {
	if p, err := knownFolderPath(folderIDDownloads); err == nil {
		if st, statErr := os.Stat(p); statErr == nil && st.IsDir() {
			return p
		}
	}

	// Fallback: %USERPROFILE%\Downloads
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	fallback := filepath.Join(home, "Downloads")
	if st, statErr := os.Stat(fallback); statErr == nil && st.IsDir() {
		return fallback
	}
	// 最后的兜底：至少返回 home（保证不为空时可用）
	if st, statErr := os.Stat(home); statErr == nil && st.IsDir() {
		return home
	}
	return ""
}

func knownFolderPath(id windows.GUID) (string, error) {
	shell32 := windows.NewLazySystemDLL("shell32.dll")
	proc := shell32.NewProc("SHGetKnownFolderPath")
	if err := shell32.Load(); err != nil {
		return "", err
	}
	if err := proc.Find(); err != nil {
		return "", err
	}

	var out *uint16
	hr, _, callErr := proc.Call(
		uintptr(unsafe.Pointer(&id)),
		uintptr(0),
		uintptr(0),
		uintptr(unsafe.Pointer(&out)),
	)
	// SHGetKnownFolderPath returns HRESULT.
	if hr != 0 {
		if callErr != nil && callErr != windows.ERROR_SUCCESS {
			return "", callErr
		}
		return "", errors.New("SHGetKnownFolderPath failed")
	}
	if out == nil {
		return "", errors.New("SHGetKnownFolderPath returned empty")
	}
	path := windows.UTF16PtrToString(out)

	// Free memory returned by SHGetKnownFolderPath.
	ole32 := windows.NewLazySystemDLL("ole32.dll")
	free := ole32.NewProc("CoTaskMemFree")
	_ = ole32.Load()
	_ = free.Find()
	_, _, _ = free.Call(uintptr(unsafe.Pointer(out)))

	return path, nil
}
