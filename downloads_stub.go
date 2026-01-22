//go:build !windows

package main

import "errors"

func getDownloadsDirWindows() (string, error) {
	return "", errors.New("not supported")
}
