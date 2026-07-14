package handlers

import (
	"log"
	"net/http"
	
	"karpenter-pulse-backend/internal/state"
)

type HandlerContext struct {
	State *state.ClusterState
}

func NewHandlerContext(s *state.ClusterState) *HandlerContext {
	return &HandlerContext{State: s}
}

func CorsAndLogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		log.Printf("%s - %s %s\n", r.RemoteAddr, r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}
