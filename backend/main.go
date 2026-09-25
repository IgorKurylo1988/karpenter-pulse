package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"karpenter-pulse-backend/internal/handlers"
	"karpenter-pulse-backend/internal/k8s"
	"karpenter-pulse-backend/internal/pricing"
	"karpenter-pulse-backend/internal/sqs"
	"karpenter-pulse-backend/internal/state"
	"karpenter-pulse-backend/internal/storage"
)

func main() {
	// Initialize shared concurrent cluster state context
	appState := state.NewClusterState()

	// Initialize Intermediate Storage Driver (Redis with in-memory fallback)
	redisAddr := os.Getenv("REDIS_ADDR")
	redisPassword := os.Getenv("REDIS_PASSWORD")
	var store storage.StorageDriver
	if redisAddr != "" {
		store = storage.NewRedisStorage(redisAddr, redisPassword, 1000)
	} else {
		log.Println("INFO: REDIS_ADDR not configured. Operating with in-memory ring buffer and cache.")
		store = storage.NewMemoryStorage(1000)
	}
	defer store.Close()
	appState.Storage = store

	// Initialize Multi-Tier Pricing Engine
	pricingEngine := pricing.NewPricingEngine(store)

	// A. Initialize Kubernetes Clients
	k8s.InitK8sClient(appState)

	// Set Log callbacks to bridge log lines and typed entries to WebSocket clients and storage
	appState.OnLogReceived = handlers.PublishLog
	appState.OnStructuredLogReceived = handlers.PublishStructuredLog

	// Start WebSocket Broadcast Ticker
	handlers.StartWSBroadcastTicker(appState)

	// Start live Karpenter controller leader log streamer
	k8s.StartKarpenterLogStreamer(appState)

	// Start Kubernetes Event Watcher for Karpenter resources
	k8s.StartKarpenterEventWatcher(appState)

	// Start AWS SQS Poller background thread if queue URL is configured
	sqsQueueURL := os.Getenv("SQS_QUEUE_URL")
	if sqsQueueURL != "" {
		go sqs.StartSQSPoller(appState, sqsQueueURL)
	} else {
		log.Println("INFO: SQS_QUEUE_URL not configured. AWS Spot Interruption poller disabled.")
	}

	// B. Setup HTTP router
	mux := http.NewServeMux()
	hc := handlers.NewHandlerContext(appState, pricingEngine)

	// API Routes (Decoupled endpoints)
	mux.HandleFunc("/api/ws", hc.HandleWS)
	mux.HandleFunc("/api/nodes", hc.HandleNodes)
	mux.HandleFunc("/api/nodepools", hc.HandleNodePools)
	mux.HandleFunc("/api/nodeclasses", hc.HandleNodeClasses)
	mux.HandleFunc("/api/nodeclaims", hc.HandleNodeClaims)
	mux.HandleFunc("/api/pods", hc.HandlePodsRoute)
	mux.HandleFunc("/api/alerts", hc.HandleAlertsRoute)
	mux.HandleFunc("/api/pricing/summary", hc.HandlePricingSummary)
	mux.HandleFunc("/api/pricing/estimate", hc.HandlePricingEstimate)
	mux.HandleFunc("/api/logs", hc.HandleLogs)
	mux.HandleFunc("/api/nodes/consolidate", hc.HandleConsolidateNode)
	mux.HandleFunc("/api/scale-up", hc.HandleScaleUp)
	mux.HandleFunc("/api/sandbox/reset", hc.HandleResetSandbox)
	mux.HandleFunc("/api/health", hc.HandleHealth)

	// CORS and Logger Middleware
	handler := handlers.CorsAndLogMiddleware(mux)

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	server := &http.Server{
		Addr:    ":" + port,
		Handler: handler,
	}

	// Catch OS shutdown signals
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	// Start server in background thread
	go func() {
		fmt.Printf("Karpenter Pulse API server starting on port %s...\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Error starting API server: %v\n", err)
		}
	}()

	// Block until exit signal is received
	sig := <-stop
	handlers.PublishLog(fmt.Sprintf("OS Signal %v received. Initiating graceful shutdown...", sig), "WARNING")

	// Create shutdown context with 30s timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v\n", err)
	}

	handlers.PublishLog("API Server shut down gracefully. Exiting.", "SUCCESS")
}
