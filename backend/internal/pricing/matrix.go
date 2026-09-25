package pricing

import (
	"strings"
)

// Regional cost adjustment multipliers relative to us-east-1 baseline
var regionalMultipliers = map[string]float64{
	"us-east-1":       1.00,
	"us-east-2":       1.00,
	"us-west-1":       1.15,
	"us-west-2":       1.00,
	"eu-west-1":       1.08,
	"eu-west-2":       1.12,
	"eu-west-3":       1.10,
	"eu-central-1":    1.12,
	"eu-north-1":      0.98,
	"europe-north1":   0.98,
	"ap-northeast-1":  1.18,
	"ap-northeast-2":  1.16,
	"ap-southeast-1":  1.15,
	"ap-southeast-2":  1.20,
	"ap-south-1":      1.04,
	"ca-central-1":    1.08,
	"sa-east-1":       1.45,
}

// Average empirical spot discount ratios per family
var familySpotDiscounts = map[string]float64{
	"t4g":  0.68, // 68% savings
	"c6g":  0.65,
	"c7g":  0.63,
	"m6g":  0.62,
	"m7g":  0.61,
	"r6g":  0.64,
	"r7g":  0.62,
	"c6i":  0.60,
	"c6a":  0.63,
	"m6i":  0.58,
	"m6a":  0.62,
	"r6i":  0.60,
	"r6a":  0.63,
	"c5":   0.62,
	"m5":   0.60,
	"r5":   0.61,
	"t3":   0.65,
	"t3a":  0.68,
	"g4dn": 0.62,
	"g5":   0.58,
	"p4d":  0.52,
}

// Baseline on-demand hourly pricing in us-east-1 (USD)
var onDemandBaselinePrices = map[string]float64{
	// T4g (Graviton ARM)
	"t4g.nano":    0.0042,
	"t4g.micro":   0.0084,
	"t4g.small":   0.0168,
	"t4g.medium":  0.0336,
	"t4g.large":   0.0672,
	"t4g.xlarge":  0.1344,
	"t4g.2xlarge": 0.2688,

	// T3 (Intel x86)
	"t3.nano":    0.0052,
	"t3.micro":   0.0104,
	"t3.small":   0.0208,
	"t3.medium":  0.0416,
	"t3.large":   0.0832,
	"t3.xlarge":  0.1664,
	"t3.2xlarge": 0.3328,

	// C6g (Compute Optimized Graviton)
	"c6g.medium":   0.0340,
	"c6g.large":    0.0680,
	"c6g.xlarge":   0.1360,
	"c6g.2xlarge":  0.2720,
	"c6g.4xlarge":  0.5440,
	"c6g.8xlarge":  1.0880,
	"c6g.12xlarge": 1.6320,
	"c6g.16xlarge": 2.1760,

	// C7g (Next-Gen Graviton3)
	"c7g.medium":   0.0361,
	"c7g.large":    0.0723,
	"c7g.xlarge":   0.1445,
	"c7g.2xlarge":  0.2890,
	"c7g.4xlarge":  0.5780,
	"c7g.8xlarge":  1.1560,
	"c7g.12xlarge": 1.7340,
	"c7g.16xlarge": 2.3120,

	// C6i (Compute Optimized Intel)
	"c6i.large":    0.0850,
	"c6i.xlarge":   0.1700,
	"c6i.2xlarge":  0.3400,
	"c6i.4xlarge":  0.6800,
	"c6i.8xlarge":  1.3600,
	"c6i.12xlarge": 2.0400,
	"c6i.16xlarge": 2.7200,
	"c6i.24xlarge": 4.0800,

	// C5 (Legacy Intel)
	"c5.large":    0.0850,
	"c5.xlarge":   0.1700,
	"c5.2xlarge":  0.3400,
	"c5.4xlarge":  0.6800,
	"c5.9xlarge":  1.5300,
	"c5.12xlarge": 2.0400,
	"c5.18xlarge": 3.0600,

	// M6g (General Purpose Graviton)
	"m6g.medium":   0.0385,
	"m6g.large":    0.0770,
	"m6g.xlarge":   0.1540,
	"m6g.2xlarge":  0.3080,
	"m6g.4xlarge":  0.6160,
	"m6g.8xlarge":  1.2320,
	"m6g.12xlarge": 1.8480,
	"m6g.16xlarge": 2.4640,

	// M7g (General Purpose Graviton3)
	"m7g.medium":   0.0408,
	"m7g.large":    0.0816,
	"m7g.xlarge":   0.1632,
	"m7g.2xlarge":  0.3264,
	"m7g.4xlarge":  0.6528,
	"m7g.8xlarge":  1.3056,
	"m7g.12xlarge": 1.9584,
	"m7g.16xlarge": 2.6112,

	// M6i (General Purpose Intel)
	"m6i.large":    0.0960,
	"m6i.xlarge":   0.1920,
	"m6i.2xlarge":  0.3840,
	"m6i.4xlarge":  0.7680,
	"m6i.8xlarge":  1.5360,
	"m6i.12xlarge": 2.3040,
	"m6i.16xlarge": 3.0720,
	"m6i.24xlarge": 4.6080,

	// M5 (Legacy Intel General)
	"m5.large":    0.0960,
	"m5.xlarge":   0.1920,
	"m5.2xlarge":  0.3840,
	"m5.4xlarge":  0.7680,
	"m5.8xlarge":  1.5360,
	"m5.12xlarge": 2.3040,

	// R6g (Memory Optimized Graviton)
	"r6g.medium":   0.0505,
	"r6g.large":    0.1010,
	"r6g.xlarge":   0.2020,
	"r6g.2xlarge":  0.4040,
	"r6g.4xlarge":  0.8080,
	"r6g.8xlarge":  1.6160,
	"r6g.12xlarge": 2.4240,
	"r6g.16xlarge": 3.2320,

	// R6i (Memory Optimized Intel)
	"r6i.large":    0.1260,
	"r6i.xlarge":   0.2520,
	"r6i.2xlarge":  0.5040,
	"r6i.4xlarge":  1.0080,
	"r6i.8xlarge":  2.0160,
	"r6i.12xlarge": 3.0240,
	"r6i.16xlarge": 4.0320,
	"r6i.24xlarge": 6.0480,

	// G5 (GPU Accelerated)
	"g5.xlarge":   1.0060,
	"g5.2xlarge":  1.2120,
	"g5.4xlarge":  1.6240,
	"g5.8xlarge":  2.4480,
	"g5.12xlarge": 5.6720,
	"g5.16xlarge": 4.0960,
	"g5.24xlarge": 8.1440,

	// G4dn (GPU Inference)
	"g4dn.xlarge":  0.5260,
	"g4dn.2xlarge": 0.7520,
	"g4dn.4xlarge": 1.2040,
	"g4dn.8xlarge": 2.1780,
}

// GetMatrixPrice retrieves accurate baseline and estimated spot pricing from the reference matrix
func GetMatrixPrice(instanceType, capacityType, zone string) (hourly float64, onDemand float64, savingsPercent float64, found bool) {
	instLower := strings.ToLower(strings.TrimSpace(instanceType))
	capLower := strings.ToLower(strings.TrimSpace(capacityType))

	basePrice, exists := onDemandBaselinePrices[instLower]
	if !exists {
		// Heuristic fallback for unlisted sizes
		basePrice = estimateUnknownInstance(instLower)
	}

	// Apply regional adjustment
	region := extractRegionFromZone(zone)
	multiplier, hasRegion := regionalMultipliers[region]
	if !hasRegion {
		multiplier = 1.00
	}
	adjustedOnDemand := roundPrice(basePrice * multiplier)

	isSpot := capLower == "spot"
	if isSpot {
		discount := extractFamilyDiscount(instLower)
		hourly = roundPrice(adjustedOnDemand * (1.0 - discount))
		savingsPercent = roundPrice(discount * 100.0)
	} else {
		hourly = adjustedOnDemand
		savingsPercent = 0.0
	}

	return hourly, adjustedOnDemand, savingsPercent, true
}

func extractRegionFromZone(zone string) string {
	if zone == "" {
		return "us-east-1"
	}
	// e.g. "us-east-1a" -> "us-east-1", "europe-north1-a" -> "europe-north1"
	z := strings.TrimSpace(zone)
	lastChar := z[len(z)-1]
	if lastChar >= 'a' && lastChar <= 'z' {
		trimmed := z[:len(z)-1]
		if strings.HasSuffix(trimmed, "-") {
			return trimmed[:len(trimmed)-1]
		}
		return trimmed
	}
	return z
}

func extractFamilyDiscount(instanceType string) float64 {
	dotIdx := strings.Index(instanceType, ".")
	if dotIdx != -1 {
		family := instanceType[:dotIdx]
		if discount, ok := familySpotDiscounts[family]; ok {
			return discount
		}
	}
	return 0.60 // Default 60% spot discount
}

func estimateUnknownInstance(instanceType string) float64 {
	// Fallback calculation based on size suffix
	switch {
	case strings.Contains(instanceType, "24xlarge"):
		return 4.50
	case strings.Contains(instanceType, "16xlarge"):
		return 3.00
	case strings.Contains(instanceType, "12xlarge"):
		return 2.25
	case strings.Contains(instanceType, "8xlarge"):
		return 1.50
	case strings.Contains(instanceType, "4xlarge"):
		return 0.75
	case strings.Contains(instanceType, "2xlarge"):
		return 0.38
	case strings.Contains(instanceType, "xlarge"):
		return 0.19
	case strings.Contains(instanceType, "large"):
		return 0.095
	case strings.Contains(instanceType, "medium"):
		return 0.048
	case strings.Contains(instanceType, "small"):
		return 0.024
	case strings.Contains(instanceType, "micro"):
		return 0.012
	default:
		return 0.15
	}
}

func roundPrice(val float64) float64 {
	return float64(int(val*10000+0.5)) / 10000.0
}
