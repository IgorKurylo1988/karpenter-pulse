package state

import (
	"sync"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	
	"karpenter-pulse-backend/internal/mock"
	"karpenter-pulse-backend/internal/models"
)

type ClusterState struct {
	Clientset     *kubernetes.Clientset
	DynamicClient dynamic.Interface
	K8sConnected  bool
	
	AlertsMu     sync.RWMutex
	ActiveAlerts map[string]models.SpotAlert

	// Mutable sandbox simulation lists
	MockMu        sync.RWMutex
	MockNodes     []models.K8sNode
	MockNodePools []models.NodePool
	MockClasses   []models.EC2NodeClass
	MockClaims    []models.NodeClaim
	MockPods      []models.UnscheduledPod

	// Callback to push logs to WebSocket clients
	OnLogReceived func(message string, level string)
}

func NewClusterState() *ClusterState {
	s := &ClusterState{
		ActiveAlerts: make(map[string]models.SpotAlert),
	}
	s.ResetSandbox()
	return s
}

func (s *ClusterState) ResetSandbox() {
	s.MockMu.Lock()
	defer s.MockMu.Unlock()
	
	s.MockNodes = mock.GetMockNodes()
	s.MockNodePools = mock.GetMockNodePools()
	s.MockClasses = mock.GetMockNodeClasses()
	s.MockClaims = mock.GetMockNodeClaims()
	s.MockPods = mock.GetMockPods()
}
