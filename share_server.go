package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:web/dist
var webAssets embed.FS

const settingKeyCustomPort = "local-share:custom-port"
const settingKeyAccessPass = "local-share:access-pass"
const settingKeyPermissions = "local-share:permissions"

const headerShareToken = "X-Share-Token"
const queryShareToken = "token"

const authTokenTTL = 10 * time.Minute
const authTokenRenewBefore = 2 * time.Minute

const authRateWindow = 10 * time.Second
const authRateMaxRequestsPerWindow = 5

type authTokenEntry struct {
	ExpiresAt time.Time
	ClientIP  string
	PassHash  [32]byte
}

type rateWindowState struct {
	WindowStart time.Time
	Count       int
}

type directoryItem struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"` // "file" | "directory"
	Hidden    bool    `json:"hidden"`
	Size      int64   `json:"size"`
	Modified  string  `json:"modified"`
	Extension *string `json:"extension"`
}

type filesResponse struct {
	Items       []directoryItem `json:"items"`
	RootName    string          `json:"rootName"`
	CurrentPath string          `json:"currentPath"`
	ParentPath  *string         `json:"parentPath"`
}

type ShareServer struct {
	mu       sync.RWMutex
	settings *SettingsStore

	sharedRoot string
	localIP    string
	port       int

	server   *http.Server
	listener net.Listener

	events *sseHub

	authMu         sync.Mutex
	authTokens     map[string]authTokenEntry
	authRateByIP   map[string]rateWindowState
	authLastSweep  time.Time
	authLastRateGC time.Time

	watchMu   sync.Mutex
	watcher   *directoryWatcher
	watchRoot string
}

func shouldServeWebFromDisk() bool {
	// In dev, we want the share-server web UI (web/dist) to update without
	// restarting the Go process. Serving from disk achieves that.
	//
	// Production builds should still use embedded assets.
	if strings.EqualFold(os.Getenv("LOCALSHARE_WEB_DISK"), "1") {
		return true
	}
	return strings.EqualFold(Version, "dev")
}

func findWebDistDir() (string, bool) {
	// Try common locations. In `wails dev`, CWD is typically the repo root.
	candidates := []string{
		filepath.Join("web", "dist"),
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates, filepath.Join(exeDir, "web", "dist"))
	}

	for _, dir := range candidates {
		p := dir
		if st, err := os.Stat(filepath.Join(p, "index.html")); err == nil && !st.IsDir() {
			return p, true
		}
	}
	return "", false
}

func NewShareServer() *ShareServer {
	return &ShareServer{
		events:       newSSEHub(),
		settings:     NewSettingsStore(),
		authTokens:   map[string]authTokenEntry{},
		authRateByIP: map[string]rateWindowState{},
	}
}

func isValidAccessPass(pass string) bool {
	if pass == "" {
		return true
	}
	if len(pass) < 1 || len(pass) > 16 {
		return false
	}
	for i := 0; i < len(pass); i++ {
		c := pass[i]
		isDigit := c >= '0' && c <= '9'
		isLower := c >= 'a' && c <= 'z'
		isUpper := c >= 'A' && c <= 'Z'
		if !isDigit && !isLower && !isUpper {
			return false
		}
	}
	return true
}

func (s *ShareServer) getAccessPassFromSettings() (string, bool, error) {
	if s.settings == nil {
		return "", false, nil
	}
	raw, ok, err := s.settings.Get(settingKeyAccessPass)
	if err != nil {
		return "", false, err
	}
	if !ok || len(raw) == 0 {
		return "", false, nil
	}
	var pass string
	if err := json.Unmarshal(raw, &pass); err != nil {
		return "", false, err
	}
	pass = strings.TrimSpace(pass)
	if pass == "" {
		return "", false, nil
	}
	if !isValidAccessPass(pass) {
		return "", false, errors.New("无效访问口令")
	}
	return pass, true, nil
}

type permissionSetting struct {
	Read   *bool `json:"read"`
	Write  *bool `json:"write"`
	Delete *bool `json:"delete"`
}

type effectivePermissions struct {
	Read   bool
	Write  bool
	Delete bool
}

func (s *ShareServer) getPermissionsFromSettings() effectivePermissions {
	perms := effectivePermissions{Read: true, Write: true, Delete: false}
	if s.settings == nil {
		return perms
	}
	raw, ok, err := s.settings.Get(settingKeyPermissions)
	if err != nil || !ok || len(raw) == 0 {
		return perms
	}
	var input permissionSetting
	if err := json.Unmarshal(raw, &input); err != nil {
		return perms
	}
	if input.Read != nil {
		perms.Read = *input.Read
	}
	if input.Write != nil {
		perms.Write = *input.Write
	}
	if input.Delete != nil {
		perms.Delete = *input.Delete
	}
	return perms
}

func getClientIP(r *http.Request) string {
	if r == nil {
		return ""
	}
	addr := strings.TrimSpace(r.RemoteAddr)
	if addr == "" {
		return ""
	}
	host, _, err := net.SplitHostPort(addr)
	if err == nil && host != "" {
		return host
	}
	return addr
}

func (s *ShareServer) authRateAllowedLocked(ip string, now time.Time) bool {
	st := s.authRateByIP[ip]
	if st.WindowStart.IsZero() || now.Sub(st.WindowStart) >= authRateWindow {
		st.WindowStart = now
		st.Count = 0
	}
	if st.Count >= authRateMaxRequestsPerWindow {
		s.authRateByIP[ip] = st
		return false
	}
	st.Count++
	s.authRateByIP[ip] = st
	return true
}

func (s *ShareServer) authSweepLocked(now time.Time) {
	if now.Sub(s.authLastSweep) < 60*time.Second {
		return
	}
	s.authLastSweep = now
	for k, v := range s.authTokens {
		if now.After(v.ExpiresAt) {
			delete(s.authTokens, k)
		}
	}
}

func (s *ShareServer) authRateGCLocked(now time.Time) {
	if now.Sub(s.authLastRateGC) < 60*time.Second {
		return
	}
	s.authLastRateGC = now
	for ip, st := range s.authRateByIP {
		if st.WindowStart.IsZero() {
			delete(s.authRateByIP, ip)
			continue
		}
		if now.Sub(st.WindowStart) > 5*authRateWindow {
			delete(s.authRateByIP, ip)
		}
	}
}

func accessPassHash(pass string) [32]byte {
	// Token invalidation: when access pass changes, the hash changes,
	// making previously issued tokens invalid.
	return sha256.Sum256([]byte(pass))
}

func (s *ShareServer) issueAuthTokenLocked(ip string, passHash [32]byte, now time.Time) (string, time.Time, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	exp := now.Add(authTokenTTL)
	s.authTokens[token] = authTokenEntry{ExpiresAt: exp, ClientIP: ip, PassHash: passHash}
	return token, exp, nil
}

func (s *ShareServer) validateAndMaybeRenewToken(token string, ip string, passHash [32]byte, now time.Time) bool {
	if token == "" {
		return false
	}
	s.authMu.Lock()
	defer s.authMu.Unlock()
	s.authSweepLocked(now)
	entry, ok := s.authTokens[token]
	if !ok {
		return false
	}
	if now.After(entry.ExpiresAt) {
		delete(s.authTokens, token)
		return false
	}
	if subtle.ConstantTimeCompare(entry.PassHash[:], passHash[:]) != 1 {
		delete(s.authTokens, token)
		return false
	}
	// Optional binding: keep it strict (same IP) to reduce replay across IPs.
	if entry.ClientIP != "" && ip != "" && entry.ClientIP != ip {
		return false
	}
	if entry.ExpiresAt.Sub(now) <= authTokenRenewBefore {
		entry.ExpiresAt = now.Add(authTokenTTL)
		s.authTokens[token] = entry
	}
	return true
}

func (s *ShareServer) requireAuth(w http.ResponseWriter, r *http.Request) bool {
	pass, enabled, err := s.getAccessPassFromSettings()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "访问口令配置异常"})
		return false
	}
	if !enabled || pass == "" {
		return true
	}

	// Prefer header token; fall back to query for EventSource / download navigation.
	token := strings.TrimSpace(r.Header.Get(headerShareToken))
	if token == "" {
		token = strings.TrimSpace(r.URL.Query().Get(queryShareToken))
	}
	ip := getClientIP(r)
	if !s.validateAndMaybeRenewToken(token, ip, accessPassHash(pass), time.Now()) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "鉴权失败",
			"code":  "AUTH_REQUIRED",
		})
		return false
	}
	return true
}

func (s *ShareServer) requirePermission(w http.ResponseWriter, perm string) bool {
	perms := s.getPermissionsFromSettings()
	allowed := false
	code := ""
	msg := ""
	switch perm {
	case "read":
		allowed = perms.Read
		code = "PERMISSION_DENIED_READ"
		msg = "无读取权限"
	case "write":
		allowed = perms.Write
		code = "PERMISSION_DENIED_WRITE"
		msg = "无写入权限"
	case "delete":
		allowed = perms.Delete
		code = "PERMISSION_DENIED_DELETE"
		msg = "无删除权限"
	default:
		allowed = false
		code = "PERMISSION_DENIED"
		msg = "无权限"
	}
	if allowed {
		return true
	}
	writeJSON(w, http.StatusForbidden, map[string]string{
		"error": msg,
		"code":  code,
	})
	return false
}

func (s *ShareServer) handleAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	// If pass isn't enabled, return empty token.
	passSetting, enabled, err := s.getAccessPassFromSettings()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "访问口令配置异常"})
		return
	}
	if !enabled || passSetting == "" {
		writeJSON(w, http.StatusOK, map[string]any{"token": ""})
		return
	}

	ip := getClientIP(r)
	now := time.Now()

	s.authMu.Lock()
	allowed := s.authRateAllowedLocked(ip, now)
	s.authRateGCLocked(now)
	s.authMu.Unlock()
	if !allowed {
		w.Header().Set("Retry-After", fmt.Sprintf("%d", int(authRateWindow.Seconds())))
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"error":      "请求过于频繁，请稍后重试",
			"code":       "AUTH_RATE_LIMITED",
			"retryAfter": int(authRateWindow.Seconds()),
		})
		return
	}

	var req struct {
		Pass string `json:"pass"`
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	input := strings.TrimSpace(req.Pass)
	if input == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "需要访问口令",
			"code":  "AUTH_REQUIRED",
		})
		return
	}
	if !isValidAccessPass(input) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "访问口令格式错误"})
		return
	}

	// Constant-time compare (only meaningful when same length, but still good practice).
	ok := false
	if len(input) == len(passSetting) {
		ok = subtle.ConstantTimeCompare([]byte(input), []byte(passSetting)) == 1
	}
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "访问口令错误",
			"code":  "AUTH_INVALID",
		})
		return
	}

	passHash := accessPassHash(passSetting)

	s.authMu.Lock()
	token, exp, terr := s.issueAuthTokenLocked(ip, passHash, now)
	s.authSweepLocked(now)
	s.authMu.Unlock()
	if terr != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "生成 token 失败"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token":     token,
		"expiresIn": int(exp.Sub(now).Seconds()),
	})
}

func (s *ShareServer) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.server != nil
}

func (s *ShareServer) GetServerInfo() (*ServerInfo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.server == nil {
		return nil, nil
	}
	return &ServerInfo{
		URL:          fmt.Sprintf("http://%s:%d", s.localIP, s.port),
		Port:         s.port,
		LocalIP:      s.localIP,
		SharedFolder: s.sharedRoot,
	}, nil
}

func (s *ShareServer) getCustomPortFromSettings() (int, bool, error) {
	if s.settings == nil {
		return 0, false, nil
	}
	raw, ok, err := s.settings.Get(settingKeyCustomPort)
	if err != nil {
		return 0, false, err
	}
	if !ok || len(raw) == 0 {
		return 0, false, nil
	}
	var input string
	if err := json.Unmarshal(raw, &input); err != nil {
		return 0, false, err
	}
	input = strings.TrimSpace(input)
	if input == "" {
		return 0, false, nil
	}
	port, err := strconv.Atoi(input)
	if err != nil || port <= 0 || port > 65535 {
		return 0, false, errors.New("无效端口")
	}
	return port, true, nil
}

func (s *ShareServer) buildHTTPServer() *http.Server {
	mux := http.NewServeMux()
	s.registerRoutes(mux)
	return &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       0,
		WriteTimeout:      0,
		IdleTimeout:       60 * time.Second,
	}
}

func (s *ShareServer) Start(ctx context.Context, folderPath string) (*ServerInfo, error) {
	folderPath = strings.TrimSpace(folderPath)
	folderPath = strings.Trim(folderPath, "\"")
	if folderPath == "" {
		return nil, errors.New("共享文件夹路径为空")
	}

	absRoot, err := filepath.Abs(folderPath)
	if err != nil {
		return nil, err
	}
	st, err := os.Stat(absRoot)
	if err != nil {
		return nil, err
	}
	if !st.IsDir() {
		return nil, errors.New("共享路径不是文件夹")
	}

	s.mu.Lock()
	if s.server != nil {
		// 共享服务已在运行时，不要重新绑定端口（避免右键再次共享导致端口变化）。
		// 仅更新共享目录与（可选）本机 IP / 二维码。
		s.sharedRoot = absRoot
		if ip, ipErr := getLocalIPv4(); ipErr == nil {
			s.localIP = ip
		}

		urlStr := fmt.Sprintf("http://%s:%d", s.localIP, s.port)
		info := &ServerInfo{
			URL:          urlStr,
			Port:         s.port,
			LocalIP:      s.localIP,
			SharedFolder: s.sharedRoot,
		}
		s.mu.Unlock()
		// best-effort: restart watcher for new root
		s.resetWatcher(absRoot)
		return info, nil
	}
	s.mu.Unlock()

	ip, err := getLocalIPv4()
	if err != nil {
		return nil, err
	}

	var port int
	var ln net.Listener
	customPortUnavailable := false
	if customPort, ok, perr := s.getCustomPortFromSettings(); perr == nil && ok {
		l, lerr := net.Listen("tcp", fmt.Sprintf(":%d", customPort))
		if lerr != nil {
			customPortUnavailable = true
		} else {
			port = customPort
			ln = l
		}
	}
	if ln == nil {
		p, l, lerr := getAvailablePort()
		if lerr != nil {
			return nil, lerr
		}
		port = p
		ln = l
	}

	srv := s.buildHTTPServer()

	urlStr := fmt.Sprintf("http://%s:%d", ip, port)

	// Commit server state under lock (another goroutine might have started it).
	s.mu.Lock()
	if s.server != nil {
		// Someone started it; keep existing port, just update shared root.
		_ = ln.Close()
		s.sharedRoot = absRoot
		if ip2, ipErr := getLocalIPv4(); ipErr == nil {
			s.localIP = ip2
		}
		urlStr2 := fmt.Sprintf("http://%s:%d", s.localIP, s.port)
		info := &ServerInfo{
			URL:          urlStr2,
			Port:         s.port,
			LocalIP:      s.localIP,
			SharedFolder: s.sharedRoot,
		}
		s.mu.Unlock()
		s.resetWatcher(absRoot)
		return info, nil
	}

	s.sharedRoot = absRoot
	s.localIP = ip
	s.port = port
	s.listener = ln
	s.server = srv

	info := &ServerInfo{
		URL:          urlStr,
		Port:         port,
		LocalIP:      ip,
		SharedFolder: absRoot,
	}
	s.mu.Unlock()

	go func() {
		_ = srv.Serve(ln)
	}()

	if customPortUnavailable && ctx != nil {
		// Non-blocking: tell frontend we fell back to a random port.
		wruntime.EventsEmit(ctx, "toastError", "自定义端口不可用，已切换至随机端口")
	}

	s.resetWatcher(absRoot)
	return info, nil
}

func (s *ShareServer) ApplyCustomPorts(ctx context.Context, input string) (*ServerInfo, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, errors.New("端口不能为空")
	}
	port, err := strconv.Atoi(input)
	if err != nil || port <= 0 || port > 65535 {
		return nil, errors.New("无效端口")
	}

	// Persist the raw input so future starts prefer it.
	if s.settings != nil {
		b, _ := json.Marshal(input)
		_ = s.settings.Set(settingKeyCustomPort, b)
	}

	s.mu.RLock()
	running := s.server != nil
	root := s.sharedRoot
	currentPort := s.port
	s.mu.RUnlock()
	if !running || root == "" {
		return nil, errors.New("本地服务器未启用")
	}

	if port == currentPort {
		return s.GetServerInfo()
	}

	// Pre-bind to ensure we don't tear down the current server when the port is unavailable.
	ln, lerr := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if lerr != nil {
		return nil, errors.New("端口不可用")
	}

	ip, err := getLocalIPv4()
	if err != nil {
		_ = ln.Close()
		return nil, err
	}

	// Stop the old server then start a new one on the chosen port.
	if err := s.Stop(ctx); err != nil {
		_ = ln.Close()
		return nil, err
	}

	srv := s.buildHTTPServer()
	urlStr := fmt.Sprintf("http://%s:%d", ip, port)

	s.mu.Lock()
	if s.server != nil {
		s.mu.Unlock()
		_ = ln.Close()
		return nil, errors.New("服务状态已变化，请重试")
	}
	s.sharedRoot = root
	s.localIP = ip
	s.port = port
	s.listener = ln
	s.server = srv
	info := &ServerInfo{
		URL:          urlStr,
		Port:         port,
		LocalIP:      ip,
		SharedFolder: root,
	}
	s.mu.Unlock()

	go func() {
		_ = srv.Serve(ln)
	}()

	s.resetWatcher(root)
	return info, nil
}

func (s *ShareServer) Stop(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stopLocked(ctx)
}

func (s *ShareServer) stopLocked(ctx context.Context) error {
	if s.server == nil {
		return nil
	}

	// Proactively close SSE clients so long-lived event streams don't block shutdown.
	if s.events != nil {
		s.events.CloseAll()
	}

	// Stop directory watcher before tearing down state.
	s.stopWatcher()

	// Use a dedicated timeout context here: the app-level ctx may be canceled or
	// too short-lived for a graceful shutdown.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	err := s.server.Shutdown(shutdownCtx)
	if errors.Is(err, context.DeadlineExceeded) {
		// Graceful shutdown timed out (likely due to in-flight downloads/uploads).
		// Force-close to avoid surfacing a noisy error to the user.
		_ = s.server.Close()
		err = nil
	}
	_ = s.listener.Close()

	s.server = nil
	s.listener = nil
	s.port = 0
	s.localIP = ""
	s.sharedRoot = ""

	return err
}

func (s *ShareServer) registerRoutes(mux *http.ServeMux) {
	serveFromDisk := shouldServeWebFromDisk()
	var staticFS fs.FS
	isDiskFS := false

	if serveFromDisk {
		if dir, ok := findWebDistDir(); ok {
			staticFS = os.DirFS(dir)
			isDiskFS = true
		}
	}
	if staticFS == nil {
		sub, err := fs.Sub(webAssets, "web/dist")
		if err != nil {
			mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
				http.Error(w, "static assets not available", http.StatusInternalServerError)
			})
			return
		}
		staticFS = sub
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// In dev, prevent browser caching from masking updated builds.
		if isDiskFS {
			w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
			w.Header().Set("Pragma", "no-cache")
			w.Header().Set("Expires", "0")
		}

		// Serve embedded static assets.
		// Avoid http.FileServer's implicit redirects which can cause redirect loops
		// in some FS/path combinations.
		reqPath := r.URL.Path
		if reqPath == "" || reqPath == "/" {
			reqPath = "/index.html"
		}

		clean := path.Clean(reqPath)
		if !strings.HasPrefix(clean, "/") {
			clean = "/" + clean
		}
		name := strings.TrimPrefix(clean, "/")
		if name == "" {
			name = "index.html"
		}

		openAndServe := func(fileName string) bool {
			f, err := staticFS.Open(fileName)
			if err != nil {
				return false
			}
			defer f.Close()

			mod := time.Time{}
			if st, err := fs.Stat(staticFS, fileName); err == nil {
				mod = st.ModTime()
			}
			if rs, ok := f.(io.ReadSeeker); ok {
				http.ServeContent(w, r, path.Base(fileName), mod, rs)
				return true
			}
			// Fallback (should be rare): read into memory.
			data, err := fs.ReadFile(staticFS, fileName)
			if err != nil {
				return false
			}
			http.ServeContent(w, r, path.Base(fileName), mod, bytes.NewReader(data))
			return true
		}

		// Try exact file first.
		served := openAndServe(name)
		if !served {
			// If it's a directory, try index.html inside it.
			if st, statErr := fs.Stat(staticFS, name); statErr == nil && st.IsDir() {
				idx := path.Join(name, "index.html")
				name = idx
				served = openAndServe(idx)
			}
		}
		if !served {
			// SPA fallback: if a non-asset route is requested, serve index.html.
			// Keep missing static assets as 404 (e.g. /assets/*.js).
			base := path.Base(name)
			isAsset := strings.Contains(base, ".")
			if !isAsset {
				name = "index.html"
				served = openAndServe("index.html")
			}
		}
		if !served {
			http.NotFound(w, r)
			return
		}
	})

	mux.HandleFunc("/api/files", s.handleFiles)
	mux.HandleFunc("/api/events", s.handleEvents)
	mux.HandleFunc("/api/settings/", s.handleSettings)
	mux.HandleFunc("/api/settings", s.handleSettings)
	mux.HandleFunc("/api/auth", s.handleAuth)
	mux.HandleFunc("/api/download", s.handleDownload)
	mux.HandleFunc("/api/download-zip", s.handleDownloadZip)
	mux.HandleFunc("/api/preview", s.handlePreview)
	mux.HandleFunc("/api/upload", s.handleUpload)
	mux.HandleFunc("/api/delete", s.handleDelete)
}

func (s *ShareServer) handleEvents(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	if !s.requirePermission(w, "read") {
		return
	}
	if s.events == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	s.events.ServeHTTP(w, r)
}

func (s *ShareServer) handleSettings(w http.ResponseWriter, r *http.Request) {
	if s.settings == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "settings store not available"})
		return
	}

	key := strings.TrimPrefix(r.URL.Path, "/api/settings")
	key = strings.TrimPrefix(key, "/")
	key = strings.TrimSpace(key)
	if key == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing key"})
		return
	}
	// Do not allow reading/writing access pass over HTTP.
	if key == settingKeyAccessPass {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if !isValidSettingKey(key) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid key"})
		return
	}
	if !s.requireAuth(w, r) {
		return
	}

	switch r.Method {
	case http.MethodGet:
		raw, ok, err := s.settings.Get(key)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "read settings failed"})
			return
		}
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		writeJSON(w, http.StatusOK, struct {
			Value json.RawMessage `json:"value"`
		}{Value: raw})
		return

	case http.MethodPut:
		var req struct {
			Value json.RawMessage `json:"value"`
		}
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		if err := dec.Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}

		// Treat null/empty as delete.
		if len(req.Value) == 0 || string(req.Value) == "null" {
			if err := s.settings.Delete(key); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete setting failed"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}

		if !json.Valid(req.Value) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json value"})
			return
		}
		if err := s.settings.Set(key, req.Value); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save setting failed"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	default:
		w.Header().Set("Allow", "GET, PUT")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
}

func isValidSettingKey(key string) bool {
	if len(key) == 0 || len(key) > 256 {
		return false
	}
	// Keep URL/path parsing simple and avoid surprising keys.
	if strings.Contains(key, "/") || strings.Contains(key, "\\") {
		return false
	}
	return true
}

func (s *ShareServer) handleFiles(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	root := s.sharedRoot
	s.mu.RUnlock()
	if root == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "服务未启动"})
		return
	}
	if !s.requireAuth(w, r) {
		return
	}
	if !s.requirePermission(w, "read") {
		return
	}

	subPath := r.URL.Query().Get("path")
	fullPath, ok := safeJoin(root, subPath)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "无权限访问此路径"})
		return
	}

	st, err := os.Stat(fullPath)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "路径不存在"})
		return
	}
	if !st.IsDir() {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "路径不存在"})
		return
	}

	items, err := getDirectoryItems(fullPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "读取文件夹失败"})
		return
	}

	rootName := filepath.Base(root)
	if rootName == "" {
		rootName = root
	}

	var parentPath *string
	if strings.TrimSpace(subPath) != "" {
		p := filepath.ToSlash(filepath.Dir(filepath.FromSlash(subPath)))
		if p == "." {
			p = ""
		}
		parentPath = &p
	}

	resp := filesResponse{
		Items:       items,
		RootName:    rootName,
		CurrentPath: subPath,
		ParentPath:  parentPath,
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *ShareServer) handleDownload(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	root := s.sharedRoot
	s.mu.RUnlock()
	if root == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "服务未启动"})
		return
	}
	if !s.requireAuth(w, r) {
		return
	}
	if !s.requirePermission(w, "read") {
		return
	}

	filePath := r.URL.Query().Get("path")
	if strings.TrimSpace(filePath) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "缺少文件路径参数"})
		return
	}

	fullPath, ok := safeJoin(root, filePath)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "无权限访问此文件"})
		return
	}

	st, err := os.Stat(fullPath)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "文件不存在"})
		return
	}
	if st.IsDir() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "无法下载文件夹"})
		return
	}

	name := filepath.Base(fullPath)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename*=UTF-8''%s", url.PathEscape(name)))
	http.ServeFile(w, r, fullPath)
}

type pathsRequest struct {
	Paths  []string `json:"paths"`
	Ignore []string `json:"ignore"`
}

func (s *ShareServer) handleDownloadZip(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "仅支持 POST"})
		return
	}

	s.mu.RLock()
	root := s.sharedRoot
	s.mu.RUnlock()
	if root == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "服务未启动"})
		return
	}
	if !s.requireAuth(w, r) {
		return
	}
	if !s.requirePermission(w, "read") {
		return
	}

	// Avoid zip-bomb/oversized requests.
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024*1024)

	var req pathsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "请求体解析失败"})
		return
	}

	ignoreNames := make([]string, 0, len(req.Ignore))
	ignorePrefixes := make([]string, 0, len(req.Ignore))
	seenIgnore := make(map[string]struct{}, len(req.Ignore))
	for _, ig := range req.Ignore {
		ig = strings.TrimSpace(ig)
		if ig == "" {
			continue
		}
		// Normalize path ignores to forward slashes for zip entry comparison.
		igNorm := filepath.ToSlash(ig)
		igNorm = strings.TrimPrefix(igNorm, "/")
		if _, ok := seenIgnore[igNorm]; ok {
			continue
		}
		seenIgnore[igNorm] = struct{}{}
		if strings.Contains(igNorm, "/") {
			ignorePrefixes = append(ignorePrefixes, igNorm)
		} else {
			ignoreNames = append(ignoreNames, igNorm)
		}
	}

	isIgnoredName := func(name string) bool {
		if name == "" {
			return false
		}
		for _, ig := range ignoreNames {
			if runtime.GOOS == "windows" {
				if strings.EqualFold(name, ig) {
					return true
				}
				continue
			}
			if name == ig {
				return true
			}
		}
		return false
	}

	isIgnoredZipEntry := func(zipEntry string) bool {
		if zipEntry == "" {
			return false
		}
		zipEntry = path.Clean(filepath.ToSlash(zipEntry))
		zipEntry = strings.TrimPrefix(zipEntry, "/")

		// Quick segment name checks.
		parts := strings.Split(zipEntry, "/")
		for _, p := range parts {
			if isIgnoredName(p) {
				return true
			}
		}
		// Prefix path ignores, e.g. "frontend/node_modules".
		for _, pref := range ignorePrefixes {
			p := path.Clean(pref)
			p = strings.TrimPrefix(p, "/")
			if p == "" || p == "." {
				continue
			}
			if zipEntry == p || strings.HasPrefix(zipEntry, p+"/") {
				return true
			}
		}
		return false
	}

	paths := make([]string, 0, len(req.Paths))
	seen := make(map[string]struct{}, len(req.Paths))
	for _, p := range req.Paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		paths = append(paths, p)
	}
	if len(paths) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "未选择任何内容"})
		return
	}
	if len(paths) > 200 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "一次最多选择 200 个路径"})
		return
	}

	// 单个文件：保持兼容，直接返回原文件（不打 zip）
	if len(paths) == 1 {
		fullPath, ok := safeJoin(root, paths[0])
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "无权限访问此路径"})
			return
		}
		st, err := os.Stat(fullPath)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "路径不存在"})
			return
		}
		rootClean := filepath.Clean(root)
		fullClean := filepath.Clean(fullPath)
		isRoot := fullClean == rootClean
		if runtime.GOOS == "windows" {
			isRoot = strings.EqualFold(fullClean, rootClean)
		}
		if isRoot {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "禁止下载根目录"})
			return
		}

		if !st.IsDir() {
			name := filepath.Base(fullPath)
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename*=UTF-8''%s", url.PathEscape(name)))
			http.ServeFile(w, r, fullPath)
			return
		}
	}

	const maxFilesInZip = 2000
	const maxTotalSize int64 = 2 * 1024 * 1024 * 1024 // 2GB (uncompressed)
	errTooManyFiles := errors.New("打包文件过多，请减少选择")
	errTooLarge := errors.New("打包内容过大，请减少选择")

	type zipCandidate struct {
		fullPath string
		zipEntry string
		modTime  time.Time
		size     int64
	}

	// First pass: validate all selected paths and collect files to be zipped.
	// This ensures we can return a proper JSON error response without corrupting a partially-written zip.
	candidates := make([]zipCandidate, 0, len(paths))
	filesAdded := 0
	var totalSize int64
	addCandidate := func(fullPath string, zipEntry string, modTime time.Time, size int64) error {
		if filesAdded >= maxFilesInZip {
			return errTooManyFiles
		}
		totalSize += size
		if totalSize > maxTotalSize {
			return errTooLarge
		}
		candidates = append(candidates, zipCandidate{fullPath: fullPath, zipEntry: zipEntry, modTime: modTime, size: size})
		filesAdded++
		return nil
	}

	zipName := "shared-" + time.Now().Format("20060102-150405") + ".zip"
	if len(paths) == 1 {
		base := path.Base(path.Clean(filepath.ToSlash(paths[0])))
		if base != "." && base != "" {
			zipName = base + ".zip"
		}
	}

	for _, rel := range paths {
		full, ok := safeJoin(root, rel)
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "包含无权限访问的路径"})
			return
		}
		rootClean := filepath.Clean(root)
		fullClean := filepath.Clean(full)
		isRoot := fullClean == rootClean
		if runtime.GOOS == "windows" {
			isRoot = strings.EqualFold(fullClean, rootClean)
		}
		if isRoot {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "禁止下载根目录"})
			return
		}
		st, err := os.Lstat(full)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "包含不存在的路径"})
			return
		}
		if st.Mode()&os.ModeSymlink != 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "不支持打包符号链接"})
			return
		}

		cleanRel := path.Clean(filepath.ToSlash(rel))
		cleanRel = strings.TrimPrefix(cleanRel, "/")
		if isIgnoredZipEntry(cleanRel) {
			continue
		}

		if !st.IsDir() {
			if !st.Mode().IsRegular() {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "只支持打包普通文件"})
				return
			}
			if err := addCandidate(full, cleanRel, st.ModTime(), st.Size()); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			continue
		}

		// 目录：递归打包，保留相对路径前缀
		walkErr := filepath.WalkDir(full, func(p string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if isIgnoredName(d.Name()) {
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			// 跳过 symlink（避免穿透共享根目录）
			if d.Type()&fs.ModeSymlink != 0 {
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			if d.IsDir() {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			if !info.Mode().IsRegular() {
				return nil
			}
			relInside, err := filepath.Rel(full, p)
			if err != nil {
				return nil
			}
			zipEntry := path.Join(cleanRel, filepath.ToSlash(relInside))
			if isIgnoredZipEntry(zipEntry) {
				return nil
			}
			return addCandidate(p, zipEntry, info.ModTime(), info.Size())
		})
		if walkErr != nil {
			if errors.Is(walkErr, errTooManyFiles) || errors.Is(walkErr, errTooLarge) {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": walkErr.Error()})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "打包失败"})
			return
		}
	}

	if len(candidates) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "打包内容为空（已全部被忽略）"})
		return
	}

	// Second pass: stream zip once we know we can fulfill the request.
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename*=UTF-8''%s", url.PathEscape(zipName)))
	zw := zip.NewWriter(w)
	defer func() { _ = zw.Close() }()

	usedNames := map[string]int{}
	makeUnique := func(name string) string {
		name = path.Clean(strings.TrimPrefix(name, "/"))
		if name == "." || name == "" {
			name = "file"
		}
		if c := usedNames[name]; c == 0 {
			usedNames[name] = 1
			return name
		}
		usedNames[name] = usedNames[name] + 1
		c := usedNames[name] - 1

		dir := path.Dir(name)
		base := path.Base(name)
		ext := path.Ext(base)
		stem := strings.TrimSuffix(base, ext)
		alt := stem + " (" + strconv.Itoa(c) + ")" + ext
		if dir != "." {
			return path.Join(dir, alt)
		}
		return alt
	}

	addFile := func(fullPath string, zipEntry string, modTime time.Time) error {
		in, err := os.Open(fullPath)
		if err != nil {
			return err
		}
		defer in.Close()

		h := &zip.FileHeader{Name: makeUnique(zipEntry), Method: zip.Deflate}
		h.SetModTime(modTime)
		wtr, err := zw.CreateHeader(h)
		if err != nil {
			return err
		}
		_, err = io.Copy(wtr, in)
		if err != nil {
			return err
		}
		return nil
	}

	for _, c := range candidates {
		if err := addFile(c.fullPath, c.zipEntry, c.modTime); err != nil {
			// Response has already started (zip stream). We can't safely switch to JSON.
			return
		}
	}
}

func (s *ShareServer) handlePreview(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	root := s.sharedRoot
	s.mu.RUnlock()
	if root == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "服务未启动"})
		return
	}
	if !s.requireAuth(w, r) {
		return
	}
	if !s.requirePermission(w, "read") {
		return
	}

	filePath := r.URL.Query().Get("path")
	if strings.TrimSpace(filePath) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "缺少文件路径参数"})
		return
	}

	fullPath, ok := safeJoin(root, filePath)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "无权限访问此文件"})
		return
	}

	st, err := os.Stat(fullPath)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "文件不存在"})
		return
	}
	if st.IsDir() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "无法预览文件夹"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	mimeType := map[string]string{
		".ico":   "image/x-icon",
		".jpg":   "image/jpeg",
		".jpeg":  "image/jpeg",
		".png":   "image/png",
		".gif":   "image/gif",
		".bmp":   "image/bmp",
		".svg":   "image/svg+xml",
		".txt":   "text/plain; charset=utf-8",
		".log":   "text/plain; charset=utf-8",
		".md":    "text/markdown; charset=utf-8",
		".csv":   "text/csv; charset=utf-8",
		".json":  "application/json; charset=utf-8",
		".html":  "text/html; charset=utf-8",
		".xml":   "application/xml; charset=utf-8",
		".yml":   "text/yaml; charset=utf-8",
		".yaml":  "text/yaml; charset=utf-8",
		".css":   "text/css; charset=utf-8",
		".js":    "application/javascript; charset=utf-8",
		".ts":    "text/plain; charset=utf-8",
		".go":    "text/plain; charset=utf-8",
		".py":    "text/plain; charset=utf-8",
		".java":  "text/plain; charset=utf-8",
		".c":     "text/plain; charset=utf-8",
		".h":     "text/plain; charset=utf-8",
		".cpp":   "text/plain; charset=utf-8",
		".hpp":   "text/plain; charset=utf-8",
		".rs":    "text/plain; charset=utf-8",
		".php":   "text/plain; charset=utf-8",
		".rb":    "text/plain; charset=utf-8",
		".cs":    "text/plain; charset=utf-8",
		".kt":    "text/plain; charset=utf-8",
		".swift": "text/plain; charset=utf-8",
		".sh":    "text/plain; charset=utf-8",
		".bat":   "text/plain; charset=utf-8",
		".ps1":   "text/plain; charset=utf-8",
		".sql":   "text/plain; charset=utf-8",
		".toml":  "text/plain; charset=utf-8",
		".ini":   "text/plain; charset=utf-8",
		".env":   "text/plain; charset=utf-8",
	}[ext]
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", mimeType)
	http.ServeFile(w, r, fullPath)
}

func (s *ShareServer) handleUpload(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	root := s.sharedRoot
	s.mu.RUnlock()
	if root == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "服务未启动"})
		return
	}
	if !s.requireAuth(w, r) {
		return
	}
	perms := s.getPermissionsFromSettings()
	if !perms.Write {
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error": "无写入权限",
			"code":  "PERMISSION_DENIED_WRITE",
		})
		return
	}

	// 10GB
	r.Body = http.MaxBytesReader(w, r.Body, 10*1024*1024*1024)

	if err := r.ParseMultipartForm(64 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "解析上传数据失败"})
		return
	}

	vals := r.MultipartForm.Value
	targetPath := ""
	if v, ok := vals["path"]; ok && len(v) > 0 {
		targetPath = v[0]
	}

	uploadDir, ok := safeJoin(root, targetPath)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "无权限上传到此路径"})
		return
	}
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "创建目录失败"})
		return
	}

	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "没有上传文件"})
		return
	}

	type uploaded struct {
		Name string `json:"name"`
		Size int64  `json:"size"`
		Path string `json:"path"`
	}
	var results []uploaded

	for _, fh := range files {
		f, err := fh.Open()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "读取上传文件失败"})
			return
		}
		defer f.Close()

		outPath := filepath.Join(uploadDir, filepath.Base(fh.Filename))
		if !perms.Delete {
			if st, err := os.Stat(outPath); err == nil {
				if st.IsDir() {
					writeJSON(w, http.StatusForbidden, map[string]string{
						"error": "无删除权限，不能覆盖同名目录",
						"code":  "PERMISSION_DENIED_DELETE",
					})
					return
				}
				writeJSON(w, http.StatusForbidden, map[string]string{
					"error": "无删除权限，不能覆盖同名文件",
					"code":  "PERMISSION_DENIED_DELETE",
				})
				return
			}
		}
		out, err := os.Create(outPath)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "写入文件失败"})
			return
		}
		_, copyErr := io.Copy(out, f)
		closeErr := out.Close()
		if copyErr != nil || closeErr != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "写入文件失败"})
			return
		}

		rel, _ := filepath.Rel(root, outPath)
		results = append(results, uploaded{
			Name: fh.Filename,
			Size: fh.Size,
			Path: filepath.ToSlash(rel),
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": fmt.Sprintf("成功上传 %d 个文件", len(results)),
		"files":   results,
	})
}

func (s *ShareServer) handleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "仅支持 POST"})
		return
	}

	s.mu.RLock()
	root := s.sharedRoot
	s.mu.RUnlock()
	if root == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "服务未启动"})
		return
	}
	if !s.requireAuth(w, r) {
		return
	}
	if !s.requirePermission(w, "delete") {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024)
	var req pathsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "请求体解析失败"})
		return
	}

	paths := make([]string, 0, len(req.Paths))
	seen := make(map[string]struct{}, len(req.Paths))
	for _, p := range req.Paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		paths = append(paths, p)
	}
	if len(paths) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "未选择任何内容"})
		return
	}
	if len(paths) > 500 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "一次最多删除 500 个路径"})
		return
	}

	deleted := 0
	errorsMap := map[string]string{}
	for _, rel := range paths {
		full, ok := safeJoin(root, rel)
		if !ok {
			errorsMap[rel] = "无权限"
			continue
		}
		rootClean := filepath.Clean(root)
		fullClean := filepath.Clean(full)
		isRoot := fullClean == rootClean
		if runtime.GOOS == "windows" {
			isRoot = strings.EqualFold(fullClean, rootClean)
		}
		if isRoot {
			errorsMap[rel] = "禁止删除根目录"
			continue
		}
		st, err := os.Stat(full)
		if err != nil {
			errorsMap[rel] = "不存在"
			continue
		}
		if runtime.GOOS == "windows" {
			if err := moveToTrash(full); err != nil {
				errorsMap[rel] = "移入回收站失败"
				continue
			}
			deleted++
			continue
		}
		if st.IsDir() {
			if err := os.RemoveAll(full); err != nil {
				errorsMap[rel] = "删除失败"
				continue
			}
			deleted++
			continue
		}
		if err := os.Remove(full); err != nil {
			errorsMap[rel] = "删除失败"
			continue
		}
		deleted++
	}

	resp := map[string]any{
		"success":   true,
		"deleted":   deleted,
		"requested": len(paths),
	}
	if len(errorsMap) > 0 {
		resp["errors"] = errorsMap
	}
	writeJSON(w, http.StatusOK, resp)
}

func safeJoin(sharedRoot string, subPath string) (string, bool) {
	root := filepath.Clean(sharedRoot)
	if runtime.GOOS == "windows" {
		// Windows volume roots are special:
		// - filepath.Clean("D:") keeps the trailing separator
		// - filepath.Clean("D:") and building prefix as root+"\\" would create "D:\\\\" and break HasPrefix
		// - filepath.Clean("D:") might also become "D:" in some paths; normalize to "D:\\".
		vol := filepath.VolumeName(root)
		if vol != "" {
			// Depending on Go version, Clean("D:") can be "D:", "D:", or even "D:.".
			if strings.EqualFold(root, vol) || strings.EqualFold(root, vol+".") || strings.EqualFold(root, vol+string(os.PathSeparator)+".") {
				root = vol + string(os.PathSeparator)
			}
		}
	}
	sub := filepath.FromSlash(strings.TrimSpace(subPath))
	full := filepath.Clean(filepath.Join(root, sub))

	// Build prefix with exactly one path separator.
	prefix := root
	if !strings.HasSuffix(prefix, string(os.PathSeparator)) {
		prefix = prefix + string(os.PathSeparator)
	}

	if runtime.GOOS == "windows" {
		if strings.EqualFold(full, root) {
			return full, true
		}
		if strings.HasPrefix(strings.ToLower(full), strings.ToLower(prefix)) {
			return full, true
		}
		return "", false
	}

	if full == root {
		return full, true
	}
	if strings.HasPrefix(full, prefix) {
		return full, true
	}
	return "", false
}

func getDirectoryItems(dirPath string) ([]directoryItem, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	items := make([]directoryItem, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		isDir := info.IsDir()
		name := entry.Name()

		var ext *string
		if !isDir {
			e := strings.ToLower(filepath.Ext(name))
			ext = &e
		}

		items = append(items, directoryItem{
			Name:      name,
			Type:      map[bool]string{true: "directory", false: "file"}[isDir],
			Hidden:    isHiddenPath(dirPath, name),
			Size:      map[bool]int64{true: 0, false: info.Size()}[isDir],
			Modified:  info.ModTime().UTC().Format(time.RFC3339),
			Extension: ext,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Type != items[j].Type {
			return items[i].Type == "directory"
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	return items, nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func init() {
	// Ensure common mime types for ServeFile
	_ = mime.TypeByExtension(".md")
}
