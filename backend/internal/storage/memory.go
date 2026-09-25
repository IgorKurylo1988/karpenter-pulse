package storage

import (
	"context"
	"strings"
	"sync"
	"time"

	"karpenter-pulse-backend/internal/models"
)

type priceCacheItem struct {
	price     *models.PriceEstimate
	expiresAt time.Time
}

// MemoryStorage provides an in-memory thread-safe implementation of StorageDriver
type MemoryStorage struct {
	mu           sync.RWMutex
	prices       map[string]priceCacheItem
	logs         []models.LogEntry
	maxLogBuffer int
}

// NewMemoryStorage creates a new in-memory storage driver
func NewMemoryStorage(maxLogBuffer int) *MemoryStorage {
	if maxLogBuffer <= 0 {
		maxLogBuffer = 1000
	}
	return &MemoryStorage{
		prices:       make(map[string]priceCacheItem),
		logs:         make([]models.LogEntry, 0, maxLogBuffer),
		maxLogBuffer: maxLogBuffer,
	}
}

func (m *MemoryStorage) Name() string {
	return "memory"
}

func (m *MemoryStorage) GetPrice(ctx context.Context, key string) (*models.PriceEstimate, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	item, exists := m.prices[key]
	if !exists {
		return nil, nil
	}
	if time.Now().After(item.expiresAt) {
		return nil, nil
	}
	return item.price, nil
}

func (m *MemoryStorage) SetPrice(ctx context.Context, key string, price *models.PriceEstimate, ttl time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.prices[key] = priceCacheItem{
		price:     price,
		expiresAt: time.Now().Add(ttl),
	}
	return nil
}

func (m *MemoryStorage) AppendLog(ctx context.Context, entry *models.LogEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.logs) >= m.maxLogBuffer {
		// Evict oldest entry
		m.logs = m.logs[1:]
	}
	m.logs = append(m.logs, *entry)
	return nil
}

func (m *MemoryStorage) GetRecentLogs(ctx context.Context, limit int, filter models.LogFilter) ([]models.LogEntry, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if limit <= 0 || limit > m.maxLogBuffer {
		limit = 200
	}

	searchLower := strings.ToLower(filter.Search)
	levelUpper := strings.ToUpper(filter.Level)

	results := make([]models.LogEntry, 0, limit)

	// Iterate backwards from newest to oldest
	for i := len(m.logs) - 1; i >= 0; i-- {
		entry := m.logs[i]

		if levelUpper != "" && strings.ToUpper(entry.Level) != levelUpper {
			continue
		}
		if filter.Category != "" && entry.Category != filter.Category {
			continue
		}
		if searchLower != "" {
			matched := strings.Contains(strings.ToLower(entry.Message), searchLower) ||
				strings.Contains(strings.ToLower(entry.NodeClaim), searchLower) ||
				strings.Contains(strings.ToLower(entry.NodePool), searchLower) ||
				strings.Contains(strings.ToLower(entry.NodeName), searchLower)
			if !matched {
				continue
			}
		}

		results = append(results, entry)
		if len(results) >= limit {
			break
		}
	}

	return results, nil
}

func (m *MemoryStorage) Close() error {
	return nil
}
