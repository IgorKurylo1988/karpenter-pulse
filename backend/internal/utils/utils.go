package utils

import (
	"fmt"
	"time"

	"karpenter-pulse-backend/internal/pricing"
)

func GetAgeString(t time.Time) string {
	if t.IsZero() {
		return "unknown"
	}
	diff := time.Since(t)
	if diff.Hours() > 24 {
		return fmt.Sprintf("%dd", int(diff.Hours()/24))
	}
	if diff.Hours() >= 1 {
		return fmt.Sprintf("%dh %dm", int(diff.Hours()), int(diff.Minutes())%60)
	}
	return fmt.Sprintf("%dm", int(diff.Minutes()))
}

func GetEstimatedCost(instanceType string, isSpot bool) float64 {
	capType := "on-demand"
	if isSpot {
		capType = "spot"
	}
	hourly, _, _, _ := pricing.GetMatrixPrice(instanceType, capType, "us-east-1")
	return hourly
}

func RoundTwoDecimals(val float64) float64 {
	return float64(int(val*100)) / 100.0
}
