package handlers

import (
	"encoding/json"
	"net/http"
)

func (h *HandlerContext) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "OK",
		"k8sConnected": h.State.K8sConnected,
	})
}
