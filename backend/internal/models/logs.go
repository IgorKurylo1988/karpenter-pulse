package models

// LogCategory classifies the domain intent of Karpenter and K8s activity
type LogCategory string

const (
	CategoryProvisioning LogCategory = "PROVISIONING"
	CategoryDisruption   LogCategory = "DISRUPTION"
	CategoryConsolidation LogCategory = "CONSOLIDATION"
	CategoryInterruption LogCategory = "INTERRUPTION"
	CategoryK8sEvent     LogCategory = "K8S_EVENT"
	CategorySystem       LogCategory = "SYSTEM"
)

// LogEntry represents a single structured log or event line
type LogEntry struct {
	ID        string                 `json:"id"`
	Timestamp string                 `json:"timestamp"`
	Level     string                 `json:"level"` // "INFO", "WARNING", "ERROR", "SUCCESS"
	Category  LogCategory            `json:"category"`
	Message   string                 `json:"message"`
	NodePool  string                 `json:"nodePool,omitempty"`
	NodeClaim string                 `json:"nodeClaim,omitempty"`
	NodeName  string                 `json:"nodeName,omitempty"`
	Details   map[string]interface{} `json:"details,omitempty"`
}

// LogFilter specifies criteria for querying historical logs
type LogFilter struct {
	Level    string      `json:"level,omitempty"`
	Category LogCategory `json:"category,omitempty"`
	Search   string      `json:"search,omitempty"`
	Limit    int         `json:"limit,omitempty"`
}

// LogQueryResponse represents the API response for /api/logs
type LogQueryResponse struct {
	Total     int        `json:"total"`
	LeaderPod string     `json:"leaderPod,omitempty"`
	Storage   string     `json:"storage"` // "redis" or "memory"
	Logs      []LogEntry `json:"logs"`
}
