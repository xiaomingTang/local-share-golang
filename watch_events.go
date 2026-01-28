package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

func (s *ShareServer) resetWatcher(root string) {
	root = filepath.Clean(root)
	if root == "" {
		s.stopWatcher()
		return
	}

	// Avoid doing expensive recursive watch if unchanged.
	s.watchMu.Lock()
	prev := s.watchRoot
	s.watchMu.Unlock()
	if samePath(prev, root) {
		return
	}

	s.stopWatcher()

	dw, err := newDirectoryWatcher(root, s.events)
	if err != nil {
		return
	}
	if err := dw.Start(); err != nil {
		dw.Stop()
		return
	}

	s.watchMu.Lock()
	s.watcher = dw
	s.watchRoot = root
	s.watchMu.Unlock()
}

func (s *ShareServer) stopWatcher() {
	s.watchMu.Lock()
	dw := s.watcher
	s.watcher = nil
	s.watchRoot = ""
	s.watchMu.Unlock()

	if dw != nil {
		dw.Stop()
	}
}

func samePath(a, b string) bool {
	a = filepath.Clean(strings.TrimSpace(a))
	b = filepath.Clean(strings.TrimSpace(b))
	if a == b {
		return true
	}
	// Windows is case-insensitive.
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return false
}

type sseHub struct {
	mu      sync.Mutex
	clients map[*sseClient]struct{}
}

type sseClient struct {
	ch        chan []byte
	closeOnce sync.Once
}

func (c *sseClient) close() {
	c.closeOnce.Do(func() {
		close(c.ch)
	})
}

func newSSEHub() *sseHub {
	return &sseHub{clients: make(map[*sseClient]struct{})}
}

func (h *sseHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")

	client := &sseClient{ch: make(chan []byte, 16)}
	h.addClient(client)
	defer h.removeClient(client)

	// Initial flush so the client considers the connection established.
	_, _ = io.WriteString(w, ": connected\n\n")
	flusher.Flush()

	keepAlive := time.NewTicker(20 * time.Second)
	defer keepAlive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepAlive.C:
			_, _ = io.WriteString(w, ": ping\n\n")
			flusher.Flush()
		case msg, ok := <-client.ch:
			if !ok {
				return
			}
			if len(msg) == 0 {
				continue
			}
			_, _ = w.Write(msg)
			flusher.Flush()
		}
	}
}

func (h *sseHub) addClient(c *sseClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = struct{}{}
}

func (h *sseHub) removeClient(c *sseClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c)
	c.close()
}

func (h *sseHub) CloseAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		c.close()
		delete(h.clients, c)
	}
}

func (h *sseHub) broadcast(event string, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	msg := []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", event, data))

	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		// Don't let slow clients block the broadcaster.
		select {
		case c.ch <- msg:
		default:
			// Drop backlog and keep the latest.
			for {
				select {
				case <-c.ch:
				default:
					goto sendLatest
				}
			}
		}
	sendLatest:
		select {
		case c.ch <- msg:
		default:
			// still full; give up
		}
	}
}

type directoryWatcher struct {
	watcher    *fsnotify.Watcher
	root       string
	ignoreDirs map[string]struct{}
	watched    map[string]struct{}
	stopCh     chan struct{}
	doneCh     chan struct{}

	hub *sseHub
}

const includeWriteEvents = false

func newDirectoryWatcher(root string, hub *sseHub) (*directoryWatcher, error) {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	dw := &directoryWatcher{
		watcher: w,
		root:    filepath.Clean(root),
		hub:     hub,
		ignoreDirs: map[string]struct{}{
			// VCS
			".git": {},
			".hg":  {},
			".svn": {},

			// JS / frontend deps
			"node_modules": {},

			// Common caches
			"__pycache__": {},
			".cache":      {},
			".gradle":     {},
			".m2":         {},
		},
		watched: make(map[string]struct{}),
		stopCh:  make(chan struct{}),
		doneCh:  make(chan struct{}),
	}

	return dw, nil
}

func (dw *directoryWatcher) Start() error {
	// Watch root and all sub-directories (skipping ignored).
	if err := dw.addRecursive(dw.root); err != nil {
		_ = dw.watcher.Close()
		return err
	}

	go dw.loop()
	return nil
}

func (dw *directoryWatcher) Stop() {
	select {
	case <-dw.stopCh:
		// already stopped
		return
	default:
		close(dw.stopCh)
	}
	_ = dw.watcher.Close()
	<-dw.doneCh
}

func (dw *directoryWatcher) loop() {
	defer close(dw.doneCh)

	pendingDirs := map[string]struct{}{}
	var timer *time.Timer
	flush := func() {
		if len(pendingDirs) == 0 {
			return
		}
		dirs := make([]string, 0, len(pendingDirs))
		for d := range pendingDirs {
			dirs = append(dirs, d)
		}
		pendingDirs = map[string]struct{}{}

		if dw.hub != nil {
			dw.hub.broadcast("dirsChanged", map[string]any{
				"dirs": dirs,
				"ts":   time.Now().UTC().Format(time.RFC3339Nano),
			})
		}
	}

	resetTimer := func() {
		if timer == nil {
			timer = time.NewTimer(250 * time.Millisecond)
			return
		}
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timer.Reset(250 * time.Millisecond)
	}

	for {
		select {
		case <-dw.stopCh:
			if timer != nil {
				_ = timer.Stop()
			}
			flush()
			return
		case err, ok := <-dw.watcher.Errors:
			if !ok {
				flush()
				return
			}
			_ = err
		case ev, ok := <-dw.watcher.Events:
			if !ok {
				flush()
				return
			}
			// Only care about name-level changes.
			if ev.Name == "" {
				continue
			}

			isCreate := ev.Op&fsnotify.Create != 0
			isRemove := ev.Op&fsnotify.Remove != 0
			isRename := ev.Op&fsnotify.Rename != 0
			isWrite := includeWriteEvents && (ev.Op&fsnotify.Write != 0)

			if !(isCreate || isRemove || isRename || isWrite) {
				continue
			}

			// If a new directory is created, start watching it (unless ignored).
			if isCreate {
				if st, err := os.Stat(ev.Name); err == nil && st.IsDir() {
					_ = dw.addIfDir(ev.Name)
				}
			}

			relDir := dw.relativeDirForEvent(ev.Name)
			if relDir == "__ignored__" {
				continue
			}
			pendingDirs[relDir] = struct{}{}
			resetTimer()
		case <-func() <-chan time.Time {
			if timer == nil {
				return nil
			}
			return timer.C
		}():
			flush()
		}
	}
}

func (dw *directoryWatcher) relativeDirForEvent(fullPath string) string {
	fullPath = filepath.Clean(fullPath)
	dir := filepath.Dir(fullPath)

	rel, err := filepath.Rel(dw.root, dir)
	if err != nil {
		return "__ignored__"
	}
	rel = filepath.Clean(rel)
	if rel == "." {
		return ""
	}
	// Outside root.
	if strings.HasPrefix(rel, "..") {
		return "__ignored__"
	}
	// If the dir is inside an ignored subtree, ignore.
	if dw.isInIgnoredSubtree(rel) {
		return "__ignored__"
	}
	return filepath.ToSlash(rel)
}

func (dw *directoryWatcher) isInIgnoredSubtree(relDir string) bool {
	if relDir == "" {
		return false
	}
	parts := strings.Split(filepath.ToSlash(relDir), "/")
	for _, p := range parts {
		if p == "" {
			continue
		}
		if _, ok := dw.ignoreDirs[p]; ok {
			return true
		}
	}
	return false
}

func (dw *directoryWatcher) addRecursive(root string) error {
	first := true
	return filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}

		// Skip ignored subtrees (but never skip the root itself).
		if p != root {
			name := d.Name()
			if _, ok := dw.ignoreDirs[name]; ok {
				return filepath.SkipDir
			}
		}

		required := first
		first = false
		return dw.addWatchDir(p, required)
	})
}

func (dw *directoryWatcher) addIfDir(path string) error {
	path = filepath.Clean(path)
	if _, ok := dw.watched[path]; ok {
		return nil
	}
	base := filepath.Base(path)
	if _, ok := dw.ignoreDirs[base]; ok {
		return nil
	}
	st, err := os.Stat(path)
	if err != nil {
		return nil
	}
	if !st.IsDir() {
		return nil
	}
	return dw.addRecursive(path)
}

func (dw *directoryWatcher) addWatchDir(dir string, required bool) error {
	dir = filepath.Clean(dir)
	if _, ok := dw.watched[dir]; ok {
		return nil
	}
	if err := dw.watcher.Add(dir); err != nil {
		if required {
			return err
		}
		return nil
	}
	dw.watched[dir] = struct{}{}
	return nil
}
