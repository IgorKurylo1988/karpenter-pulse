import React, { useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { 
  TrendingDown, 
  DollarSign, 
  ShieldCheck, 
  Cpu, 
  Zap,
  Activity,
  Layers,
  AlertCircle
} from 'lucide-react';
import type { K8sNode, PricingSummary } from '../types';

interface FinOpsDashboardProps {
  nodes: K8sNode[];
  pricingSummary?: PricingSummary | null;
  onSelectNodePool?: (poolName: string) => void;
}

const POOL_COLORS = ['#8b5cf6', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4'];

export const FinOpsDashboard: React.FC<FinOpsDashboardProps> = ({ 
  nodes, 
  pricingSummary, 
  onSelectNodePool 
}) => {
  // 1. Calculate or use server-provided pricing summary
  const summary = useMemo(() => {
    if (pricingSummary && pricingSummary.totalHourlyCost > 0) {
      return pricingSummary;
    }

    let actual = 0;
    let onDemand = 0;
    let spotNodes = 0;
    let gravitonNodes = 0;
    const poolMap: Record<string, { hourlyCost: number; onDemandCost: number; count: number; spotCount: number }> = {};

    nodes.forEach(n => {
      actual += n.costPerHour;
      const base = n.capacityType === 'spot' ? n.costPerHour / 0.38 : n.costPerHour;
      onDemand += base;

      if (n.capacityType === 'spot') spotNodes++;
      if (n.instanceType.includes('g.') || n.instanceType.startsWith('t4g') || n.instanceType.startsWith('c6g') || n.instanceType.startsWith('m6g') || n.instanceType.startsWith('r6g')) {
        gravitonNodes++;
      }

      const pool = n.nodePool || 'default';
      if (!poolMap[pool]) {
        poolMap[pool] = { hourlyCost: 0, onDemandCost: 0, count: 0, spotCount: 0 };
      }
      poolMap[pool].hourlyCost += n.costPerHour;
      poolMap[pool].onDemandCost += base;
      poolMap[pool].count++;
      if (n.capacityType === 'spot') poolMap[pool].spotCount++;
    });

    const savings = onDemand > actual ? onDemand - actual : 0;
    const savingsPercent = onDemand > 0 ? (savings / onDemand) * 100 : 0;

    return {
      totalHourlyCost: parseFloat(actual.toFixed(4)),
      onDemandBaselineHourly: parseFloat(onDemand.toFixed(4)),
      totalHourlySavings: parseFloat(savings.toFixed(4)),
      savingsPercentage: parseFloat(savingsPercent.toFixed(1)),
      projectedMonthlySpend: parseFloat((actual * 730).toFixed(2)),
      projectedMonthlySavings: parseFloat((savings * 730).toFixed(2)),
      currency: 'USD',
      spotRatio: nodes.length > 0 ? parseFloat((spotNodes / nodes.length).toFixed(2)) : 0,
      gravitonRatio: nodes.length > 0 ? parseFloat((gravitonNodes / nodes.length).toFixed(2)) : 0,
      nodePoolBreakdown: Object.entries(poolMap).map(([name, data]) => ({
        name,
        hourlyCost: parseFloat(data.hourlyCost.toFixed(4)),
        onDemandCost: parseFloat(data.onDemandCost.toFixed(4)),
        nodeCount: data.count,
        spotCount: data.spotCount,
        savingsCost: parseFloat((data.onDemandCost - data.hourlyCost).toFixed(4))
      })),
      timestamp: new Date().toISOString()
    };
  }, [nodes, pricingSummary]);

  // 2. Mock historical trend for Area Chart
  const trendData = useMemo(() => {
    const actual = summary.totalHourlyCost;
    const baseline = summary.onDemandBaselineHourly;

    return [
      { time: '04:00', actual: parseFloat((actual * 0.72).toFixed(3)), baseline: parseFloat((baseline * 0.75).toFixed(3)), savings: parseFloat(((baseline * 0.75) - (actual * 0.72)).toFixed(3)) },
      { time: '06:00', actual: parseFloat((actual * 0.85).toFixed(3)), baseline: parseFloat((baseline * 0.88).toFixed(3)), savings: parseFloat(((baseline * 0.88) - (actual * 0.85)).toFixed(3)) },
      { time: '08:00', actual: parseFloat((actual * 1.15).toFixed(3)), baseline: parseFloat((baseline * 1.18).toFixed(3)), savings: parseFloat(((baseline * 1.18) - (actual * 1.15)).toFixed(3)) },
      { time: '10:00', actual: parseFloat((actual * 1.05).toFixed(3)), baseline: parseFloat((baseline * 1.08).toFixed(3)), savings: parseFloat(((baseline * 1.08) - (actual * 1.05)).toFixed(3)) },
      { time: '12:00', actual: parseFloat((actual * 0.95).toFixed(3)), baseline: parseFloat((baseline * 0.98).toFixed(3)), savings: parseFloat(((baseline * 0.98) - (actual * 0.95)).toFixed(3)) },
      { time: 'Now', actual: actual, baseline: baseline, savings: summary.totalHourlySavings }
    ];
  }, [summary]);

  // 3. NodePool Donut Data
  const donutData = useMemo(() => {
    return summary.nodePoolBreakdown.map((p, idx) => ({
      name: p.name,
      value: p.hourlyCost,
      color: POOL_COLORS[idx % POOL_COLORS.length],
      count: p.nodeCount
    }));
  }, [summary]);

  // 4. Spot Diversification Radar Data
  const radarData = useMemo(() => {
    const familyCounts: Record<string, number> = {
      'c6g (Graviton)': 0,
      'm6g (General)': 0,
      'r6g (Memory)': 0,
      't4g (Burst)': 0,
      'c6i (Intel)': 0,
      'm6i (Intel)': 0,
      'g5 (GPU)': 0
    };

    nodes.forEach(n => {
      const inst = n.instanceType.toLowerCase();
      if (inst.startsWith('c6g') || inst.startsWith('c7g')) familyCounts['c6g (Graviton)']++;
      else if (inst.startsWith('m6g') || inst.startsWith('m7g')) familyCounts['m6g (General)']++;
      else if (inst.startsWith('r6g') || inst.startsWith('r7g')) familyCounts['r6g (Memory)']++;
      else if (inst.startsWith('t4g')) familyCounts['t4g (Burst)']++;
      else if (inst.startsWith('c6i') || inst.startsWith('c5')) familyCounts['c6i (Intel)']++;
      else if (inst.startsWith('m6i') || inst.startsWith('m5')) familyCounts['m6i (Intel)']++;
      else if (inst.startsWith('g5') || inst.startsWith('g4')) familyCounts['g5 (GPU)']++;
    });

    const maxCount = Math.max(1, ...Object.values(familyCounts));
    return Object.entries(familyCounts).map(([family, count]) => ({
      family,
      utilization: Math.round((count / maxCount) * 100),
      rawCount: count
    }));
  }, [nodes]);

  // Calculate Interruption Resilience Score (0 - 100)
  const resilienceScore = useMemo(() => {
    const distinctFamilies = radarData.filter(d => d.rawCount > 0).length;
    const spotNodes = nodes.filter(n => n.capacityType === 'spot').length;
    if (spotNodes === 0) return 100; // All on-demand = 100% resilient to spot interruptions
    const score = Math.min(100, Math.round((distinctFamilies / 4) * 100));
    return score;
  }, [radarData, nodes]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* 1. FinOps Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: '0.75rem',
        padding: '1.25rem 1.5rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1.25rem',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <DollarSign size={14} style={{ color: 'var(--status-ready)' }} />
            Actual Cluster Spend
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            ${summary.totalHourlyCost}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}> /hr</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            ~${summary.projectedMonthlySpend} /mo projected
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <TrendingDown size={14} style={{ color: 'var(--accent-purple)' }} />
            On-Demand Baseline
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            ${summary.onDemandBaselineHourly}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}> /hr</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            If running 100% On-Demand
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Zap size={14} style={{ color: 'var(--status-ready)' }} />
            Active Real-Time Savings
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--status-ready)', marginTop: '0.25rem' }}>
            {summary.savingsPercentage}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--status-ready)', marginTop: '0.15rem', fontWeight: 500 }}>
            Saving ~${summary.projectedMonthlySavings}/mo with Karpenter
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ShieldCheck size={14} style={{ color: 'var(--accent-blue)' }} />
            Spot & Graviton Ratio
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem', display: 'flex', gap: '0.75rem' }}>
            <span style={{ color: 'var(--accent-purple)' }}>{Math.round(summary.spotRatio * 100)}% Spot</span>
            <span style={{ color: 'var(--accent-blue)' }}>{Math.round(summary.gravitonRatio * 100)}% ARM</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            Optimized architecture mix
          </div>
        </div>
      </div>

      {/* 2. Top Charts Row: Cost Trends vs Baseline & NodePool Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
        {/* Cost Savings Area Chart */}
        <div className="panel-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={16} style={{ color: 'var(--status-ready)' }} />
                Hourly Spend vs. On-Demand Baseline
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Green area highlights real-time dollar savings achieved by Karpenter
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--status-ready)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-ready)' }} /> Actual Cost
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--status-pending)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-pending)' }} /> Baseline
              </span>
            </div>
          </div>

          <div style={{ height: 230, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="colorBaseline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#090a0f', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '0.5rem', 
                    fontSize: '0.8rem' 
                  }}
                  formatter={(value: any) => [`$${value}`, '']}
                />
                <Area type="monotone" dataKey="baseline" stroke="#f59e0b" strokeDasharray="4 4" fillOpacity={1} fill="url(#colorBaseline)" name="On-Demand Baseline" />
                <Area type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorActual)" name="Actual Spend" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost Allocation by NodePool Donut */}
        <div className="panel-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={16} style={{ color: 'var(--accent-purple)' }} />
              Cost Allocation by NodePool
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Distribution of compute spend across autoscaling pools
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', height: 230 }}>
            <div style={{ width: '55%', height: '100%', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#090a0f', border: '1px solid var(--border-color)', borderRadius: '0.5rem', fontSize: '0.8rem' }}
                    formatter={(val: any) => [`$${val}/hr`, 'Hourly Cost']}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center KPI */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  ${summary.totalHourlyCost}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total / hr
                </div>
              </div>
            </div>

            {/* Legend & Breakdown */}
            <div style={{ width: '45%', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '0.5rem' }}>
              {donutData.map((pool) => (
                <div 
                  key={pool.name}
                  onClick={() => onSelectNodePool && onSelectNodePool(pool.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    cursor: onSelectNodePool ? 'pointer' : 'default',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    backgroundColor: 'rgba(255,255,255,0.02)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: pool.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {pool.name}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    ${pool.value}/hr
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bottom Row: Node Bin-Packing Efficiency & Spot Resilience Radar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
        {/* Node Bin-Packing Heatmap */}
        <div className="panel-card" style={{ padding: '1.25rem' }}>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Cpu size={16} style={{ color: 'var(--accent-blue)' }} />
                Node Bin-Packing & Allocation Matrix
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Identifies underutilized nodes eligible for Karpenter consolidation
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem' }}>
              <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> &gt;75% Optimal
              </span>
              <span style={{ color: '#ec4899', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ec4899' }} /> &lt;40% Underutilized
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '240px', overflowY: 'auto' }}>
            {nodes.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '2rem' }}>
                No active nodes detected
              </div>
            ) : (
              nodes.map(node => {
                const cpuPercent = node.cpuCapacity > 0 ? Math.round((node.cpuAllocated / node.cpuCapacity) * 100) : 0;
                const memPercent = node.memCapacity > 0 ? Math.round((node.memAllocated / node.memCapacity) * 100) : 0;
                const isUnderutilized = cpuPercent < 40 && memPercent < 40;

                return (
                  <div 
                    key={node.name}
                    style={{
                      background: isUnderutilized ? 'rgba(236, 72, 153, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid ${isUnderutilized ? 'rgba(236, 72, 153, 0.3)' : 'var(--border-color)'}`,
                      borderRadius: '0.5rem',
                      padding: '0.65rem 0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {node.name.split('.')[0]}
                        </span>
                        <span style={{ 
                          fontSize: '0.65rem', 
                          padding: '0.1rem 0.35rem', 
                          borderRadius: '0.2rem', 
                          backgroundColor: node.capacityType === 'spot' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                          color: node.capacityType === 'spot' ? 'var(--accent-purple)' : 'var(--accent-blue)'
                        }}>
                          {node.instanceType}
                        </span>
                      </div>
                      {isUnderutilized && (
                        <span style={{ color: '#ec4899', fontSize: '0.65rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <AlertCircle size={12} /> Consolidation Candidate
                        </span>
                      )}
                    </div>

                    {/* Progress Bars */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.7rem' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>
                          <span>CPU: {node.cpuAllocated} / {node.cpuCapacity}</span>
                          <span style={{ fontWeight: 600 }}>{cpuPercent}%</span>
                        </div>
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: `${cpuPercent}%`, 
                            height: '100%', 
                            background: cpuPercent > 75 ? '#10b981' : cpuPercent < 40 ? '#ec4899' : '#3b82f6' 
                          }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>
                          <span>RAM: {node.memAllocated} / {node.memCapacity}Gi</span>
                          <span style={{ fontWeight: 600 }}>{memPercent}%</span>
                        </div>
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: `${memPercent}%`, 
                            height: '100%', 
                            background: memPercent > 75 ? '#10b981' : memPercent < 40 ? '#ec4899' : '#06b6d4' 
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Spot Resilience & Diversification Radar */}
        <div className="panel-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={16} style={{ color: 'var(--status-ready)' }} />
                Spot Pool Diversification Radar
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Measures spread across instance families to minimize mass eviction risk
              </span>
            </div>
            <div style={{
              backgroundColor: resilienceScore > 70 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${resilienceScore > 70 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
              color: resilienceScore > 70 ? 'var(--status-ready)' : 'var(--status-pending)',
              padding: '0.2rem 0.5rem',
              borderRadius: '0.25rem',
              fontSize: '0.75rem',
              fontWeight: 700
            }}>
              {resilienceScore}/100 Resilience
            </div>
          </div>

          <div style={{ height: 230, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="75%">
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="family" stroke="var(--text-muted)" fontSize={10} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="rgba(255,255,255,0.06)" tick={false} />
                <Radar name="Utilization" dataKey="utilization" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#090a0f', border: '1px solid var(--border-color)', borderRadius: '0.5rem', fontSize: '0.8rem' }}
                  formatter={(val: any, _: any, item: any) => [`${item.payload.rawCount} active node(s)`, 'Fleet Count']}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
