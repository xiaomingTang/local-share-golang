//go:build !windows

package main

import "errors"

func openFolderInOS(path string) error {
	return errors.New("仅支持 Windows")
}
