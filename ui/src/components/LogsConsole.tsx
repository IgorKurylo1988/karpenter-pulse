import React, { useState } from 'react';
import { Terminal, Search, Radio, Filter } from 'lucide-react';
import type { LogEntry } from '../types';

interface LogsConsoleProps {
  logs: LogEntry[];
  leaderPod?: string;
  storageDriver?: string;
}

type LogLevel = 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
type CategoryFilter = 'ALL' | 'PROVISIONING' | 'CONSOLIDATION' | 'DISRUPTION' | 'INTERRUPTION' | 'K8S_EVENT' | 'SYSTEM';

export const LogsConsole: React.FC<LogsConsoleProps> = ({ logs, leaderPod, storageDriver }) => {
  const [activeLevels, setActiveLevels] = useState<Record<LogLevel, boolean>>({
    INFO: true,
    SUCCESS: true,
    WARNING: true,
    ERROR: true
  });

  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const toggleLevel = (level: LogLevel) => {
    setActiveLevels(prev => ({
      ...prev,
      [level]: !prev[level]
    }));
  };

  const filteredLogs = logs.filter(log => {
    // Level filter
    if (!activeLevels[log.level]) return false;

    // Category filter
    if (selectedCategory !== 'ALL' && log.category !== selectedCategory) {
      return false;
    }

    // Search filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchClaim = log.nodeClaim?.toLowerCase().includes(q) || false;
      const matchPool = log.nodePool?.toLowerCase().includes(q) || false;
      const matchNode = log.nodeName?.toLowerCase().includes(q) || false;
      if (!matchMsg && !matchClaim && !matchPool && !matchNode) return false;
    }

    return true;
  });

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

  const categories: CategoryFilter[] = ['ALL', 'PROVISIONING', 'CONSOLIDATION', 'DISRUPTION', 'INTERRUPTION', 'K8S_EVENT'];

  return (
    <div className="panel-card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', marginTop: '1rem' }}>
      {/* Header & Controls */}
      <div className="panel-header" style={{ padding: '0.75rem 1.25rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '0.95rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Terminal size={15} style={{ color: 'var(--accent-purple)' }} />
            Karpenter Observability Feed
          </h2>

          {/* Leader Pod Badge */}
          {leaderPod && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.68rem',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--status-ready)',
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
              fontWeight: 500
            }}>
              <Radio size={11} style={{ animation: 'pulse-glow 1.5s infinite' }} />
              Leader: {leaderPod}
            </div>
          )}

          {storageDriver && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              [{storageDriver}]
            </span>
          )}
        </div>

        {/* Filter controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Quick search input */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={12} style={{ position: 'absolute', left: '0.4rem', color: 'var(--text-muted)' }} />
            <input 
              type="text"
              placeholder="Search logs/claims..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.25rem',
                color: 'var(--text-primary)',
                fontSize: '0.7rem',
                padding: '0.2rem 0.5rem 0.2rem 1.4rem',
                outline: 'none',
                width: '140px'
              }}
            />
          </div>

          {/* Category Dropdown/Pills */}
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  color: selectedCategory === cat ? '#ffffff' : 'var(--text-muted)',
                  backgroundColor: selectedCategory === cat ? 'var(--accent-purple)' : 'transparent',
                  border: '1px solid var(--border-color)',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '0.2rem',
                  cursor: 'pointer',
                  textTransform: 'uppercase'
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '12px', background: 'var(--border-color)' }}></div>

          {/* Log level filter pills */}
          {(Object.keys(levelStyles) as LogLevel[]).map(lvl => {
            const isActive = activeLevels[lvl];
            const cfg = levelStyles[lvl];
            return (
              <button
                key={lvl}
                onClick={() => toggleLevel(lvl)}
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  color: cfg.color,
                  backgroundColor: isActive ? cfg.activeBg : cfg.bg,
                  border: `1px solid ${isActive ? cfg.activeBorder : 'var(--border-color)'}`,
                  padding: '0.15rem 0.4rem',
                  borderRadius: '0.2rem',
                  cursor: 'pointer',
                  opacity: isActive ? 1 : 0.4,
                  textTransform: 'uppercase'
                }}
              >
                {lvl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Log Console Body */}
      <div 
        id="log-console"
        style={{
          backgroundColor: '#090a0f',
          padding: '0.85rem 1.25rem',
          height: '210px',
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.73rem',
          color: '#e2e8f0',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem'
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '3rem' }}>
            <Filter size={20} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
            No logs matching active filters
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            let color = '#94a3b8';
            if (log.level === 'SUCCESS') color = '#34d399';
            else if (log.level === 'WARNING') color = '#fbbf24';
            else if (log.level === 'ERROR') color = '#f87171';
            else if (log.level === 'INFO' && log.category === 'PROVISIONING') color = '#60a5fa';

            const formattedTime = log.timestamp.includes('T') 
              ? log.timestamp.split('T')[1].substring(0, 8) 
              : log.timestamp;

            return (
              <div key={log.id || index} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', width: '100%', lineHeight: '1.4' }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>[{formattedTime}]</span>
                <span style={{ 
                  fontSize: '0.62rem', 
                  fontWeight: 700, 
                  color, 
                  padding: '0 0.25rem', 
                  borderRadius: '0.15rem', 
                  backgroundColor: `${color}15`,
                  flexShrink: 0 
                }}>
                  {log.level}
                </span>

                {log.category && (
                  <span style={{ 
                    fontSize: '0.6rem', 
                    color: 'var(--text-muted)', 
                    border: '1px solid rgba(255,255,255,0.08)', 
                    padding: '0 0.25rem', 
                    borderRadius: '0.15rem',
                    flexShrink: 0 
                  }}>
                    {log.category}
                  </span>
                )}

                {log.nodeClaim && (
                  <span style={{ color: 'var(--accent-purple)', fontSize: '0.68rem', flexShrink: 0 }}>
                    [{log.nodeClaim}]
                  </span>
                )}

                <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', color }}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
