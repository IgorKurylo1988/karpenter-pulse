package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"

	"karpenter-pulse-backend/internal/k8s"
	"karpenter-pulse-backend/internal/models"
)

func (h *HandlerContext) HandleNodes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	isSandbox := !h.State.K8sConnected || r.URL.Query().Get("sandbox") == "true"
	if isSandbox {
		h.State.MockMu.Lock()
		json.NewEncoder(w).Encode(h.State.MockNodes)
		h.State.MockMu.Unlock()
		return
	}
	nodes, err := k8s.FetchNodes(h.State)
	if err != nil {
		log.Printf("Error fetching nodes: %v\n", err)
		http.Error(w, fmt.Sprintf(`{"error":"Failed to query nodes","details":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(nodes)
}

func (h *HandlerContext) HandleConsolidateNode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		NodeName string `json:"nodeName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}` , http.StatusBadRequest)
		return
	}

	if req.NodeName == "" {
		http.Error(w, `{"error":"nodeName is required"}`, http.StatusBadRequest)
		return
	}

	isSandbox := !h.State.K8sConnected || r.URL.Query().Get("sandbox") == "true"
	if isSandbox {
		PublishLog(fmt.Sprintf("Initiating consolidation for node %q (underutilized)", req.NodeName), "WARNING")
		h.State.MockMu.Lock()
		nodeIdx := -1
		for i, n := range h.State.MockNodes {
			if n.Name == req.NodeName {
				h.State.MockNodes[i].Status = "Terminating"
				nodeIdx = i
				break
			}
		}
		h.State.MockMu.Unlock()

		if nodeIdx != -1 {
			go func(name string) {
				time.Sleep(1 * time.Second)
				PublishLog(fmt.Sprintf("Evicting pods running on node %q", name), "INFO")
				
				time.Sleep(2 * time.Second)
				h.State.MockMu.Lock()
				defer h.State.MockMu.Unlock()
				
				claimName := ""
				for _, n := range h.State.MockNodes {
					if n.Name == name {
						claimName = n.NodeClaim
						break
					}
				}
				
				newNodes := []models.K8sNode{}
				for _, n := range h.State.MockNodes {
					if n.Name != name {
						newNodes = append(newNodes, n)
					}
				}
				h.State.MockNodes = newNodes

				if claimName != "" {
					newClaims := []models.NodeClaim{}
					for _, c := range h.State.MockClaims {
						if c.Name != claimName {
							newClaims = append(newClaims, c)
						}
					}
					h.State.MockClaims = newClaims
				}
				PublishLog(fmt.Sprintf("Successfully deprovisioned node %q and terminated associated instance", name), "SUCCESS")
			}(req.NodeName)
		}
	} else {
		node, err := h.State.Clientset.CoreV1().Nodes().Get(context.Background(), req.NodeName, metav1.GetOptions{})
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Node not found","details":"%s"}`, err.Error()), http.StatusNotFound)
			return
		}
		
		claimName := node.Labels["karpenter.sh/nodeclaim"]
		if claimName != "" {
			gvr := schema.GroupVersionResource{Group: "karpenter.sh", Version: "v1", Resource: "nodeclaims"}
			err = h.State.DynamicClient.Resource(gvr).Delete(context.Background(), claimName, metav1.DeleteOptions{})
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"Failed to delete NodeClaim","details":"%s"}`, err.Error()), http.StatusInternalServerError)
				return
			}
		} else {
			err = h.State.Clientset.CoreV1().Nodes().Delete(context.Background(), req.NodeName, metav1.DeleteOptions{})
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"Failed to delete Node","details":"%s"}`, err.Error()), http.StatusInternalServerError)
				return
			}
		}
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"Consolidation initiated"}`))
}
