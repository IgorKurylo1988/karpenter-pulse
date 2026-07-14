package handlers

import (
	"fmt"
	"net/http"
	"time"

	"karpenter-pulse-backend/internal/models"
)

func (h *HandlerContext) HandleScaleUp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	isSandbox := !h.State.K8sConnected || r.URL.Query().Get("sandbox") == "true"
	if !isSandbox {
		http.Error(w, `{"error":"Scale-up simulation is disabled in Live Cluster mode"}`, http.StatusForbidden)
		return
	}

	h.State.MockMu.Lock()
	if len(h.State.MockPods) == 0 {
		h.State.MockMu.Unlock()
		http.Error(w, `{"error":"No pending pods in queue to scale up"}`, http.StatusBadRequest)
		return
	}
	h.State.MockMu.Unlock()

	PublishLog("Pending pod queue scan: 1 unschedulable pod detected. Starting autoscaling run.", "INFO")

	claimId := fmt.Sprintf("general-purpose-%d", time.Now().UnixNano()%100000)
	instanceName := fmt.Sprintf("ip-10-0-3-%d.ec2.internal", time.Now().UnixNano()%250)

	go func() {
		time.Sleep(1500 * time.Millisecond)
		h.State.MockMu.Lock()
		h.State.MockClaims = append(h.State.MockClaims, models.NodeClaim{
			Name:         claimId,
			ApiVersion:   "karpenter.sh/v1",
			NodePool:     "general-purpose",
			Status:       "Provisioning",
			CapacityType: "spot",
			InstanceType: "m6g.2xlarge",
			Zone:         "us-east-1a",
			Age:          "1s",
		})
		h.State.MockMu.Unlock()
		PublishLog("Autoscaler selected spot instance type m6g.2xlarge for claims; launching instance", "INFO")
		PublishLog(fmt.Sprintf("NodeClaim %q created in state [Provisioning]", claimId), "SUCCESS")

		time.Sleep(2500 * time.Millisecond)
		h.State.MockMu.Lock()
		for i, c := range h.State.MockClaims {
			if c.Name == claimId {
				h.State.MockClaims[i].Status = "Ready"
				h.State.MockClaims[i].NodeName = instanceName
				break
			}
		}
		h.State.MockNodes = append(h.State.MockNodes, models.K8sNode{
			Name:         instanceName,
			Status:       "NotReady",
			NodePool:     "general-purpose",
			NodeClaim:    claimId,
			CapacityType: "spot",
			InstanceType: "m6g.2xlarge",
			Zone:         "us-east-1a",
			CpuAllocated: 0,
			CpuCapacity:  8,
			MemAllocated: 0,
			MemCapacity:  32,
			PodsCount:    0,
			Age:          "5s",
			CostPerHour:  0.1536,
		})
		h.State.MockMu.Unlock()
		PublishLog("EC2 Instance launched: i-0abcdef123 (m6g.2xlarge, spot, us-east-1a)", "INFO")
		PublishLog(fmt.Sprintf("Kubernetes Node %q joined cluster, state [NotReady]", instanceName), "INFO")

		time.Sleep(3000 * time.Millisecond)
		h.State.MockMu.Lock()
		for i, n := range h.State.MockNodes {
			if n.Name == instanceName {
				h.State.MockNodes[i].Status = "Ready"
				h.State.MockNodes[i].CpuAllocated = 3.0
				h.State.MockNodes[i].MemAllocated = 8.0
				h.State.MockNodes[i].PodsCount = 1
				break
			}
		}
		h.State.MockPods = []models.UnscheduledPod{}
		h.State.MockMu.Unlock()
		PublishLog(fmt.Sprintf("Node %q became [Ready] (kubelet operational)", instanceName), "SUCCESS")
		PublishLog("Scheduled pod onto new node", "SUCCESS")
	}()

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"Scale up initiated"}`))
}
