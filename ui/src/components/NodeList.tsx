import React from 'react';
import { Server, ExternalLink, Trash2 } from 'lucide-react';
import type { K8sNode, SpotAlert } from '../types';

interface NodeListProps {
  nodes: K8sNode[];
  alerts: SpotAlert[];
  formatCountdown: (seconds: number) => string;
  isConsolidating: boolean;
  triggerConsolidation: (nodeName: string) => void;
  setSelectedItem: (item: { type: string; data: any } | null) => void;
}

export const NodeList: React.FC<NodeListProps> = ({
  nodes,
  alerts,
  formatCountdown,
  isConsolidating,
  triggerConsolidation,
  setSelectedItem,
}) => {
  if (nodes.length === 0) {
    return (
      <div className="empty-state">
        <Server size={48} className="empty-state-icon" />
        <p>No nodes found matching filters.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="custom-table">
        <thead>
          <tr>
            <th>Node Name</th>
            <th>Status</th>
            <th>Capacity</th>
            <th>Instance Type</th>
            <th>Zone</th>
            <th>CPU Allocated</th>
            <th>Mem Allocated</th>
            <th>Pods</th>
            <th>Age</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map(node => {
            const nodeAlert = alerts.find(a => a.nodeName === node.name);
            return (
              <tr key={node.name} className={nodeAlert ? 'row-interrupted' : ''}>
                <td 
                  style={{ fontWeight: 600, color: 'var(--accent-cyan)', cursor: 'pointer' }}
                  onClick={() => setSelectedItem({ type: 'node', data: node })}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {node.name}
                    <ExternalLink size={12} style={{ opacity: 0.5 }} />
                  </div>
                </td>
                <td>
                  {nodeAlert ? (
                    <span className="badge badge-error" style={{ animation: 'pulse-glow 1.5s infinite', whiteSpace: 'nowrap' }}>
                      INTERRUPTED ({formatCountdown(nodeAlert.countdownSeconds)})
                    </span>
                  ) : (
                    <span className={`badge badge-${node.status.toLowerCase()}`}>
                      {node.status}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge badge-${node.capacityType}`}>
                    {node.capacityType}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{node.instanceType}</td>
                <td>{node.zone}</td>
                <td>
                  <div className="progress-container">
                    <div className="progress-bar-wrapper">
                      <div 
                        className="progress-bar-fill fill-blue" 
                        style={{ width: `${Math.min(100, (node.cpuAllocated / node.cpuCapacity) * 100)}%` }}
                      ></div>
                    </div>
                    <div className="progress-labels">
                      <span>{node.cpuAllocated} / {node.cpuCapacity} Cores</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="progress-container">
                    <div className="progress-bar-wrapper">
                      <div 
                        className="progress-bar-fill fill-green" 
                        style={{ width: `${Math.min(100, (node.memAllocated / node.memCapacity) * 100)}%` }}
                      ></div>
                    </div>
                    <div className="progress-labels">
                      <span>{node.memAllocated} / {node.memCapacity}Gi</span>
                    </div>
                  </div>
                </td>
                <td>{node.podsCount}</td>
                <td style={{ color: 'var(--text-muted)' }}>{node.age}</td>
                <td style={{ textAlign: 'right' }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--status-terminating-border)', color: 'var(--status-terminating)' }}
                    onClick={() => triggerConsolidation(node.name)}
                    disabled={node.status === 'Terminating' || isConsolidating}
                  >
                    <Trash2 size={12} />
                    Consolidate
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
