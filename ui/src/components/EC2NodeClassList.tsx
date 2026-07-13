import React from 'react';
import { FileCode2 } from 'lucide-react';
import type { EC2NodeClass } from '../types';

interface EC2NodeClassListProps {
  nodeClasses: EC2NodeClass[];
  setSelectedItem: (item: { type: string; data: any } | null) => void;
}

export const EC2NodeClassList: React.FC<EC2NodeClassListProps> = ({
  nodeClasses,
  setSelectedItem,
}) => {
  return (
    <div className="crd-grid">
      {nodeClasses.map(nodeClass => (
        <div key={nodeClass.name} className="crd-card">
          <div className="crd-card-header">
            <div>
              <div className="crd-title">{nodeClass.name}</div>
              <div className="crd-meta">{nodeClass.apiVersion}</div>
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => setSelectedItem({ type: 'nodeclass', data: nodeClass })}
            >
              <FileCode2 size={12} />
              YAML
            </button>
          </div>

          <div className="crd-spec-row">
            <span className="crd-spec-label">AMI Family:</span>
            <span className="crd-spec-value">{nodeClass.amiFamily}</span>
          </div>
          <div className="crd-spec-row">
            <span className="crd-spec-label">Disk Volume:</span>
            <span className="crd-spec-value">{nodeClass.diskSize} (gp3)</span>
          </div>
          <div className="crd-spec-row">
            <span className="crd-spec-label">IAM Node Role:</span>
            <span className="crd-spec-value" style={{ fontSize: '0.7rem' }}>{nodeClass.iamRole}</span>
          </div>
          
          <div style={{ marginTop: '0.75rem' }}>
            <div className="crd-spec-label" style={{ marginBottom: '0.15rem' }}>Subnet Discovery Tags:</div>
            <span className="badge badge-tag" style={{ display: 'block', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {nodeClass.subnetDiscovery}
            </span>
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            <div className="crd-spec-label" style={{ marginBottom: '0.15rem' }}>Security Group Discovery Tags:</div>
            <span className="badge badge-tag" style={{ display: 'block', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {nodeClass.securityGroupDiscovery}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
