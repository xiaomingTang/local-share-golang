package main

import (
	"errors"
	"net"
)

func getLocalIPv4() (string, error) {
	ifs, err := net.Interfaces()
	if err != nil {
		return "", err
	}

	for _, iface := range ifs {
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			default:
				continue
			}

			ip4 := ip.To4()
			if ip4 == nil {
				continue
			}
			return ip4.String(), nil
		}
	}

	return "", errors.New("未找到可用的局域网 IPv4 地址")
}

func getAvailablePort() (int, net.Listener, error) {
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		return 0, nil, err
	}
	addr := ln.Addr().(*net.TCPAddr)
	return addr.Port, ln, nil
}
