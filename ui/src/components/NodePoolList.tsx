import React from 'react';
import { FileCode2 } from 'lucide-react';
import type { NodePool } from '../types';

interface NodePoolListProps {
  nodePools: NodePool[];
  setSelectedItem: (item: { type: string; data: any } | null) => void;
}

export const NodePoolList: React.FC<NodePoolListProps> = ({
  nodePools,
  setSelectedItem,
}) => {
  return (
    <div className="crd-grid">
      {nodePools.map(pool => (
        <div key={pool.name} className="crd-card">
          <div className="crd-card-header">
            <div>
              <div className="crd-title">{pool.name}</div>
              <div className="crd-meta">{pool.apiVersion}</div>
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => setSelectedItem({ type: 'nodepool', data: pool })}
            >
              <FileCode2 size={12} />
              YAML
            </button>
          </div>

          <div className="crd-spec-row">
            <span className="crd-spec-label">CPU Limit:</span>
            <span className="crd-spec-value">{pool.limits.cpu} Cores</span>
          </div>
          <div className="crd-spec-row">
            <span className="crd-spec-label">Memory Limit:</span>
            <span className="crd-spec-value">{pool.limits.memory}</span>
          </div>
          <div className="crd-spec-row">
            <span className="crd-spec-label">Consolidation:</span>
            <span className="crd-spec-value" style={{ color: 'var(--accent-purple)' }}>{pool.consolidation}</span>
          </div>
          <div className="crd-spec-row">
            <span className="crd-spec-label">TTL After Empty:</span>
            <span className="crd-spec-value">{pool.consolidateAfter}</span>
          </div>
          
          <div style={{ marginTop: '0.75rem' }}>
            <div className="crd-spec-label" style={{ marginBottom: '0.25rem' }}>Capacity Types:</div>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {pool.capacityTypes.map(t => (
                <span key={t} className={`badge badge-${t}`}>{t}</span>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <div className="crd-spec-label" style={{ marginBottom: '0.25rem' }}>Zones:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {pool.zones.map(z => (
                <span key={z} className="badge badge-tag">{z}</span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
