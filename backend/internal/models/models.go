package models

type NodePoolLimits struct {
	Cpu    string `json:"cpu"`
	Memory string `json:"memory"`
}

type NodePool struct {
	Name               string         `json:"name"`
	ApiVersion         string         `json:"apiVersion"`
	Limits             NodePoolLimits `json:"limits"`
	Consolidation      string         `json:"consolidation"`
	ConsolidateAfter   string         `json:"consolidateAfter"`
	CapacityTypes      []string       `json:"capacityTypes"`
	InstanceCategories []string       `json:"instanceCategories"`
	Zones              []string       `json:"zones"`
	Age                string         `json:"age"`
}

type EC2NodeClass struct {
	Name                   string `json:"name"`
	ApiVersion             string `json:"apiVersion"`
	AmiFamily              string `json:"amiFamily"`
	SubnetDiscovery        string `json:"subnetDiscovery"`
	SecurityGroupDiscovery string `json:"securityGroupDiscovery"`
	IamRole                string `json:"iamRole"`
	DiskSize               string `json:"diskSize"`
	Age                    string `json:"age"`
}

type NodeClaim struct {
	Name         string `json:"name"`
	ApiVersion   string `json:"apiVersion"`
	NodePool     string `json:"nodePool"`
	Status       string `json:"status"`
	CapacityType string `json:"capacityType"`
	InstanceType string `json:"instanceType"`
	Zone         string `json:"zone"`
	NodeName     string `json:"nodeName,omitempty"`
	Age          string `json:"age"`
}

type K8sNode struct {
	Name         string  `json:"name"`
	Status       string  `json:"status"`
	NodePool     string  `json:"nodePool"`
	NodeClaim    string  `json:"nodeClaim"`
	CapacityType string  `json:"capacityType"`
	InstanceType string  `json:"instanceType"`
	Zone         string  `json:"zone"`
	CpuAllocated float64 `json:"cpuAllocated"`
	CpuCapacity  float64 `json:"cpuCapacity"`
	MemAllocated float64 `json:"memAllocated"`
	MemCapacity  float64 `json:"memCapacity"`
	PodsCount    int     `json:"podsCount"`
	Age          string  `json:"age"`
	CostPerHour  float64 `json:"costPerHour"`
}

type UnscheduledPod struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	CpuRequest string `json:"cpuRequest"`
	MemRequest string `json:"memRequest"`
	GpuRequest string `json:"gpuRequest,omitempty"`
	NodePool   string `json:"nodePool"`
	Reason     string `json:"reason"`
	Age        string `json:"age"`
}

type SpotAlert struct {
	Id               string `json:"id"`
	Type             string `json:"type"`
	NodeName         string `json:"nodeName"`
	InstanceId       string `json:"instanceId"`
	Severity         string `json:"severity"`
	Message          string `json:"message"`
	Deadline         string `json:"deadline"`
	CountdownSeconds int    `json:"countdownSeconds"`
}

type SQSMessageBody struct {
	DetailType string   `json:"detail-type"`
	Time       string   `json:"time"`
	Resources  []string `json:"resources"`
	Detail     struct {
		InstanceID string `json:"instance-id"`
		Action     string `json:"action"`
	} `json:"detail"`
}
