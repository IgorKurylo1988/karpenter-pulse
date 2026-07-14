package handlers

import (
	"net/http"
)

func (h *HandlerContext) HandleResetSandbox(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	h.State.ResetSandbox()
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"Sandbox state reset success"}`))
}
