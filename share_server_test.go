package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestShareServerRootDoesNotRedirectLoop(t *testing.T) {
	tmp := t.TempDir()
	_ = os.WriteFile(filepath.Join(tmp, "hello.txt"), []byte("hi"), 0o644)

	s := NewShareServer()
	s.sharedRoot = tmp

	mux := http.NewServeMux()
	s.registerRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	client := ts.Client()
	resp, err := client.Get(ts.URL + "/")
	if err != nil {
		t.Fatalf("GET / failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		t.Fatalf("expected 2xx, got %d", resp.StatusCode)
	}
}

func TestShareServerDownloadZip(t *testing.T) {
	tmp := t.TempDir()
	_ = os.WriteFile(filepath.Join(tmp, "a.txt"), []byte("aaa"), 0o644)
	_ = os.WriteFile(filepath.Join(tmp, "b.txt"), []byte("bbb"), 0o644)

	s := NewShareServer()
	s.sharedRoot = tmp

	mux := http.NewServeMux()
	s.registerRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"paths": []string{"a.txt", "b.txt"},
	})
	resp, err := ts.Client().Post(ts.URL+"/api/download-zip", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/download-zip failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d, body=%s", resp.StatusCode, string(b))
	}

	zipBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read zip body failed: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("zip reader failed: %v", err)
	}

	got := map[string]bool{}
	for _, f := range zr.File {
		got[f.Name] = true
	}
	if !got["a.txt"] || !got["b.txt"] {
		t.Fatalf("zip missing files: got=%v", got)
	}
}

func TestShareServerDownloadZipMissingPathReturnsJSONError(t *testing.T) {
	tmp := t.TempDir()
	_ = os.WriteFile(filepath.Join(tmp, "a.txt"), []byte("aaa"), 0o644)

	s := NewShareServer()
	s.sharedRoot = tmp

	mux := http.NewServeMux()
	s.registerRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"paths": []string{"a.txt", "missing.txt"},
	})
	resp, err := ts.Client().Post(ts.URL+"/api/download-zip", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/download-zip failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected non-200, got %d, body=%s", resp.StatusCode, string(b))
	}

	ct := strings.ToLower(resp.Header.Get("Content-Type"))
	if !strings.Contains(ct, "application/json") {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected json error response, ct=%q body=%q", ct, string(b))
	}

	var payload map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&payload)
	if payload["error"] == nil {
		t.Fatalf("expected error field, payload=%v", payload)
	}
}

func TestShareServerDelete(t *testing.T) {
	tmp := t.TempDir()
	pa := filepath.Join(tmp, "a.txt")
	pb := filepath.Join(tmp, "b.txt")
	_ = os.WriteFile(pa, []byte("aaa"), 0o644)
	_ = os.WriteFile(pb, []byte("bbb"), 0o644)

	s := NewShareServer()
	s.sharedRoot = tmp

	mux := http.NewServeMux()
	s.registerRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"paths": []string{"a.txt", "b.txt"},
	})
	resp, err := ts.Client().Post(ts.URL+"/api/delete", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/delete failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d, body=%s", resp.StatusCode, string(b))
	}

	if _, err := os.Stat(pa); !os.IsNotExist(err) {
		t.Fatalf("expected a.txt to be deleted, stat err=%v", err)
	}
	if _, err := os.Stat(pb); !os.IsNotExist(err) {
		t.Fatalf("expected b.txt to be deleted, stat err=%v", err)
	}
}

func TestShareServerDownloadZipDirectory(t *testing.T) {
	tmp := t.TempDir()
	_ = os.MkdirAll(filepath.Join(tmp, "dir"), 0o755)
	_ = os.WriteFile(filepath.Join(tmp, "dir", "a.txt"), []byte("aaa"), 0o644)
	_ = os.WriteFile(filepath.Join(tmp, "dir", "b.txt"), []byte("bbb"), 0o644)

	s := NewShareServer()
	s.sharedRoot = tmp

	mux := http.NewServeMux()
	s.registerRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"paths": []string{"dir"},
	})
	resp, err := ts.Client().Post(ts.URL+"/api/download-zip", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/download-zip failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d, body=%s", resp.StatusCode, string(b))
	}

	zipBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read zip body failed: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("zip reader failed: %v", err)
	}

	got := map[string]bool{}
	for _, f := range zr.File {
		got[f.Name] = true
	}
	if !got["dir/a.txt"] || !got["dir/b.txt"] {
		t.Fatalf("zip missing files: got=%v", got)
	}
}

func TestShareServerDownloadZipIgnoreNodeModules(t *testing.T) {
	tmp := t.TempDir()
	_ = os.MkdirAll(filepath.Join(tmp, "proj", "node_modules", "pkg"), 0o755)
	_ = os.MkdirAll(filepath.Join(tmp, "proj", "src"), 0o755)
	_ = os.WriteFile(filepath.Join(tmp, "proj", "node_modules", "pkg", "a.txt"), []byte("aaa"), 0o644)
	_ = os.WriteFile(filepath.Join(tmp, "proj", "src", "main.ts"), []byte("console.log('hi')"), 0o644)

	s := NewShareServer()
	s.sharedRoot = tmp

	mux := http.NewServeMux()
	s.registerRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"paths":  []string{"proj"},
		"ignore": []string{"node_modules"},
	})
	resp, err := ts.Client().Post(ts.URL+"/api/download-zip", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/download-zip failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d, body=%s", resp.StatusCode, string(b))
	}

	zipBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read zip body failed: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("zip reader failed: %v", err)
	}

	got := map[string]bool{}
	for _, f := range zr.File {
		got[f.Name] = true
	}
	if !got["proj/src/main.ts"] {
		t.Fatalf("expected src file in zip, got=%v", got)
	}
	if got["proj/node_modules/pkg/a.txt"] {
		t.Fatalf("expected node_modules to be ignored, got=%v", got)
	}
}

func TestShareServerDeleteDirectory(t *testing.T) {
	tmp := t.TempDir()
	_ = os.MkdirAll(filepath.Join(tmp, "dir"), 0o755)
	_ = os.WriteFile(filepath.Join(tmp, "dir", "a.txt"), []byte("aaa"), 0o644)

	s := NewShareServer()
	s.sharedRoot = tmp

	mux := http.NewServeMux()
	s.registerRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"paths": []string{"dir"},
	})
	resp, err := ts.Client().Post(ts.URL+"/api/delete", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/delete failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d, body=%s", resp.StatusCode, string(b))
	}

	if _, err := os.Stat(filepath.Join(tmp, "dir")); !os.IsNotExist(err) {
		t.Fatalf("expected dir to be deleted, stat err=%v", err)
	}
}

func TestSafeJoinWindowsDriveRoot(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("windows-only")
	}

	// Ensure drive root with trailing separator works.
	full, ok := safeJoin(`D:\\`, `Windows`)
	if !ok {
		t.Fatalf("expected safeJoin(D:\\\\, Windows) ok")
	}
	if !strings.EqualFold(full, filepath.Clean(`D:\\Windows`)) {
		t.Fatalf("unexpected full path: %q", full)
	}

	// Ensure bare volume root (D:) is normalized.
	full2, ok2 := safeJoin(`D:`, `Windows`)
	if !ok2 {
		t.Fatalf("expected safeJoin(D:, Windows) ok")
	}
	if !strings.EqualFold(full2, filepath.Clean(`D:\\Windows`)) {
		t.Fatalf("unexpected full path: %q", full2)
	}
}
