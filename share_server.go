package main

import (
	"bytes"
	"context"
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
	"sort"
	"strings"
	"sync"
	"time"

	qrcode "github.com/skip2/go-qrcode"
)

//go:embed all:web
var webAssets embed.FS

type directoryItem struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"` // "file" | "directory"
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
	qrCode     string

	server   *http.Server
	listener net.Listener
}

func NewShareServer() *ShareServer {
	return &ShareServer{}
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
		QRCode:       s.qrCode,
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
	defer s.mu.Unlock()

	if s.server != nil {
		// 共享服务已在运行时，不要重新绑定端口（避免右键再次共享导致端口变化）。
		// 仅更新共享目录与（可选）本机 IP / 二维码。
		s.sharedRoot = absRoot
		if ip, ipErr := getLocalIPv4(); ipErr == nil {
			s.localIP = ip
		}

		urlStr := fmt.Sprintf("http://%s:%d", s.localIP, s.port)
		if s.localIP != "" && s.port > 0 {
			if png, qrErr := qrcode.Encode(urlStr, qrcode.Medium, 256); qrErr == nil {
				s.qrCode = "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
			}
		}

		return &ServerInfo{
			URL:          urlStr,
			Port:         s.port,
			LocalIP:      s.localIP,
			QRCode:       s.qrCode,
			SharedFolder: s.sharedRoot,
		}, nil
	}

	ip, err := getLocalIPv4()
	if err != nil {
		return nil, err
	}
	port, ln, err := getAvailablePort()
	if err != nil {
		return nil, err
	}

	s.sharedRoot = absRoot
	s.localIP = ip
	s.port = port
	s.listener = ln

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	s.server = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       0,
		WriteTimeout:      0,
		IdleTimeout:       60 * time.Second,
	}

	urlStr := fmt.Sprintf("http://%s:%d", s.localIP, s.port)
	png, err := qrcode.Encode(urlStr, qrcode.Medium, 256)
	if err != nil {
		_ = ln.Close()
		s.server = nil
		return nil, err
	}
	s.qrCode = "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)

	go func() {
		_ = s.server.Serve(ln)
	}()

	return &ServerInfo{
		URL:          urlStr,
		Port:         s.port,
		LocalIP:      s.localIP,
		QRCode:       s.qrCode,
		SharedFolder: s.sharedRoot,
	}, nil
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

	shutdownCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	err := s.server.Shutdown(shutdownCtx)
	_ = s.listener.Close()

	s.server = nil
	s.listener = nil
	s.port = 0
	s.localIP = ""
	s.qrCode = ""
	s.sharedRoot = ""

	return err
}

func (s *ShareServer) registerRoutes(mux *http.ServeMux) {
	staticFS, err := fs.Sub(webAssets, "web")
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
			http.NotFound(w, r)
			return
		}

		http.ServeContent(w, r, path.Base(name), time.Time{}, bytes.NewReader(data))
	})

	mux.HandleFunc("/api/files", s.handleFiles)
	mux.HandleFunc("/api/download", s.handleDownload)
	mux.HandleFunc("/api/preview", s.handlePreview)
	mux.HandleFunc("/api/upload", s.handleUpload)
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
		".ico":  "image/jpeg",
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".png":  "image/png",
		".gif":  "image/gif",
		".txt":  "text/plain; charset=utf-8",
		".md":   "text/markdown; charset=utf-8",
		".json": "application/json; charset=utf-8",
		".html": "text/html; charset=utf-8",
		".xml":  "application/xml; charset=utf-8",
		".yml":  "text/yaml; charset=utf-8",
		".yaml": "text/yaml; charset=utf-8",
		".css":  "text/css; charset=utf-8",
		".js":   "application/javascript; charset=utf-8",
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

func safeJoin(sharedRoot string, subPath string) (string, bool) {
	root := filepath.Clean(sharedRoot)
	sub := filepath.FromSlash(strings.TrimSpace(subPath))
	full := filepath.Clean(filepath.Join(root, sub))

	if full == root {
		return full, true
	}
	prefix := root + string(os.PathSeparator)
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
