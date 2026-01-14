package main

import (
	"errors"
	"net"
	"strings"
)

func getLocalIPv4() (string, error) {
	ifs, err := net.Interfaces()
	if err != nil {
		return "", err
	}

	type candidate struct {
		ip    net.IP
		score int
	}

	isRFC1918 := func(ip net.IP) bool {
		if ip == nil {
			return false
		}
		ip4 := ip.To4()
		if ip4 == nil {
			return false
		}
		// 10.0.0.0/8
		if ip4[0] == 10 {
			return true
		}
		// 172.16.0.0/12
		if ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31 {
			return true
		}
		// 192.168.0.0/16
		return ip4[0] == 192 && ip4[1] == 168
	}

	isIPv4LinkLocal := func(ip net.IP) bool {
		ip4 := ip.To4()
		return ip4 != nil && ip4[0] == 169 && ip4[1] == 254
	}

	isProbablyVPNOrVirtual := func(ifNameLower string) bool {
		keywords := []string{
			"radmin",
			"vpn",
			"virtualbox",
			"vmware",
			"hyper-v",
			"wintun",
			"wireguard",
			"tailscale",
			"zerotier",
			"hamachi",
			"tap",
			"tun",
			"utun",
			"docker",
			"vethernet",
			"loopback",
		}
		for _, k := range keywords {
			if strings.Contains(ifNameLower, k) {
				return true
			}
		}
		return false
	}

	best := (*candidate)(nil)
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

		ifNameLower := strings.ToLower(iface.Name)
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
			if ip4.IsLoopback() {
				continue
			}
			if isIPv4LinkLocal(ip4) {
				continue
			}

			score := 0
			if isRFC1918(ip4) {
				score += 100
			}
			// 轻微偏好 192.168（常见家庭/小型局域网），但不强制。
			if ip4[0] == 192 && ip4[1] == 168 {
				score += 5
			}
			// 常见 VirtualBox Host-Only 默认网段，降低优先级。
			if ip4[0] == 192 && ip4[1] == 168 && ip4[2] == 56 {
				score -= 50
			}
			if strings.Contains(ifNameLower, "wlan") || strings.Contains(ifNameLower, "wi-fi") || strings.Contains(ifNameLower, "wifi") || strings.Contains(ifNameLower, "wireless") {
				score += 40
			}
			if strings.Contains(ifNameLower, "ethernet") {
				score += 5
			}
			if iface.Flags&net.FlagPointToPoint != 0 {
				score -= 200
			}
			if isProbablyVPNOrVirtual(ifNameLower) {
				score -= 1000
			}

			cand := &candidate{ip: ip4, score: score}
			if best == nil || cand.score > best.score {
				best = cand
			}
		}
	}

	if best == nil {
		return "", errors.New("未找到可用的 IPv4 地址")
	}
	return best.ip.String(), nil
}

func getAvailablePort() (int, net.Listener, error) {
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		return 0, nil, err
	}
	addr := ln.Addr().(*net.TCPAddr)
	return addr.Port, ln, nil
}
