import React from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import type { UnscheduledPod } from '../types';

interface PendingPodsListProps {
  pods: UnscheduledPod[];
  setSelectedItem: (item: { type: string; data: any } | null) => void;
}

export const PendingPodsList: React.FC<PendingPodsListProps> = ({
  pods,
  setSelectedItem,
}) => {
  if (pods.length === 0) {
    return (
      <div className="empty-state">
        <CheckCircle2 size={48} className="empty-state-icon" style={{ color: 'var(--status-ready)', opacity: 0.8 }} />
        <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>All pods scheduled successfully!</p>
        <p style={{ fontSize: '0.85rem' }}>The cluster has sufficient resource capacity.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="custom-table">
        <thead>
          <tr>
            <th>Pod Name</th>
            <th>Namespace</th>
            <th>CPU Req</th>
            <th>Mem Req</th>
            <th>Target NodePool</th>
            <th>Unscheduled Reason</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {pods.map(pod => (
            <tr key={pod.name}>
              <td 
                style={{ fontWeight: 600, color: 'var(--status-pending)', cursor: 'pointer' }}
                onClick={() => setSelectedItem({ type: 'pod', data: pod })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {pod.name}
                  <ExternalLink size={12} style={{ opacity: 0.5 }} />
                </div>
              </td>
              <td>{pod.namespace}</td>
              <td style={{ fontFamily: 'var(--font-mono)' }}>{pod.cpuRequest}</td>
              <td style={{ fontFamily: 'var(--font-mono)' }}>{pod.memRequest}</td>
              <td>
                <span className="badge badge-tag">{pod.nodePool}</span>
              </td>
              <td style={{ color: 'var(--status-error)', fontSize: '0.8rem' }}>
                {pod.reason}
              </td>
              <td style={{ color: 'var(--text-muted)' }}>{pod.age}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
