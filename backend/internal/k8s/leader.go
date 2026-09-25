package k8s

import (
	"context"
	"log"
	"os"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"karpenter-pulse-backend/internal/state"
)

// GetKarpenterLeaderPod resolves the active leader pod name via the Lease API or fallback label discovery
func GetKarpenterLeaderPod(s *state.ClusterState) (string, string, bool) {
	if s.Clientset == nil {
		return "", "", false
	}

	leaseName := os.Getenv("KARPENTER_LEADER_LEASE_NAME")
	if leaseName == "" {
		leaseName = "karpenter-leader-election"
	}

	namespacesToSearch := []string{"karpenter", "kube-system"}
	if envNs := os.Getenv("KARPENTER_NAMESPACE"); envNs != "" {
		namespacesToSearch = []string{envNs}
	}

	// 1. Try querying the coordination.k8s.io/v1 Lease object
	for _, ns := range namespacesToSearch {
		lease, err := s.Clientset.CoordinationV1().Leases(ns).Get(context.Background(), leaseName, metav1.GetOptions{})
		if err == nil && lease.Spec.HolderIdentity != nil && *lease.Spec.HolderIdentity != "" {
			rawHolder := *lease.Spec.HolderIdentity
			// Holder identity format can be "pod-name_uuid" or "pod-name"
			podName := rawHolder
			if idx := strings.Index(rawHolder, "_"); idx != -1 {
				podName = rawHolder[:idx]
			}
			log.Printf("INFO: Discovered Karpenter active leader pod %q from Lease %s/%s", podName, ns, leaseName)
			return podName, ns, true
		}
	}

	// 2. Fallback: Search pods via label selectors if Lease is unavailable
	labelSelectors := []string{
		"app.kubernetes.io/name=karpenter",
		"app.kubernetes.io/instance=karpenter",
		"app=karpenter",
	}
	if envSelector := os.Getenv("KARPENTER_LABEL_SELECTOR"); envSelector != "" {
		labelSelectors = []string{envSelector}
	}

	for _, ns := range namespacesToSearch {
		for _, selector := range labelSelectors {
			pods, err := s.Clientset.CoreV1().Pods(ns).List(context.Background(), metav1.ListOptions{
				LabelSelector: selector,
			})
			if err == nil && len(pods.Items) > 0 {
				for _, pod := range pods.Items {
					if pod.Status.Phase == corev1.PodRunning {
						log.Printf("INFO: Discovered Karpenter controller pod %q in namespace %q via labels", pod.Name, pod.Namespace)
						return pod.Name, pod.Namespace, false
					}
				}
			}
		}
	}

	return "", "", false
}
