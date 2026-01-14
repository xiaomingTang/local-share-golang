//go:build !windows

package main

import "strings"

func isHiddenName(name string) bool {
	return strings.HasPrefix(name, ".") && name != "." && name != ".."
}

func isHiddenPath(_ string, name string) bool {
	return isHiddenName(name)
}
