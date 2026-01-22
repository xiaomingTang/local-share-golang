package main

import (
	"context"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func quitApp(ctx context.Context) {
	wailsruntime.Quit(ctx)
}
