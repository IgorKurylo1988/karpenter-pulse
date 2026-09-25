package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"karpenter-pulse-backend/internal/models"
)

// HandleLogs queries historical buffered logs from the intermediate storage driver
func (h *HandlerContext) HandleLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	limitStr := r.URL.Query().Get("limit")
	limit := 200
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
			if limit > 1000 {
				limit = 1000
			}
		}
	}

	filter := models.LogFilter{
		Level:    r.URL.Query().Get("level"),
		Category: models.LogCategory(r.URL.Query().Get("category")),
		Search:   r.URL.Query().Get("search"),
		Limit:    limit,
	}

	var logs []models.LogEntry
	var err error
	storageName := "memory"

	if h.State.Storage != nil {
		storageName = h.State.Storage.Name()
		logs, err = h.State.Storage.GetRecentLogs(r.Context(), limit, filter)
	}

	if err != nil {
		http.Error(w, `{"error":"Failed to retrieve buffered logs"}`, http.StatusInternalServerError)
		return
	}

	if logs == nil {
		logs = []models.LogEntry{}
	}

	response := models.LogQueryResponse{
		Total:     len(logs),
		LeaderPod: h.State.LeaderPod,
		Storage:   storageName,
		Logs:      logs,
	}

	json.NewEncoder(w).Encode(response)
}
