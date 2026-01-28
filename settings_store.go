package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

type SettingsStore struct {
	mu     sync.Mutex
	path   string
	loaded bool
	data   map[string]json.RawMessage
}

func NewSettingsStore() *SettingsStore {
	cfgDir, err := os.UserConfigDir()
	if err != nil || cfgDir == "" {
		cfgDir = "."
	}
	baseDir := filepath.Join(cfgDir, "local-share-golang")
	return &SettingsStore{
		path: filepath.Join(baseDir, "settings.json"),
		data: map[string]json.RawMessage{},
	}
}

func (s *SettingsStore) loadLocked() error {
	if s.loaded {
		return nil
	}
	s.loaded = true

	_ = os.MkdirAll(filepath.Dir(s.path), 0o755)

	b, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.data = map[string]json.RawMessage{}
			return nil
		}
		return err
	}
	if len(b) == 0 {
		s.data = map[string]json.RawMessage{}
		return nil
	}

	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		// If the file is corrupted, don't brick the app; start fresh.
		s.data = map[string]json.RawMessage{}
		return nil
	}
	if m == nil {
		m = map[string]json.RawMessage{}
	}
	s.data = m
	return nil
}

func (s *SettingsStore) saveLocked() error {
	_ = os.MkdirAll(filepath.Dir(s.path), 0o755)
	b, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, b, 0o644)
}

func (s *SettingsStore) Get(key string) (json.RawMessage, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(); err != nil {
		return nil, false, err
	}
	v, ok := s.data[key]
	if !ok {
		return nil, false, nil
	}
	return v, true, nil
}

func (s *SettingsStore) Set(key string, value json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(); err != nil {
		return err
	}
	if s.data == nil {
		s.data = map[string]json.RawMessage{}
	}
	s.data[key] = value
	return s.saveLocked()
}

func (s *SettingsStore) Delete(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(); err != nil {
		return err
	}
	delete(s.data, key)
	return s.saveLocked()
}
