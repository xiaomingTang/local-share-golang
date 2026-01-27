package main

import (
	"archive/zip"
	"bytes"
	"context"
	"embed"
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
)

//go:embed all:web/dist
var webAssets embed.FS

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
	mu sync.RWMutex

	sharedRoot string
	localIP    string
	port       int

	server   *http.Server
	listener net.Listener

	events *sseHub

	watchMu   sync.Mutex
	watcher   *directoryWatcher
	watchRoot string
}

func NewShareServer() *ShareServer {
	return &ShareServer{events: newSSEHub()}
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
	port, ln, err := getAvailablePort()
	if err != nil {
		return nil, err
	}

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       0,
		WriteTimeout:      0,
		IdleTimeout:       60 * time.Second,
	}

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

	s.resetWatcher(absRoot)
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

	// Stop directory watcher before tearing down state.
	s.stopWatcher()

	shutdownCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	err := s.server.Shutdown(shutdownCtx)
	_ = s.listener.Close()

	s.server = nil
	s.listener = nil
	s.port = 0
	s.localIP = ""
	s.sharedRoot = ""

	return err
}

func (s *ShareServer) registerRoutes(mux *http.ServeMux) {
	staticFS, err := fs.Sub(webAssets, "web/dist")
	if err != nil {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "static assets not available", http.StatusInternalServerError)
		})
		return
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
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

		data, readErr := fs.ReadFile(staticFS, name)
		if readErr != nil {
			// If it's a directory, try index.html inside it.
			if st, statErr := fs.Stat(staticFS, name); statErr == nil && st.IsDir() {
				idx := path.Join(name, "index.html")
				data, readErr = fs.ReadFile(staticFS, idx)
				name = idx
			}
		}
		if readErr != nil {
			// SPA fallback: if a non-asset route is requested, serve index.html.
			// Keep missing static assets as 404 (e.g. /assets/*.js).
			base := path.Base(name)
			isAsset := strings.Contains(base, ".")
			if !isAsset {
				idxData, idxErr := fs.ReadFile(staticFS, "index.html")
				if idxErr == nil {
					data = idxData
					name = "index.html"
					readErr = nil
				}
			}
		}
		if readErr != nil {
			http.NotFound(w, r)
			return
		}

		http.ServeContent(w, r, path.Base(name), time.Time{}, bytes.NewReader(data))
	})

	mux.HandleFunc("/api/files", s.handleFiles)
	mux.HandleFunc("/api/events", s.handleEvents)
	mux.HandleFunc("/api/download", s.handleDownload)
	mux.HandleFunc("/api/download-zip", s.handleDownloadZip)
	mux.HandleFunc("/api/preview", s.handlePreview)
	mux.HandleFunc("/api/upload", s.handleUpload)
	mux.HandleFunc("/api/delete", s.handleDelete)
}

func (s *ShareServer) handleEvents(w http.ResponseWriter, r *http.Request) {
	if s.events == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	s.events.ServeHTTP(w, r)
}

func (s *ShareServer) handleFiles(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	root := s.sharedRoot
	s.mu.RUnlock()
	if root == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "服务未启动"})
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
	Paths []string `json:"paths"`
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

	// Avoid zip-bomb/oversized requests.
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024*1024)

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

	zipName := "shared-" + time.Now().Format("20060102-150405") + ".zip"
	if len(paths) == 1 {
		base := path.Base(path.Clean(filepath.ToSlash(paths[0])))
		if base != "." && base != "" {
			zipName = base + ".zip"
		}
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename*=UTF-8''%s", url.PathEscape(zipName)))
	zw := zip.NewWriter(w)
	defer func() { _ = zw.Close() }()

	usedNames := map[string]int{}
	filesAdded := 0
	var totalSize int64

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

	addFile := func(fullPath string, zipEntry string, modTime time.Time, size int64) error {
		if filesAdded >= maxFilesInZip {
			return errors.New("打包文件过多，请减少选择")
		}
		totalSize += size
		if totalSize > maxTotalSize {
			return errors.New("打包内容过大，请减少选择")
		}

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
		filesAdded++
		return nil
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

		if !st.IsDir() {
			if !st.Mode().IsRegular() {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "只支持打包普通文件"})
				return
			}
			if err := addFile(full, cleanRel, st.ModTime(), st.Size()); err != nil {
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
			return addFile(p, zipEntry, info.ModTime(), info.Size())
		})
		if walkErr != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "打包失败"})
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
