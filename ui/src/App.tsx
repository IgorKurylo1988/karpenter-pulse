import { useState, useEffect, useMemo } from 'react';
import { 
  Layers, 
  RefreshCw, 
  Search,
  Server,
  Cpu,
  HardDrive,
  AlertTriangle,
  Sun,
  Moon
} from 'lucide-react';

// Shared Types
import type { NodePool, EC2NodeClass, NodeClaim, K8sNode, UnscheduledPod, SpotAlert, LogEntry } from './types';

// Modular Components
import { MetricCard } from './components/MetricCard';
import { AlertsBanner } from './components/AlertsBanner';
import { SimulationBanner } from './components/SimulationBanner';
import { NodeList } from './components/NodeList';
import { NodePoolList } from './components/NodePoolList';
import { EC2NodeClassList } from './components/EC2NodeClassList';
import { NodeClaimList } from './components/NodeClaimList';
import { PendingPodsList } from './components/PendingPodsList';
import { ResourceInspector } from './components/ResourceInspector';
import { LogsConsole } from './components/LogsConsole';

import './App.css';

// ==========================================
// 1. Initial Rich Mock Data Definitions
// ==========================================

const INITIAL_NODE_POOLS: NodePool[] = [
  {
    name: 'general-purpose',
    apiVersion: 'karpenter.sh/v1',
    limits: { cpu: '160', memory: '640Gi' },
    consolidation: 'WhenEmptyOrUnderutilized',
    consolidateAfter: '10m',
    capacityTypes: ['spot', 'on-demand'],
    instanceCategories: ['c', 'm', 'r'],
    zones: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
    age: '12d'
  },
  {
    name: 'gpu-workload',
    apiVersion: 'karpenter.sh/v1',
    limits: { cpu: '64', memory: '256Gi' },
    consolidation: 'WhenEmpty',
    consolidateAfter: '30m',
    capacityTypes: ['on-demand'],
    instanceCategories: ['g', 'p'],
    zones: ['us-east-1a', 'us-east-1b'],
    age: '4d'
  }
];

const INITIAL_NODE_CLASSES: EC2NodeClass[] = [
  {
    name: 'default-aws-class',
    apiVersion: 'karpenter.k8s.aws/v1',
    amiFamily: 'AL2023',
    subnetDiscovery: 'karpenter.sh/discovery: my-cluster',
    securityGroupDiscovery: 'karpenter.sh/discovery: my-cluster',
    iamRole: 'KarpenterNodeRole-my-cluster',
    diskSize: '80Gi',
    age: '12d'
  },
  {
    name: 'bottlerocket-gpu-class',
    apiVersion: 'karpenter.k8s.aws/v1',
    amiFamily: 'Bottlerocket',
    subnetDiscovery: 'karpenter.sh/discovery: my-cluster',
    securityGroupDiscovery: 'karpenter.sh/discovery: my-cluster-gpu',
    iamRole: 'KarpenterNodeRole-my-cluster',
    diskSize: '150Gi',
    age: '4d'
  }
];

const INITIAL_NODE_CLAIMS: NodeClaim[] = [
  {
    name: 'general-purpose-qkz9m',
    apiVersion: 'karpenter.sh/v1',
    nodePool: 'general-purpose',
    status: 'Ready',
    capacityType: 'spot',
    instanceType: 'm6g.xlarge',
    zone: 'us-east-1a',
    nodeName: 'ip-10-0-1-145.ec2.internal',
    age: '2h 14m'
  },
  {
    name: 'general-purpose-p2x8r',
    apiVersion: 'karpenter.sh/v1',
    nodePool: 'general-purpose',
    status: 'Ready',
    capacityType: 'on-demand',
    instanceType: 't4g.medium',
    zone: 'us-east-1b',
    nodeName: 'ip-10-0-2-87.ec2.internal',
    age: '4h 5m'
  }
];

const INITIAL_NODES: K8sNode[] = [
  {
    name: 'ip-10-0-1-145.ec2.internal',
    status: 'Ready',
    nodePool: 'general-purpose',
    nodeClaim: 'general-purpose-qkz9m',
    capacityType: 'spot',
    instanceType: 'm6g.xlarge', // 4 vCPU, 16 GiB
    zone: 'us-east-1a',
    cpuAllocated: 3.2,
    cpuCapacity: 4,
    memAllocated: 12.5,
    memCapacity: 16,
    podsCount: 14,
    age: '2h 14m',
    costPerHour: 0.0768 // typical Spot discount
  },
  {
    name: 'ip-10-0-2-87.ec2.internal',
    status: 'Ready',
    nodePool: 'general-purpose',
    nodeClaim: 'general-purpose-p2x8r',
    capacityType: 'on-demand',
    instanceType: 't4g.medium', // 2 vCPU, 4 GiB
    zone: 'us-east-1b',
    cpuAllocated: 0.8,
    cpuCapacity: 2,
    memAllocated: 2.1,
    memCapacity: 4,
    podsCount: 6,
    age: '4h 5m',
    costPerHour: 0.0336 // standard On-Demand price
  }
];

const INITIAL_PENDING_PODS: UnscheduledPod[] = [
  {
    name: 'payment-processor-deployment-55d648-j2h8l',
    namespace: 'finance',
    cpuRequest: '1500m',
    memRequest: '2Gi',
    nodePool: 'general-purpose',
    reason: 'Unschedulable: 0/2 nodes are available: 2 Insufficient cpu.',
    age: '45s'
  }
];

const INITIAL_LOGS: LogEntry[] = [
  { timestamp: '2026-07-13T10:01:00Z', level: 'INFO', message: 'karpenter  Starting controller manager...' },
  { timestamp: '2026-07-13T10:01:05Z', level: 'INFO', message: 'karpenter  Registered 2 NodePools, 2 EC2NodeClasses' },
  { timestamp: '2026-07-13T10:01:10Z', level: 'INFO', message: 'karpenter  Discovered subnets: [subnet-0123456789abcdef0, subnet-0987654321fedcba0]' },
  { timestamp: '2026-07-13T10:01:12Z', level: 'INFO', message: 'karpenter  Discovered security groups: [sg-0123456789abcdef0]' },
  { timestamp: '2026-07-13T10:02:15Z', level: 'INFO', message: 'karpenter  Watching cluster resources; 2 active Karpenter nodes detected' },
  { timestamp: '2026-07-13T10:05:48Z', level: 'WARNING', message: 'karpenter Pod "finance/payment-processor-deployment-55d648-j2h8l" is unschedulable; triggering simulation scan...' }
];

export default function App() {
  // Navigation & Filtering
  const [selectedView, setSelectedView] = useState<'nodes' | 'nodepools' | 'nodeclasses' | 'nodeclaims' | 'pods'>('nodes');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCapacity, setFilterCapacity] = useState<'all' | 'spot' | 'on-demand'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'Ready' | 'NotReady' | 'Terminating'>('all');
  
  // Resources States
  const [nodePools, setNodePools] = useState<NodePool[]>(INITIAL_NODE_POOLS);
  const [nodeClasses, setNodeClasses] = useState<EC2NodeClass[]>(INITIAL_NODE_CLASSES);
  const [nodeClaims, setNodeClaims] = useState<NodeClaim[]>(INITIAL_NODE_CLAIMS);
  const [nodes, setNodes] = useState<K8sNode[]>(INITIAL_NODES);
  const [pendingPods, setPendingPods] = useState<UnscheduledPod[]>(INITIAL_PENDING_PODS);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [alerts, setAlerts] = useState<SpotAlert[]>([]);
  const [dataSource, setDataSource] = useState<'sandbox' | 'cluster'>('sandbox');
  
  // Interactive Overrides
  const [isSandboxMode, setIsSandboxMode] = useState<boolean>(true);
  const [isApiAvailable, setIsApiAvailable] = useState<boolean>(false);
  const [pricingMode, setPricingMode] = useState<'actual' | 'ondemand'>('actual');

  // Theme state & persistence
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    return saved !== 'light';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Consolidation Confirmation Modal State
  const [nodeToConsolidate, setNodeToConsolidate] = useState<string | null>(null);
  const [confirmInputName, setConfirmInputName] = useState<string>('');

  // Fetch real-time data from Go backend
  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const healthResponse = await fetch('/api/health');
        if (!healthResponse.ok) throw new Error('API server unreachable');
        const healthData = await healthResponse.json();
        
        if (!active) return;
        
        setIsApiAvailable(healthData.k8sConnected);
        
        let currentSandbox = isSandboxMode;
        if (!healthData.k8sConnected) {
          currentSandbox = true;
          setIsSandboxMode(true);
          setDataSource('sandbox');
        } else {
          setDataSource(isSandboxMode ? 'sandbox' : 'cluster');
        }

        const queryParam = currentSandbox ? '?sandbox=true' : '';
        const [nodesRes, nodepoolsRes, nodeclassesRes, nodeclaimsRes, podsRes] = await Promise.all([
          fetch(`/api/nodes${queryParam}`),
          fetch(`/api/nodepools${queryParam}`),
          fetch(`/api/nodeclasses${queryParam}`),
          fetch(`/api/nodeclaims${queryParam}`),
          fetch(`/api/pods${queryParam}`)
        ]);
        
        const nodes = await nodesRes.json();
        const nodepools = await nodepoolsRes.json();
        const nodeclasses = await nodeclassesRes.json();
        const nodeclaims = await nodeclaimsRes.json();
        const pods = await podsRes.json();
        
        if (!active) return;
        setNodes(nodes || []);
        setNodeClaims(nodeclaims || []);
        setPendingPods(pods || []);
        setNodePools(nodepools || []);
        setNodeClasses(nodeclasses || []);
      } catch (err) {
        if (active) {
          setIsApiAvailable(false);
          setIsSandboxMode(true);
          setDataSource('sandbox');
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isSandboxMode]);

  // Connect to real-time WebSocket for logs and alerts stream
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const queryParam = isSandboxMode ? '?sandbox=true' : '';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/ws${queryParam}`;
    
    const socket = new WebSocket(wsUrl);
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'alerts') {
          setAlerts(data.payload || []);
        } else if (data.type === 'log') {
          const { message, level } = data.payload;
          addLog(message, level);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };
    
    socket.onclose = () => {
      console.log('WebSocket stream closed.');
    };
    
    return () => {
      socket.close();
    };
  }, [isSandboxMode]);

  const toggleMode = () => {
    if (isSandboxMode) {
      if (isApiAvailable) {
        setIsSandboxMode(false);
        setDataSource('cluster');
        addLog("Switched to Live Cluster mode. Synced active instances.", "INFO");
      } else {
        addLog("Live Cluster connection unavailable. Please check your kubeconfig settings.", "WARNING");
      }
    } else {
      setIsSandboxMode(true);
      setDataSource('sandbox');
      setNodes(INITIAL_NODES);
      setNodeClaims(INITIAL_NODE_CLAIMS);
      setPendingPods(INITIAL_PENDING_PODS);
      setNodePools(INITIAL_NODE_POOLS);
      setNodeClasses(INITIAL_NODE_CLASSES);
      setAlerts([]);
      fetch('/api/sandbox/reset', { method: 'POST' }).catch(() => {});
      addLog("Switched to Sandbox mode. Initial simulation state restored.", "SUCCESS");
    }
  };

  // Countdown timer for alerts
  useEffect(() => {
    const timer = setInterval(() => {
      setAlerts(prevAlerts => {
        return prevAlerts
          .map(alert => {
            const nextSecs = alert.countdownSeconds - 1;
            return {
              ...alert,
              countdownSeconds: nextSecs,
              message: alert.type === 'SpotInterruption' 
                ? `Spot Interruption Notice: Node will terminate in ${formatCountdown(nextSecs)}`
                : alert.message
            };
          })
          .filter(alert => {
            if (alert.countdownSeconds <= 0) {
              if (dataSource === 'sandbox') {
                handleAlertExpiry(alert.nodeName);
              }
              return false;
            }
            return true;
          });
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [dataSource, nodes]);

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const handleAlertExpiry = (nodeName: string) => {
    setNodes(prev => prev.filter(n => n.name !== nodeName));
    setNodeClaims(prev => {
      const matchingNode = nodes.find(n => n.name === nodeName);
      if (matchingNode) {
        return prev.filter(c => c.name !== matchingNode.nodeClaim);
      }
      return prev;
    });
    addLog(`Spot Interruption Warning completed: Node "${nodeName}" deprovisioned from cluster.`, 'SUCCESS');
  };

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  // Inspector Drawer State
  const [selectedItem, setSelectedItem] = useState<{ type: string; data: any } | null>(null);

  // Auto-scrolling logs
  useEffect(() => {
    const logsConsole = document.getElementById('log-console');
    if (logsConsole) {
      logsConsole.scrollTop = logsConsole.scrollHeight;
    }
  }, [logs]);

  // Helper log function
  const addLog = (message: string, level: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR' = 'INFO') => {
    const timestamp = new Date().toISOString();
    setLogs(prev => [...prev, { timestamp, level, message }]);
  };

  // ==========================================
  // 2. Interactive Simulations
  // ==========================================

  const [isScalingUp, setIsScalingUp] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);

  // A. Trigger Scale-up
  const simulateScaleUp = async () => {
    if (isScalingUp) return;
    setIsScalingUp(true);

    const queryParam = isSandboxMode ? '?sandbox=true' : '';
    let targetPod: UnscheduledPod;

    if (pendingPods.length === 0) {
      targetPod = {
        name: `nginx-deployment-${Math.random().toString(36).substring(2, 7)}`,
        namespace: 'default',
        cpuRequest: '3',
        memRequest: '8Gi',
        nodePool: 'general-purpose',
        reason: 'Unschedulable: Insufficient cpu requests on current fleet.',
        age: '10s'
      };
      addLog(`Pod "${targetPod.namespace}/${targetPod.name}" is unschedulable; requesting scaling evaluation`, 'WARNING');
      
      try {
        await fetch(`/api/pods${queryParam}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(targetPod)
        });
      } catch (err) {
        setIsScalingUp(false);
        addLog('Failed to create mock pod', 'ERROR');
        return;
      }
    } else {
      targetPod = pendingPods[0];
      addLog(`Pending pod queue scan: 1 unschedulable pod detected. Starting autoscaling run.`, 'INFO');
    }

    try {
      const res = await fetch(`/api/scale-up${queryParam}`, { method: 'POST' });
      if (!res.ok) throw new Error('Scale up request failed');

      addLog(`Autoscaler selected spot instance type m6g.2xlarge for claims; launching instance`, 'INFO');
      addLog(`Provisioning node claim sequence initiated.`, 'SUCCESS');
      
      setTimeout(() => addLog(`Kubernetes Node claim created in state [Provisioning]`, 'SUCCESS'), 1500);
      setTimeout(() => addLog(`EC2 Instance launched, Node joined cluster [NotReady]`, 'INFO'), 4000);
      setTimeout(() => {
        addLog(`Node became [Ready] (kubelet operational)`, 'SUCCESS');
        addLog(`Scheduled pod "${targetPod.namespace}/${targetPod.name}" onto new node`, 'SUCCESS');
        setIsScalingUp(false);
      }, 7000);
    } catch (e) {
      setIsScalingUp(false);
      addLog('Scale up simulation failed', 'ERROR');
    }
  };

  // B. Trigger Consolidation (Safety Confirm modal triggers this)
  const executeConsolidation = async (nodeName: string) => {
    if (isConsolidating) return;
    setIsConsolidating(true);
    addLog(`Initiating consolidation for node "${nodeName}" (underutilized)`, 'WARNING');

    const queryParam = isSandboxMode ? '?sandbox=true' : '';
    try {
      const res = await fetch(`/api/nodes/consolidate${queryParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeName })
      });
      if (!res.ok) throw new Error('Consolidation failed');

      setTimeout(() => {
        addLog(`Evicting pods running on node "${nodeName}"`, 'INFO');
      }, 1000);

      setTimeout(() => {
        setIsConsolidating(false);
        if (selectedItem?.data?.name === nodeName) {
          setSelectedItem(null);
        }
        addLog(`Successfully deprovisioned node "${nodeName}" and terminated associated instance`, 'SUCCESS');
      }, 3000);
    } catch (e) {
      setIsConsolidating(false);
      addLog(`Failed to consolidate node: ${e}`, 'ERROR');
    }
  };

  const triggerConsolidation = (nodeName: string) => {
    setNodeToConsolidate(nodeName);
    setConfirmInputName('');
  };

  // C. Add a pending pod manually
  const createUnscheduledPod = async () => {
    const isGpu = Math.random() > 0.6;
    const pool = isGpu ? 'gpu-workload' : 'general-purpose';
    const reqCpu = isGpu ? '4000m' : '2000m';
    const reqMem = isGpu ? '16Gi' : '4Gi';
    const gpuPart = isGpu ? ', 1 nvidia.com/gpu' : '';

    const newPod: UnscheduledPod = {
      name: `nginx-backend-${Math.random().toString(36).substring(2, 7)}`,
      namespace: 'production',
      cpuRequest: reqCpu,
      memRequest: reqMem,
      gpuRequest: isGpu ? '1' : undefined,
      nodePool: pool,
      reason: `Unschedulable: insufficient resources (requires ${reqCpu} CPU, ${reqMem} RAM${gpuPart})`,
      age: '1s'
    };

    const queryParam = isSandboxMode ? '?sandbox=true' : '';
    try {
      const res = await fetch(`/api/pods${queryParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPod)
      });
      if (!res.ok) throw new Error('Pod creation failed');
      addLog(`Created unscheduled pod "${newPod.namespace}/${newPod.name}" requiring ${pool} pool`, 'WARNING');
    } catch (e) {
      addLog('Failed to create pod', 'ERROR');
    }
  };

  // D. Simulate Spot Interruption Notice
  const simulateSpotInterruption = async () => {
    const spotNodes = nodes.filter(n => n.capacityType === 'spot' && n.status !== 'Terminating');
    if (spotNodes.length === 0) {
      addLog("Interruption warning ignored: No active Spot instances found to interrupt.", "WARNING");
      return;
    }

    const selectedNode = spotNodes[0];
    const instId = `i-0abcdef${Math.floor(Math.random() * 900000 + 100000)}`;

    const queryParam = isSandboxMode ? '?sandbox=true' : '';
    try {
      const res = await fetch(`/api/alerts${queryParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeName: selectedNode.name, instanceId: instId })
      });
      if (!res.ok) throw new Error('Spot warning injection failed');

      addLog(`SQS Message: EC2 Spot Instance Interruption Notice for ${instId} (Node: ${selectedNode.name})`, 'WARNING');
      addLog(`Karpenter controller started node drain sequence for ${selectedNode.name}; marking node as [Terminating]`, 'INFO');
    } catch (e) {
      addLog('Failed to inject Spot Interruption alert', 'ERROR');
    }
  };

  // ==========================================
  // 3. Derived Metrics & Computations
  // ==========================================

  const metrics = useMemo(() => {
    let totalCoresCapacity = 0;
    let totalCoresAllocated = 0;
    let totalMemCapacity = 0;
    let totalMemAllocated = 0;
    let activeNodesCount = 0;
    let terminatingNodesCount = 0;
    let totalPods = 0;
    let actualHourlyCost = 0.0;
    let onDemandHourlyCost = 0.0;

    nodes.forEach(node => {
      activeNodesCount++;
      if (node.status === 'Terminating') {
        terminatingNodesCount++;
      }
      totalCoresCapacity += node.cpuCapacity;
      totalCoresAllocated += node.cpuAllocated;
      totalMemCapacity += node.memCapacity;
      totalMemAllocated += node.memAllocated;
      totalPods += node.podsCount;
      
      actualHourlyCost += node.costPerHour;
      
      let baseCost = node.costPerHour;
      if (node.capacityType === 'spot') {
        baseCost = node.costPerHour / 0.40;
      }
      onDemandHourlyCost += baseCost;
    });

    const cpuUsagePercent = totalCoresCapacity > 0 ? (totalCoresAllocated / totalCoresCapacity) * 100 : 0;
    const memUsagePercent = totalMemCapacity > 0 ? (totalMemAllocated / totalMemCapacity) * 100 : 0;
    const savings = onDemandHourlyCost - actualHourlyCost;

    return {
      nodesCount: activeNodesCount,
      terminatingCount: terminatingNodesCount,
      claimsCount: nodeClaims.length,
      pendingClaims: nodeClaims.filter(c => c.status === 'Provisioning').length,
      pendingPodsCount: pendingPods.length,
      cpuUsage: Math.round(cpuUsagePercent),
      memUsage: Math.round(memUsagePercent),
      totalPods,
      actualCost: actualHourlyCost.toFixed(4),
      onDemandCost: onDemandHourlyCost.toFixed(4),
      savingsCost: savings.toFixed(4),
      savingsPercent: onDemandHourlyCost > 0 ? Math.round((savings / onDemandHourlyCost) * 100) : 0,
      coresAllocated: totalCoresAllocated.toFixed(1),
      coresCapacity: totalCoresCapacity.toFixed(1),
      memAllocated: totalMemAllocated.toFixed(1),
      memCapacity: totalMemCapacity.toFixed(1)
    };
  }, [nodes, nodeClaims, pendingPods]);

  // Filtered lists
  const filteredNodes = useMemo(() => {
    return nodes.filter(node => {
      const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            node.instanceType.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCapacity = filterCapacity === 'all' || node.capacityType === filterCapacity;
      const matchesStatus = filterStatus === 'all' || node.status === filterStatus;
      return matchesSearch && matchesCapacity && matchesStatus;
    });
  }, [nodes, searchTerm, filterCapacity, filterStatus]);

  const filteredClaims = useMemo(() => {
    return nodeClaims.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.instanceType.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [nodeClaims, searchTerm]);

  const filteredPods = useMemo(() => {
    return pendingPods.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.namespace.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [pendingPods, searchTerm]);

  return (
    <div className="app-container">
      {/* 1. Dashboard Header */}
      <header className="header">
        <div className="logo-section">
          <Layers className="logo-icon" size={32} />
          <div className="logo-text">
            <h1>Karpenter Pulse</h1>
            <p>Cluster Autoscaling & CRD Dashboard</p>
          </div>
        </div>

        <div className="header-actions">
          <button 
            className="btn" 
            onClick={toggleMode}
            style={{
              color: isSandboxMode ? 'var(--accent-purple)' : 'var(--status-ready)',
              backgroundColor: isSandboxMode ? 'rgba(139, 92, 246, 0.1)' : 'var(--status-ready-bg)',
              borderColor: isSandboxMode ? 'rgba(139, 92, 246, 0.3)' : 'var(--status-ready-border)',
              borderStyle: 'solid',
              borderWidth: '1px',
              textTransform: 'uppercase',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.35rem 0.85rem',
              borderRadius: '9999px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: isApiAvailable ? 'pointer' : 'not-allowed',
              opacity: (isSandboxMode || isApiAvailable) ? 1 : 0.5
            }}
            title={isApiAvailable ? "Click to toggle modes" : "Live API disconnected"}
            disabled={!isSandboxMode && !isApiAvailable}
          >
            <span className="live-dot" style={{
              backgroundColor: isSandboxMode ? 'var(--accent-purple)' : 'var(--status-ready)',
              boxShadow: isSandboxMode ? '0 0 8px var(--accent-purple)' : '0 0 8px var(--status-ready)',
              animation: 'pulse-glow 1.5s infinite'
            }}></span>
            {isSandboxMode ? 'Mode: Sandbox' : 'Mode: Live'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => setIsDarkMode(prev => !prev)}
            style={{
              padding: '0.45rem',
              borderRadius: '9999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              cursor: 'pointer'
            }}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="btn btn-secondary" onClick={() => {
            addLog("Manual refresh triggered. Synchronizing CRD state...", "INFO");
          }}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </header>

      {/* 2. Simulation Sandbox Banner */}
      <SimulationBanner
        dataSource={dataSource}
        isScalingUp={isScalingUp}
        isConsolidating={isConsolidating}
        createUnscheduledPod={createUnscheduledPod}
        simulateSpotInterruption={simulateSpotInterruption}
        simulateScaleUp={simulateScaleUp}
        hasSpotNodes={nodes.some(n => n.capacityType === 'spot' && n.status !== 'Terminating')}
        hasPendingPods={pendingPods.length > 0}
      />

      {/* 2.5 Active AWS Cluster Alerts */}
      <AlertsBanner
        alerts={alerts}
        dataSource={dataSource}
        formatCountdown={formatCountdown}
        dismissAlert={dismissAlert}
      />

      {/* 3. Metric KPI Cards */}
      <section className="metrics-grid">
        <MetricCard
          title="Autoscaled Nodes"
          icon={<Server size={18} />}
          value={metrics.nodesCount}
          colorClass="purple"
          footer={metrics.terminatingCount > 0 ? `${metrics.terminatingCount} consolidating` : 'Active fleet is stable'}
        />

        <MetricCard
          title="CPU Allocation"
          icon={<Cpu size={18} />}
          value={`${metrics.cpuUsage}%`}
          colorClass="blue"
          progress={metrics.cpuUsage}
          progressLabel={`${metrics.coresAllocated} / ${metrics.coresCapacity} Cores`}
        />

        <MetricCard
          title="Memory Allocation"
          icon={<HardDrive size={18} />}
          value={`${metrics.memUsage}%`}
          colorClass="cyan"
          progress={metrics.memUsage}
          progressLabel={`${metrics.memAllocated}Gi / ${metrics.memCapacity}Gi`}
        />

        <MetricCard
          title="Pending Resources"
          icon={<AlertTriangle size={18} />}
          value={`${metrics.pendingPodsCount} Pod${metrics.pendingPodsCount !== 1 ? 's' : ''}`}
          colorClass="orange"
          footer={`${metrics.pendingClaims} active node claims`}
        />

        <MetricCard
          title="Instance Cost / Hr"
          value={`$${pricingMode === 'actual' ? metrics.actualCost : metrics.onDemandCost}`}
          colorClass="green"
          badgeText={pricingMode === 'actual' ? 'SPOT (ACTUAL)' : 'ON-DEMAND'}
          onClick={() => setPricingMode(prev => prev === 'actual' ? 'ondemand' : 'actual')}
          onClickTitle="Click to toggle Spot vs On-Demand pricing equivalent"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span>
                {pricingMode === 'actual' 
                  ? `On-Demand: $${metrics.onDemandCost}` 
                  : `Spot Actual: $${metrics.actualCost}`}
              </span>
              <span style={{ color: 'var(--status-ready)', fontWeight: 'bold' }}>
                -{metrics.savingsPercent}%
              </span>
            </div>
          }
        />
      </section>

      {/* 4. Dashboard Core Layout */}
      <div className="dashboard-layout">
        {/* Left Sidebar Menu */}
        <aside className="sidebar">
          <div className="sidebar-card">
            <div className="sidebar-title">Karpenter Resources</div>
            <ul className="sidebar-menu">
              <li>
                <button 
                  className={`menu-item-btn ${selectedView === 'nodes' ? 'active' : ''}`}
                  onClick={() => { setSelectedView('nodes'); setSelectedItem(null); }}
                >
                  <span>Active Nodes</span>
                  <span className="item-count">{nodes.length}</span>
                </button>
              </li>
              <li>
                <button 
                  className={`menu-item-btn ${selectedView === 'nodepools' ? 'active' : ''}`}
                  onClick={() => { setSelectedView('nodepools'); setSelectedItem(null); }}
                >
                  <span>NodePools (CRD)</span>
                  <span className="item-count">{nodePools.length}</span>
                </button>
              </li>
              <li>
                <button 
                  className={`menu-item-btn ${selectedView === 'nodeclasses' ? 'active' : ''}`}
                  onClick={() => { setSelectedView('nodeclasses'); setSelectedItem(null); }}
                >
                  <span>EC2NodeClasses (CRD)</span>
                  <span className="item-count">{nodeClasses.length}</span>
                </button>
              </li>
              <li>
                <button 
                  className={`menu-item-btn ${selectedView === 'nodeclaims' ? 'active' : ''}`}
                  onClick={() => { setSelectedView('nodeclaims'); setSelectedItem(null); }}
                >
                  <span>NodeClaims (CRD)</span>
                  <span className="item-count">{nodeClaims.length}</span>
                </button>
              </li>
              <li>
                <button 
                  className={`menu-item-btn ${selectedView === 'pods' ? 'active' : ''}`}
                  onClick={() => { setSelectedView('pods'); setSelectedItem(null); }}
                >
                  <span>Pending Pods</span>
                  <span className="item-count">{pendingPods.length}</span>
                </button>
              </li>
            </ul>
          </div>

          <div className="sidebar-card" style={{ flexGrow: 1 }}>
            <div className="sidebar-title">Cluster Overview</div>
            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Kubernetes Version:</span>
                <span style={{ fontWeight: 500 }}>v1.30.2</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Karpenter:</span>
                <span style={{ fontWeight: 500 }}>v1.0.1</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Region:</span>
                <span style={{ fontWeight: 500 }}>us-east-1</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Main Panel */}
        <main className="main-panel">
          {/* Filters and Search Bar */}
          <div className="control-bar">
            <div className="search-wrapper">
              <Search className="search-icon" size={16} />
              <input 
                type="text" 
                placeholder={`Search ${selectedView}...`} 
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {selectedView === 'nodes' && (
              <div className="filter-buttons">
                <button 
                  className={`filter-btn ${filterCapacity === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterCapacity('all')}
                >
                  All Provision
                </button>
                <button 
                  className={`filter-btn ${filterCapacity === 'spot' ? 'active' : ''}`}
                  onClick={() => setFilterCapacity('spot')}
                >
                  Spot
                </button>
                <button 
                  className={`filter-btn ${filterCapacity === 'on-demand' ? 'active' : ''}`}
                  onClick={() => setFilterCapacity('on-demand')}
                >
                  On-Demand
                </button>

                <div style={{ borderLeft: '1px solid var(--border-color)', margin: '0 0.25rem' }}></div>

                <button 
                  className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('all')}
                >
                  All Status
                </button>
                <button 
                  className={`filter-btn ${filterStatus === 'Ready' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('Ready')}
                >
                  Ready
                </button>
                <button 
                  className={`filter-btn ${filterStatus === 'Terminating' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('Terminating')}
                >
                  Terminating
                </button>
              </div>
            )}
          </div>

          {/* Core Panel Content */}
          <div className="panel-card">
            {selectedView === 'nodes' && (
              <>
                <div className="panel-header">
                  <div>
                    <h2>Active Karpenter Nodes</h2>
                    <div className="panel-subtitle">Standard cluster nodes launched by Karpenter NodePool policies</div>
                  </div>
                </div>
                <NodeList
                  nodes={filteredNodes}
                  alerts={alerts}
                  formatCountdown={formatCountdown}
                  isConsolidating={isConsolidating}
                  triggerConsolidation={triggerConsolidation}
                  setSelectedItem={setSelectedItem}
                />
              </>
            )}

            {selectedView === 'nodepools' && (
              <>
                <div className="panel-header">
                  <div>
                    <h2>NodePool Configurations</h2>
                    <div className="panel-subtitle">CRD `karpenter.sh/v1` - Defines constraints and rules for autoscaling</div>
                  </div>
                </div>
                <NodePoolList
                  nodePools={nodePools}
                  setSelectedItem={setSelectedItem}
                />
              </>
            )}

            {selectedView === 'nodeclasses' && (
              <>
                <div className="panel-header">
                  <div>
                    <h2>EC2NodeClasses</h2>
                    <div className="panel-subtitle">CRD `karpenter.k8s.aws/v1` - Configures cloud-provider specific node attributes</div>
                  </div>
                </div>
                <EC2NodeClassList
                  nodeClasses={nodeClasses}
                  setSelectedItem={setSelectedItem}
                />
              </>
            )}

            {selectedView === 'nodeclaims' && (
              <>
                <div className="panel-header">
                  <div>
                    <h2>NodeClaims</h2>
                    <div className="panel-subtitle">CRD `karpenter.sh/v1` - Active requests mapped to instances currently provisioning or running</div>
                  </div>
                </div>
                <NodeClaimList
                  nodeClaims={filteredClaims}
                  setSelectedItem={setSelectedItem}
                />
              </>
            )}

            {selectedView === 'pods' && (
              <>
                <div className="panel-header">
                  <div>
                    <h2>Pending Pods (Autoscaler Watchlist)</h2>
                    <div className="panel-subtitle">Pods currently unable to schedule which Karpenter is actively scanning</div>
                  </div>
                </div>
                <PendingPodsList
                  pods={filteredPods}
                  setSelectedItem={setSelectedItem}
                />
              </>
            )}

            {/* Resource Inspector Sliding Panel */}
            <ResourceInspector
              selectedItem={selectedItem}
              onClose={() => setSelectedItem(null)}
            />
          </div>

          {/* Live Logs Console */}
          <LogsConsole logs={logs} />
        </main>
      </div>

      {/* Safety Confirmation Modal for Consolidation/Drain */}
      {nodeToConsolidate && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            width: '450px',
            maxWidth: '90%',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
              <AlertTriangle style={{ color: 'var(--status-error)' }} size={20} />
              Confirm Node Deprovisioning
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              You are about to trigger Karpenter consolidation for <strong>{nodeToConsolidate}</strong>. This will drain all running pods and terminate the underlying VM instance.
            </p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              To proceed, type the name of the node to confirm:
            </p>
            <input 
              type="text" 
              value={confirmInputName} 
              onChange={(e) => setConfirmInputName(e.target.value)} 
              placeholder={nodeToConsolidate}
              style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                outline: 'none',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-mono)'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setNodeToConsolidate(null)}
              >
                Cancel
              </button>
              <button 
                className="btn" 
                onClick={() => {
                  executeConsolidation(nodeToConsolidate);
                  setNodeToConsolidate(null);
                }}
                disabled={confirmInputName !== nodeToConsolidate}
                style={{
                  backgroundColor: confirmInputName === nodeToConsolidate ? 'var(--status-error)' : 'var(--bg-tertiary)',
                  color: confirmInputName === nodeToConsolidate ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  cursor: confirmInputName === nodeToConsolidate ? 'pointer' : 'not-allowed',
                  opacity: confirmInputName === nodeToConsolidate ? 1 : 0.5,
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}
              >
                Drain & Terminate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
