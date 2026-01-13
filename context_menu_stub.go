//go:build !windows

package main

import "errors"

func (a *App) CheckContextMenuExists() (ContextMenuStatus, error) {
	return ContextMenuStatus{Exists: false}, errors.New("仅支持 Windows")
}

func (a *App) SetContextMenuEnabled(enable bool) error {
	return errors.New("仅支持 Windows")
}
