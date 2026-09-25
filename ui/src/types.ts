export interface NodePool {
  name: string;
  apiVersion: string;
  limits: { cpu: string; memory: string };
  consolidation: string;
  consolidateAfter: string;
  capacityTypes: string[];
  instanceCategories: string[];
  zones: string[];
  age: string;
}

export interface EC2NodeClass {
  name: string;
  apiVersion: string;
  amiFamily: string;
  subnetDiscovery: string;
  securityGroupDiscovery: string;
  iamRole: string;
  diskSize: string;
  age: string;
}

export interface NodeClaim {
  name: string;
  apiVersion: string;
  nodePool: string;
  status: 'Provisioning' | 'Ready' | 'Failed';
  capacityType: 'spot' | 'on-demand';
  instanceType: string;
  zone: string;
  nodeName?: string;
  age: string;
}

export interface K8sNode {
  name: string;
  status: 'Ready' | 'NotReady' | 'Terminating';
  nodePool: string;
  nodeClaim: string;
  capacityType: 'spot' | 'on-demand';
  instanceType: string;
  zone: string;
  cpuAllocated: number;
  cpuCapacity: number;
  memAllocated: number;
  memCapacity: number;
  podsCount: number;
  age: string;
  costPerHour: number;
}

export interface UnscheduledPod {
  name: string;
  namespace: string;
  cpuRequest: string;
  memRequest: string;
  gpuRequest?: string;
  nodePool: string;
  reason: string;
  age: string;
}

export interface SpotAlert {
  id: string;
  type: 'SpotInterruption' | 'RebalanceRecommendation';
  nodeName: string;
  instanceId: string;
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  deadline: string;
  countdownSeconds: number;
}

export interface LogEntry {
  id?: string;
  timestamp: string;
  level: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
  category?: 'PROVISIONING' | 'CONSOLIDATION' | 'DISRUPTION' | 'INTERRUPTION' | 'K8S_EVENT' | 'SYSTEM';
  message: string;
  nodePool?: string;
  nodeClaim?: string;
  nodeName?: string;
  details?: Record<string, any>;
}

export interface NodePoolPricing {
  name: string;
  hourlyCost: number;
  nodeCount: number;
  spotCount: number;
  onDemandCost: number;
  savingsCost: number;
}

export interface PricingSummary {
  totalHourlyCost: number;
  onDemandBaselineHourly: number;
  totalHourlySavings: number;
  savingsPercentage: number;
  projectedMonthlySpend: number;
  projectedMonthlySavings: number;
  currency: string;
  spotRatio: number;
  gravitonRatio: number;
  nodePoolBreakdown: NodePoolPricing[];
  timestamp: string;
}

export interface LogQueryResponse {
  total: number;
  leaderPod?: string;
  storage: string;
  logs: LogEntry[];
}
