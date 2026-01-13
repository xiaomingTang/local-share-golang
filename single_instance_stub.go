//go:build !windows

package main

import "net"

func tryAcquireSingleInstance(appID string) (primary bool, release func(), err error) {
	return true, func() {}, nil
}

func startInstanceIPC(appID string) (net.Listener, func(), error) {
	return nil, func() {}, nil
}

func notifyExistingInstance(appID string, sharePath string) error {
	return nil
}
