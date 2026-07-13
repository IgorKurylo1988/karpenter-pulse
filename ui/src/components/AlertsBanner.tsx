import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { SpotAlert } from '../types';

interface AlertsBannerProps {
  alerts: SpotAlert[];
  dataSource: 'sandbox' | 'cluster';
  formatCountdown: (seconds: number) => string;
  dismissAlert: (id: string) => void;
}

export const AlertsBanner: React.FC<AlertsBannerProps> = ({
  alerts,
  dataSource,
  formatCountdown,
  dismissAlert,
}) => {
  if (alerts.length === 0) return null;

  return (
    <section className="alerts-banner" style={{
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid var(--status-error-border)',
      borderRadius: '0.75rem',
      padding: '1rem 1.25rem',
      marginBottom: '2rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--status-error)', fontWeight: 700, fontSize: '0.95rem' }}>
        <AlertTriangle size={18} />
        <span>Active AWS EC2 Cluster Alerts ({alerts.length})</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {alerts.map(alert => (
          <div key={alert.id} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(0, 0, 0, 0.2)',
            padding: '0.6rem 1rem',
            borderRadius: '0.5rem',
            borderLeft: '4px solid var(--status-error)',
            fontSize: '0.85rem'
          }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>{alert.nodeName}</strong> 
              <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({alert.instanceId})</span>
              <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)' }}>{alert.message}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="badge badge-error" style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.5rem' }}>
                TIMEOUT: {formatCountdown(alert.countdownSeconds)}
              </span>
              {dataSource === 'sandbox' && (
                <button 
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  onClick={() => dismissAlert(alert.id)}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
