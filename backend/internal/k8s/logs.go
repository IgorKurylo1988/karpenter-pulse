package k8s

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	"karpenter-pulse-backend/internal/models"
	"karpenter-pulse-backend/internal/state"
)

// StartKarpenterLogStreamer streams logs from the Karpenter leader pod with automatic failover
func StartKarpenterLogStreamer(s *state.ClusterState) {
	go func() {
		tailLines := int64(100) // Initial backlog
		for {
			if !s.K8sConnected || s.Clientset == nil {
				// Run sandbox simulation loop if cluster is disconnected
				runSandboxLogSimulation(s)
				time.Sleep(5 * time.Second)
				continue
			}

			podName, namespace, isLeader := GetKarpenterLeaderPod(s)
			if podName == "" {
				time.Sleep(10 * time.Second)
				continue
			}

			s.LeaderPod = podName
			s.LeaderNamespace = namespace

			discoveryMethod := "via K8s Lease"
			if !isLeader {
				discoveryMethod = "via label matching (single replica)"
			}

			welcomeMsg := fmt.Sprintf("Following Karpenter leader pod %q in namespace %q (%s).", podName, namespace, discoveryMethod)
			publishStructuredLog(s, &models.LogEntry{
				ID:        fmt.Sprintf("log-%d", time.Now().UnixNano()),
				Timestamp: time.Now().Format(time.RFC3339),
				Level:     "SUCCESS",
				Category:  models.CategorySystem,
				Message:   welcomeMsg,
				NodeName:  podName,
			})

			ctx, cancel := context.WithCancel(context.Background())

			// Watch for leader changes in the background
			go func() {
				ticker := time.NewTicker(5 * time.Second)
				defer ticker.Stop()
				for {
					select {
					case <-ctx.Done():
						return
					case <-ticker.C:
						newPod, _, _ := GetKarpenterLeaderPod(s)
						if newPod != "" && newPod != podName {
							log.Printf("INFO: Karpenter leader transitioned from %s to %s. Reconnecting log stream...", podName, newPod)
							cancel()
							return
						}
					}
				}
			}()

			err := streamPodLogs(ctx, s, namespace, podName, tailLines)
			cancel()

			if err != nil && err != context.Canceled {
				publishStructuredLog(s, &models.LogEntry{
					ID:        fmt.Sprintf("log-%d", time.Now().UnixNano()),
					Timestamp: time.Now().Format(time.RFC3339),
					Level:     "WARNING",
					Category:  models.CategorySystem,
					Message:   fmt.Sprintf("Karpenter log stream disconnected: %v. Reconnecting in 5s...", err),
				})
				time.Sleep(5 * time.Second)
			}

			tailLines = int64(10)
		}
	}()
}

func streamPodLogs(ctx context.Context, s *state.ClusterState, namespace, podName string, tailLines int64) error {
	req := s.Clientset.CoreV1().Pods(namespace).GetLogs(podName, &corev1.PodLogOptions{
		Follow:    true,
		TailLines: &tailLines,
	})

	stream, err := req.Stream(ctx)
	if err != nil {
		return err
	}
	defer stream.Close()

	reader := bufio.NewReader(stream)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}

		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			continue
		}

		entry := parseStructuredKarpenterLog(line)
		publishStructuredLog(s, entry)
	}
}

func parseStructuredKarpenterLog(line string) *models.LogEntry {
	var zapMap map[string]interface{}
	entry := &models.LogEntry{
		ID:        fmt.Sprintf("log-%d-%d", time.Now().UnixNano(), rand.Intn(1000)),
		Timestamp: time.Now().Format(time.RFC3339),
		Level:     "INFO",
		Category:  models.CategorySystem,
		Message:   line,
		Details:   make(map[string]interface{}),
	}

	if err := json.Unmarshal([]byte(line), &zapMap); err == nil {
		// Extract Message
		if msg, ok := zapMap["msg"].(string); ok {
			entry.Message = msg
		} else if msg, ok := zapMap["message"].(string); ok {
			entry.Message = msg
		}

		// Extract Level
		if lvl, ok := zapMap["level"].(string); ok {
			switch strings.ToLower(lvl) {
			case "error", "panic", "fatal":
				entry.Level = "ERROR"
			case "warn", "warning":
				entry.Level = "WARNING"
			case "info":
				entry.Level = "INFO"
			case "debug":
				entry.Level = "INFO"
			}
		}

		// Extract Resource Associations
		if nc, ok := zapMap["nodeclaim"].(string); ok {
			entry.NodeClaim = nc
		} else if nc, ok := zapMap["claim"].(string); ok {
			entry.NodeClaim = nc
		}

		if np, ok := zapMap["nodepool"].(string); ok {
			entry.NodePool = np
		}

		if node, ok := zapMap["node"].(string); ok {
			entry.NodeName = node
		}

		// Categorize Intent
		lowerMsg := strings.ToLower(entry.Message)
		logger, _ := zapMap["logger"].(string)
		loggerLower := strings.ToLower(logger)

		switch {
		case strings.Contains(loggerLower, "provision") || strings.Contains(lowerMsg, "provision") || strings.Contains(lowerMsg, "launched nodeclaim") || strings.Contains(lowerMsg, "found provisionable"):
			entry.Category = models.CategoryProvisioning
			if strings.Contains(lowerMsg, "launched") {
				entry.Level = "SUCCESS"
			}
		case strings.Contains(loggerLower, "consolidation") || strings.Contains(lowerMsg, "consolidat") || strings.Contains(lowerMsg, "underutilized") || strings.Contains(lowerMsg, "empty"):
			entry.Category = models.CategoryConsolidation
		case strings.Contains(loggerLower, "disruption") || strings.Contains(lowerMsg, "disrupt") || strings.Contains(lowerMsg, "terminat") || strings.Contains(lowerMsg, "evict"):
			entry.Category = models.CategoryDisruption
		case strings.Contains(loggerLower, "interruption") || strings.Contains(lowerMsg, "spot") || strings.Contains(lowerMsg, "rebalance"):
			entry.Category = models.CategoryInterruption
			entry.Level = "WARNING"
		default:
			entry.Category = models.CategorySystem
		}

		// Preserve key metadata fields
		for _, key := range []string{"pods", "instance-types", "zone", "capacity-type", "reason", "duration", "error"} {
			if val, exists := zapMap[key]; exists {
				entry.Details[key] = val
			}
		}

		return entry
	}

	// Plain text log categorization fallback
	lower := strings.ToLower(line)
	if strings.Contains(lower, "error") || strings.Contains(lower, "failed") {
		entry.Level = "ERROR"
	} else if strings.Contains(lower, "warn") {
		entry.Level = "WARNING"
	} else if strings.Contains(lower, "success") || strings.Contains(lower, "ready") {
		entry.Level = "SUCCESS"
	}

	return entry
}

func publishStructuredLog(s *state.ClusterState, entry *models.LogEntry) {
	// 1. Buffer into Storage Driver (Redis or In-Memory)
	if s.Storage != nil {
		_ = s.Storage.AppendLog(context.Background(), entry)
	}

	// 2. Broadcast to UI consumers
	if s.OnStructuredLogReceived != nil {
		s.OnStructuredLogReceived(*entry)
	}
	if s.OnLogReceived != nil {
		s.OnLogReceived(entry.Message, entry.Level)
	}
}

// runSandboxLogSimulation generates realistic Karpenter autoscaling cycles when running without K8s
func runSandboxLogSimulation(s *state.ClusterState) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	cycle := 0
	for range ticker.C {
		if s.K8sConnected {
			return
		}

		cycle++
		switch cycle % 4 {
		case 1:
			publishStructuredLog(s, &models.LogEntry{
				ID:        fmt.Sprintf("sim-%d", time.Now().UnixNano()),
				Timestamp: time.Now().Format(time.RFC3339),
				Level:     "INFO",
				Category:  models.CategoryProvisioning,
				Message:   "Found 2 provisionable pod(s) with requests: cpu 1800m, memory 3800Mi",
				NodePool:  "general-purpose",
				Details: map[string]interface{}{
					"pods":           []string{"default/batch-processor-8f4b-x91k2", "default/api-worker-6c2d-98mzk"},
					"instance-types": "c6g.xlarge, m6g.xlarge",
				},
			})
		case 2:
			claimId := fmt.Sprintf("general-purpose-%x", rand.Intn(0xfffff))
			publishStructuredLog(s, &models.LogEntry{
				ID:        fmt.Sprintf("sim-%d", time.Now().UnixNano()),
				Timestamp: time.Now().Format(time.RFC3339),
				Level:     "SUCCESS",
				Category:  models.CategoryProvisioning,
				Message:   fmt.Sprintf("Launched nodeclaim %q with instance type c6g.xlarge (spot)", claimId),
				NodePool:  "general-purpose",
				NodeClaim: claimId,
				Details: map[string]interface{}{
					"instanceType": "c6g.xlarge",
					"capacityType": "spot",
					"zone":         "europe-north1a",
					"price":        0.0476,
				},
			})
		case 3:
			publishStructuredLog(s, &models.LogEntry{
				ID:        fmt.Sprintf("sim-%d", time.Now().UnixNano()),
				Timestamp: time.Now().Format(time.RFC3339),
				Level:     "INFO",
				Category:  models.CategoryConsolidation,
				Message:   "Evaluating candidate nodes for consolidation (WhenEmptyOrUnderutilized)",
				NodePool:  "general-purpose",
			})
		case 0:
			publishStructuredLog(s, &models.LogEntry{
				ID:        fmt.Sprintf("sim-%d", time.Now().UnixNano()),
				Timestamp: time.Now().Format(time.RFC3339),
				Level:     "INFO",
				Category:  models.CategorySystem,
				Message:   "Leader lease karpenter-leader-election renewed successfully",
			})
		}
	}
}
