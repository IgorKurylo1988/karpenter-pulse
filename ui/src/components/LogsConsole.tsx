import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Search, Radio, Filter, Maximize2, Minimize2, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const logConsoleRef = useRef<HTMLDivElement>(null);

  const toggleLevel = (level: LogLevel) => {
    setActiveLevels(prev => ({
      ...prev,
      [level]: !prev[level]
    }));
  };

  const toggleExpand = () => {
    setIsExpanded(prev => {
      const next = !prev;
      if (logConsoleRef.current) {
        logConsoleRef.current.style.height = next ? '520px' : '220px';
      }
      return next;
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => {
      const next = !prev;
      if (logConsoleRef.current) {
        if (next) {
          logConsoleRef.current.style.height = '100%';
        } else {
          logConsoleRef.current.style.height = isExpanded ? '520px' : '220px';
        }
      }
      return next;
    });
  };

  // Close fullscreen on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        if (logConsoleRef.current) {
          logConsoleRef.current.style.height = isExpanded ? '520px' : '220px';
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isExpanded]);

  // Prevent background scroll in fullscreen
  useEffect(() => {
    if (isFullscreen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isFullscreen]);

  // Keep scroll at bottom on size change
  useEffect(() => {
    if (logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [isExpanded, isFullscreen]);

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
    <>
      {/* Modal backdrop when in Fullscreen mode */}
      {isFullscreen && (
        <div
          onClick={toggleFullscreen}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 998,
            cursor: 'pointer'
          }}
        />
      )}

      <div
        className="panel-card"
        style={isFullscreen ? {
          position: 'fixed',
          top: '1.25rem',
          left: '1.25rem',
          right: '1.25rem',
          bottom: '1.25rem',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '0.6rem',
          border: '1px solid var(--accent-purple)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 35px rgba(168, 85, 247, 0.2)',
          overflow: 'hidden'
        } : {
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1rem'
        }}
      >
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

          {/* Filter & View controls */}
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

            <div style={{ width: '1px', height: '12px', background: 'var(--border-color)' }}></div>

            {/* Expand / Fullscreen Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                onClick={toggleExpand}
                title={isExpanded ? "Collapse height to standard (220px)" : "Expand height to large (520px)"}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: isExpanded ? 'var(--accent-purple)' : 'var(--text-muted)',
                  backgroundColor: isExpanded ? 'rgba(168, 85, 247, 0.15)' : 'var(--bg-tertiary)',
                  border: `1px solid ${isExpanded ? 'rgba(168, 85, 247, 0.4)' : 'var(--border-color)'}`,
                  padding: '0.2rem 0.45rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <span>{isExpanded ? 'Compact' : 'Expand'}</span>
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit Fullscreen (Esc)" : "Expand to Fullscreen"}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: isFullscreen ? 'var(--accent-blue)' : 'var(--text-muted)',
                  backgroundColor: isFullscreen ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-tertiary)',
                  border: `1px solid ${isFullscreen ? 'rgba(59, 130, 246, 0.4)' : 'var(--border-color)'}`,
                  padding: '0.2rem 0.45rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                <span>{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Log Console Body */}
        <div 
          id="log-console"
          ref={logConsoleRef}
          style={{
            backgroundColor: '#090a0f',
            padding: '0.85rem 1.25rem',
            height: isFullscreen ? '100%' : (isExpanded ? '520px' : '220px'),
            minHeight: isFullscreen ? '0' : '160px',
            maxHeight: isFullscreen ? 'none' : '80vh',
            resize: isFullscreen ? 'none' : 'vertical',
            overflowY: 'auto',
            overflowX: 'hidden',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.73rem',
            color: '#e2e8f0',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            flex: isFullscreen ? 1 : undefined
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

        {/* Console Footer Status & Resize Hint */}
        <div
          style={{
            padding: '0.35rem 1.25rem',
            backgroundColor: '#07080c',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.64rem',
            color: 'var(--text-muted)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>
              Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredLogs.length}</strong> of {logs.length} events
            </span>
            {searchTerm && (
              <span style={{ color: 'var(--accent-purple)' }}>
                Filtered by: "{searchTerm}"
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.8 }}>
            {isFullscreen ? (
              <span>
                Press <kbd style={{ padding: '0.1rem 0.35rem', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.6rem' }}>ESC</kbd> or click Exit Full to return
              </span>
            ) : (
              <span style={{ userSelect: 'none' }}>
                Drag bottom-right corner ⇲ to custom resize
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
