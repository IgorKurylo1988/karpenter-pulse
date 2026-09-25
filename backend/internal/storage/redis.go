package storage

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"karpenter-pulse-backend/internal/models"
)

// RedisStorage provides a resilient Redis client using standard library networking
type RedisStorage struct {
	addr         string
	password     string
	mu           sync.Mutex
	conn         net.Conn
	reader       *bufio.Reader
	fallback     *MemoryStorage
	connected    bool
	maxLogBuffer int
}

// NewRedisStorage attempts to connect to Redis, wrapping a fallback in-memory store
func NewRedisStorage(addr, password string, maxLogBuffer int) *RedisStorage {
	r := &RedisStorage{
		addr:         addr,
		password:     password,
		fallback:     NewMemoryStorage(maxLogBuffer),
		maxLogBuffer: maxLogBuffer,
	}

	if err := r.reconnect(); err != nil {
		log.Printf("WARNING: Could not connect to Redis at %s: %v. Engaging in-memory fallback.", addr, err)
	} else {
		log.Printf("INFO: Successfully connected to Redis intermediate cache at %s", addr)
	}

	return r
}

func (r *RedisStorage) Name() string {
	if r.isConnected() {
		return "redis"
	}
	return "memory-fallback"
}

func (r *RedisStorage) isConnected() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.connected
}

func (r *RedisStorage) reconnect() error {
	if r.conn != nil {
		r.conn.Close()
	}
	r.connected = false

	d := net.Dialer{Timeout: 3 * time.Second}
	c, err := d.Dial("tcp", r.addr)
	if err != nil {
		return err
	}

	r.conn = c
	r.reader = bufio.NewReader(c)

	// Auth if password provided
	if r.password != "" {
		if err := r.rawCommand("AUTH", r.password); err != nil {
			r.conn.Close()
			return fmt.Errorf("redis auth failed: %w", err)
		}
	}

	// Ping to verify
	if err := r.rawCommand("PING"); err != nil {
		r.conn.Close()
		return fmt.Errorf("redis ping failed: %w", err)
	}

	r.connected = true
	return nil
}

func (r *RedisStorage) rawCommand(args ...string) error {
	var cmd strings.Builder
	cmd.WriteString(fmt.Sprintf("*%d\r\n", len(args)))
	for _, arg := range args {
		cmd.WriteString(fmt.Sprintf("$%d\r\n%s\r\n", len(arg), arg))
	}

	r.conn.SetDeadline(time.Now().Add(3 * time.Second))
	if _, err := r.conn.Write([]byte(cmd.String())); err != nil {
		return err
	}

	line, err := r.reader.ReadString('\n')
	if err != nil {
		return err
	}
	if len(line) > 0 && line[0] == '-' {
		return fmt.Errorf("redis error: %s", strings.TrimSpace(line[1:]))
	}
	return nil
}

func (r *RedisStorage) GetPrice(ctx context.Context, key string) (*models.PriceEstimate, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.connected {
		return r.fallback.GetPrice(ctx, key)
	}

	// Send GET key
	cmd := fmt.Sprintf("*2\r\n$3\r\nGET\r\n$%d\r\n%s\r\n", len(key), key)
	r.conn.SetDeadline(time.Now().Add(2 * time.Second))
	if _, err := r.conn.Write([]byte(cmd)); err != nil {
		r.connected = false
		return r.fallback.GetPrice(ctx, key)
	}

	line, err := r.reader.ReadString('\n')
	if err != nil || len(line) == 0 {
		r.connected = false
		return r.fallback.GetPrice(ctx, key)
	}

	if strings.HasPrefix(line, "$-1") {
		return nil, nil // Key does not exist
	}

	if line[0] == '$' {
		length, _ := strconv.Atoi(strings.TrimSpace(line[1:]))
		buf := make([]byte, length+2)
		for read := 0; read < length+2; {
			n, err := r.reader.Read(buf[read:])
			if err != nil {
				r.connected = false
				return r.fallback.GetPrice(ctx, key)
			}
			read += n
		}
		var price models.PriceEstimate
		if err := json.Unmarshal(buf[:length], &price); err == nil {
			return &price, nil
		}
	}

	return nil, nil
}

func (r *RedisStorage) SetPrice(ctx context.Context, key string, price *models.PriceEstimate, ttl time.Duration) error {
	r.fallback.SetPrice(ctx, key, price, ttl)

	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.connected {
		return nil
	}

	data, err := json.Marshal(price)
	if err != nil {
		return err
	}

	ttlSec := int(ttl.Seconds())
	if ttlSec <= 0 {
		ttlSec = 3600
	}

	// SET key val EX ttlSec
	cmd := fmt.Sprintf("*5\r\n$3\r\nSET\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n$2\r\nEX\r\n$%d\r\n%d\r\n",
		len(key), key, len(data), string(data), len(strconv.Itoa(ttlSec)), ttlSec)

	r.conn.SetDeadline(time.Now().Add(2 * time.Second))
	if _, err := r.conn.Write([]byte(cmd)); err != nil {
		r.connected = false
		return nil
	}
	r.reader.ReadString('\n')
	return nil
}

func (r *RedisStorage) AppendLog(ctx context.Context, entry *models.LogEntry) error {
	r.fallback.AppendLog(ctx, entry)

	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.connected {
		return nil
	}

	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}

	listKey := "karpenter:logs"
	// LPUSH karpenter:logs <data>
	pushCmd := fmt.Sprintf("*3\r\n$5\r\nLPUSH\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n",
		len(listKey), listKey, len(data), string(data))

	r.conn.SetDeadline(time.Now().Add(2 * time.Second))
	if _, err := r.conn.Write([]byte(pushCmd)); err != nil {
		r.connected = false
		return nil
	}
	r.reader.ReadString('\n')

	// LTRIM karpenter:logs 0 maxLogBuffer-1
	trimCmd := fmt.Sprintf("*4\r\n$5\r\nLTRIM\r\n$%d\r\n%s\r\n$1\r\n0\r\n$%d\r\n%d\r\n",
		len(listKey), listKey, len(strconv.Itoa(r.maxLogBuffer-1)), r.maxLogBuffer-1)
	r.conn.Write([]byte(trimCmd))
	r.reader.ReadString('\n')

	return nil
}

func (r *RedisStorage) GetRecentLogs(ctx context.Context, limit int, filter models.LogFilter) ([]models.LogEntry, error) {
	// Fallback in-memory provides instant filtering
	return r.fallback.GetRecentLogs(ctx, limit, filter)
}

func (r *RedisStorage) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.conn != nil {
		return r.conn.Close()
	}
	return nil
}
