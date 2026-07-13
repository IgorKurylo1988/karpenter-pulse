import React from 'react';
import { Terminal, Clock } from 'lucide-react';

interface LogsConsoleProps {
  logs: string[];
}

export const LogsConsole: React.FC<LogsConsoleProps> = ({ logs }) => {
  return (
    <div className="panel-card" style={{ flexGrow: 1 }}>
      <div className="panel-header" style={{ padding: '0.75rem 1.25rem' }}>
        <h2 style={{ fontSize: '0.95rem' }}>
          <Terminal size={14} style={{ color: 'var(--accent-purple)' }} />
          Karpenter Controller Logs (Simulated Engine)
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <Clock size={12} />
          Realtime stream active
        </div>
      </div>

      <div 
        id="log-console"
        style={{
          backgroundColor: '#090a0f',
          padding: '1rem',
          maxHeight: '180px',
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: '#e2e8f0',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem'
        }}
      >
        {logs.map((log, index) => {
          let color = '#94a3b8';
          if (log.includes('SUCCESS') || log.includes('Ready') || log.includes('became [Ready]')) {
            color = '#34d399';
          } else if (log.includes('WARNING') || log.includes('unschedulable') || log.includes('Interruption')) {
            color = '#fbbf24';
          } else if (log.includes('ERROR')) {
            color = '#f87171';
          } else if (log.includes('launched') || log.includes('joined')) {
            color = '#60a5fa';
          }
          return (
            <div key={index} style={{ color, whiteSpace: 'pre-wrap' }}>
              {log}
            </div>
          );
        })}
      </div>
    </div>
  );
};
