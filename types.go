package main

// ServerInfo matches the shape expected by the existing mobile web UI.
type ServerInfo struct {
	URL          string `json:"url"`
	Port         int    `json:"port"`
	LocalIP      string `json:"localIP"`
	QRCode       string `json:"qrCode"`
	SharedFolder string `json:"sharedFolder"`
}

type ContextMenuStatus struct {
	Exists bool `json:"exists"`
}
