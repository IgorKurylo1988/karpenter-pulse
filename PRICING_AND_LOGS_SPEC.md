# Technical Specification: Real-Time Pricing Engine, Redis Caching, & Karpenter Observability Visualizations

**Status:** Approved for Implementation  
**Author:** [@Product Engineer](.agents/product_engineer.md)  
**Target Profiles:** [@Backend Engineer](.agents/backend_engineer.md), [@Frontend Engineer](.agents/frontend_engineer.md), [@Release Engineer](.agents/release_engineer.md)  
**Target Audience:** DevOps Engineers, FinOps Architects, Kubernetes Platform SREs  

---

## 1. Executive Summary & Problem Discovery

Karpenter Pulse's core mission is to provide clear, actionable visibility into Kubernetes autoscaling, provisioning decisions, and compute costs. This specification expands upon two foundational pillars and introduces high-leverage data visualizations and an intermediate caching architecture:

1. **Accurate Multi-Tier Pricing Engine:**
   * Replaces the static `GetEstimatedCost` heuristic in `backend/internal/utils/utils.go` with a 3-tier resolution engine (Karpenter metrics $\to$ AWS Pricing API $\to$ Embedded offline matrix).
2. **Intermediate Caching Layer (Redis / In-Memory Fallback):**
   * Solves state loss across backend pod restarts, enables horizontal scaling of the Karpenter Pulse backend, and deduplicates high-volume log buffering and external pricing queries.
3. **Leader-Aware Controller Observability:**
   * Dynamically tracks the active Karpenter leader replica via the Kubernetes `Lease` API, buffers historical logs in a circular ring buffer, and watches `v1.Event` lifecycle events.
4. **Rich FinOps & Autoscaling Data Visualizations:**
   * Interactive Recharts dashboards designed specifically for SREs and FinOps teams to audit spend, spot diversification, bin-packing efficiency, and scaling decision timelines.

---

## 2. System Architecture Overview

```mermaid
graph TD
    subgraph Kubernetes Cluster
        KarpenterLeader[Karpenter Leader Pod]
        KarpenterStandby[Karpenter Standby Pod]
        K8sLease[Lease: karpenter-leader-election]
        K8sEvents[Kubernetes Events API]
        KarpenterMetrics[Karpenter Prometheus Metrics :8000]
    end

    subgraph Intermediate Cache Layer
        Redis[Redis / Valkey Cache & Stream]
        MemoryFallback[In-Memory RWMutex Buffer Fallback]
    end

    subgraph Karpenter Pulse Backend
        LeaderDetector[Leader Election Detector]
        LogStreamer[Structured Log Ingestion Engine]
        EventWatcher[K8s Event Watcher]
        
        subgraph Hybrid Pricing Engine
            KarpenterMetricsScraper[Karpenter Offering Price Reader]
            AWSPricingClient[AWS Pricing Provider]
            FallbackMatrix[Static Embedded Pricing Matrix]
        end

        APIHandler[REST API & WS Broadcast]
        SimulationEngine[Fallback Sandbox Simulator]
    end

    subgraph Frontend Client Recharts
        UI_CostTrends[Cumulative Spend & Savings Area Chart]
        UI_NodePoolDonut[Cost Allocation by NodePool Donut]
        UI_BinPacking[Bin-Packing Efficiency Heatmap]
        UI_SpotRadar[Spot Diversification Risk Radar]
        UI_DecisionTimeline[Autoscaling Decision Timeline]
    end

    K8sLease -->|Watch Active Leader| LeaderDetector
    LeaderDetector -->|Follow Leader Pod| LogStreamer
    KarpenterLeader -->|Tail Stdout Logs| LogStreamer
    K8sEvents -->|Watch Events| EventWatcher

    LogStreamer --> Redis
    EventWatcher --> Redis
    LogStreamer -.->|If Redis Unavailable| MemoryFallback
    EventWatcher -.->|If Redis Unavailable| MemoryFallback

    KarpenterMetrics --> KarpenterMetricsScraper
    KarpenterMetricsScraper --> Redis
    AWSPricingClient --> Redis
    FallbackMatrix -.-> MemoryFallback

    Redis --> APIHandler
    MemoryFallback --> APIHandler
    SimulationEngine -.->|When Disconnected| APIHandler

    APIHandler -->|HTTP /api/pricing & /api/logs| Frontend Client Recharts
    APIHandler -->|WebSocket /api/ws| Frontend Client Recharts
```

---

## 3. Intermediate Cache Layer: Redis with In-Memory Fallback

To support multi-replica deployments of Karpenter Pulse, prevent API rate-limiting against AWS Pricing, and ensure historical logs survive container restarts:

### A. Dual-Driver Cache Architecture
The backend will implement a pluggable `StorageDriver` interface:

```go
type StorageDriver interface {
    // Pricing Caching
    GetPrice(ctx context.Context, key string) (*models.PriceEstimate, error)
    SetPrice(ctx context.Context, key string, price *models.PriceEstimate, ttl time.Duration) error
    
    // Log & Event History Ring Buffer
    AppendLog(ctx context.Context, entry *models.LogEntry) error
    GetRecentLogs(ctx context.Context, limit int, filter models.LogFilter) ([]models.LogEntry, error)
    
    // Pub/Sub for Multi-Instance WebSocket Sync
    PublishEvent(ctx context.Context, channel string, payload interface{}) error
    SubscribeEvents(ctx context.Context, channel string, handler func(payload []byte)) error
}
```

### B. Driver Resolution Strategy
1. **Redis Driver (`REDIS_ADDR != ""`):**
   * Stores pricing keys: `pricing:instance:{region}:{instanceType}:{capacityType}` (TTL: 24h for on-demand, 30m for spot).
   * Stores logs using **Redis Capped Lists** (`LPUSH` + `LTRIM` keeping 2,000 items) or **Redis Streams** (`XADD` with `MAXLEN ~ 2000`).
   * Uses Redis Pub/Sub to broadcast WebSocket messages across multiple Karpenter Pulse backend pods.
2. **In-Memory Ring Buffer Driver (`REDIS_ADDR == ""` or Redis connection failure):**
   * Zero external dependencies. Uses a thread-safe `sync.RWMutex` circular buffer in RAM with an LRU pricing map.
   * Seamlessly used in local development, Docker Compose sandbox mode, and single-replica production installs.

---

## 4. Subsystem 1: Hybrid Pricing Engine

Replaces `utils.GetEstimatedCost()` with three tiers:

```text
Tier 1: Karpenter Native Offering Price (Prometheus :8000/metrics or NodeClaim annotations)
          ↓ (if metric endpoint unreachable)
Tier 2: AWS Price List API & EC2 Spot Price History (Cached in Redis for 24h/30m)
          ↓ (if AWS credentials not supplied or rate limited)
Tier 3: Embedded Multi-Region Reference Matrix (Go static dataset)
```

### Pricing Model Schema (`backend/internal/models/pricing.go`)
```go
type PriceEstimate struct {
    InstanceType     string    `json:"instanceType"`
    CapacityType     string    `json:"capacityType"` // "spot" | "on-demand"
    Zone             string    `json:"zone"`
    HourlyPrice      float64   `json:"hourlyPrice"`
    OnDemandBaseline float64   `json:"onDemandBaseline"`
    SavingsPercent   float64   `json:"savingsPercentage"`
    Source           string    `json:"source"` // "karpenter_metric" | "aws_api" | "embedded_matrix" | "simulation"
    UpdatedAt        time.Time `json:"updatedAt"`
}
```

---

## 5. Subsystem 2: Leader-Aware Controller Log & Event Ingestion

1. **Lease Watcher:** Checks `coordination.k8s.io/v1` `Lease` named `karpenter-leader-election` in the Karpenter namespace. Discovers the `holderIdentity` pod and follows its log stream. If leadership shifts, reconnects within 2 seconds.
2. **Structured Zap Parser:** Parses Karpenter’s JSON logs, extracting:
   * `category`: `PROVISIONING`, `CONSOLIDATION`, `DISRUPTION`, `INTERRUPTION`, `SYSTEM`.
   * `metadata`: `nodeclaim`, `nodepool`, `pods`, `reason`.
3. **Kubernetes Event Watcher:** Watches `corev1.Event` objects where `involvedObject.kind` is `NodePool`, `NodeClaim`, or `Node`. Injects lifecycle milestones (`Nominated`, `Launched`, `Disrupted`) into the unified event stream.

---

## 6. Frontend Data Visualization Specifications (Recharts)

The [@Frontend Engineer](.agents/frontend_engineer.md) will implement a dedicated **FinOps & Observability Analytics Suite** using Recharts.

### Visualization 1: Cumulative Hourly Spend vs. On-Demand Baseline
* **Chart Type:** Multi-Area Chart with gradient fill (`AreaChart`).
* **Data Sources:** Real-time cluster aggregate cost computed from active nodes.
* **Metrics:**
  * **Line A (Red dashed):** On-Demand Baseline Cost ($/hour if 100% On-Demand).
  * **Area B (Emerald gradient):** Actual Current Cost ($/hour blending Spot + On-Demand).
  * **Delta Shading:** The shaded gap represents **Active Real-Time Savings ($/hr and $/month projected)**.
* **Interactive Tooltip:** Hovering over any data point breaks down: Spot Spend, On-Demand Spend, and Net Savings percentage.

### Visualization 2: Cost Allocation by NodePool
* **Chart Type:** Interactive Donut / Pie Chart (`PieChart` with `Cell` colors).
* **Data Sources:** Grouped node costs by `labels["karpenter.sh/nodepool"]`.
* **Features:**
  * Center KPI display: Total hourly burn rate ($/hr).
  * Legend showing NodePool name, active node count, and percentage of cluster budget.
  * Clicking a sector filters the node table below to only display nodes belonging to that NodePool.

### Visualization 3: Spot vs. On-Demand & Architecture Efficiency Ratio
* **Chart Type:** Bi-axial Stacked Bar Chart (`BarChart`).
* **Dimensions:**
  * Grouped by NodePool.
  * Bar 1: Spot vs On-Demand ($ and count).
  * Bar 2: Graviton (ARM64) vs x86 (AMD64) ($ and count).
* **Product Value:** Shows whether teams are maximizing cost efficiency by adopting both Spot and modern Graviton processors.

---

## 7. Product Innovation: Advanced Autoscaling Visualizations

To help DevOps and Platform SREs diagnose Karpenter autoscaler health beyond just raw tables:

### Visualization 4: Node Bin-Packing & Allocation Efficiency Heatmap
* **Chart Type:** Treemap or Multi-Bar Packing Gauge (`Treemap` / Progress bars).
* **Concept:** Karpenter aims to pack pods tightly so underutilized nodes can be consolidated.
* **Metrics Displayed:**
  * CPU Allocated vs. Allocatable Capacity (%).
  * Memory Allocated vs. Allocatable Capacity (%).
* **Visual Alerting:**
  * **Green (>80% packed):** Highly efficient bin-packing.
  * **Amber (50% - 80%):** Balanced.
  * **Purple / Pulsing (<40% underutilized for >10m):** Highlighted as a prime candidate for Karpenter Consolidation (`WhenEmptyOrUnderutilized`).

### Visualization 5: Spot Pool Diversification & Interruption Risk Radar
* **Chart Type:** Radar / Polar Chart (`RadarChart`).
* **Concept:** If a cluster runs 100% of its Spot workload on a single instance type (e.g., `c6g.xlarge` in `eu-north1-a`), an AWS capacity spike could reclaim all nodes at once.
* **Axes:** Instance Families (`c6g`, `c6i`, `m6g`, `m6i`, `r6g`, `t4g`) across Availability Zones.
* **Product Value:** Displays an **"Interruption Resilience Score"** (0-100). Higher spread across distinct capacity pools indicates greater resilience against mass Spot evictions.

### Visualization 6: Autoscaling Decision Timeline (Chronological Swimlane)
* **Chart Type:** Timeline / Event Flow Diagram.
* **Chronology Flow:**
  $$\text{Unscheduled Pod Event} \longrightarrow \text{Bin-Packing Calculation} \longrightarrow \text{NodeClaim Launched} \longrightarrow \text{Node Ready} \longrightarrow \text{Pod Bound}$$
* **Product Value:** Replaces scrolling through raw logs. SREs can see the exact time elapsed (e.g., *42 seconds from pod pending to running*), isolating whether delays stem from Karpenter scheduling, EC2 instance launch, or container image pulling.

---

## 8. REST & WebSocket API Contracts

### A. `GET /api/pricing/summary`
Returns cluster-wide financial metrics and historical points for the Recharts charts.
```json
{
  "totalHourlyCost": 1.482,
  "onDemandBaselineHourly": 4.120,
  "totalHourlySavings": 2.638,
  "savingsPercentage": 64.03,
  "projectedMonthlySpend": 1067.04,
  "projectedMonthlySavings": 1899.36,
  "currency": "USD",
  "spotRatio": 0.78,
  "gravitonRatio": 0.85,
  "nodePoolBreakdown": [
    { "name": "general-purpose", "hourlyCost": 0.894, "nodeCount": 6 },
    { "name": "memory-heavy", "hourlyCost": 0.588, "nodeCount": 2 }
  ]
}
```

### B. `GET /api/logs`
```json
{
  "total": 240,
  "leaderPod": "karpenter-6f75646f-8d9zk",
  "storage": "redis",
  "logs": [
    {
      "id": "log-4819",
      "timestamp": "2026-09-17T08:35:10Z",
      "level": "INFO",
      "category": "PROVISIONING",
      "message": "Found 3 provisionable pod(s)",
      "nodeClaim": "general-purpose-4m9xk",
      "nodePool": "general-purpose",
      "details": {
        "instanceTypes": ["c6g.xlarge", "c7g.xlarge"],
        "zone": "europe-north1a"
      }
    }
  ]
}
```

---

## 9. Phased Engineering Task Breakdown

### Phase 1: Storage Driver & Pricing Engine Core
* **Assignee:** [@Backend Engineer](.agents/backend_engineer.md)
* [ ] Create `internal/storage/storage.go` defining the `StorageDriver` interface.
* [ ] Implement `internal/storage/redis.go` (Redis client with connection pooling and graceful degraded fallback).
* [ ] Implement `internal/storage/memory.go` (Thread-safe in-memory cache and circular ring buffer).
* [ ] Build `internal/pricing/pricing.go` and `internal/pricing/matrix.go` replacing `utils.GetEstimatedCost`.
* [ ] Expose `GET /api/pricing/summary` and `GET /api/pricing/estimate`.

### Phase 2: Leader-Aware Controller Streamer & Event Watcher
* **Assignee:** [@Backend Engineer](.agents/backend_engineer.md)
* [ ] Implement `internal/k8s/leader.go` using the Kubernetes `Lease` client.
* [ ] Update `internal/k8s/logs.go` with structured `zap` parsing and automatic reconnection on leader transition.
* [ ] Implement `internal/k8s/events.go` to watch core `v1.Event` resources for Karpenter CRDs.
* [ ] Buffer all ingested logs and events through the `StorageDriver`.
* [ ] Expose `GET /api/logs` with search, level, and category filters.

### Phase 3: Frontend Data Visualizations & Recharts Suite
* **Assignee:** [@Frontend Engineer](.agents/frontend_engineer.md)
* [ ] Install `recharts` in `ui/package.json` (Approved by Product Engineer).
* [ ] Build `<CostSavingsAreaChart />` (Actual vs. On-Demand baseline with gradient fill).
* [ ] Build `<NodePoolDonutChart />` (Interactive cost breakdown with center burn-rate KPI).
* [ ] Build `<BinPackingHeatmap />` (Node CPU/Memory packing efficiency with underutilization alerts).
* [ ] Build `<SpotRiskRadar />` (Spot instance pool diversification radar).
* [ ] Build `<ActivityTimeline />` (Karpenter autoscaling decision chronological swimlane).

### Phase 4: Helm Chart & Deployment Configurations
* **Assignee:** [@Release Engineer](.agents/release_engineer.md)
* [ ] Update `helm/values.yaml` to include optional Redis subchart dependency (`redis.enabled: false`) or external connection (`redis.host`, `redis.port`, `redis.passwordSecret`).
* [ ] Add environment variable injection in `helm/charts/backend/templates/deployment.yaml` for `REDIS_ADDR` and `REDIS_PASSWORD`.
