package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
	"fmt"

	"karpenter-pulse-backend/internal/k8s"
	"karpenter-pulse-backend/internal/models"
)

func (h *HandlerContext) HandleAlerts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	isSandbox := !h.State.K8sConnected || r.URL.Query().Get("sandbox") == "true"
	
	var nodes []models.K8sNode
	var err error
	if !isSandbox {
		nodes, err = k8s.FetchNodes(h.State)
		if err != nil {
			log.Printf("Error fetching nodes for alert pruning: %v\n", err)
		}
	} else {
		h.State.MockMu.Lock()
		nodes = h.State.MockNodes
		h.State.MockMu.Unlock()
	}

	alerts := k8s.FetchActiveAlerts(h.State, nodes)
	json.NewEncoder(w).Encode(alerts)
}

func (h *HandlerContext) HandlePostAlerts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		NodeName   string `json:"nodeName"`
		InstanceId string `json:"instanceId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}` , http.StatusBadRequest)
		return
	}

	if req.NodeName == "" || req.InstanceId == "" {
		http.Error(w, `{"error":"nodeName and instanceId are required"}`, http.StatusBadRequest)
		return
	}

	deadline := time.Now().Add(2 * time.Minute)
	alert := models.SpotAlert{
		Id:               "alert-" + req.InstanceId,
		Type:             "SpotInterruption",
		NodeName:         req.NodeName,
		InstanceId:       req.InstanceId,
		Severity:         "CRITICAL",
		Message:          "Spot Interruption Warning: Instance will terminate in 2m 0s.",
		Deadline:         deadline.Format(time.RFC3339),
		CountdownSeconds: 120,
	}

	h.State.AlertsMu.Lock()
	h.State.ActiveAlerts[alert.Id] = alert
	h.State.AlertsMu.Unlock()

	PublishLog(fmt.Sprintf("SQS Message: EC2 Spot Instance Interruption Notice for %s (Node: %s)", req.InstanceId, req.NodeName), "WARNING")
	PublishLog(fmt.Sprintf("Karpenter controller started node drain sequence for %s; marking node as [Terminating]", req.NodeName), "INFO")

	isSandbox := !h.State.K8sConnected || r.URL.Query().Get("sandbox") == "true"
	if isSandbox {
		h.State.MockMu.Lock()
		for i, n := range h.State.MockNodes {
			if n.Name == req.NodeName {
				h.State.MockNodes[i].Status = "Terminating"
				break
			}
		}
		h.State.MockMu.Unlock()
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(alert)
}

func (h *HandlerContext) HandleAlertsRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		h.HandlePostAlerts(w, r)
	} else {
		h.HandleAlerts(w, r)
	}
}
