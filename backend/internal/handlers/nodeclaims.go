package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"karpenter-pulse-backend/internal/k8s"
)

func (h *HandlerContext) HandleNodeClaims(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	isSandbox := !h.State.K8sConnected || r.URL.Query().Get("sandbox") == "true"
	if isSandbox {
		h.State.MockMu.Lock()
		json.NewEncoder(w).Encode(h.State.MockClaims)
		h.State.MockMu.Unlock()
		return
	}
	nodeclaims, err := k8s.FetchNodeClaims(h.State)
	if err != nil {
		log.Printf("Error fetching nodeclaims: %v\n", err)
		http.Error(w, fmt.Sprintf(`{"error":"Failed to query nodeclaims","details":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(nodeclaims)
}
