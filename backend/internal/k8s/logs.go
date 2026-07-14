package k8s

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"karpenter-pulse-backend/internal/state"
)

// StartKarpenterLogStreamer locates the Karpenter controller pod and streams its logs in a background thread
func StartKarpenterLogStreamer(s *state.ClusterState) {
	if s.Clientset == nil {
		log.Println("INFO: Kubernetes Client is nil. Skipping Karpenter pod log streamer.")
		return
	}

	go func() {
		tailLines := int64(50) // Tail last 50 lines on startup
		for {
			if !s.K8sConnected {
				time.Sleep(5 * time.Second)
				continue
			}

			podName, namespace := locateKarpenterPod(s)
			if podName == "" {
				time.Sleep(10 * time.Second)
				continue
			}

			if s.OnLogReceived != nil {
				s.OnLogReceived(fmt.Sprintf("Discovered Karpenter controller pod %q in namespace %q. Initiating live log stream...", podName, namespace), "SUCCESS")
			}

			err := streamPodLogs(s, namespace, podName, tailLines)
			if err != nil {
				if s.OnLogReceived != nil {
					s.OnLogReceived(fmt.Sprintf("Karpenter log stream disconnected: %v. Reconnecting in 10s...", err), "WARNING")
				}
				time.Sleep(10 * time.Second)
			}
			
			// After first successful connection, only tail new lines on reconnect
			tailLines = int64(5)
		}
	}()
}

func locateKarpenterPod(s *state.ClusterState) (string, string) {
	namespacesToSearch := []string{"karpenter", "kube-system", ""}
	envNs := os.Getenv("KARPENTER_NAMESPACE")
	if envNs != "" {
		namespacesToSearch = []string{envNs}
	}

	labelSelectors := []string{
		"app.kubernetes.io/name=karpenter",
		"app.kubernetes.io/instance=karpenter",
		"app=karpenter",
	}
	envSelector := os.Getenv("KARPENTER_LABEL_SELECTOR")
	if envSelector != "" {
		labelSelectors = []string{envSelector}
	}

	for _, ns := range namespacesToSearch {
		for _, selector := range labelSelectors {
			pods, err := s.Clientset.CoreV1().Pods(ns).List(context.Background(), metav1.ListOptions{
				LabelSelector: selector,
			})
			if err == nil && len(pods.Items) > 0 {
				// Return the first active running pod
				for _, pod := range pods.Items {
					if pod.Status.Phase == corev1.PodRunning {
						return pod.Name, pod.Namespace
					}
				}
			}
		}
	}
	return "", ""
}

func streamPodLogs(s *state.ClusterState, namespace, podName string, tailLines int64) error {
	req := s.Clientset.CoreV1().Pods(namespace).GetLogs(podName, &corev1.PodLogOptions{
		Follow:    true,
		TailLines: &tailLines,
	})

	stream, err := req.Stream(context.Background())
	if err != nil {
		return err
	}
	defer stream.Close()

	reader := bufio.NewReader(stream)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}

		// Strip newline
		if len(line) > 0 && line[len(line)-1] == '\n' {
			line = line[:len(line)-1]
		}
		if len(line) > 0 && line[len(line)-1] == '\r' {
			line = line[:len(line)-1]
		}

		// Forward Karpenter log line to WebSocket clients
		if s.OnLogReceived != nil {
			msg, level := parseKarpenterLog(line)
			s.OnLogReceived(msg, level)
		}
	}
}

func parseKarpenterLog(line string) (string, string) {
	var logMap map[string]interface{}
	if err := json.Unmarshal([]byte(line), &logMap); err == nil {
		message := ""
		if msg, ok := logMap["msg"].(string); ok {
			message = msg
		} else if msg, ok := logMap["message"].(string); ok {
			message = msg
		} else {
			message = line
		}

		rawLevel := "info"
		if lvl, ok := logMap["level"].(string); ok {
			rawLevel = strings.ToLower(lvl)
		}

		mappedLevel := "INFO"
		if rawLevel == "error" || rawLevel == "panic" || rawLevel == "fatal" {
			mappedLevel = "ERROR"
		} else if rawLevel == "warn" || rawLevel == "warning" {
			mappedLevel = "WARNING"
		} else if rawLevel == "info" || rawLevel == "debug" {
			mappedLevel = "INFO"
		}
		
		return message, mappedLevel
	}

	lower := strings.ToLower(line)
	level := "INFO"
	if strings.Contains(lower, "error") || strings.Contains(lower, "fatal") || strings.Contains(lower, "panic") {
		level = "ERROR"
	} else if strings.Contains(lower, "warn") || strings.Contains(lower, "warning") {
		level = "WARNING"
	} else if strings.Contains(lower, "success") {
		level = "SUCCESS"
	}

	return line, level
}
