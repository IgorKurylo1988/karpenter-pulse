import React from 'react';

interface MetricCardProps {
  title: string;
  icon?: React.ReactNode;
  value: string | number;
  footer?: React.ReactNode;
  colorClass: 'purple' | 'blue' | 'cyan' | 'orange' | 'green';
  onClick?: () => void;
  onClickTitle?: string;
  badgeText?: string;
  progress?: number;
  progressLabel?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  icon,
  value,
  footer,
  colorClass,
  onClick,
  onClickTitle,
  badgeText,
  progress,
  progressLabel,
}) => {
  return (
    <div 
      className={`metric-card ${colorClass}`} 
      onClick={onClick} 
      style={onClick ? { cursor: 'pointer' } : undefined}
      title={onClickTitle}
    >
      <div className="metric-header">
        <span>{title}</span>
        {badgeText ? (
          <span style={{ 
            fontSize: '0.65rem', 
            background: 'rgba(16, 185, 129, 0.15)', 
            color: 'var(--status-ready)', 
            padding: '0.15rem 0.4rem', 
            borderRadius: '0.25rem',
            fontWeight: 700
          }}>
            {badgeText}
          </span>
        ) : (
          icon
        )}
      </div>
      <div className="metric-value">{value}</div>
      
      {progress !== undefined && (
        <div className="progress-container" style={{ marginTop: '0.5rem' }}>
          <div className="progress-bar-wrapper">
            <div 
              className={`progress-bar-fill fill-${colorClass}`} 
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            ></div>
          </div>
          {progressLabel && (
            <div className="progress-labels">
              <span>{progressLabel}</span>
            </div>
          )}
        </div>
      )}

      {footer && <div className="metric-footer">{footer}</div>}
    </div>
  );
};
