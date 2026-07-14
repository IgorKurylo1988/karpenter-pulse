package mock

import "karpenter-pulse-backend/internal/models"



func GetMockNodes() []models.K8sNode {
	return []models.K8sNode{
		{
			Name:         "ip-10-0-1-145.ec2.internal",
			Status:       "Ready",
			NodePool:     "general-purpose",
			NodeClaim:    "general-purpose-qkz9m",
			CapacityType: "spot",
			InstanceType: "m6g.xlarge",
			Zone:         "us-east-1a",
			CpuAllocated: 3.2,
			CpuCapacity:  4,
			MemAllocated: 12.5,
			MemCapacity:  16,
			PodsCount:    14,
			Age:          "2h 14m",
			CostPerHour:  0.0768,
		},
		{
			Name:         "ip-10-0-2-87.ec2.internal",
			Status:       "Ready",
			NodePool:     "general-purpose",
			NodeClaim:    "general-purpose-p2x8r",
			CapacityType: "on-demand",
			InstanceType: "t4g.medium",
			Zone:         "us-east-1b",
			CpuAllocated: 0.8,
			CpuCapacity:  2,
			MemAllocated: 2.1,
			MemCapacity:  4,
			PodsCount:    6,
			Age:          "4h 5m",
			CostPerHour:  0.0336,
		},
	}
}

func GetMockNodePools() []models.NodePool {
	return []models.NodePool{
		{
			Name:             "general-purpose",
			ApiVersion:       "karpenter.sh/v1",
			Limits:           models.NodePoolLimits{Cpu: "160", Memory: "640Gi"},
			Consolidation:    "WhenEmptyOrUnderutilized",
			ConsolidateAfter: "10m",
			CapacityTypes:    []string{"spot", "on-demand"},
			InstanceCategories: []string{"c", "m", "r"},
			Zones:            []string{"us-east-1a", "us-east-1b", "us-east-1c"},
			Age:              "12d",
		},
		{
			Name:             "gpu-workload",
			ApiVersion:       "karpenter.sh/v1",
			Limits:           models.NodePoolLimits{Cpu: "64", Memory: "256Gi"},
			Consolidation:    "WhenEmpty",
			ConsolidateAfter: "30m",
			CapacityTypes:    []string{"on-demand"},
			InstanceCategories: []string{"g", "p"},
			Zones:            []string{"us-east-1a", "us-east-1b"},
			Age:              "4d",
		},
	}
}

func GetMockNodeClasses() []models.EC2NodeClass {
	return []models.EC2NodeClass{
		{
			Name:                   "default-aws-class",
			ApiVersion:             "karpenter.k8s.aws/v1",
			AmiFamily:              "AL2023",
			SubnetDiscovery:        `[{"tags":{"karpenter.sh/discovery":"my-cluster"}}]`,
			SecurityGroupDiscovery: `[{"tags":{"karpenter.sh/discovery":"my-cluster"}}]`,
			IamRole:                "KarpenterNodeRole-my-cluster",
			DiskSize:               "80Gi",
			Age:                    "12d",
		},
		{
			Name:                   "bottlerocket-gpu-class",
			ApiVersion:             "karpenter.k8s.aws/v1",
			AmiFamily:              "Bottlerocket",
			SubnetDiscovery:        `[{"tags":{"karpenter.sh/discovery":"my-cluster"}}]`,
			SecurityGroupDiscovery: `[{"tags":{"karpenter.sh/discovery":"my-cluster-gpu"}}]`,
			IamRole:                "KarpenterNodeRole-my-cluster",
			DiskSize:               "150Gi",
			Age:                    "4d",
		},
	}
}

func GetMockNodeClaims() []models.NodeClaim {
	return []models.NodeClaim{
		{
			Name:         "general-purpose-qkz9m",
			ApiVersion:   "karpenter.sh/v1",
			NodePool:     "general-purpose",
			Status:       "Ready",
			CapacityType: "spot",
			InstanceType: "m6g.xlarge",
			Zone:         "us-east-1a",
			NodeName:     "ip-10-0-1-145.ec2.internal",
			Age:          "2h 14m",
		},
		{
			Name:         "general-purpose-p2x8r",
			ApiVersion:   "karpenter.sh/v1",
			NodePool:     "general-purpose",
			Status:       "Ready",
			CapacityType: "on-demand",
			InstanceType: "t4g.medium",
			Zone:         "us-east-1b",
			NodeName:     "ip-10-0-2-87.ec2.internal",
			Age:          "4h 5m",
		},
	}
}

func GetMockPods() []models.UnscheduledPod {
	return []models.UnscheduledPod{
		{
			Name:       "payment-processor-deployment-55d648-j2h8l",
			Namespace:  "finance",
			CpuRequest: "1500m",
			MemRequest: "2Gi",
			NodePool:   "general-purpose",
			Reason:     "Unschedulable: 0/2 nodes are available: 2 Insufficient cpu.",
			Age:        "45s",
		},
	}
}

func GetMockAlerts() []models.SpotAlert {
	return []models.SpotAlert{}
}
