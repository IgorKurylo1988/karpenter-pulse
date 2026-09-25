package k8s

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
	"karpenter-pulse-backend/internal/models"
	"karpenter-pulse-backend/internal/state"
)

// StartKarpenterEventWatcher watches K8s events for Karpenter resources and buffers them
func StartKarpenterEventWatcher(s *state.ClusterState) {
	if s.Clientset == nil {
		return
	}

	go func() {
		for {
			if !s.K8sConnected {
				time.Sleep(5 * time.Second)
				continue
			}

			watcher, err := s.Clientset.CoreV1().Events("").Watch(context.Background(), metav1.ListOptions{})
			if err != nil {
				log.Printf("WARNING: Failed to initiate K8s event watcher: %v. Retrying in 10s...", err)
				time.Sleep(10 * time.Second)
				continue
			}

			log.Println("INFO: Successfully initiated K8s Event Watcher for Karpenter resources.")
			ch := watcher.ResultChan()

			for event := range ch {
				if event.Type != watch.Added && event.Type != watch.Modified {
					continue
				}

				k8sEvent, ok := event.Object.(*corev1.Event)
				if !ok {
					continue
				}

				// Filter for Karpenter-related events
				isKarpenter := strings.Contains(strings.ToLower(k8sEvent.Source.Component), "karpenter") ||
					strings.HasPrefix(strings.ToLower(k8sEvent.InvolvedObject.APIVersion), "karpenter.sh") ||
					k8sEvent.InvolvedObject.Kind == "NodeClaim" ||
					k8sEvent.InvolvedObject.Kind == "NodePool"

				if !isKarpenter {
					continue
				}

				level := "INFO"
				if k8sEvent.Type == "Warning" {
					level = "WARNING"
					if strings.Contains(strings.ToLower(k8sEvent.Reason), "failed") {
						level = "ERROR"
					}
				} else if strings.Contains(strings.ToLower(k8sEvent.Reason), "launched") || strings.Contains(strings.ToLower(k8sEvent.Reason), "nominated") {
					level = "SUCCESS"
				}

				entry := &models.LogEntry{
					ID:        fmt.Sprintf("k8s-evt-%s", k8sEvent.UID),
					Timestamp: k8sEvent.LastTimestamp.Time.Format(time.RFC3339),
					Level:     level,
					Category:  models.CategoryK8sEvent,
					Message:   fmt.Sprintf("[%s] %s: %s", k8sEvent.InvolvedObject.Kind, k8sEvent.Reason, k8sEvent.Message),
					Details: map[string]interface{}{
						"reason":    k8sEvent.Reason,
						"kind":      k8sEvent.InvolvedObject.Kind,
						"name":      k8sEvent.InvolvedObject.Name,
						"namespace": k8sEvent.InvolvedObject.Namespace,
						"count":     k8sEvent.Count,
					},
				}

				if k8sEvent.InvolvedObject.Kind == "NodeClaim" {
					entry.NodeClaim = k8sEvent.InvolvedObject.Name
				} else if k8sEvent.InvolvedObject.Kind == "NodePool" {
					entry.NodePool = k8sEvent.InvolvedObject.Name
				} else if k8sEvent.InvolvedObject.Kind == "Node" {
					entry.NodeName = k8sEvent.InvolvedObject.Name
				}

				publishStructuredLog(s, entry)
			}

			watcher.Stop()
			time.Sleep(5 * time.Second)
		}
	}()
}
