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

// UpdateInfo is returned to the frontend for update UI.
type UpdateInfo struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	HasUpdate      bool   `json:"hasUpdate"`
	ReleaseURL     string `json:"releaseURL"`
	Notes          string `json:"notes"`

	ZipName string `json:"zipName"`
	ZipURL  string `json:"zipURL"`
	ShaURL  string `json:"shaURL"`
}

// DownloadResult is returned after a successful download+verify+extract.
type DownloadResult struct {
	LatestVersion    string `json:"latestVersion"`
	DownloadsDir     string `json:"downloadsDir"`
	ZipPath          string `json:"zipPath"`
	ShaPath          string `json:"shaPath"`
	ExtractedExePath string `json:"extractedExePath"`
	BackupExePath    string `json:"backupExePath"`
}
