package utils

import (
	"fmt"
	"strings"
	"time"
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
	basePrice := 0.096
	if strings.Contains(instanceType, "medium") {
		basePrice = 0.0336
	} else if strings.Contains(instanceType, "large") && !strings.Contains(instanceType, "xlarge") {
		basePrice = 0.048
	} else if strings.Contains(instanceType, "2xlarge") {
		basePrice = 0.192
	} else if strings.Contains(instanceType, "4xlarge") {
		basePrice = 0.384
	} else if strings.Contains(instanceType, "8xlarge") {
		basePrice = 0.768
	} else if strings.Contains(instanceType, "g5.xlarge") {
		basePrice = 1.006
	}

	if isSpot {
		return basePrice * 0.40
	}
	return basePrice
}

func RoundTwoDecimals(val float64) float64 {
	return float64(int(val*100)) / 100.0
}
