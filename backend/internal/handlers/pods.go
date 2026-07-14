package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"karpenter-pulse-backend/internal/k8s"
	"karpenter-pulse-backend/internal/models"
)

func (h *HandlerContext) HandlePods(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	isSandbox := !h.State.K8sConnected || r.URL.Query().Get("sandbox") == "true"
	if isSandbox {
		h.State.MockMu.Lock()
		json.NewEncoder(w).Encode(h.State.MockPods)
		h.State.MockMu.Unlock()
		return
	}
	pods, err := k8s.FetchPendingPods(h.State)
	if err != nil {
		log.Printf("Error fetching pods: %v\n", err)
		http.Error(w, fmt.Sprintf(`{"error":"Failed to query pending pods","details":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(pods)
}

func (h *HandlerContext) HandlePostPods(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var pod models.UnscheduledPod
	if err := json.NewDecoder(r.Body).Decode(&pod); err != nil {
		http.Error(w, `{"error":"Invalid request body"}` , http.StatusBadRequest)
		return
	}

	if pod.Name == "" || pod.NodePool == "" {
		http.Error(w, `{"error":"name and nodePool are required"}`, http.StatusBadRequest)
		return
	}

	pod.Age = "1s"
	if pod.Namespace == "" {
		pod.Namespace = "default"
	}
	if pod.Reason == "" {
		pod.Reason = fmt.Sprintf("Unschedulable: insufficient resource requests (requires %s CPU, %s RAM)", pod.CpuRequest, pod.MemRequest)
	}

	isSandbox := !h.State.K8sConnected || r.URL.Query().Get("sandbox") == "true"
	if isSandbox {
		h.State.MockMu.Lock()
		h.State.MockPods = append(h.State.MockPods, pod)
		h.State.MockMu.Unlock()
		PublishLog(fmt.Sprintf("Created unscheduled pod %q requiring %s pool", pod.Namespace+"/"+pod.Name, pod.NodePool), "WARNING")
	} else {
		http.Error(w, `{"error":"Pod creation is disabled in Live Cluster mode for safety"}`, http.StatusForbidden)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(pod)
}

func (h *HandlerContext) HandlePodsRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		h.HandlePostPods(w, r)
	} else {
		h.HandlePods(w, r)
	}
}
