//go:build !windows

package main

import "errors"

var errTrashUnsupported = errors.New("move to trash not supported on this platform")

func moveToTrash(path string) error {
	return errTrashUnsupported
}
