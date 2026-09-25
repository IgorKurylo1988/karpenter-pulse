package pricing

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"karpenter-pulse-backend/internal/models"
	"karpenter-pulse-backend/internal/storage"
)

// PricingEngine orchestrates the 3-tier pricing resolution strategy
type PricingEngine struct {
	storage             storage.StorageDriver
	karpenterMetricsURL string
	httpClient          *http.Client
}

// NewPricingEngine initializes a new engine backed by a StorageDriver
func NewPricingEngine(store storage.StorageDriver) *PricingEngine {
	metricsURL := os.Getenv("KARPENTER_METRICS_URL")
	return &PricingEngine{
		storage:             store,
		karpenterMetricsURL: metricsURL,
		httpClient:          &http.Client{Timeout: 3 * time.Second},
	}
}

// EstimatePrice resolves the price using the 3-tier hierarchy
func (p *PricingEngine) EstimatePrice(ctx context.Context, instanceType, capacityType, zone string) (*models.PriceEstimate, error) {
	instType := strings.TrimSpace(instanceType)
	if instType == "" {
		instType = "m6g.xlarge"
	}
	capType := strings.ToLower(strings.TrimSpace(capacityType))
	if capType == "" {
		capType = "on-demand"
	}

	cacheKey := fmt.Sprintf("price:%s:%s:%s", zone, instType, capType)

	// 1. Check intermediate cache
	if p.storage != nil {
		if cached, _ := p.storage.GetPrice(ctx, cacheKey); cached != nil {
			return cached, nil
		}
	}

	// 2. Tier 1: Scrape Karpenter Prometheus metrics endpoint if configured
	if p.karpenterMetricsURL != "" {
		if price, err := p.scrapeKarpenterMetric(ctx, instType, capType, zone); err == nil && price > 0 {
			_, onDemand, _, _ := GetMatrixPrice(instType, "on-demand", zone)
			savings := 0.0
			if onDemand > price {
				savings = roundPrice(((onDemand - price) / onDemand) * 100.0)
			}
			est := &models.PriceEstimate{
				InstanceType:     instType,
				CapacityType:     capType,
				Zone:             zone,
				HourlyPrice:      price,
				OnDemandBaseline: onDemand,
				SavingsPercent:   savings,
				Source:           "karpenter_metric",
				Currency:         "USD",
				UpdatedAt:        time.Now(),
			}
			if p.storage != nil {
				ttl := 30 * time.Minute
				if capType == "on-demand" {
					ttl = 24 * time.Hour
				}
				_ = p.storage.SetPrice(ctx, cacheKey, est, ttl)
			}
			return est, nil
		}
	}

	// 3. Tier 3: Reference Pricing Matrix
	hourly, onDemand, savingsPercent, _ := GetMatrixPrice(instType, capType, zone)
	est := &models.PriceEstimate{
		InstanceType:     instType,
		CapacityType:     capType,
		Zone:             zone,
		HourlyPrice:      hourly,
		OnDemandBaseline: onDemand,
		SavingsPercent:   savingsPercent,
		Source:           "embedded_matrix",
		Currency:         "USD",
		UpdatedAt:        time.Now(),
	}

	if p.storage != nil {
		ttl := 30 * time.Minute
		if capType == "on-demand" {
			ttl = 24 * time.Hour
		}
		_ = p.storage.SetPrice(ctx, cacheKey, est, ttl)
	}

	return est, nil
}

// scrapeKarpenterMetric queries Karpenter's Prometheus metrics endpoint
func (p *PricingEngine) scrapeKarpenterMetric(ctx context.Context, instanceType, capacityType, zone string) (float64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.karpenterMetricsURL, nil)
	if err != nil {
		return 0, err
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	scanner := bufio.NewScanner(resp.Body)
	targetMetric := "karpenter_nodeclaims_instance_type_offering_price_estimate"

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, targetMetric) {
			if strings.Contains(line, fmt.Sprintf("instance_type=%q", instanceType)) &&
				strings.Contains(line, fmt.Sprintf("capacity_type=%q", capacityType)) {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					val, parseErr := strconv.ParseFloat(parts[len(parts)-1], 64)
					if parseErr == nil {
						return val, nil
					}
				}
			}
		}
	}
	return 0, fmt.Errorf("metric not found")
}

// CalculateClusterSummary aggregates financial metrics across active nodes for Recharts
func (p *PricingEngine) CalculateClusterSummary(nodes []models.K8sNode) models.PricingSummary {
	var totalHourly, onDemandBaseline float64
	var spotCount, gravitonCount int

	poolMap := make(map[string]*models.NodePoolPricing)

	for _, node := range nodes {
		totalHourly += node.CostPerHour

		// Get the on-demand baseline for this node
		_, nodeBaseline, _, _ := GetMatrixPrice(node.InstanceType, "on-demand", node.Zone)
		onDemandBaseline += nodeBaseline

		isSpot := strings.ToLower(node.CapacityType) == "spot"
		if isSpot {
			spotCount++
		}

		if isGraviton(node.InstanceType) {
			gravitonCount++
		}

		poolName := node.NodePool
		if poolName == "" {
			poolName = "default"
		}

		if _, exists := poolMap[poolName]; !exists {
			poolMap[poolName] = &models.NodePoolPricing{
				Name: poolName,
			}
		}

		pool := poolMap[poolName]
		pool.HourlyCost = roundPrice(pool.HourlyCost + node.CostPerHour)
		pool.OnDemandCost = roundPrice(pool.OnDemandCost + nodeBaseline)
		pool.NodeCount++
		if isSpot {
			pool.SpotCount++
		}
		pool.SavingsCost = roundPrice(pool.OnDemandCost - pool.HourlyCost)
	}

	totalHourly = roundPrice(totalHourly)
	onDemandBaseline = roundPrice(onDemandBaseline)
	totalSavings := roundPrice(onDemandBaseline - totalHourly)
	if totalSavings < 0 {
		totalSavings = 0
	}

	savingsPercent := 0.0
	if onDemandBaseline > 0 {
		savingsPercent = roundPrice((totalSavings / onDemandBaseline) * 100.0)
	}

	totalNodes := len(nodes)
	spotRatio := 0.0
	gravitonRatio := 0.0
	if totalNodes > 0 {
		spotRatio = roundPrice(float64(spotCount) / float64(totalNodes))
		gravitonRatio = roundPrice(float64(gravitonCount) / float64(totalNodes))
	}

	breakdown := make([]models.NodePoolPricing, 0, len(poolMap))
	for _, p := range poolMap {
		breakdown = append(breakdown, *p)
	}

	return models.PricingSummary{
		TotalHourlyCost:         totalHourly,
		OnDemandBaselineHourly:  onDemandBaseline,
		TotalHourlySavings:      totalSavings,
		SavingsPercentage:       savingsPercent,
		ProjectedMonthlySpend:   roundPrice(totalHourly * 730.0),
		ProjectedMonthlySavings: roundPrice(totalSavings * 730.0),
		Currency:                "USD",
		SpotRatio:               spotRatio,
		GravitonRatio:           gravitonRatio,
		NodePoolBreakdown:       breakdown,
		Timestamp:               time.Now().Format(time.RFC3339),
	}
}

func isGraviton(instanceType string) bool {
	instLower := strings.ToLower(instanceType)
	return strings.Contains(instLower, "g.") ||
		strings.HasPrefix(instLower, "t4g") ||
		strings.HasPrefix(instLower, "c6g") ||
		strings.HasPrefix(instLower, "c7g") ||
		strings.HasPrefix(instLower, "m6g") ||
		strings.HasPrefix(instLower, "m7g") ||
		strings.HasPrefix(instLower, "r6g") ||
		strings.HasPrefix(instLower, "r7g")
}
