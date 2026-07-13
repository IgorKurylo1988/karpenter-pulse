import React from 'react';
import { Activity, Plus, AlertTriangle, Play } from 'lucide-react';

interface SimulationBannerProps {
  dataSource: 'sandbox' | 'cluster';
  isScalingUp: boolean;
  isConsolidating: boolean;
  createUnscheduledPod: () => void;
  simulateSpotInterruption: () => void;
  simulateScaleUp: () => void;
  hasSpotNodes: boolean;
  hasPendingPods: boolean;
}

export const SimulationBanner: React.FC<SimulationBannerProps> = ({
  dataSource,
  isScalingUp,
  isConsolidating,
  createUnscheduledPod,
  simulateSpotInterruption,
  simulateScaleUp,
  hasSpotNodes,
  hasPendingPods,
}) => {
  const isCluster = dataSource === 'cluster';

  return (
    <section className="simulation-banner" style={{
      background: isCluster ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%)' : undefined,
      borderColor: isCluster ? 'rgba(16, 185, 129, 0.3)' : undefined
    }}>
      <div className="simulation-info">
        <Activity 
          className="logo-icon" 
          size={20} 
          style={{ color: isCluster ? 'var(--status-ready)' : undefined }} 
        />
        <div>
          {isCluster ? (
            <p><strong>Cluster Integration Active</strong>: Successfully streaming from the active Kubernetes API. Sandbox simulations are disabled in live view.</p>
          ) : (
            <p><strong>Scaling Simulation Sandbox</strong>: Simulate workloads to trigger Karpenter's real-time scheduling decisions and node claims.</p>
          )}
        </div>
      </div>
      <div className="simulation-controls">
        <button 
          className="btn btn-secondary" 
          onClick={createUnscheduledPod}
          disabled={isCluster || isScalingUp || isConsolidating}
          style={{ opacity: isCluster ? 0.5 : 1 }}
        >
          <Plus size={16} />
          Unscheduled Pod
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={simulateSpotInterruption}
          disabled={isCluster || isScalingUp || isConsolidating || !hasSpotNodes}
          style={{ 
            opacity: (isCluster || !hasSpotNodes) ? 0.5 : 1,
            borderColor: 'var(--status-error-border)',
            color: 'var(--status-error)'
          }}
        >
          <AlertTriangle size={16} />
          Spot Interruption
        </button>
        <button 
          className="btn btn-primary" 
          onClick={simulateScaleUp}
          disabled={isCluster || isScalingUp || !hasPendingPods || isConsolidating}
          style={{ 
            opacity: isCluster ? 0.5 : 1,
            background: isCluster ? 'var(--bg-tertiary)' : undefined,
            borderColor: isCluster ? 'var(--border-color)' : undefined
          }}
        >
          <Play size={16} />
          {isScalingUp ? 'Autoscaling...' : 'Scale Up Fleet'}
        </button>
      </div>
    </section>
  );
};
