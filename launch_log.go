package main

import (
	"fmt"
	"os"
	"strings"
	"time"
)

func appendLaunchLogf(format string, args ...any) {
	appendLaunchLog(fmt.Sprintf(format, args...))
}

func appendLaunchLog(line string) {
	// 仅用于排查“右键菜单点了没反应/没共享/未唤起 UI”的问题。
	// 写到临时目录，不影响正常功能。
	path := filepathJoinSafe(os.TempDir(), "localshare-launch.log")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.WriteString(time.Now().Format(time.RFC3339) + " " + line + "\n")
}

func filepathJoinSafe(dir, name string) string {
	if strings.HasSuffix(dir, "\\") || strings.HasSuffix(dir, "/") {
		return dir + name
	}
	return dir + string(os.PathSeparator) + name
}
