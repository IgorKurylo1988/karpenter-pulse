package models

import "time"

// PriceEstimate represents the estimated cost for an instance type
type PriceEstimate struct {
	InstanceType     string    `json:"instanceType"`
	CapacityType     string    `json:"capacityType"` // "spot" or "on-demand"
	Zone             string    `json:"zone"`
	HourlyPrice      float64   `json:"hourlyPrice"`
	OnDemandBaseline float64   `json:"onDemandBaseline"`
	SavingsPercent   float64   `json:"savingsPercentage"`
	Source           string    `json:"source"` // "karpenter_metric", "aws_api", "embedded_matrix", "simulation"
	Currency         string    `json:"currency"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

// NodePoolPricing contains aggregated pricing information for a single NodePool
type NodePoolPricing struct {
	Name         string  `json:"name"`
	HourlyCost   float64 `json:"hourlyCost"`
	NodeCount    int     `json:"nodeCount"`
	SpotCount    int     `json:"spotCount"`
	OnDemandCost float64 `json:"onDemandCost"`
	SavingsCost  float64 `json:"savingsCost"`
}

// PricingSummary contains cluster-wide cost and efficiency metrics for Recharts
type PricingSummary struct {
	TotalHourlyCost        float64           `json:"totalHourlyCost"`
	OnDemandBaselineHourly float64           `json:"onDemandBaselineHourly"`
	TotalHourlySavings     float64           `json:"totalHourlySavings"`
	SavingsPercentage      float64           `json:"savingsPercentage"`
	ProjectedMonthlySpend  float64           `json:"projectedMonthlySpend"`
	ProjectedMonthlySavings float64          `json:"projectedMonthlySavings"`
	Currency               string            `json:"currency"`
	SpotRatio              float64           `json:"spotRatio"`
	GravitonRatio          float64           `json:"gravitonRatio"`
	NodePoolBreakdown      []NodePoolPricing `json:"nodePoolBreakdown"`
	Timestamp              string            `json:"timestamp"`
}
