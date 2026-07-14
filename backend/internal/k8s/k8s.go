package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"

	"karpenter-pulse-backend/internal/models"
	"karpenter-pulse-backend/internal/state"
	"karpenter-pulse-backend/internal/utils"
)

var (
	nodePoolGVR     = schema.GroupVersionResource{Group: "karpenter.sh", Version: "v1", Resource: "nodepools"}
	nodeClaimGVR    = schema.GroupVersionResource{Group: "karpenter.sh", Version: "v1", Resource: "nodeclaims"}
	ec2NodeClassGVR = schema.GroupVersionResource{Group: "karpenter.k8s.aws", Version: "v1", Resource: "ec2nodeclasses"}
)

func InitK8sClient(s *state.ClusterState) {
	var config *rest.Config
	var err error

	config, err = rest.InClusterConfig()
	if err != nil {
		var kubeconfig string
		if home := homedir.HomeDir(); home != "" {
			kubeconfig = filepath.Join(home, ".kube", "config")
		} else {
			kubeconfig = os.Getenv("KUBECONFIG")
		}

		if kubeconfig != "" {
			if _, statErr := os.Stat(kubeconfig); statErr == nil {
				config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
			}
		}
	}

	if err != nil || config == nil {
		log.Println("Could not configure Kubernetes client. Operating in Sandbox/Mock mode.")
		return
	}

	cset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Printf("Failed to create Core clientset: %v\n", err)
		return
	}
	s.Clientset = cset

	dclient, err := dynamic.NewForConfig(config)
	if err != nil {
		log.Printf("Failed to create dynamic client: %v\n", err)
		return
	}
	s.DynamicClient = dclient

	s.K8sConnected = true
	log.Println("Successfully connected to Kubernetes API Server.")
}

func FetchNodes(s *state.ClusterState) ([]models.K8sNode, error) {
	ctx := context.TODO()
	nodeList, err := s.Clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("listing nodes failed: %w", err)
	}

	podList, err := s.Clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("listing pods failed: %w", err)
	}

	nodes := []models.K8sNode{}
	for _, node := range nodeList.Items {
		labels := node.GetLabels()
		nodePoolName, isKarpenter := labels["karpenter.sh/nodepool"]
		if !isKarpenter {
			continue
		}

		nodeName := node.GetName()
		var cpuAllocated float64
		var memAllocated float64
		podsCount := 0

		for _, pod := range podList.Items {
			if pod.Spec.NodeName != nodeName {
				continue
			}
			podsCount++

			for _, container := range pod.Spec.Containers {
				cpuReq := container.Resources.Requests.Cpu()
				cpuAllocated += float64(cpuReq.MilliValue()) / 1000.0

				memReq := container.Resources.Requests.Memory()
				memAllocated += float64(memReq.Value()) / (1024.0 * 1024.0 * 1024.0)
			}
		}

		cpuCap := node.Status.Capacity.Cpu()
		memCap := node.Status.Capacity.Memory()
		cpuCapacityFloat := float64(cpuCap.Value())
		memCapacityFloat := float64(memCap.Value()) / (1024.0 * 1024.0 * 1024.0)

		status := "NotReady"
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeReady {
				if condition.Status == corev1.ConditionTrue {
					status = "Ready"
				}
				break
			}
		}

		if node.GetDeletionTimestamp() != nil {
			status = "Terminating"
		}

		instType := labels["node.kubernetes.io/instance-type"]
		if instType == "" {
			instType = "m6g.xlarge"
		}
		capType := labels["karpenter.sh/capacity-type"]
		if capType == "" {
			capType = "on-demand"
		}
		isSpot := capType == "spot"
		cost := utils.GetEstimatedCost(instType, isSpot)

		nodes = append(nodes, models.K8sNode{
			Name:         nodeName,
			Status:       status,
			NodePool:     nodePoolName,
			NodeClaim:    labels["karpenter.sh/nodeclaim"],
			CapacityType: capType,
			InstanceType: instType,
			Zone:         labels["topology.kubernetes.io/zone"],
			CpuAllocated: utils.RoundTwoDecimals(cpuAllocated),
			CpuCapacity:  cpuCapacityFloat,
			MemAllocated: utils.RoundTwoDecimals(memAllocated),
			MemCapacity:  utils.RoundTwoDecimals(memCapacityFloat),
			PodsCount:    podsCount,
			Age:          utils.GetAgeString(node.GetCreationTimestamp().Time),
			CostPerHour:  cost,
		})
	}

	return nodes, nil
}

func FetchNodePools(s *state.ClusterState) ([]models.NodePool, error) {
	rawNodePools, err := ListCustomObjects(s.DynamicClient, nodePoolGVR)
	if err != nil {
		return nil, fmt.Errorf("listing nodepools failed: %w", err)
	}

	nodePools := []models.NodePool{}
	for _, raw := range rawNodePools {
		spec := raw.Object["spec"].(map[string]interface{})
		limitsRaw, limitsOk := spec["limits"].(map[string]interface{})
		limits := models.NodePoolLimits{Cpu: "Unlimited", Memory: "Unlimited"}
		if limitsOk {
			if cpu, ok := limitsRaw["cpu"].(string); ok {
				limits.Cpu = cpu
			}
			if mem, ok := limitsRaw["memory"].(string); ok {
				limits.Memory = mem
			}
		}

		disruption, disruptionOk := spec["disruption"].(map[string]interface{})
		consolidation := "None"
		consolidateAfter := "N/A"
		if disruptionOk {
			if cp, ok := disruption["consolidationPolicy"].(string); ok {
				consolidation = cp
			}
			if ca, ok := disruption["consolidateAfter"].(string); ok {
				consolidateAfter = ca
			}
		}

		var capacityTypes []string
		var instanceCategories []string
		var zones []string

		if template, ok := spec["template"].(map[string]interface{}); ok {
			if tempSpec, ok := template["spec"].(map[string]interface{}); ok {
				if requirements, ok := tempSpec["requirements"].([]interface{}); ok {
					for _, reqRaw := range requirements {
						req, ok := reqRaw.(map[string]interface{})
						if !ok {
							continue
						}
						key, _ := req["key"].(string)
						valuesRaw, _ := req["values"].([]interface{})
						var values []string
						for _, val := range valuesRaw {
							if valStr, ok := val.(string); ok {
								values = append(values, valStr)
							}
						}

						switch key {
						case "karpenter.sh/capacity-type":
							capacityTypes = values
						case "karpenter.k8s.aws/instance-category":
							instanceCategories = values
						case "topology.kubernetes.io/zone":
							zones = values
						}
					}
				}
			}
		}

		nodePools = append(nodePools, models.NodePool{
			Name:               raw.GetName(),
			ApiVersion:         raw.GetAPIVersion(),
			Limits:             limits,
			Consolidation:      consolidation,
			ConsolidateAfter:   consolidateAfter,
			CapacityTypes:      capacityTypes,
			InstanceCategories: instanceCategories,
			Zones:              zones,
			Age:                utils.GetAgeString(raw.GetCreationTimestamp().Time),
		})
	}
	return nodePools, nil
}

func FetchEC2NodeClasses(s *state.ClusterState) ([]models.EC2NodeClass, error) {
	rawNodeClasses, err := ListCustomObjects(s.DynamicClient, ec2NodeClassGVR)
	if err != nil {
		return nil, fmt.Errorf("listing ec2nodeclasses failed: %w", err)
	}

	nodeClasses := []models.EC2NodeClass{}
	for _, raw := range rawNodeClasses {
		spec := raw.Object["spec"].(map[string]interface{})
		amiFamily, _ := spec["amiFamily"].(string)
		iamRole, _ := spec["role"].(string)
		
		subnetText := "N/A"
		if subnets, ok := spec["subnetSelectorTerms"].([]interface{}); ok {
			sBytes, _ := json.Marshal(subnets)
			subnetText = string(sBytes)
		}

		sgText := "N/A"
		if sgs, ok := spec["securityGroupSelectorTerms"].([]interface{}); ok {
			sBytes, _ := json.Marshal(sgs)
			sgText = string(sBytes)
		}

		diskSize := "80Gi"
		if mappings, ok := spec["blockDeviceMappings"].([]interface{}); ok && len(mappings) > 0 {
			if first, ok := mappings[0].(map[string]interface{}); ok {
				if ebs, ok := first["ebs"].(map[string]interface{}); ok {
					if volSize, ok := ebs["volumeSize"].(string); ok {
						diskSize = volSize
					}
				}
			}
		}

		nodeClasses = append(nodeClasses, models.EC2NodeClass{
			Name:                   raw.GetName(),
			ApiVersion:             raw.GetAPIVersion(),
			AmiFamily:              amiFamily,
			SubnetDiscovery:        subnetText,
			SecurityGroupDiscovery: sgText,
			IamRole:                iamRole,
			DiskSize:               diskSize,
			Age:                    utils.GetAgeString(raw.GetCreationTimestamp().Time),
		})
	}
	return nodeClasses, nil
}

func FetchNodeClaims(s *state.ClusterState) ([]models.NodeClaim, error) {
	rawNodeClaims, err := ListCustomObjects(s.DynamicClient, nodeClaimGVR)
	if err != nil {
		return nil, fmt.Errorf("listing nodeclaims failed: %w", err)
	}

	nodeClaims := []models.NodeClaim{}
	for _, raw := range rawNodeClaims {
		spec, specOk := raw.Object["spec"].(map[string]interface{})
		status, statusOk := raw.Object["status"].(map[string]interface{})
		
		nodePool := "unknown"
		if specOk {
			if np, ok := spec["nodePool"].(string); ok {
				nodePool = np
			}
		}

		phase := "Provisioning"
		nodeName := ""
		if statusOk {
			if ph, ok := status["phase"].(string); ok {
				phase = ph
			}
			if nn, ok := status["nodeName"].(string); ok {
				nodeName = nn
			}
		}

		capacityType := "spot"
		instanceType := "unknown"
		zone := "unknown"

		if specOk {
			if reqs, ok := spec["requirements"].([]interface{}); ok {
				for _, reqRaw := range reqs {
					req, ok := reqRaw.(map[string]interface{})
					if !ok {
						continue
					}
					key, _ := req["key"].(string)
					values, _ := req["values"].([]interface{})
					if len(values) == 0 {
						continue
					}
					valStr, _ := values[0].(string)

					switch key {
					case "karpenter.sh/capacity-type":
						capacityType = valStr
					case "node.kubernetes.io/instance-type":
						instanceType = valStr
					case "topology.kubernetes.io/zone":
						zone = valStr
					}
				}
			}
		}

		nodeClaims = append(nodeClaims, models.NodeClaim{
			Name:         raw.GetName(),
			ApiVersion:   raw.GetAPIVersion(),
			NodePool:     nodePool,
			Status:       phase,
			CapacityType: capacityType,
			InstanceType: instanceType,
			Zone:         zone,
			NodeName:     nodeName,
			Age:          utils.GetAgeString(raw.GetCreationTimestamp().Time),
		})
	}
	return nodeClaims, nil
}

func FetchPendingPods(s *state.ClusterState) ([]models.UnscheduledPod, error) {
	ctx := context.TODO()
	podList, err := s.Clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("listing pods failed: %w", err)
	}

	pods := []models.UnscheduledPod{}
	for _, pod := range podList.Items {
		if pod.Status.Phase != corev1.PodPending {
			continue
		}

		unschedulable := false
		reason := "Scheduling pending."
		for _, condition := range pod.Status.Conditions {
			if condition.Type == corev1.PodScheduled && condition.Status == corev1.ConditionFalse {
				if condition.Reason == corev1.PodReasonUnschedulable {
					unschedulable = true
					reason = condition.Message
				}
				break
			}
		}

		npSelector, hasNp := pod.Spec.NodeSelector["karpenter.sh/nodepool"]
		if !hasNp && !unschedulable {
			continue
		}
		if npSelector == "" {
			npSelector = "general-purpose"
		}

		var cpuRequest string
		var memRequest string
		for _, c := range pod.Spec.Containers {
			cpuReq := c.Resources.Requests.Cpu()
			if !cpuReq.IsZero() {
				cpuRequest = cpuReq.String()
			}
			memReq := c.Resources.Requests.Memory()
			if !memReq.IsZero() {
				memRequest = memReq.String()
			}
		}

		pods = append(pods, models.UnscheduledPod{
			Name:       pod.GetName(),
			Namespace:  pod.GetNamespace(),
			CpuRequest: cpuRequest,
			MemRequest: memRequest,
			NodePool:   npSelector,
			Reason:     reason,
			Age:        utils.GetAgeString(pod.GetCreationTimestamp().Time),
		})
	}
	return pods, nil
}

func FetchActiveAlerts(s *state.ClusterState, activeNodes []models.K8sNode) []models.SpotAlert {
	s.AlertsMu.Lock()
	defer s.AlertsMu.Unlock()

	for alertId, alert := range s.ActiveAlerts {
		nodeExists := false
		for _, node := range activeNodes {
			if node.Name == alert.NodeName {
				nodeExists = true
				break
			}
		}
		
		if parsedDeadline, err := time.Parse(time.RFC3339, alert.Deadline); err == nil {
			secsLeft := int(time.Until(parsedDeadline).Seconds())
			if secsLeft <= 0 || !nodeExists {
				delete(s.ActiveAlerts, alertId)
			} else {
				alert.CountdownSeconds = secsLeft
				s.ActiveAlerts[alertId] = alert
			}
		} else {
			delete(s.ActiveAlerts, alertId)
		}
	}
	
	apiAlerts := make([]models.SpotAlert, 0, len(s.ActiveAlerts))
	for _, alert := range s.ActiveAlerts {
		apiAlerts = append(apiAlerts, alert)
	}
	return apiAlerts
}

func ListCustomObjects(client dynamic.Interface, gvr schema.GroupVersionResource) ([]unstructured.Unstructured, error) {
	if client == nil {
		return nil, fmt.Errorf("dynamic client not configured")
	}
	list, err := client.Resource(gvr).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}
