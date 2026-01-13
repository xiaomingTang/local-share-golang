package main

import (
	"embed"
	"net"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	initialShare := ""
	exe, _ := os.Executable()
	// Wails 在 dev 模式下会运行一个临时的 wailsbindings.exe 来生成绑定。
	// 该进程不应参与单实例逻辑，否则可能在极短时间内“抢到”互斥锁，导致真正的 App 进程误判为次实例并直接退出。
	baseExe := strings.ToLower(filepath.Base(exe))
	skipSingleInstance := strings.Contains(baseExe, "wailsbindings")
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, "--share=") {
			initialShare = strings.TrimPrefix(arg, "--share=")
			initialShare = strings.Trim(initialShare, "\"")
			break
		}
	}
	appendLaunchLogf("main exe=%q args=%q initialShare=%q", exe, strings.Join(os.Args[1:], " "), initialShare)
	if skipSingleInstance {
		appendLaunchLogf("single-instance skipped exe=%q", exe)
	}

	const appID = "LocalShare"
	primary, releaseMutex, err := true, func() {}, error(nil)
	if !skipSingleInstance {
		primary, releaseMutex, err = tryAcquireSingleInstance(appID)
	}
	if err != nil {
		appendLaunchLogf("single-instance acquire err=%v", err)
	} else if !primary {
		appendLaunchLogf("single-instance secondary: notifying existing instance")
		// 已有实例在运行：把这次启动意图（可选 --share）转发给它，然后直接退出。
		if err := notifyExistingInstance(appID, initialShare); err != nil {
			appendLaunchLogf("single-instance notify err=%v", err)
		}
		return
	}
	defer releaseMutex()
	if primary {
		appendLaunchLogf("single-instance primary")
	}

	var ipcLn net.Listener
	var ipcCleanup func()
	if primary {
		ln, cleanup, err := startInstanceIPC(appID)
		if err != nil {
			appendLaunchLogf("single-instance ipc start err=%v", err)
		} else {
			ipcLn = ln
			ipcCleanup = cleanup
		}
	}
	if ipcCleanup != nil {
		defer ipcCleanup()
	}

	// Create an instance of the app structure
	app := NewApp(initialShare)
	if ipcLn != nil {
		app.setIPCListener(ipcLn)
	}

	// Create application with options
	err = wails.Run(&options.App{
		Title:  "LocalShare",
		Width:  864,
		Height: 700,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
