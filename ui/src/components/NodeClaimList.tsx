import React from 'react';
import { Cpu, ExternalLink } from 'lucide-react';
import type { NodeClaim } from '../types';

interface NodeClaimListProps {
  nodeClaims: NodeClaim[];
  setSelectedItem: (item: { type: string; data: any } | null) => void;
}

export const NodeClaimList: React.FC<NodeClaimListProps> = ({
  nodeClaims,
  setSelectedItem,
}) => {
  if (nodeClaims.length === 0) {
    return (
      <div className="empty-state">
        <Cpu size={48} className="empty-state-icon" />
        <p>No active NodeClaims.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="custom-table">
        <thead>
          <tr>
            <th>Claim Name</th>
            <th>NodePool</th>
            <th>Instance Type</th>
            <th>Capacity</th>
            <th>Zone</th>
            <th>Status</th>
            <th>Mapped Node</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {nodeClaims.map(claim => (
            <tr key={claim.name}>
              <td 
                style={{ fontWeight: 600, color: 'var(--accent-purple)', cursor: 'pointer' }}
                onClick={() => setSelectedItem({ type: 'nodeclaim', data: claim })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {claim.name}
                  <ExternalLink size={12} style={{ opacity: 0.5 }} />
                </div>
              </td>
              <td>{claim.nodePool}</td>
              <td style={{ fontFamily: 'var(--font-mono)' }}>{claim.instanceType}</td>
              <td>
                <span className={`badge badge-${claim.capacityType}`}>
                  {claim.capacityType}
                </span>
              </td>
              <td>{claim.zone}</td>
              <td>
                <span className={`badge badge-${claim.status === 'Ready' ? 'ready' : 'pending'}`}>
                  {claim.status}
                </span>
              </td>
              <td style={{ color: claim.nodeName ? 'var(--accent-cyan)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {claim.nodeName || 'Waiting...'}
              </td>
              <td style={{ color: 'var(--text-muted)' }}>{claim.age}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
