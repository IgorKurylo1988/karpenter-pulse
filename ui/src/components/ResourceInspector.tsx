import React from 'react';
import { FileCode2, X } from 'lucide-react';

interface ResourceInspectorProps {
  selectedItem: { type: string; data: any } | null;
  onClose: () => void;
}

export const ResourceInspector: React.FC<ResourceInspectorProps> = ({
  selectedItem,
  onClose,
}) => {
  if (!selectedItem) return null;

  const { type, data } = selectedItem;

  const getYamlRepresentation = () => {
    if (type === 'node') {
      return `apiVersion: v1
kind: Node
metadata:
  name: ${data.name}
  labels:
    karpenter.sh/nodepool: ${data.nodePool}
    karpenter.sh/capacity-type: ${data.capacityType}
    node.kubernetes.io/instance-type: ${data.instanceType}
    topology.kubernetes.io/zone: ${data.zone}
    karpenter.sh/initialized: "true"
spec:
  providerID: aws:///us-east-1/${data.name.split('.')[0]}
status:
  conditions:
    - type: Ready
      status: "${data.status === 'Ready' ? 'True' : 'False'}"
  capacity:
    cpu: "${data.cpuCapacity}"
    memory: "${data.memCapacity}Gi"
    pods: "110"
  allocatable:
    cpu: "${data.cpuCapacity}"
    memory: "${data.memCapacity}Gi"`;
    }

    if (type === 'nodepool') {
      return `apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: ${data.name}
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: ${JSON.stringify(data.capacityTypes)}
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ${JSON.stringify(data.instanceCategories)}
        - key: topology.kubernetes.io/zone
          operator: In
          values: ${JSON.stringify(data.zones)}
  limits:
    cpu: ${data.limits.cpu}
    memory: ${data.limits.memory}
  disruption:
    consolidationPolicy: ${data.consolidation}
    consolidateAfter: ${data.consolidateAfter}`;
    }

    if (type === 'nodeclass') {
      return `apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: ${data.name}
spec:
  amiFamily: ${data.amiFamily}
  role: ${data.iamRole}
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: my-cluster
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: my-cluster
  blockDeviceMappings:
    - deviceName: /dev/xvda
      ebs:
        volumeSize: ${data.diskSize}
        volumeType: gp3`;
    }

    if (type === 'nodeclaim') {
      return `apiVersion: karpenter.sh/v1
kind: NodeClaim
metadata:
  name: ${data.name}
spec:
  nodePool: ${data.nodePool}
  requirements:
    - key: karpenter.sh/capacity-type
      operator: In
      values: ["${data.capacityType}"]
status:
  nodeName: ${data.nodeName || '""'}
  phase: ${data.status}
  capacity:
    cpu: "${data.instanceType.includes('2xl') ? '8' : '4'}"
    memory: "${data.instanceType.includes('2xl') ? '32Gi' : '16Gi'}"`;
    }

    if (type === 'pod') {
      return `apiVersion: v1
kind: Pod
metadata:
  name: ${data.name}
  namespace: ${data.namespace}
spec:
  containers:
    - name: application
      resources:
        requests:
          cpu: "${data.cpuRequest}"
          memory: "${data.memRequest}"
          ${data.gpuRequest ? `nvidia.com/gpu: "${data.gpuRequest}"` : ''}
  nodeSelector:
    karpenter.sh/nodepool: ${data.nodePool}
status:
  phase: Pending
  conditions:
    - type: PodScheduled
      status: "False"
      reason: "Unschedulable"
      message: "${data.reason}"`;
    }

    return '';
  };

  return (
    <div className="drawer">
      <div className="drawer-header">
        <div className="drawer-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileCode2 size={16} style={{ color: 'var(--accent-purple)' }} />
          <span>Resource Inspector: {data.name}</span>
        </div>
        <button 
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="drawer-content">
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Kubernetes Resource Spec (YAML)
          </div>
          <pre className="yaml-view">
            {getYamlRepresentation()}
          </pre>
        </div>

        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Metadata & Details
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
            {type === 'node' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Autoscale Claim Ref:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>{data.nodeClaim}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Belongs to NodePool:</span>
                  <span style={{ fontWeight: 600 }}>{data.nodePool}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Hourly Instance Cost:</span>
                  <span style={{ color: 'var(--status-ready)', fontWeight: 600 }}>${data.costPerHour}/hr</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Assigned System Labels:</span>
                  <div className="labels-grid">
                    <div className="label-pill">
                      <span className="label-key">karpenter.sh/nodepool</span>
                      <span className="label-val">{data.nodePool}</span>
                    </div>
                    <div className="label-pill">
                      <span className="label-key">karpenter.sh/capacity-type</span>
                      <span className="label-val">{data.capacityType}</span>
                    </div>
                    <div className="label-pill">
                      <span className="label-key">kubernetes.io/arch</span>
                      <span className="label-val">arm64</span>
                    </div>
                    <div className="label-pill">
                      <span className="label-key">topology.kubernetes.io/zone</span>
                      <span className="label-val">{data.zone}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {type === 'nodepool' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Autoscaler Kind:</span>
                  <span>NodePool</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Consolidation Grace:</span>
                  <span>{data.consolidateAfter}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Requirements Matches:</span>
                  <div className="labels-grid">
                    <div className="label-pill">
                      <span className="label-key">instance-categories</span>
                      <span className="label-val">{data.instanceCategories.join(', ')}</span>
                    </div>
                    <div className="label-pill">
                      <span className="label-key">capacity-types</span>
                      <span className="label-val">{data.capacityTypes.join(', ')}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {type === 'nodeclass' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>AWS Provider Role:</span>
                  <span>{data.iamRole}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>EBS Block Mapping:</span>
                  <span>{data.diskSize} GP3</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>AMI OS Target:</span>
                  <span>{data.amiFamily} (Linux)</span>
                </div>
              </>
            )}

            {type === 'nodeclaim' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Autoscaling State:</span>
                  <span style={{ fontWeight: 600 }} className={data.status === 'Ready' ? 'text-green' : 'text-orange'}>
                    {data.status}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Requested Instance Spec:</span>
                  <span>{data.instanceType} ({data.capacityType})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Allocated IP Node:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{data.nodeName || 'Pending Provisioning...'}</span>
                </div>
              </>
            )}

            {type === 'pod' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Tolerations / Selector:</span>
                  <span>karpenter.sh/nodepool={data.nodePool}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Status Phase:</span>
                  <span style={{ color: 'var(--status-pending)' }}>Pending (Unschedulable)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Autoscaler Scanning Verdict:</span>
                  <span style={{ color: 'var(--status-error)', padding: '0.4rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '0.25rem', fontSize: '0.8rem', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                    {data.reason}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
