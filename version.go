package main

// Version is the current app version.
//
// Build-time injection example:
//
//	wails build -clean -platform windows/amd64 -ldflags "-X main.Version=v0.0.7"
//
// If not injected, it defaults to "dev".
var Version = "dev"
