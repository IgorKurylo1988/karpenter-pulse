package handlers

import (
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"karpenter-pulse-backend/internal/state"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow cross-origin connections for localhost development
	},
}

type WSMessage struct {
	Type    string      `json:"type"` // "alerts" or "log"
	Payload interface{} `json:"payload"`
}

type LogPayload struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

var (
	clients   = make(map[*websocket.Conn]bool)
	clientsMu sync.Mutex

	allowedLogLevels = map[string]bool{
		"INFO":    true,
		"WARNING": true,
		"SUCCESS": true,
		"ERROR":   true,
	}
	levelsOnce sync.Once
)

func initLogLevels() {
	envLevels := os.Getenv("LOG_LEVELS")
	if envLevels == "" {
		return
	}
	allowed := make(map[string]bool)
	parts := strings.Split(envLevels, ",")
	for _, part := range parts {
		lvl := strings.ToUpper(strings.TrimSpace(part))
		if lvl != "" {
			allowed[lvl] = true
		}
	}
	allowedLogLevels = allowed
}

// BroadcastWS sends a message to all connected WebSocket clients
func BroadcastWS(msg WSMessage) {
	clientsMu.Lock()
	defer clientsMu.Unlock()

	for client := range clients {
		err := client.WriteJSON(msg)
		if err != nil {
			log.Printf("WebSocket error: %v, closing client\n", err)
			client.Close()
			delete(clients, client)
		}
	}
}

// PublishLog logs a message to the stdout console and broadcasts it to all connected clients
func PublishLog(message string, level string) {
	levelsOnce.Do(initLogLevels)

	upperLvl := strings.ToUpper(level)
	if !allowedLogLevels[upperLvl] {
		return
	}

	timestamp := time.Now().Format("2006-01-02T15:04:05Z07:00")
	
	// Console log
	log.Printf("[%s] %s: %s\n", level, timestamp, message)
	
	// Broadcast to UI log console
	BroadcastWS(WSMessage{
		Type: "log",
		Payload: LogPayload{
			Timestamp: timestamp,
			Level:     level,
			Message:   message,
		},
	})
}

// HandleWS upgrades HTTP connection and registers the WebSocket client
func (h *HandlerContext) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection to WebSocket: %v\n", err)
		return
	}

	clientsMu.Lock()
	clients[conn] = true
	clientsMu.Unlock()

	// Notify connection
	PublishLog("Operator UI dashboard connected via WebSockets.", "SUCCESS")

	// Cleanup client on disconnect
	defer func() {
		clientsMu.Lock()
		delete(clients, conn)
		clientsMu.Unlock()
		conn.Close()
		log.Println("WebSocket client disconnected.")
	}()

	// Send initial active alerts list
	h.State.AlertsMu.RLock()
	alertsList := make([]interface{}, 0, len(h.State.ActiveAlerts))
	for _, alert := range h.State.ActiveAlerts {
		alertsList = append(alertsList, alert)
	}
	h.State.AlertsMu.RUnlock()

	conn.WriteJSON(WSMessage{
		Type:    "alerts",
		Payload: alertsList,
	})

	// Read loop to keep socket open and catch client disconnects
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

// StartWSBroadcastTicker runs a background goroutine ticking down alerts and updating clients
func StartWSBroadcastTicker(s *state.ClusterState) {
	ticker := time.NewTicker(1 * time.Second)
	go func() {
		for range ticker.C {
			s.AlertsMu.Lock()
			alertsChanged := false
			for id, alert := range s.ActiveAlerts {
				parsedDeadline, err := time.Parse(time.RFC3339, alert.Deadline)
				if err == nil {
					secsLeft := int(time.Until(parsedDeadline).Seconds())
					if secsLeft <= 0 {
						delete(s.ActiveAlerts, id)
						alertsChanged = true
					} else if secsLeft != alert.CountdownSeconds {
						alert.CountdownSeconds = secsLeft
						s.ActiveAlerts[id] = alert
						alertsChanged = true
					}
				} else {
					delete(s.ActiveAlerts, id)
					alertsChanged = true
				}
			}
			
			// Always broadcast if active alerts exist to maintain countdown timers synced, or when alert removed
			if alertsChanged || len(s.ActiveAlerts) > 0 {
				alertsList := make([]interface{}, 0, len(s.ActiveAlerts))
				for _, alert := range s.ActiveAlerts {
					alertsList = append(alertsList, alert)
				}
				s.AlertsMu.Unlock()
				
				BroadcastWS(WSMessage{
					Type:    "alerts",
					Payload: alertsList,
				})
			} else {
				s.AlertsMu.Unlock()
			}
		}
	}()
}
