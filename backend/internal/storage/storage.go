package storage

import (
	"context"
	"time"

	"karpenter-pulse-backend/internal/models"
)

// StorageDriver provides a pluggable interface for caching pricing and buffering logs
type StorageDriver interface {
	// Name returns the driver identifier ("redis" or "memory")
	Name() string

	// Pricing caching operations
	GetPrice(ctx context.Context, key string) (*models.PriceEstimate, error)
	SetPrice(ctx context.Context, key string, price *models.PriceEstimate, ttl time.Duration) error

	// Log buffering and retrieval operations
	AppendLog(ctx context.Context, entry *models.LogEntry) error
	GetRecentLogs(ctx context.Context, limit int, filter models.LogFilter) ([]models.LogEntry, error)

	// Close releases any driver resources or connections
	Close() error
}
