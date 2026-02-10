package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx          context.Context
	shareServer  *ShareServer
	initialShare string

	ipcOnce     sync.Once
	ipcListener net.Listener

	pendingUpdateMu sync.Mutex
	pendingUpdate   *pendingUpdate
}

func (a *App) emitServerInfoChanged() {
	if a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, "serverInfoChanged")
}

// NewApp creates a new App application struct
func NewApp(initialShare string) *App {
	return &App{shareServer: NewShareServer(), initialShare: initialShare}
}

func (a *App) setIPCListener(ln net.Listener) {
	a.ipcListener = ln
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.startIPCListener()

	sharePath := strings.TrimSpace(a.initialShare)
	if sharePath == "" {
		return
	}

	// 启动时自动共享（来自右键菜单 --share=...）。
	// 这里不要吞掉错误：否则用户会觉得“点了没反应”。
	info, err := a.shareServer.Start(ctx, sharePath)
	appendLaunchLogf("startup --share=%q err=%v url=%v", sharePath, err, func() string {
		if info == nil {
			return ""
		}
		return info.URL
	}())
	a.emitServerInfoChanged()
	if err != nil {
		_, _ = runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "共享失败",
			Message: err.Error(),
		})
	}
}

func (a *App) startIPCListener() {
	if a.ipcListener == nil {
		return
	}
	a.ipcOnce.Do(func() {
		go func() {
			for {
				conn, err := a.ipcListener.Accept()
				if err != nil {
					return
				}
				go a.handleIPCConn(conn)
			}
		}()
	})
}

func (a *App) handleIPCConn(conn net.Conn) {
	defer func() { _ = conn.Close() }()
	if a.ctx == nil {
		return
	}

	data, _ := io.ReadAll(io.LimitReader(conn, 16*1024))
	sharePath := strings.TrimSpace(string(data))
	sharePath = strings.Trim(sharePath, "\"")

	// 尽量把窗口拉到前台。
	runtime.WindowShow(a.ctx)
	runtime.WindowUnminimise(a.ctx)
	// 小技巧：短暂置顶再取消，提升“唤醒到前台”的成功率。
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	runtime.WindowSetAlwaysOnTop(a.ctx, false)

	if sharePath == "" {
		a.emitServerInfoChanged()
		return
	}

	info, err := a.shareServer.Start(a.ctx, sharePath)
	appendLaunchLogf("ipc --share=%q err=%v url=%v", sharePath, err, func() string {
		if info == nil {
			return ""
		}
		return info.URL
	}())
	a.emitServerInfoChanged()
	if err != nil {
		_, _ = runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "共享失败",
			Message: err.Error(),
		})
	}
}

func (a *App) StartSharing(folderPath string) (*ServerInfo, error) {
	info, err := a.shareServer.Start(a.ctx, folderPath)
	a.emitServerInfoChanged()
	return info, err
}

func (a *App) StopSharing() error {
	err := a.shareServer.Stop(a.ctx)
	a.emitServerInfoChanged()
	return err
}

func (a *App) GetServerInfo() (*ServerInfo, error) {
	return a.shareServer.GetServerInfo()
}

func (a *App) ApplyCustomPorts(input string) (*ServerInfo, error) {
	info, err := a.shareServer.ApplyCustomPorts(a.ctx, input)
	a.emitServerInfoChanged()
	return info, err
}

// GetSetting returns a JSON string previously stored under key.
// If the key does not exist, it returns an empty string.
func (a *App) GetSetting(key string) (string, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return "", nil
	}
	if !isValidSettingKey(key) {
		return "", errors.New("invalid key")
	}
	if a.shareServer == nil || a.shareServer.settings == nil {
		return "", errors.New("settings store not available")
	}

	raw, ok, err := a.shareServer.settings.Get(key)
	if err != nil {
		return "", err
	}
	if !ok || len(raw) == 0 {
		return "", nil
	}
	return string(raw), nil
}

// SetSetting stores a JSON string under key. Pass "" or "null" to delete.
func (a *App) SetSetting(key string, value string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil
	}
	if !isValidSettingKey(key) {
		return errors.New("invalid key")
	}
	if a.shareServer == nil || a.shareServer.settings == nil {
		return errors.New("settings store not available")
	}

	value = strings.TrimSpace(value)
	if value == "" || value == "null" {
		if err := a.shareServer.settings.Delete(key); err != nil {
			return err
		}
		a.shareServer.emitSettingChanged(key, json.RawMessage("null"))
		return nil
	}
	if !json.Valid([]byte(value)) {
		return errors.New("invalid json")
	}
	if err := a.shareServer.settings.Set(key, json.RawMessage(value)); err != nil {
		return err
	}
	a.shareServer.emitSettingChanged(key, json.RawMessage(value))
	return nil
}

// OpenFolder opens the given path in the OS file explorer.
// Used by the frontend when clicking the shared folder path.
func (a *App) OpenFolder(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	return openFolderInOS(path)
}

func (a *App) PickFolder() (string, error) {
	if a.ctx == nil {
		return "", nil
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择要共享的文件夹",
	})
}
