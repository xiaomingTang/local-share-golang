//go:build windows

package main

import (
	"errors"
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// moveToTrash moves a file/folder to the Windows Recycle Bin.
// It is best-effort and does not show UI.
func moveToTrash(path string) error {
	if path == "" {
		return errors.New("empty path")
	}

	// SHFileOperationW expects a double-NUL-terminated string list.
	p16, err := windows.UTF16FromString(path)
	if err != nil {
		return err
	}
	from := append(p16, 0) // add the extra NUL terminator

	type shFileOpStructW struct {
		hwnd                  uintptr
		wFunc                 uint32
		pFrom                 *uint16
		pTo                   *uint16
		fFlags                uint16
		fAnyOperationsAborted int32
		hNameMappings         uintptr
		lpszProgressTitle     *uint16
	}

	const (
		foDelete = 0x0003

		// https://learn.microsoft.com/windows/win32/api/shellapi/ns-shellapi-shfileopstructa
		fofSilent          = 0x0004
		fofNoConfirmation  = 0x0010
		fofAllowUndo       = 0x0040
		fofNoErrorUI       = 0x0400
		fofNoConnectedElem = 0x2000
	)

	op := shFileOpStructW{
		wFunc:  foDelete,
		pFrom:  &from[0],
		fFlags: fofAllowUndo | fofNoConfirmation | fofSilent | fofNoErrorUI | fofNoConnectedElem,
	}

	shell32 := syscall.NewLazyDLL("shell32.dll")
	proc := shell32.NewProc("SHFileOperationW")

	r1, _, _ := proc.Call(uintptr(unsafe.Pointer(&op)))
	if r1 != 0 {
		// SHFileOperation returns non-zero on failure; it's an HRESULT-like code.
		return fmt.Errorf("move to recycle bin failed: code=%d", r1)
	}
	if op.fAnyOperationsAborted != 0 {
		return errors.New("move to recycle bin aborted")
	}
	return nil
}
