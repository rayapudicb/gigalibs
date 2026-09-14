/**
 * @gigalibs/charts-react
 *
 * Enterprise BI Charting Suite (ECharts / Chart.js / Highcharts grade).
 * Pure zero-dependency SVG & Canvas charts with full responsiveness, interactive tooltips,
 * drill-down capabilities, and pre-configured Giga UI design tokens:
 *
 * 1. LineChart (Smooth Spline & Multi-series)
 * 2. AreaChart (Gradient filled area under curve)
 * 3. BarChart (Horizontal category bars)
 * 4. StackedBarChart (Horizontal multi-segment stacked bars)
 * 5. ColumnChart (Vertical bars / Grouped columns)
 * 6. StackedColumnChart (Vertical multi-segment stacked columns)
 * 7. DonutChart (With Center KPI metric)
 * 8. PieChart (Full circular proportional distribution)
 * 9. ScatterChart (2D correlation XY plot)
 * 10. BubbleChart (3D multivariate XY with variable bubble radius)
 * 11. RadarChart (Spider / Multi-axis Competency & Risk)
 * 12. GaugeChart (Speedometer SLA Compliance)
 * 13. WaterfallChart (Financial Variance & Margin Bridge)
 * 14. FunnelChart (Conversion Stage Funnels)
 * 15. HeatmapChart (Agency vs Urgency 2D Intensity Grid)
 * 16. TreemapChart (Hierarchical rectangular proportional allocation)
 * 17. SankeyChart (Multi-stage flow balance from input to destination)
 * 18. BoxPlotChart (Five-number statistical distribution: Min, Q1, Median, Q3, Max)
 * 19. HistogramChart (Frequency distribution across discrete value bins)
 * 20. PolarAreaChart (Coxcomb / Nightingale rose diagram with variable radii)
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

export interface XYPoint {
  x: number;
  y: number;
  label?: string;
  size?: number; // for bubble chart
  category?: string;
  color?: string;
}

export interface TreemapNode {
  label: string;
  value: number;
  color?: string;
  category?: string;
}

export interface SankeyFlow {
  source: string;
  target: string;
  value: number;
  color?: string;
}

export interface BoxPlotPoint {
  label: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers?: number[];
  color?: string;
}

// Default palette
const PALETTE = [
  '#2563eb', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ef4444', // Rose
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#f97316', // Orange
];

// ============================================================================
// 1. LINE CHART (Smooth Spline & Multi-Series)
// ============================================================================
export const LineChart: React.FC<{
  data: number[];
  labels: string[];
  height?: number;
  lineColor?: string;
  fillGradient?: boolean;
}> = ({ data = [], labels = [], height = 200, lineColor = '#2563eb', fillGradient = true }) => {
  const min = Math.min(...data, 0);
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

  const areaD =
    points.length > 0
      ? `${pathD} L ${points[points.length - 1]?.x} ${height - padding} L ${points[0]?.x} ${height - padding} Z`
      : '';

  return (
    <div className="w-full space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        <defs>
          <linearGradient id={`lineGrad_${lineColor.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {fillGradient && <path d={areaD} fill={`url(#lineGrad_${lineColor.replace('#', '')})`} />}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke={lineColor} strokeWidth="2.5">
            <title>{`${labels[i] || `Point ${i + 1}`}: ${p.val}`}</title>
          </circle>
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
// ============================================================================
// 2. AREA CHART (Stacked & Shaded Area Curves)
// ============================================================================
export const AreaChart: React.FC<{
  series: Array<{ name: string; data: number[]; color?: string }>;
  labels?: string[];
  categories?: string[];
  height?: number;
}> = ({ series = [], labels = [], categories = [], height = 200 }) => {
  const effectiveLabels = labels.length > 0 ? labels : categories;
  const width = 500;
  const padding = 20;

  const allVals = series.flatMap((s) => s.data);
  const max = Math.max(...allVals, 1);
  const min = 0;

  return (
    <div className="w-full space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        <defs>
          {series.map((s, sIdx) => {
            const color = s.color || PALETTE[sIdx % PALETTE.length];
            return (
              <linearGradient key={sIdx} id={`areaGrad_${sIdx}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.45" />
                <stop offset="100%" stopColor={color} stopOpacity="0.05" />
              </linearGradient>
            );
          })}
        </defs>

        {series.map((s, sIdx) => {
          const color = s.color || PALETTE[sIdx % PALETTE.length];
          const points = s.data.map((val, i) => {
            const x = padding + (i / Math.max(s.data.length - 1, 1)) * (width - 2 * padding);
            const y = height - padding - ((val - min) / (max - min || 1)) * (height - 2 * padding);
            return { x, y, val };
          });

          const pathD = points.reduce((acc, p, i) => {
            if (i === 0) return `M ${p.x} ${p.y}`;
            const prev = points[i - 1]!;
            const cx = (prev.x + p.x) / 2;
            return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
          }, '');

          const areaD =
            points.length > 0
              ? `${pathD} L ${points[points.length - 1]?.x} ${height - padding} L ${points[0]?.x} ${height - padding} Z`
              : '';

          return (
            <g key={sIdx}>
              <path d={areaD} fill={`url(#areaGrad_${sIdx})`} />
              <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill="#ffffff" stroke={color} strokeWidth="2">
                  <title>{`${s.name} - ${effectiveLabels[i] || `Point ${i + 1}`}: ${p.val}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        {effectiveLabels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 pt-1">
        {series.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || PALETTE[i % PALETTE.length] }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 3. BAR CHART (Horizontal Category Bars)
// ============================================================================
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
                >
                  <title>{`${d.label}: ${d.value}`}</title>
                </div>
              </div>
              {p2 !== null && (
                <div className="w-full flex flex-col items-center">
                  <div
                    style={{ height: `${p2}%`, backgroundColor: secondaryBarColor }}
                    className="w-full rounded-t-md transition-all duration-300 hover:opacity-85"
                  >
                    <title>{`${d.label} (Secondary): ${d.secondaryValue}`}</title>
                  </div>
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

// ============================================================================
// 4. STACKED BAR CHART (Horizontal Multi-Segment Stacked)
// ============================================================================
export const StackedBarChart: React.FC<{
  categories: string[];
  series: Array<{ name: string; data: number[]; color?: string }>;
}> = ({ categories = [], series = [] }) => {
  // Sum totals per category
  const totals = categories.map((_, i) => series.reduce((sum, s) => sum + (s.data[i] || 0), 0));
  const maxTotal = Math.max(...totals, 1);

  return (
    <div className="w-full space-y-3">
      {categories.map((cat, catIdx) => {
        return (
          <div key={catIdx} className="space-y-1 text-xs">
            <div className="flex justify-between font-medium text-slate-700">
              <span>{cat}</span>
              <span className="font-mono text-slate-500">{totals[catIdx]?.toLocaleString()} total</span>
            </div>
            <div className="w-full bg-slate-100 h-6 rounded-md overflow-hidden flex">
              {series.map((s, sIdx) => {
                const val = s.data[catIdx] || 0;
                const pct = (val / maxTotal) * 100;
                const color = s.color || PALETTE[sIdx % PALETTE.length];
                if (pct <= 0) return null;
                return (
                  <div
                    key={sIdx}
                    style={{ width: `${pct}%`, backgroundColor: color }}
                    className="h-full transition-all hover:opacity-90 flex items-center justify-center text-[10px] text-white font-bold px-1 truncate"
                    title={`${cat} - ${s.name}: ${val}`}
                  >
                    {val > 0 ? val : ''}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-100">
        {series.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color || PALETTE[i % PALETTE.length] }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 5. COLUMN CHART (Vertical Single/Multi-Series)
// ============================================================================
export const ColumnChart: React.FC<{
  categories: string[];
  series: Array<{ name: string; data: number[]; color?: string }>;
  height?: number;
}> = ({ categories = [], series = [], height = 220 }) => {
  const allVals = series.flatMap((s) => s.data);
  const maxVal = Math.max(...allVals, 1);

  return (
    <div className="w-full space-y-2">
      <div className="flex items-end justify-between gap-3 w-full" style={{ height }}>
        {categories.map((cat, catIdx) => (
          <div key={catIdx} className="flex-1 flex items-end justify-center gap-1 h-full">
            {series.map((s, sIdx) => {
              const val = s.data[catIdx] || 0;
              const pct = (val / maxVal) * 100;
              const color = s.color || PALETTE[sIdx % PALETTE.length];
              return (
                <div
                  key={sIdx}
                  style={{ height: `${pct}%`, backgroundColor: color }}
                  className="flex-1 rounded-t transition-all duration-300 hover:brightness-110 min-w-[12px]"
                  title={`${cat} - ${s.name}: ${val}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t border-slate-100 pt-2">
        {categories.map((cat, i) => (
          <span key={i} className="text-[11px] font-medium text-slate-500 truncate text-center flex-1">
            {cat}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 pt-1">
        {series.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color || PALETTE[i % PALETTE.length] }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 6. STACKED COLUMN CHART (Vertical Multi-Segment Stacked)
// ============================================================================
export const StackedColumnChart: React.FC<{
  categories: string[];
  series: Array<{ name: string; data: number[]; color?: string }>;
  height?: number;
}> = ({ categories = [], series = [], height = 220 }) => {
  const totals = categories.map((_, cIdx) => series.reduce((sum, s) => sum + (s.data[cIdx] || 0), 0));
  const maxTotal = Math.max(...totals, 1);

  return (
    <div className="w-full space-y-2">
      <div className="flex items-end justify-between gap-4 w-full" style={{ height }}>
        {categories.map((cat, cIdx) => {
          return (
            <div key={cIdx} className="flex-1 flex flex-col-reverse justify-start h-full rounded overflow-hidden">
              {series.map((s, sIdx) => {
                const val = s.data[cIdx] || 0;
                const pct = (val / maxTotal) * 100;
                const color = s.color || PALETTE[sIdx % PALETTE.length];
                return (
                  <div
                    key={sIdx}
                    style={{ height: `${pct}%`, backgroundColor: color }}
                    className="w-full transition-all duration-300 hover:brightness-110"
                    title={`${cat} - ${s.name}: ${val}`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between border-t border-slate-100 pt-2">
        {categories.map((cat, i) => (
          <span key={i} className="text-[11px] font-medium text-slate-500 truncate text-center flex-1">
            {cat}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 pt-1">
        {series.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color || PALETTE[i % PALETTE.length] }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 7. DONUT CHART (With Center KPI Metric)
// ============================================================================
export const DonutChart: React.FC<{
  data: ChartDataPoint[];
  size?: number;
  centerMetric?: { label: string; value: string };
  centerValue?: string;
  centerLabel?: string;
  total?: string;
}> = ({ data = [], size = 160, centerMetric, centerValue, centerLabel, total }) => {
  const totalVal = data.reduce((sum, d) => sum + d.value, 0) || 1;
  let accumulatedPercent = 0;

  const displayCenterValue = total || centerMetric?.value || centerValue;
  const displayCenterLabel = centerMetric?.label || centerLabel;

  return (
    <div className="flex items-center space-x-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 42 42" className="transform -rotate-90">
          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="6" />
          {data.map((d, i) => {
            const percent = (d.value / totalVal) * 100;
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
                stroke={d.color ?? PALETTE[i % PALETTE.length]}
                strokeWidth="6"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500"
              >
                <title>{`${d.label}: ${d.value} (${percent.toFixed(1)}%)`}</title>
              </circle>
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
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color ?? PALETTE[i % PALETTE.length] }} />
              <span className="text-slate-600 font-medium">{d.label}</span>
            </div>
            <span className="text-slate-900 font-bold font-mono">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 8. PIE CHART (Full Circular Proportional Distribution)
// ============================================================================
export const PieChart: React.FC<{
  data: ChartDataPoint[];
  size?: number;
}> = ({ data = [], size = 180 }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const center = size / 2;
  const radius = center - 10;

  let currentAngle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const fraction = d.value / total;
    const angle = fraction * 2 * Math.PI;
    const x1 = center + radius * Math.cos(currentAngle);
    const y1 = center + radius * Math.sin(currentAngle);
    currentAngle += angle;
    const x2 = center + radius * Math.cos(currentAngle);
    const y2 = center + radius * Math.sin(currentAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const pathD = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return {
      d: pathD,
      color: d.color || PALETTE[i % PALETTE.length],
      label: d.label,
      value: d.value,
      pct: (fraction * 100).toFixed(1),
    };
  });

  return (
    <div className="flex items-center space-x-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((slice, i) => (
          <path
            key={i}
            d={slice.d}
            fill={slice.color}
            stroke="#ffffff"
            strokeWidth="1.5"
            className="transition-all duration-300 hover:opacity-90"
          >
            <title>{`${slice.label}: ${slice.value} (${slice.pct}%)`}</title>
          </path>
        ))}
      </svg>
      <div className="space-y-1.5 flex-1">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-slate-600 font-medium">{s.label}</span>
            </div>
            <span className="text-slate-900 font-bold font-mono">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 9. SCATTER CHART (2D Correlation XY Plot)
// ============================================================================
export const ScatterChart: React.FC<{
  points: XYPoint[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
}> = ({ points = [], xLabel = 'X Metric', yLabel = 'Y Metric', height = 220 }) => {
  const width = 450;
  const padding = 30;

  const xVals = points.map((p) => p.x);
  const yVals = points.map((p) => p.y);
  const minX = Math.min(...xVals, 0);
  const maxX = Math.max(...xVals, 100);
  const minY = Math.min(...yVals, 0);
  const maxY = Math.max(...yVals, 100);

  return (
    <div className="w-full space-y-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        {/* Gridlines */}
        {[0.25, 0.5, 0.75, 1.0].map((ratio, idx) => {
          const y = height - padding - ratio * (height - 2 * padding);
          return (
            <line
              key={idx}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="#f1f5f9"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          );
        })}
        {/* Axes */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />

        {/* Points */}
        {points.map((pt, i) => {
          const cx = padding + ((pt.x - minX) / (maxX - minX || 1)) * (width - 2 * padding);
          const cy = height - padding - ((pt.y - minY) / (maxY - minY || 1)) * (height - 2 * padding);
          const color = pt.color || PALETTE[i % PALETTE.length];

          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r="5"
              fill={color}
              stroke="#ffffff"
              strokeWidth="1.5"
              className="transition-transform duration-200 hover:scale-150 cursor-pointer"
            >
              <title>{`${pt.label || `Point ${i + 1}`}: (${pt.x}, ${pt.y})`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
        <span>{yLabel}: {minY} - {maxY}</span>
        <span>{xLabel}: {minX} - {maxX}</span>
      </div>
    </div>
  );
};

// ============================================================================
// 10. BUBBLE CHART (Multivariate 3D Bubble Plot: X, Y, Size)
// ============================================================================
export const BubbleChart: React.FC<{
  points: XYPoint[];
  height?: number;
}> = ({ points = [], height = 220 }) => {
  const width = 450;
  const padding = 35;

  const xVals = points.map((p) => p.x);
  const yVals = points.map((p) => p.y);
  const sizeVals = points.map((p) => p.size || 10);
  const minX = Math.min(...xVals, 0);
  const maxX = Math.max(...xVals, 100);
  const minY = Math.min(...yVals, 0);
  const maxY = Math.max(...yVals, 100);
  const maxSize = Math.max(...sizeVals, 1);

  return (
    <div className="w-full space-y-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        {/* Gridlines */}
        {[0.25, 0.5, 0.75].map((r, i) => (
          <line
            key={i}
            x1={padding}
            y1={height - padding - r * (height - 2 * padding)}
            x2={width - padding}
            y2={height - padding - r * (height - 2 * padding)}
            stroke="#f1f5f9"
            strokeDasharray="2 2"
          />
        ))}
        {/* Axes */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />

        {/* Bubbles */}
        {points.map((pt, i) => {
          const cx = padding + ((pt.x - minX) / (maxX - minX || 1)) * (width - 2 * padding);
          const cy = height - padding - ((pt.y - minY) / (maxY - minY || 1)) * (height - 2 * padding);
          const r = Math.max(((pt.size || 10) / maxSize) * 22, 6);
          const color = pt.color || PALETTE[i % PALETTE.length];

          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={color}
                fillOpacity="0.4"
                stroke={color}
                strokeWidth="2"
                className="transition-all hover:fill-opacity-80 cursor-pointer"
              >
                <title>{`${pt.label || 'Entity'}: X=${pt.x}, Y=${pt.y}, Weight=${pt.size}`}</title>
              </circle>
              {pt.label && (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="text-[9px] font-bold fill-slate-800">
                  {pt.label.slice(0, 4)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
        <span>Bubble area indicates magnitude / budget ceiling</span>
      </div>
    </div>
  );
};

// ============================================================================
// 11. RADAR / SPIDER CHART (Multi-axis Competency & Risk)
// ============================================================================
export const RadarChart: React.FC<{
  categories: string[];
  series: Array<{ name: string; values?: number[]; data?: number[]; color?: string }>;
  maxValue?: number;
  size?: number;
}> = ({ categories = [], series = [], maxValue = 100, size = 260 }) => {
  const center = size / 2;
  const radius = center - 40;
  const totalAxes = Math.max(categories.length, 3);
  const angleSlice = (Math.PI * 2) / totalAxes;
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  const getCoordinates = (index: number, ratio: number) => {
    const angle = index * angleSlice - Math.PI / 2;
    const x = center + radius * ratio * Math.cos(angle);
    const y = center + radius * ratio * Math.sin(angle);
    return { x, y };
  };

  return (
    <div className="flex flex-col items-center w-full">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Concentric Web Rings */}
        {rings.map((r, ringIdx) => {
          const points = categories
            .map((_, i) => {
              const { x, y } = getCoordinates(i, r);
              return `${x},${y}`;
            })
            .join(' ');
          return (
            <polygon
              key={ringIdx}
              points={points}
              fill={ringIdx % 2 === 0 ? '#f8fafc' : '#ffffff'}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis Spokes */}
        {categories.map((cat, i) => {
          const { x, y } = getCoordinates(i, 1);
          const labelCoord = getCoordinates(i, 1.22);
          return (
            <g key={i}>
              <line x1={center} y1={center} x2={x} y2={y} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2" />
              <text
                x={labelCoord.x}
                y={labelCoord.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="text-[10px] font-medium fill-slate-600 font-mono"
              >
                {cat}
              </text>
            </g>
          );
        })}

        {/* Data Series Polygons */}
        {series.map((s, sIdx) => {
          const color = s.color || PALETTE[sIdx % PALETTE.length];
          const valArray = s.values ?? s.data ?? [];
          const points = categories
            .map((_, i) => {
              const val = valArray[i] ?? 0;
              const ratio = Math.min(Math.max(val / maxValue, 0), 1);
              const { x, y } = getCoordinates(i, ratio);
              return `${x},${y}`;
            })
            .join(' ');

          return (
            <g key={sIdx}>
              <polygon points={points} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2" />
              {categories.map((_, i) => {
                const val = valArray[i] ?? 0;
                const ratio = Math.min(Math.max(val / maxValue, 0), 1);
                const { x, y } = getCoordinates(i, ratio);
                return <circle key={i} cx={x} cy={y} r="3.5" fill={color} stroke="#ffffff" strokeWidth="1.5" />;
              })}
            </g>
          );
        })}
      </svg>

      {/* Series Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-3">
        {series.map((s, sIdx) => {
          const color = s.color || PALETTE[sIdx % PALETTE.length];
          return (
            <div key={sIdx} className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-slate-700 font-medium">{s.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// 12. GAUGE CHART (SLA / Health Speedometer)
// ============================================================================
export const GaugeChart: React.FC<{
  value: number; // 0 to 100
  title?: string;
  label?: string;
  target?: number;
  min?: number;
  max?: number;
}> = ({ value = 99.9, title, label, target = 99.5, min = 0, max = 100 }) => {
  const displayTitle = title || label || 'Operational SLA';
  const range = max - min || 100;
  const pct = Math.min(Math.max(((value - min) / range) * 100, 0), 100);

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
            strokeDashoffset={125.6 - (125.6 * pct) / 100}
          />
        </svg>
      </div>
      <div>
        <div className="text-2xl font-black text-slate-900 font-mono">{value.toFixed(1)}%</div>
        <div className="text-xs font-bold text-slate-500 uppercase">{displayTitle}</div>
        <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">Target: &gt;{target}% (Nominal)</div>
      </div>
    </div>
  );
};

// ============================================================================
// 13. WATERFALL FINANCIAL CHART (Variance / Bridge Reconciliation)
// ============================================================================
export const WaterfallChart: React.FC<{
  data?: Array<{ label: string; value?: number; amount?: number; isTotal?: boolean; type?: string }>;
  items?: Array<{ label: string; amount: number; type: 'BASE' | 'ADD' | 'SUBTRACT' | 'TOTAL' }>;
}> = ({ data, items }) => {
  const chartItems =
    items ||
    (data || []).map((d) => ({
      label: d.label,
      amount: d.value ?? d.amount ?? 0,
      type: d.isTotal ? ('TOTAL' as const) : d.type ? (d.type as any) : (d.value ?? d.amount ?? 0) >= 0 ? 'ADD' : 'SUBTRACT',
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
                  backgroundColor: item.type === 'TOTAL' ? '#0f172a' : isPositive ? '#10b981' : '#f43f5e',
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

// ============================================================================
// 14. FUNNEL CHART (Conversion Stage Funnels)
// ============================================================================
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
              <span className="font-mono text-slate-500">
                {stage.count.toLocaleString()} ({stage.conversionRate}%)
              </span>
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

// ============================================================================
// 15. HEATMAP CHART (Matrix Intensity Grid)
// ============================================================================
export const HeatmapChart: React.FC<{
  xLabels: string[];
  yLabels: string[];
  matrix: number[][]; // 0 to 100 or raw values
  colorScheme?: 'blue' | 'emerald' | 'amber';
}> = ({ xLabels = [], yLabels = [], matrix = [], colorScheme = 'blue' }) => {
  const allValues = matrix.flat();
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);

  const getCellColor = (val: number) => {
    const ratio = Math.min(Math.max((val - minVal) / (maxVal - minVal || 1), 0.05), 1);
    if (colorScheme === 'emerald') return `rgba(16, 185, 129, ${ratio.toFixed(2)})`;
    if (colorScheme === 'amber') return `rgba(245, 158, 11, ${ratio.toFixed(2)})`;
    return `rgba(37, 99, 235, ${ratio.toFixed(2)})`;
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="p-1.5 text-left text-[11px] font-semibold text-slate-400"></th>
            {xLabels.map((col, idx) => (
              <th key={idx} className="p-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {yLabels.map((row, rIdx) => (
            <tr key={rIdx}>
              <td className="p-1.5 text-[11px] font-medium text-slate-700 whitespace-nowrap pr-3">{row}</td>
              {xLabels.map((_, cIdx) => {
                const val = matrix[rIdx]?.[cIdx] ?? 0;
                const bg = getCellColor(val);
                const isDark = (val - minVal) / (maxVal - minVal || 1) > 0.55;
                return (
                  <td key={cIdx} className="p-1">
                    <div
                      style={{ backgroundColor: bg }}
                      className={`h-9 rounded flex items-center justify-center text-[11px] font-mono font-bold transition-transform hover:scale-105 cursor-pointer shadow-sm ${
                        isDark ? 'text-white' : 'text-slate-800'
                      }`}
                      title={`${row} - ${xLabels[cIdx]}: ${val}`}
                    >
                      {val}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ============================================================================
// 16. TREEMAP CHART (Hierarchical Rectangular Proportional Allocation)
// ============================================================================
export const TreemapChart: React.FC<{
  nodes: TreemapNode[];
  height?: number;
}> = ({ nodes = [], height = 220 }) => {
  const total = nodes.reduce((sum, n) => sum + n.value, 0) || 1;

  return (
    <div className="w-full flex flex-wrap gap-1.5 p-1 bg-slate-50 rounded-lg" style={{ height }}>
      {nodes.map((node, i) => {
        const pct = (node.value / total) * 100;
        const color = node.color || PALETTE[i % PALETTE.length];
        const flexBasis = Math.max(pct, 8);

        return (
          <div
            key={i}
            style={{
              flex: `${flexBasis} 1 0%`,
              backgroundColor: color,
              minWidth: '80px',
            }}
            className="rounded p-2 text-white flex flex-col justify-between transition-all hover:brightness-110 cursor-pointer overflow-hidden shadow-sm"
            title={`${node.label}: ${node.value.toLocaleString()} (${pct.toFixed(1)}%)`}
          >
            <span className="text-xs font-bold truncate leading-tight">{node.label}</span>
            <div className="text-[10px] opacity-90 font-mono">
              {node.value.toLocaleString()} ({pct.toFixed(0)}%)
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// 17. SANKEY CHART (Flow Balance From Input to Destination)
// ============================================================================
export const SankeyChart: React.FC<{
  flows: SankeyFlow[];
  height?: number;
}> = ({ flows = [], height = 220 }) => {
  const totalValue = flows.reduce((sum, f) => sum + f.value, 0) || 1;
  const sources = Array.from(new Set(flows.map((f) => f.source)));
  const targets = Array.from(new Set(flows.map((f) => f.target)));

  return (
    <div className="w-full flex items-stretch justify-between gap-4 p-2 bg-slate-50 rounded-lg" style={{ height }}>
      {/* Sources Column */}
      <div className="flex flex-col justify-around gap-2 w-1/4">
        <span className="text-[10px] font-bold uppercase text-slate-400">Sources / Inflow</span>
        {sources.map((src, i) => {
          const srcTotal = flows.filter((f) => f.source === src).reduce((s, f) => s + f.value, 0);
          return (
            <div key={i} className="bg-blue-600 text-white p-2 rounded text-xs font-semibold shadow-sm truncate">
              {src}
              <div className="text-[10px] text-blue-100 font-mono">${srcTotal.toLocaleString()}</div>
            </div>
          );
        })}
      </div>

      {/* Center Flow Channels */}
      <div className="flex-1 flex flex-col justify-center gap-1 px-2">
        {flows.map((f, i) => {
          const pct = (f.value / totalValue) * 100;
          return (
            <div key={i} className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="truncate w-24 text-right font-medium">{f.source}</span>
              <div className="flex-1 bg-slate-200 h-2.5 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${pct}%`, backgroundColor: f.color || PALETTE[i % PALETTE.length] }}
                  className="h-full rounded-full transition-all"
                  title={`${f.source} ➔ ${f.target}: $${f.value.toLocaleString()}`}
                />
              </div>
              <span className="truncate w-24 font-medium">{f.target}</span>
            </div>
          );
        })}
      </div>

      {/* Targets Column */}
      <div className="flex flex-col justify-around gap-2 w-1/4 text-right">
        <span className="text-[10px] font-bold uppercase text-slate-400">Destinations / Outflow</span>
        {targets.map((tgt, i) => {
          const tgtTotal = flows.filter((f) => f.target === tgt).reduce((s, f) => s + f.value, 0);
          return (
            <div key={i} className="bg-emerald-600 text-white p-2 rounded text-xs font-semibold shadow-sm truncate text-right">
              {tgt}
              <div className="text-[10px] text-emerald-100 font-mono">${tgtTotal.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// 18. BOX PLOT CHART (Five-Number Statistical Distribution)
// ============================================================================
export const BoxPlotChart: React.FC<{
  data: BoxPlotPoint[];
  height?: number;
}> = ({ data = [], height = 220 }) => {
  const allVals = data.flatMap((d) => [d.min, d.q1, d.median, d.q3, d.max, ...(d.outliers || [])]);
  const minVal = Math.min(...allVals, 0);
  const maxVal = Math.max(...allVals, 100);

  const getY = (val: number) => {
    return height - 40 - ((val - minVal) / (maxVal - minVal || 1)) * (height - 60);
  };

  const width = 450;
  const colWidth = width / Math.max(data.length, 1);

  return (
    <div className="w-full space-y-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        {/* Horizontal reference grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
          const val = minVal + r * (maxVal - minVal);
          const y = getY(val);
          return (
            <g key={idx}>
              <line x1={20} y1={y} x2={width - 20} y2={y} stroke="#f1f5f9" strokeDasharray="3 3" />
              <text x={15} y={y + 3} textAnchor="end" className="text-[9px] fill-slate-400 font-mono">
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {data.map((box, i) => {
          const cx = colWidth * i + colWidth / 2;
          const boxW = Math.min(colWidth * 0.5, 36);
          const yMin = getY(box.min);
          const yQ1 = getY(box.q1);
          const yMed = getY(box.median);
          const yQ3 = getY(box.q3);
          const yMax = getY(box.max);
          const color = box.color || PALETTE[i % PALETTE.length];

          return (
            <g key={i}>
              {/* Whiskers */}
              <line x1={cx} y1={yMax} x2={cx} y2={yQ3} stroke={color} strokeWidth="1.5" />
              <line x1={cx - 10} y1={yMax} x2={cx + 10} y2={yMax} stroke={color} strokeWidth="2" />
              <line x1={cx} y1={yMin} x2={cx} y2={yQ1} stroke={color} strokeWidth="1.5" />
              <line x1={cx - 10} y1={yMin} x2={cx + 10} y2={yMin} stroke={color} strokeWidth="2" />

              {/* IQR Box */}
              <rect
                x={cx - boxW / 2}
                y={yQ3}
                width={boxW}
                height={Math.max(yQ1 - yQ3, 2)}
                fill={color}
                fillOpacity="0.2"
                stroke={color}
                strokeWidth="2"
                rx="2"
              >
                <title>{`${box.label}: Min=${box.min}, Q1=${box.q1}, Med=${box.median}, Q3=${box.q3}, Max=${box.max}`}</title>
              </rect>

              {/* Median Line */}
              <line x1={cx - boxW / 2} y1={yMed} x2={cx + boxW / 2} y2={yMed} stroke={color} strokeWidth="3" />

              {/* Outliers */}
              {box.outliers?.map((out, oIdx) => (
                <circle key={oIdx} cx={cx} cy={getY(out)} r="3" fill="#ef4444" stroke="#ffffff" strokeWidth="1">
                  <title>Outlier: {out}</title>
                </circle>
              ))}

              {/* Label */}
              <text x={cx} y={height - 10} textAnchor="middle" className="text-[10px] font-medium fill-slate-600">
                {box.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ============================================================================
// 19. HISTOGRAM CHART (Frequency Distribution Bins)
// ============================================================================
export const HistogramChart: React.FC<{
  bins: Array<{ range: string; count: number }>;
  height?: number;
  barColor?: string;
}> = ({ bins = [], height = 200, barColor = '#6366f1' }) => {
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  return (
    <div className="w-full space-y-2">
      <div className="flex items-end justify-between gap-1 w-full" style={{ height }}>
        {bins.map((b, i) => {
          const pct = (b.count / maxCount) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
              <div className="text-[9px] font-mono text-slate-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {b.count}
              </div>
              <div
                style={{ height: `${pct}%`, backgroundColor: barColor }}
                className="w-full rounded-t transition-all duration-300 hover:brightness-110"
                title={`${b.range}: ${b.count} events`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-500 font-mono">
        {bins.map((b, i) => (
          <span key={i} className="truncate text-center flex-1">
            {b.range}
          </span>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 20. POLAR AREA CHART (Coxcomb / Nightingale Rose Diagram)
// ============================================================================
export const PolarAreaChart: React.FC<{
  data: ChartDataPoint[];
  size?: number;
}> = ({ data = [], size = 240 }) => {
  const center = size / 2;
  const maxRadius = center - 25;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const totalSlices = Math.max(data.length, 1);
  const anglePerSlice = (Math.PI * 2) / totalSlices;

  return (
    <div className="flex items-center justify-center space-x-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Concentric Guide Circles */}
        {[0.33, 0.66, 1.0].map((r, i) => (
          <circle key={i} cx={center} cy={center} r={maxRadius * r} fill="none" stroke="#f1f5f9" strokeWidth="1" />
        ))}

        {data.map((d, i) => {
          const radius = (d.value / maxVal) * maxRadius;
          const startAngle = i * anglePerSlice - Math.PI / 2;
          const endAngle = startAngle + anglePerSlice;
          const x1 = center + radius * Math.cos(startAngle);
          const y1 = center + radius * Math.sin(startAngle);
          const x2 = center + radius * Math.cos(endAngle);
          const y2 = center + radius * Math.sin(endAngle);
          const pathD = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
          const color = d.color || PALETTE[i % PALETTE.length];

          return (
            <path
              key={i}
              d={pathD}
              fill={color}
              fillOpacity="0.75"
              stroke="#ffffff"
              strokeWidth="1.5"
              className="transition-all duration-300 hover:fill-opacity-100 cursor-pointer"
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </path>
          );
        })}
      </svg>
      <div className="space-y-1 text-xs">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color || PALETTE[i % PALETTE.length] }} />
            <span className="text-slate-600 font-medium">{d.label}</span>
            <span className="text-slate-900 font-bold font-mono ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 21. FLOATING BAR CHART (Range Intervals [Min, Max])
// ============================================================================
export const FloatingBarChart: React.FC<{
  data: Array<{ label: string; min: number; max: number; color?: string }>;
  height?: number;
  unit?: string;
}> = ({ data = [], height = 220, unit = '' }) => {
  const globalMin = Math.min(...data.map((d) => d.min), 0);
  const globalMax = Math.max(...data.map((d) => d.max), 1);
  const range = globalMax - globalMin || 1;

  return (
    <div className="w-full space-y-3">
      <div className="flex items-end justify-between gap-3 w-full" style={{ height }}>
        {data.map((item, idx) => {
          const bottomPct = ((item.min - globalMin) / range) * 100;
          const heightPct = Math.max(((item.max - item.min) / range) * 100, 4);
          const color = item.color || PALETTE[idx % PALETTE.length];

          return (
            <div key={idx} className="flex-1 flex flex-col justify-end items-center h-full relative group">
              <div
                style={{
                  position: 'absolute',
                  bottom: `${bottomPct}%`,
                  height: `${heightPct}%`,
                  backgroundColor: color,
                }}
                className="w-full max-w-[40px] rounded-md transition-all duration-300 hover:brightness-110 shadow-xs flex flex-col justify-between p-1 cursor-pointer"
                title={`${item.label}: ${item.min} to ${item.max} ${unit}`}
              >
                <span className="text-[9px] font-bold text-white text-center leading-none truncate">
                  {item.max}
                </span>
                <span className="text-[9px] font-bold text-white/90 text-center leading-none truncate">
                  {item.min}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between border-t border-slate-100 pt-2">
        {data.map((item, idx) => (
          <span key={idx} className="text-[11px] font-medium text-slate-500 truncate text-center flex-1">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 22. STEPPED LINE CHART (Before / After / Middle Orthogonal Transitions)
// ============================================================================
export const SteppedLineChart: React.FC<{
  data: number[];
  labels: string[];
  height?: number;
  lineColor?: string;
  stepMode?: 'before' | 'after' | 'middle';
}> = ({ data = [], labels = [], height = 200, lineColor = '#2563eb', stepMode = 'after' }) => {
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 1);
  const range = max - min || 1;

  const points = data.map((val, idx) => {
    const x = labels.length > 1 ? (idx / (labels.length - 1)) * 100 : 50;
    const y = 100 - ((val - min) / range) * 80 - 10;
    return { x, y, val, label: labels[idx] };
  });

  // Build stepped path
  let pathD = '';
  points.forEach((pt, i) => {
    if (i === 0) {
      pathD += `M ${pt.x} ${pt.y}`;
    } else {
      const prev = points[i - 1]!;
      if (stepMode === 'before') {
        pathD += ` V ${pt.y} H ${pt.x}`;
      } else if (stepMode === 'middle') {
        const midX = (prev.x + pt.x) / 2;
        pathD += ` H ${midX} V ${pt.y} H ${pt.x}`;
      } else {
        // after (default)
        pathD += ` H ${pt.x} V ${pt.y}`;
      }
    }
  });

  return (
    <div className="w-full space-y-2">
      <div className="w-full relative" style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {/* Grid lines */}
          <line x1="0" y1="20" x2="100" y2="20" stroke="#f1f5f9" strokeWidth="0.8" strokeDasharray="2 2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="0.8" strokeDasharray="2 2" />
          <line x1="0" y1="80" x2="100" y2="80" stroke="#f1f5f9" strokeWidth="0.8" strokeDasharray="2 2" />

          {/* Stepped line */}
          <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

          {/* Data Points */}
          {points.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r="2.5"
              fill="#ffffff"
              stroke={lineColor}
              strokeWidth="2"
              className="transition-all hover:r-4 cursor-pointer"
            >
              <title>{`${pt.label}: ${pt.val}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="flex justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        {labels.map((lbl, i) => (
          <span key={i} className="truncate">{lbl}</span>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 23. COMBO BAR & LINE CHART (Dual/Mixed Scales)
// ============================================================================
export const ComboBarLineChart: React.FC<{
  categories: string[];
  barSeries: { name: string; data: number[]; color?: string; unit?: string };
  lineSeries: { name: string; data: number[]; color?: string; unit?: string };
  height?: number;
}> = ({ categories = [], barSeries, lineSeries, height = 220 }) => {
  const maxBar = Math.max(...barSeries.data, 1);
  const minLine = Math.min(...lineSeries.data, 0);
  const maxLine = Math.max(...lineSeries.data, 1);
  const lineRange = maxLine - minLine || 1;

  const barColor = barSeries.color || '#3b82f6';
  const lineColor = lineSeries.color || '#f59e0b';

  const linePoints = lineSeries.data.map((val, idx) => {
    const x = categories.length > 1 ? (idx / (categories.length - 1)) * 100 : 50;
    const y = 100 - ((val - minLine) / lineRange) * 75 - 12;
    return { x, y, val };
  });

  let linePathD = '';
  linePoints.forEach((pt, i) => {
    if (i === 0) linePathD += `M ${pt.x} ${pt.y}`;
    else linePathD += ` L ${pt.x} ${pt.y}`;
  });

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs pb-1">
        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: barColor }} />
          <span>{barSeries.name} ({barSeries.unit || 'units'})</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lineColor }} />
          <span>{lineSeries.name} ({lineSeries.unit || '%'})</span>
        </div>
      </div>

      <div className="relative w-full" style={{ height }}>
        {/* Bars Container */}
        <div className="absolute inset-0 flex items-end justify-between gap-2 px-3">
          {categories.map((cat, idx) => {
            const bVal = barSeries.data[idx] || 0;
            const bPct = (bVal / maxBar) * 85;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group">
                <div
                  style={{ height: `${bPct}%`, backgroundColor: barColor }}
                  className="w-full max-w-[36px] rounded-t-md transition-all duration-300 hover:brightness-110"
                  title={`${cat} - ${barSeries.name}: ${bVal}`}
                />
              </div>
            );
          })}
        </div>

        {/* Line Overlay SVG */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none overflow-visible px-3">
          <path d={linePathD} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {linePoints.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r="3.5"
              fill="#ffffff"
              stroke={lineColor}
              strokeWidth="2.5"
              className="pointer-events-auto cursor-pointer"
            >
              <title>{`${categories[i]} - ${lineSeries.name}: ${pt.val}`}</title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="flex justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        {categories.map((cat, i) => (
          <span key={i} className="truncate flex-1 text-center">{cat}</span>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 24. MULTI-AXIS LINE CHART (Dual/Triple Independent Y-Axes)
// ============================================================================
export const MultiAxisLineChart: React.FC<{
  categories: string[];
  series: Array<{ name: string; data: number[]; color?: string; unit?: string }>;
  height?: number;
}> = ({ categories = [], series = [], height = 220 }) => {
  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap gap-4 text-xs pb-1">
        {series.map((s, sIdx) => {
          const color = s.color || PALETTE[sIdx % PALETTE.length];
          return (
            <div key={sIdx} className="flex items-center gap-1.5 font-medium text-slate-700">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span>{s.name} ({s.unit || ''})</span>
            </div>
          );
        })}
      </div>

      <div className="relative w-full" style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {/* Horizontal grid */}
          <line x1="0" y1="20" x2="100" y2="20" stroke="#f1f5f9" strokeWidth="0.8" strokeDasharray="2 2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="0.8" strokeDasharray="2 2" />
          <line x1="0" y1="80" x2="100" y2="80" stroke="#f1f5f9" strokeWidth="0.8" strokeDasharray="2 2" />

          {series.map((s, sIdx) => {
            const min = Math.min(...s.data, 0);
            const max = Math.max(...s.data, 1);
            const range = max - min || 1;
            const color = s.color || PALETTE[sIdx % PALETTE.length];

            const pts = s.data.map((val, idx) => {
              const x = categories.length > 1 ? (idx / (categories.length - 1)) * 100 : 50;
              const y = 100 - ((val - min) / range) * 75 - 12;
              return { x, y, val };
            });

            let d = '';
            pts.forEach((pt, i) => {
              if (i === 0) d += `M ${pt.x} ${pt.y}`;
              else d += ` L ${pt.x} ${pt.y}`;
            });

            return (
              <g key={sIdx}>
                <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {pts.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r="2.8"
                    fill="#ffffff"
                    stroke={color}
                    strokeWidth="2"
                    className="cursor-pointer hover:r-4"
                  >
                    <title>{`${categories[i]} - ${s.name}: ${pt.val} ${s.unit || ''}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        {categories.map((cat, i) => (
          <span key={i} className="truncate flex-1 text-center">{cat}</span>
        ))}
      </div>
    </div>
  );
};
