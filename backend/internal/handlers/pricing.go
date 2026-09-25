package handlers

import (
	"encoding/json"
	"net/http"

	"karpenter-pulse-backend/internal/k8s"
)

// HandlePricingSummary returns aggregated cluster-wide financial metrics for Recharts
func (h *HandlerContext) HandlePricingSummary(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	isSandbox := !h.State.K8sConnected || r.URL.Query().Get("sandbox") == "true"
	if isSandbox {
		h.State.MockMu.RLock()
		summary := h.Pricing.CalculateClusterSummary(h.State.MockNodes)
		h.State.MockMu.RUnlock()
		json.NewEncoder(w).Encode(summary)
		return
	}

	nodes, err := k8s.FetchNodes(h.State)
	if err != nil {
		http.Error(w, `{"error":"Failed to query nodes for pricing calculation"}`, http.StatusInternalServerError)
		return
	}

	summary := h.Pricing.CalculateClusterSummary(nodes)
	json.NewEncoder(w).Encode(summary)
}

// HandlePricingEstimate returns pricing details for a single instance type
func (h *HandlerContext) HandlePricingEstimate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	instanceType := r.URL.Query().Get("instanceType")
	capacityType := r.URL.Query().Get("capacityType")
	zone := r.URL.Query().Get("zone")

	estimate, err := h.Pricing.EstimatePrice(r.Context(), instanceType, capacityType, zone)
	if err != nil {
		http.Error(w, `{"error":"Failed to estimate price"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(estimate)
}
