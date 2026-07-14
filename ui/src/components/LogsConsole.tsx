import React, { useState } from 'react';
import { Terminal, Clock } from 'lucide-react';
import type { LogEntry } from '../types';

interface LogsConsoleProps {
  logs: LogEntry[];
}

type LogLevel = 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';

export const LogsConsole: React.FC<LogsConsoleProps> = ({ logs }) => {
  const [activeLevels, setActiveLevels] = useState<Record<LogLevel, boolean>>({
    INFO: true,
    SUCCESS: true,
    WARNING: true,
    ERROR: true
  });

  const toggleLevel = (level: LogLevel) => {
    setActiveLevels(prev => ({
      ...prev,
      [level]: !prev[level]
    }));
  };

  const filteredLogs = logs.filter(log => activeLevels[log.level]);

  // Styling maps for the filter pills
  const levelStyles: Record<LogLevel, { color: string; bg: string; activeBg: string; activeBorder: string }> = {
    INFO: {
      color: 'var(--accent-blue)',
      bg: 'rgba(59, 130, 246, 0.05)',
      activeBg: 'rgba(59, 130, 246, 0.2)',
      activeBorder: 'rgba(59, 130, 246, 0.5)'
    },
    SUCCESS: {
      color: 'var(--status-ready)',
      bg: 'rgba(16, 185, 129, 0.05)',
      activeBg: 'rgba(16, 185, 129, 0.2)',
      activeBorder: 'rgba(16, 185, 129, 0.5)'
    },
    WARNING: {
      color: 'var(--status-pending)',
      bg: 'rgba(245, 158, 11, 0.05)',
      activeBg: 'rgba(245, 158, 11, 0.2)',
      activeBorder: 'rgba(245, 158, 11, 0.5)'
    },
    ERROR: {
      color: 'var(--status-error)',
      bg: 'rgba(239, 68, 68, 0.05)',
      activeBg: 'rgba(239, 68, 68, 0.2)',
      activeBorder: 'rgba(239, 68, 68, 0.5)'
    }
  };

  return (
    <div className="panel-card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ padding: '0.75rem 1.25rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal size={14} style={{ color: 'var(--accent-purple)' }} />
          Karpenter Observability Stream
        </h2>
        
        {/* Log level filter controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          {(Object.keys(levelStyles) as LogLevel[]).map(lvl => {
            const isActive = activeLevels[lvl];
            const cfg = levelStyles[lvl];
            return (
              <button
                key={lvl}
                onClick={() => toggleLevel(lvl)}
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: cfg.color,
                  backgroundColor: isActive ? cfg.activeBg : cfg.bg,
                  border: `1px solid ${isActive ? cfg.activeBorder : 'var(--border-color)'}`,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  opacity: isActive ? 1 : 0.5,
                  transition: 'all 0.2s ease',
                  textTransform: 'uppercase'
                }}
                title={`Toggle ${lvl} logs`}
              >
                {lvl}
              </button>
            );
          })}
          
          <div style={{ width: '1px', height: '12px', background: 'var(--border-color)', margin: '0 0.25rem' }}></div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <Clock size={12} />
            <span>Live Stream</span>
          </div>
        </div>
      </div>

      <div 
        id="log-console"
        style={{
          backgroundColor: '#090a0f',
          padding: '1rem',
          height: '180px',
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: '#e2e8f0',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          flexGrow: 1
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '2rem' }}>
            No logs matching the active filters
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            let color = '#94a3b8'; // Default INFO color
            
            if (log.level === 'SUCCESS') {
              color = '#34d399';
            } else if (log.level === 'WARNING') {
              color = '#fbbf24';
            } else if (log.level === 'ERROR') {
              color = '#f87171';
            } else if (log.level === 'INFO') {
              if (log.message.includes('launched') || log.message.includes('joined')) {
                color = '#60a5fa';
              }
            }

            const formattedTime = log.timestamp.includes('T') 
              ? log.timestamp.split('T')[1].substring(0, 8) 
              : log.timestamp;

            return (
              <div key={index} style={{ color, whiteSpace: 'pre-wrap', display: 'flex', gap: '0.5rem', width: '100%' }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>[{formattedTime}]</span>
                <span style={{ fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{log.level.padEnd(7)}</span>
                <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
