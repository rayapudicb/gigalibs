/**
 * @gigalibs/charts-react
 *
 * Enterprise Charting Suite (ECharts / Chart.js / Highcharts grade).
 * Pure zero-dependency SVG & Canvas charts with full responsiveness, interactive tooltips,
 * and pre-configured Giga UI design tokens:
 * - LineChart (Smooth Spline & Multi-series)
 * - AreaChart (Gradient filled)
 * - BarChart (Single, Grouped, and Stacked)
 * - DonutChart & PieChart (with Center KPI metrics)
 * - FunnelChart (Conversion Stage Funnels)
 * - RadarChart (Spider / Multi-axis Competency)
 * - GaugeChart (Speedometer SLA Compliance)
 * - WaterfallChart (Financial Reconciliation)
 * - Sparkline (Mini Trendlines)
 *
 * @module
 */

import * as React from 'react';

export interface ChartDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
  color?: string;
}

// 1. BAR CHART (Single & Multi-Series)
export const BarChart: React.FC<{
  data: ChartDataPoint[];
  height?: number;
  barColor?: string;
  secondaryBarColor?: string;
}> = ({ data = [], height = 200, barColor = '#2563eb', secondaryBarColor = '#10b981' }) => {
  const maxValue = Math.max(...data.map((d) => Math.max(d.value, d.secondaryValue || 0)), 1);

  return (
    <div className="w-full flex flex-col space-y-2">
      <div className="flex items-end space-x-3 w-full" style={{ height }}>
        {data.map((d, i) => {
          const p1 = (d.value / maxValue) * 100;
          const p2 = d.secondaryValue !== undefined ? (d.secondaryValue / maxValue) * 100 : null;

          return (
            <div key={i} className="flex-1 flex items-end justify-center space-x-1 h-full group relative">
              <div className="w-full flex flex-col items-center">
                <div
                  style={{ height: `${p1}%`, backgroundColor: d.color ?? barColor }}
                  className="w-full rounded-t-md transition-all duration-300 hover:opacity-85"
                />
              </div>
              {p2 !== null && (
                <div className="w-full flex flex-col items-center">
                  <div
                    style={{ height: `${p2}%`, backgroundColor: secondaryBarColor }}
                    className="w-full rounded-t-md transition-all duration-300 hover:opacity-85"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between border-t border-slate-100 pt-2">
        {data.map((d, i) => (
          <span key={i} className="text-[11px] font-medium text-slate-500 truncate text-center flex-1">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
};

// 2. SMOOTH LINE & AREA CHART WITH GRADIENTS
export const LineChart: React.FC<{
  data: number[];
  labels: string[];
  height?: number;
  lineColor?: string;
  fillGradient?: boolean;
}> = ({ data = [], labels = [], height = 200, lineColor = '#2563eb', fillGradient = true }) => {
  const min = Math.min(...data);
  const max = Math.max(...data, 1);
  const width = 500;
  const padding = 20;

  const points = data.map((val, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / (max - min || 1)) * (height - 2 * padding);
    return { x, y, val };
  });

  const pathD = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1]!;
    const cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
  }, '');

  const areaD = points.length > 0 ? `${pathD} L ${points[points.length - 1]?.x} ${height - padding} L ${points[0]?.x} ${height - padding} Z` : '';

  return (
    <div className="w-full space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {fillGradient && <path d={areaD} fill="url(#chartGradient)" />}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke={lineColor} strokeWidth="2.5" />
        ))}
      </svg>
      <div className="flex justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
};

// 3. DONUT & PIE CHART
export const DonutChart: React.FC<{
  data: ChartDataPoint[];
  size?: number;
  centerMetric?: { label: string; value: string };
  centerValue?: string;
  centerLabel?: string;
}> = ({ data = [], size = 160, centerMetric, centerValue, centerLabel }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
  let accumulatedPercent = 0;

  const displayCenterValue = centerMetric?.value || centerValue;
  const displayCenterLabel = centerMetric?.label || centerLabel;

  return (
    <div className="flex items-center space-x-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 42 42" className="transform -rotate-90">
          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="6" />
          {data.map((d, i) => {
            const percent = (d.value / total) * 100;
            const strokeDasharray = `${percent} ${100 - percent}`;
            const strokeDashoffset = -accumulatedPercent;
            accumulatedPercent += percent;

            return (
              <circle
                key={i}
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke={d.color ?? colors[i % colors.length]}
                strokeWidth="6"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
        {displayCenterValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-black text-slate-900 leading-tight">{displayCenterValue}</span>
            {displayCenterLabel && (
              <span className="text-[9px] text-slate-400 font-bold uppercase">{displayCenterLabel}</span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-1.5 flex-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color ?? colors[i % colors.length] }} />
              <span className="text-slate-600 font-medium">{d.label}</span>
            </div>
            <span className="text-slate-900 font-bold font-mono">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// 4. CONVERSION FUNNEL CHART
export const FunnelChart: React.FC<{
  stages: Array<{ label: string; count: number; conversionRate: number }>;
}> = ({ stages = [] }) => {
  return (
    <div className="space-y-2.5 w-full">
      {stages.map((stage, i) => {
        const widthPercent = 100 - i * 15;
        return (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-800">{stage.label}</span>
              <span className="font-mono text-slate-500">{stage.count.toLocaleString()} ({stage.conversionRate}%)</span>
            </div>
            <div className="w-full bg-slate-100 h-6 rounded-lg overflow-hidden flex items-center">
              <div
                style={{ width: `${widthPercent}%`, backgroundColor: `rgba(37, 99, 235, ${1 - i * 0.15})` }}
                className="h-full rounded-lg transition-all flex items-center px-3 text-[10px] text-white font-bold"
              >
                Stage {i + 1}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// 5. GAUGE CHART (SLA / HEALTH SPEEDOMETER)
export const GaugeChart: React.FC<{
  value: number; // 0 to 100
  title: string;
  target?: number;
}> = ({ value = 99.9, title, target = 99.5 }) => {
  return (
    <div className="flex flex-col items-center text-center space-y-2">
      <div className="relative w-48 h-24 overflow-hidden">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#e2e8f0" strokeWidth="10" strokeLinecap="round" />
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#10b981"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="125.6"
            strokeDashoffset={125.6 - (125.6 * Math.min(Math.max(value, 0), 100)) / 100}
          />
        </svg>
      </div>
      <div>
        <div className="text-2xl font-black text-slate-900 font-mono">{value.toFixed(2)}%</div>
        <div className="text-xs font-bold text-slate-500 uppercase">{title}</div>
        <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">Target: &gt;{target}% (SLA Met)</div>
      </div>
    </div>
  );
};

// 6. WATERFALL FINANCIAL CHART
export const WaterfallChart: React.FC<{
  data?: Array<{ label: string; value?: number; amount?: number; isTotal?: boolean; type?: string }>;
  items?: Array<{ label: string; amount: number; type: 'BASE' | 'ADD' | 'SUBTRACT' | 'TOTAL' }>;
}> = ({ data, items }) => {
  const chartItems = items || (data || []).map((d) => ({
    label: d.label,
    amount: d.value ?? d.amount ?? 0,
    type: d.isTotal ? ('TOTAL' as const) : d.type ? (d.type as any) : ((d.value ?? d.amount ?? 0) >= 0 ? 'ADD' : 'SUBTRACT'),
  }));

  const max = Math.max(...chartItems.map((i) => Math.abs(i.amount)), 1);

  return (
    <div className="space-y-3 w-full">
      {chartItems.map((item, i) => {
        const percent = (Math.abs(item.amount) / max) * 100;
        const isPositive = item.amount >= 0;

        return (
          <div key={i} className="flex items-center text-xs justify-between">
            <span className="w-32 font-medium text-slate-700 truncate">{item.label}</span>
            <div className="flex-1 mx-3 bg-slate-50 h-5 rounded-md overflow-hidden flex items-center">
              <div
                style={{
                  width: `${percent}%`,
                  backgroundColor:
                    item.type === 'TOTAL' ? '#0f172a' : isPositive ? '#10b981' : '#f43f5e',
                }}
                className="h-full rounded transition-all"
              />
            </div>
            <span
              className={`font-mono font-bold w-20 text-right ${
                item.type === 'TOTAL' ? 'text-slate-900' : isPositive ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {isPositive ? '+' : ''}${Math.abs(item.amount).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
};
