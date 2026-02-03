package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	githubOwner = "xiaomingTang"
	githubRepo  = "local-share-golang"

	// The release asset inside the zip.
	// Some historical builds used the *-dev.exe name; current CI packs local-share-golang.exe.
	releaseInnerExeName = "local-share-golang-dev.exe"
	// Some builds may contain a non-dev name; keep as fallback.
	releaseInnerExeNameAlt = "local-share-golang.exe"
)

type pendingUpdate struct {
	latestTag        string
	zipName          string
	zipURL           string
	shaURL           string
	zipPath          string
	shaPath          string
	extractedExePath string
	downloadsDir     string
	backupExePath    string
}

type githubReleaseLatest struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
	Body    string `json:"body"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

func (a *App) GetVersion() string {
	return Version
}

func (a *App) GetDownloadsDir() (string, error) {
	return getDownloadsDir()
}

func (a *App) CheckForUpdate() (*UpdateInfo, error) {
	appendLaunchLogf("update check start current=%q", Version)
	rel, err := fetchLatestRelease(githubOwner, githubRepo)
	if err != nil {
		appendLaunchLogf("update check err=%v", err)
		return nil, err
	}

	zipName, zipURL, shaURL := pickWindowsAMD64ZipAndSha(rel)
	if zipURL == "" || shaURL == "" {
		return &UpdateInfo{
			CurrentVersion: Version,
			LatestVersion:  rel.TagName,
			HasUpdate:      false,
			ReleaseURL:     rel.HTMLURL,
			Notes:          rel.Body,
			ZipName:        zipName,
			ZipURL:         zipURL,
			ShaURL:         shaURL,
		}, fmt.Errorf("未找到适用于 Windows amd64 的 zip/sha256 资产")
	}

	hasUpdate := isNewerVersion(Version, rel.TagName)
	appendLaunchLogf("update check done current=%q latest=%q has=%v zip=%q sha=%v", Version, rel.TagName, hasUpdate, zipName, shaURL != "")
	return &UpdateInfo{
		CurrentVersion: Version,
		LatestVersion:  rel.TagName,
		HasUpdate:      hasUpdate,
		ReleaseURL:     rel.HTMLURL,
		Notes:          rel.Body,
		ZipName:        zipName,
		ZipURL:         zipURL,
		ShaURL:         shaURL,
	}, nil
}

func (a *App) DownloadLatestUpdate() (*DownloadResult, error) {
	appendLaunchLogf("update download start current=%q", Version)
	rel, err := fetchLatestRelease(githubOwner, githubRepo)
	if err != nil {
		appendLaunchLogf("update download fetch err=%v", err)
		return nil, err
	}
	zipName, zipURL, shaURL := pickWindowsAMD64ZipAndSha(rel)
	if zipURL == "" || shaURL == "" {
		return nil, fmt.Errorf("未找到适用于 Windows amd64 的 zip/sha256 资产")
	}

	if !isNewerVersion(Version, rel.TagName) {
		return &DownloadResult{
			LatestVersion: rel.TagName,
		}, fmt.Errorf("当前已是最新版本")
	}

	downloadsDir, err := getDownloadsDir()
	if err != nil {
		return nil, err
	}

	zipPath := filepath.Join(downloadsDir, zipName)
	shaPath := zipPath + ".sha256"

	// Download sha first (small) then zip.
	if err := downloadToFileIfNeeded(shaURL, shaPath, "LocalShare/"+Version); err != nil {
		return nil, err
	}
	if err := downloadToFileIfNeeded(zipURL, zipPath, "LocalShare/"+Version); err != nil {
		return nil, err
	}

	expected, err := parseSha256File(shaPath)
	if err != nil {
		return nil, err
	}
	actual, err := sha256FileHex(zipPath)
	if err != nil {
		return nil, err
	}
	if !strings.EqualFold(expected, actual) {
		appendLaunchLogf("update sha mismatch expected=%s actual=%s zip=%q", expected, actual, zipPath)
		return nil, fmt.Errorf("SHA256 校验失败：期望 %s，实际 %s（文件：%s）", expected, actual, zipPath)
	}

	extractedExePath, err := extractInnerExe(zipPath, downloadsDir, rel.TagName)
	if err != nil {
		appendLaunchLogf("update extract err=%v", err)
		return nil, err
	}

	// Back up the currently running exe using the *current* version, not the target version.
	backupExePath := filepath.Join(downloadsDir, backupExeNameForCurrentVersion())
	appendLaunchLogf("update download ok latest=%q zip=%q extracted=%q backup=%q", rel.TagName, zipPath, extractedExePath, backupExePath)

	a.pendingUpdateMu.Lock()
	a.pendingUpdate = &pendingUpdate{
		latestTag:        rel.TagName,
		zipName:          zipName,
		zipURL:           zipURL,
		shaURL:           shaURL,
		zipPath:          zipPath,
		shaPath:          shaPath,
		extractedExePath: extractedExePath,
		downloadsDir:     downloadsDir,
		backupExePath:    backupExePath,
	}
	a.pendingUpdateMu.Unlock()

	return &DownloadResult{
		LatestVersion:    rel.TagName,
		DownloadsDir:     downloadsDir,
		ZipPath:          zipPath,
		ShaPath:          shaPath,
		ExtractedExePath: extractedExePath,
		BackupExePath:    backupExePath,
	}, nil
}

func (a *App) ApplyDownloadedUpdate() error {
	if runtime.GOOS != "windows" {
		return errors.New("当前仅支持 Windows 自动更新")
	}

	a.pendingUpdateMu.Lock()
	pu := a.pendingUpdate
	a.pendingUpdateMu.Unlock()
	if pu == nil {
		return errors.New("没有可应用的更新，请先下载")
	}
	if pu.extractedExePath == "" {
		return errors.New("更新文件不存在，请重新下载")
	}
	if _, err := os.Stat(pu.extractedExePath); err != nil {
		return fmt.Errorf("更新文件不存在：%v", err)
	}

	oldExe, err := os.Executable()
	if err != nil {
		return err
	}
	appendLaunchLogf("update apply start oldExe=%q newExe=%q backup=%q", oldExe, pu.extractedExePath, pu.backupExePath)

	// Pre-check directory writable (so we can fail fast with a system dialog before quitting).
	exeDir := filepath.Dir(oldExe)
	if err := canWriteDir(exeDir); err != nil {
		a.showSystemError("更新失败", fmt.Sprintf("无法写入程序目录：%s\n\n请把程序放到可写目录（如桌面/下载/自建文件夹）后再试。\n\n详细错误：%v", exeDir, err))
		return err
	}

	ps1Path, err := writeUpdateScript(pu.downloadsDir, pu.latestTag)
	if err != nil {
		a.showSystemError("更新失败", fmt.Sprintf("无法创建更新脚本：%v", err))
		return err
	}

	// Kick off the updater and quit.
	if err := startWindowsUpdaterPowerShell(ps1Path, os.Getpid(), oldExe, pu.extractedExePath, pu.backupExePath); err != nil {
		a.showSystemError("更新失败", fmt.Sprintf("无法启动更新进程：%v", err))
		appendLaunchLogf("update apply start updater err=%v", err)
		return err
	}
	appendLaunchLogf("update apply updater started ps1=%q", ps1Path)

	// Quit immediately. The updater waits for PID to exit.
	if a.ctx != nil {
		quitApp(a.ctx)
		return nil
	}
	os.Exit(0)
	return nil
}

func fetchLatestRelease(owner, repo string) (*githubReleaseLatest, error) {
	api := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", owner, repo)
	req, err := http.NewRequest("GET", api, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "LocalShare/"+Version)

	resp, err := doWithProxyFallback(req, 15*time.Second)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
		return nil, fmt.Errorf("GitHub API status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(b)))
	}

	var rel githubReleaseLatest
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}
	return &rel, nil
}

func doWithProxyFallback(req *http.Request, timeout time.Duration) (*http.Response, error) {
	if req == nil {
		return nil, errors.New("request is nil")
	}
	proxyURL, proxyUsed := proxyFromEnv(req)

	// First attempt: with proxy (system default).
	resp, err := (&http.Client{Timeout: timeout}).Do(req)
	if err == nil {
		return resp, nil
	}
	if !proxyUsed {
		return nil, err
	}

	// Second attempt: direct, bypassing proxy (common when local proxy is down).
	req2 := req.Clone(req.Context())
	directTransport := &http.Transport{
		Proxy: nil,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	resp2, err2 := (&http.Client{Timeout: timeout, Transport: directTransport}).Do(req2)
	if err2 == nil {
		appendLaunchLogf("update http proxy failed, direct ok proxy=%q err=%v", proxyURL, err)
		return resp2, nil
	}

	// Return a clearer hint when proxy looks like a local proxy (e.g. 127.0.0.1:1080).
	if isLikelyLocalProxy(proxyURL) {
		return nil, fmt.Errorf("访问 GitHub 失败：检测到系统代理 %s 可能不可用（请检查代理软件/系统代理设置）。\n\n代理错误：%v\n直连错误：%v", proxyURL, err, err2)
	}
	return nil, fmt.Errorf("访问 GitHub 失败（系统代理 %s）：%v；直连也失败：%v", proxyURL, err, err2)
}

func proxyFromEnv(req *http.Request) (string, bool) {
	if req == nil {
		return "", false
	}
	pu, err := http.ProxyFromEnvironment(req)
	if err != nil || pu == nil {
		return "", false
	}
	return pu.String(), true
}

func isLikelyLocalProxy(proxyStr string) bool {
	proxyStr = strings.TrimSpace(proxyStr)
	if proxyStr == "" {
		return false
	}
	u, err := url.Parse(proxyStr)
	if err != nil {
		return false
	}
	host := u.Hostname()
	if host == "" {
		return false
	}
	ip := net.ParseIP(host)
	if ip != nil {
		return ip.IsLoopback()
	}
	return strings.EqualFold(host, "localhost")
}

func pickWindowsAMD64ZipAndSha(rel *githubReleaseLatest) (zipName, zipURL, shaURL string) {
	if rel == nil {
		return "", "", ""
	}
	// Prefer the exact naming pattern the user described.
	var zipCandidateName, zipCandidateURL string
	for _, a := range rel.Assets {
		nameLower := strings.ToLower(a.Name)
		if strings.HasSuffix(nameLower, "-windows-amd64.zip") {
			zipCandidateName = a.Name
			zipCandidateURL = a.BrowserDownloadURL
			break
		}
	}
	if zipCandidateURL == "" {
		// Fallback: any .zip containing windows+amd64.
		for _, a := range rel.Assets {
			nameLower := strings.ToLower(a.Name)
			if strings.HasSuffix(nameLower, ".zip") && strings.Contains(nameLower, "windows") && strings.Contains(nameLower, "amd64") {
				zipCandidateName = a.Name
				zipCandidateURL = a.BrowserDownloadURL
				break
			}
		}
	}
	if zipCandidateURL == "" {
		return "", "", ""
	}

	// Find matching sha asset.
	shaNameLower := strings.ToLower(zipCandidateName + ".sha256")
	for _, a := range rel.Assets {
		if strings.ToLower(a.Name) == shaNameLower {
			return zipCandidateName, zipCandidateURL, a.BrowserDownloadURL
		}
	}
	// Fallback: any .sha256 containing the zip name.
	for _, a := range rel.Assets {
		nameLower := strings.ToLower(a.Name)
		if strings.HasSuffix(nameLower, ".sha256") && strings.Contains(nameLower, strings.ToLower(zipCandidateName)) {
			return zipCandidateName, zipCandidateURL, a.BrowserDownloadURL
		}
	}
	return zipCandidateName, zipCandidateURL, ""
}

func isNewerVersion(current, latest string) bool {
	cur := strings.TrimSpace(current)
	lat := strings.TrimSpace(latest)
	if lat == "" {
		return false
	}
	if cur == "" || strings.EqualFold(cur, "dev") {
		return true
	}
	c, ok1 := parseSemver3(cur)
	l, ok2 := parseSemver3(lat)
	if ok1 && ok2 {
		return compareSemver3(c, l) < 0
	}
	// If not parseable, fall back to simple string inequality.
	return !strings.EqualFold(cur, lat)
}

type semver3 struct{ major, minor, patch int }

func parseSemver3(v string) (semver3, bool) {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "v")
	// Strip pre-release/build metadata.
	if i := strings.IndexAny(v, "-+"); i >= 0 {
		v = v[:i]
	}
	parts := strings.Split(v, ".")
	if len(parts) < 3 {
		return semver3{}, false
	}
	ma, err1 := strconv.Atoi(parts[0])
	mi, err2 := strconv.Atoi(parts[1])
	pa, err3 := strconv.Atoi(parts[2])
	if err1 != nil || err2 != nil || err3 != nil {
		return semver3{}, false
	}
	return semver3{major: ma, minor: mi, patch: pa}, true
}

func compareSemver3(a, b semver3) int {
	if a.major != b.major {
		return cmpInt(a.major, b.major)
	}
	if a.minor != b.minor {
		return cmpInt(a.minor, b.minor)
	}
	return cmpInt(a.patch, b.patch)
}

func cmpInt(a, b int) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	default:
		return 0
	}
}

func getDownloadsDir() (string, error) {
	if runtime.GOOS == "windows" {
		if p, err := getDownloadsDirWindows(); err == nil {
			if strings.TrimSpace(p) != "" {
				return p, nil
			}
		}
		// Fallback.
		if home := os.Getenv("USERPROFILE"); strings.TrimSpace(home) != "" {
			return filepath.Join(home, "Downloads"), nil
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Downloads"), nil
}

func downloadToFileIfNeeded(url, destPath, userAgent string) error {
	if url == "" {
		return errors.New("download url is empty")
	}
	if st, err := os.Stat(destPath); err == nil && st.Size() > 0 {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return err
	}
	part := destPath + ".partial"
	_ = os.Remove(part)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	if strings.TrimSpace(userAgent) != "" {
		req.Header.Set("User-Agent", userAgent)
	}

	resp, err := doWithProxyFallback(req, 60*time.Second)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
		return fmt.Errorf("download status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(b)))
	}

	f, err := os.Create(part)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(f, resp.Body)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(part)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(part)
		return closeErr
	}
	return os.Rename(part, destPath)
}

func parseSha256File(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	line := strings.TrimSpace(string(b))
	if line == "" {
		return "", errors.New("sha256 文件为空")
	}
	// Common formats:
	//   <hex>  filename
	//   <hex> *filename
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return "", errors.New("sha256 文件格式无效")
	}
	expected := strings.TrimSpace(fields[0])
	expected = strings.TrimPrefix(expected, "SHA256(")
	expected = strings.TrimSuffix(expected, ")")
	expected = strings.TrimSpace(expected)
	if len(expected) != 64 {
		// Still allow but verify it's hex.
	}
	if _, err := hex.DecodeString(expected); err != nil {
		return "", fmt.Errorf("sha256 值不是合法 hex：%v", err)
	}
	return strings.ToLower(expected), nil
}

func sha256FileHex(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func extractInnerExe(zipPath, downloadsDir, latestTag string) (string, error) {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", err
	}
	defer zr.Close()

	var target *zip.File
	// 1) Prefer the expected dev exe.
	for _, f := range zr.File {
		if strings.EqualFold(filepath.Base(f.Name), releaseInnerExeName) {
			target = f
			break
		}
	}
	// 2) Fallback: non-dev exe name.
	if target == nil {
		for _, f := range zr.File {
			if strings.EqualFold(filepath.Base(f.Name), releaseInnerExeNameAlt) {
				target = f
				break
			}
		}
	}
	// 3) Last resort: first .exe in the zip.
	if target == nil {
		for _, f := range zr.File {
			if strings.HasSuffix(strings.ToLower(filepath.Base(f.Name)), ".exe") {
				target = f
				break
			}
		}
	}
	if target == nil {
		return "", fmt.Errorf("zip 中未找到可执行文件（期望：%s）", releaseInnerExeName)
	}
	if target.FileInfo().IsDir() {
		return "", fmt.Errorf("zip 条目是目录：%s", target.Name)
	}

	updateDir := filepath.Join(downloadsDir, "LocalShare-Update", sanitizePathPart(latestTag))
	if err := os.MkdirAll(updateDir, 0o755); err != nil {
		return "", err
	}
	outName := filepath.Base(target.Name)
	outPath := filepath.Join(updateDir, outName)

	rc, err := target.Open()
	if err != nil {
		return "", err
	}
	defer rc.Close()

	part := outPath + ".partial"
	_ = os.Remove(part)
	f, err := os.Create(part)
	if err != nil {
		return "", err
	}
	_, copyErr := io.Copy(f, rc)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(part)
		return "", copyErr
	}
	if closeErr != nil {
		_ = os.Remove(part)
		return "", closeErr
	}
	if err := os.Rename(part, outPath); err != nil {
		return "", err
	}
	return outPath, nil
}

func sanitizePathPart(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "unknown"
	}
	s = strings.ReplaceAll(s, ":", "_")
	s = strings.ReplaceAll(s, "\\", "_")
	s = strings.ReplaceAll(s, "/", "_")
	s = strings.ReplaceAll(s, "..", "_")
	return s
}

func backupExeNameForCurrentVersion() string {
	v := strings.TrimSpace(Version)
	if v == "" {
		v = "unknown"
	}
	if !strings.HasPrefix(strings.ToLower(v), "v") {
		v = "v" + v
	}
	return fmt.Sprintf("local-share-golang-%s.exe", v)
}

func backupExeNameForTarget(latestTag string) string {
	v := strings.TrimSpace(latestTag)
	if v == "" {
		v = strings.TrimSpace(Version)
	}
	if v == "" {
		v = "unknown"
	}
	if !strings.HasPrefix(strings.ToLower(v), "v") {
		v = "v" + v
	}
	return fmt.Sprintf("local-share-golang-%s.exe", v)
}

func canWriteDir(dir string) error {
	if strings.TrimSpace(dir) == "" {
		return errors.New("dir is empty")
	}
	f, err := os.CreateTemp(dir, ".localshare-writetest-*")
	if err != nil {
		return err
	}
	name := f.Name()
	_ = f.Close()
	return os.Remove(name)
}
