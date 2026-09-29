'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Text,
} from '@medusajs/ui';
import {
  ArrowDownTray,
  ChartBar,
  GridList,
  MagnifyingGlass,
  XMark,
} from '@medusajs/icons';
import {
  LineChart,
  AreaChart,
  BarChart,
  StackedBarChart,
  ColumnChart,
  StackedColumnChart,
  DonutChart,
  PieChart,
  ScatterChart,
  BubbleChart,
  RadarChart,
  GaugeChart,
  WaterfallChart,
  FunnelChart,
  HeatmapChart,
  TreemapChart,
  SankeyChart,
  BoxPlotChart,
  HistogramChart,
  PolarAreaChart,
  FloatingBarChart,
  SteppedLineChart,
  ComboBarLineChart,
  MultiAxisLineChart,
} from '@gigalibs/charts-react';
import {
  INDUSTRY_CHARTS_CATALOG,
  INDUSTRY_SECTORS,
  type IndustryChartDef,
  type ChartFamily,
} from '@/lib/industry-charts-catalog';

interface ChartErrorBoundaryProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ChartErrorBoundary extends React.Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Chart visualization render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <span className="text-xs text-rose-500 font-semibold mb-1">Visualization Unavailable</span>
            <span className="text-[11px] text-slate-500 font-mono">{this.state.error?.message || 'Error rendering chart'}</span>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export function IndustryChartsCatalogView() {
  const [charts, setCharts] = useState<IndustryChartDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLiveDbSynced, setIsLiveDbSynced] = useState(false);
  const [dbSyncTimestamp, setDbSyncTimestamp] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [selectedFamily, setSelectedFamily] = useState<ChartFamily | 'all'>('all');
  const [tableViewMap, setTableViewMap] = useState<Record<string, boolean>>({});
  const [isAllTable, setIsAllTable] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchLiveCharts() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/analytics/v1/metrics/charts');
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data)) {
            setCharts(data);
            setIsLiveDbSynced(data.length > 0);
            setDbSyncTimestamp(new Date().toLocaleTimeString());
          }
        }
      } catch (err) {
        console.warn('Could not sync live telemetry from PostgreSQL API:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    fetchLiveCharts();
    return () => {
      active = false;
    };
  }, []);

  // Toggle table view per chart
  const toggleTableView = (chartId: string) => {
    setTableViewMap((prev) => ({ ...prev, [chartId]: !prev[chartId] }));
  };

  // Export CSV handler
  const exportCsv = (title: string, rows: Array<Record<string, any>>) => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]!);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => `"${row[h] ?? ''}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export all visible charts to CSV
  const exportAllVisible = () => {
    const rows = filteredCharts.map((c, idx) => ({
      Index: idx + 1,
      ID: c.id,
      Title: c.title,
      ChartType: c.chartType,
      Family: c.family,
      Domain: c.industryId,
      Dimensions: c.dimensions.join('; '),
      Tags: c.tags.join('; '),
    }));
    exportCsv('all_36_operational_charts', rows);
  };

  // Export single chart JSON
  const exportJson = (chart: IndustryChartDef) => {
    const blob = new Blob([JSON.stringify(chart, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${chart.id.toLowerCase()}_data.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper for sector icons & colors
  const getSectorInfo = (industryId: string) => {
    switch (industryId) {
      case 'farming':
        return { name: 'Smart Farming', icon: '🌾', badgeColor: 'green' as const };
      case 'energy':
        return { name: 'Energy & Grid', icon: '⚡', badgeColor: 'orange' as const };
      case 'logistics':
        return { name: 'Fleet Logistics', icon: '🚚', badgeColor: 'blue' as const };
      case 'manufacturing':
        return { name: 'Manufacturing IIoT', icon: '🏭', badgeColor: 'purple' as const };
      case 'healthcare':
        return { name: 'Clinical Healthcare', icon: '🏥', badgeColor: 'red' as const };
      case 'finops':
        return { name: 'Enterprise FinOps', icon: '💰', badgeColor: 'green' as const };
      default:
        return { name: industryId, icon: '📊', badgeColor: 'grey' as const };
    }
  };

  // Filter across all 36 charts
  const filteredCharts = useMemo(() => {
    return charts.filter((chart) => {
      // 1. Domain filter
      if (selectedDomain !== 'all' && chart.industryId !== selectedDomain) {
        return false;
      }
      // 2. Family filter
      if (selectedFamily !== 'all' && chart.family !== selectedFamily) {
        return false;
      }
      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = chart.title.toLowerCase().includes(q);
        const matchSubtitle = chart.subtitle.toLowerCase().includes(q);
        const matchType = chart.chartType.toLowerCase().includes(q);
        const matchDomain = chart.industryId.toLowerCase().includes(q);
        const matchTags = chart.tags.some((t) => t.toLowerCase().includes(q));
        const matchDims = chart.dimensions.some((d) => d.toLowerCase().includes(q));
        return matchTitle || matchSubtitle || matchType || matchDomain || matchTags || matchDims;
      }
      return true;
    });
  }, [charts, selectedDomain, selectedFamily, searchQuery]);

  // Pure SVG / Canvas Chart.js Renderer
  const renderIndustryChart = (chart: IndustryChartDef) => {
    const p = { ...(chart.payload || {}) };

    switch (chart.chartType) {
      case 'multiAxisLine': {
        const series = Array.isArray(p.series) ? p.series : [];
        return <MultiAxisLineChart categories={p.categories || p.labels || []} series={series} height={220} />;
      }
      case 'steppedLine':
        return (
          <SteppedLineChart
            labels={p.labels || p.categories || []}
            data={Array.isArray(p.data) ? p.data : []}
            lineColor={p.lineColor}
            stepMode={p.stepMode}
            height={200}
          />
        );
      case 'comboBarLine': {
        const barSeries = Array.isArray(p.barSeries) ? p.barSeries[0] : p.barSeries;
        const lineSeries = Array.isArray(p.lineSeries) ? p.lineSeries[0] : p.lineSeries;
        return (
          <ComboBarLineChart
            categories={p.categories || p.labels || []}
            barSeries={barSeries || { name: 'Metric', data: [] }}
            lineSeries={lineSeries || { name: 'Target', data: [] }}
            height={220}
          />
        );
      }
      case 'floatingBar':
        return <FloatingBarChart data={Array.isArray(p.data) ? p.data : []} unit={p.unit} height={220} />;
      case 'area':
        return <AreaChart categories={p.categories || p.labels || []} series={Array.isArray(p.series) ? p.series : []} height={220} />;
      case 'line':
        return <LineChart labels={p.labels || p.categories || []} data={Array.isArray(p.data) ? p.data : []} lineColor={p.lineColor} fillGradient={p.fillGradient} height={200} />;
      case 'bar':
        return <BarChart data={Array.isArray(p.data) ? p.data : []} height={200} />;
      case 'stackedBar':
        return <StackedBarChart categories={p.categories || p.labels || []} series={Array.isArray(p.series) ? p.series : []} />;
      case 'column':
        return <ColumnChart categories={p.categories || p.labels || []} series={Array.isArray(p.series) ? p.series : []} height={220} />;
      case 'stackedColumn':
        return <StackedColumnChart categories={p.categories || p.labels || []} series={Array.isArray(p.series) ? p.series : []} height={220} />;
      case 'donut':
        return <DonutChart data={Array.isArray(p.data) ? p.data : []} total={p.total} />;
      case 'pie':
        return <PieChart data={Array.isArray(p.data) ? p.data : []} />;
      case 'scatter':
        return <ScatterChart points={Array.isArray(p.points) ? p.points : []} height={220} />;
      case 'bubble':
        return <BubbleChart points={Array.isArray(p.points) ? p.points : []} height={220} />;
      case 'radar':
        return <RadarChart categories={Array.isArray(p.categories) ? p.categories : []} series={Array.isArray(p.series) ? p.series : []} />;
      case 'gauge':
        return <GaugeChart value={p.value ?? 0} min={p.min} max={p.max} label={p.label} />;
      case 'waterfall':
        return <WaterfallChart data={Array.isArray(p.data) ? p.data : []} />;
      case 'funnel':
        return <FunnelChart stages={Array.isArray(p.stages) ? p.stages : []} />;
      case 'heatmap':
        return <HeatmapChart xLabels={Array.isArray(p.xLabels) ? p.xLabels : []} yLabels={Array.isArray(p.yLabels) ? p.yLabels : []} matrix={Array.isArray(p.matrix) ? p.matrix : []} />;
      case 'treemap':
        return <TreemapChart nodes={Array.isArray(p.nodes) ? p.nodes : []} height={220} />;
      case 'sankey':
        return <SankeyChart flows={Array.isArray(p.flows) ? p.flows : []} height={220} />;
      case 'boxPlot':
        return <BoxPlotChart data={Array.isArray(p.data) ? p.data : []} height={220} />;
      case 'histogram':
        return <HistogramChart bins={Array.isArray(p.bins) ? p.bins : []} height={200} />;
      case 'polarArea':
        return <PolarAreaChart data={Array.isArray(p.data) ? p.data : []} />;
      default:
        return <Text className="text-xs text-ui-fg-muted">Chart preview unavailable</Text>;
    }
  };

  // Active sector info for header banner
  const activeSector = selectedDomain !== 'all' ? INDUSTRY_SECTORS.find((s) => s.id === selectedDomain) : null;

  return (
    <div className="space-y-6">
      {/* Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-ui-bg-base border border-ui-border-base rounded-2xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <Heading level="h2" className="text-xl font-bold text-ui-fg-base flex items-center gap-2">
              <ChartBar className="w-5 h-5 text-ui-fg-interactive" />
              <span>36 Industrial Telemetry &amp; Operational Charts</span>
            </Heading>
            <Badge color="purple" size="small" className="font-mono">
              36 Visual Engines
            </Badge>
            <Badge color="blue" size="small" className="font-mono">
              6 Sectors
            </Badge>
            <Badge color="green" size="small" className="font-mono">
              Pure SVG / Canvas
            </Badge>
            {isLiveDbSynced && (
              <Badge color="green" size="small" className="font-mono flex items-center gap-1 border-emerald-300 bg-emerald-50 text-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>PostgreSQL 16 Synced ({dbSyncTimestamp || 'Live'})</span>
              </Badge>
            )}
          </div>
          <Text className="text-xs text-ui-fg-subtle mt-1">
            Complete domain visualization catalog covering Smart Farming IoT, Energy &amp; Smart Grid, Fleet Logistics, Manufacturing IIoT, Clinical Healthcare, and Enterprise FinOps.
          </Text>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="small"
            variant="secondary"
            onClick={exportAllVisible}
            className="flex items-center gap-1.5 font-medium text-xs"
          >
            <ArrowDownTray className="w-3.5 h-3.5 text-blue-600" />
            <span>Export All Catalog (CSV)</span>
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setIsAllTable(!isAllTable)}
            className="flex items-center gap-1.5 font-medium text-xs"
          >
            <GridList className="w-3.5 h-3.5 text-slate-600" />
            <span>{isAllTable ? 'Show Visual Charts' : 'Toggle Raw Tables'}</span>
          </Button>
        </div>
      </div>

      {/* Sector KPI Summary Cards if Sector Selected */}
      {activeSector && (
        <div className="bg-ui-bg-base border border-ui-border-base rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-ui-border-base pb-3 mb-4">
            <div>
              <span className="text-xs font-bold text-ui-fg-base flex items-center gap-2">
                <span className="text-lg">{activeSector.icon}</span>
                <span>{activeSector.name}</span>
                <Badge color="blue" size="small">{activeSector.badge}</Badge>
              </span>
              <p className="text-xs text-ui-fg-muted mt-0.5">{activeSector.tagline}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {activeSector.kpis.map((kpi, kIdx) => (
              <div key={kIdx} className="bg-ui-bg-subtle border border-ui-border-base rounded-lg p-3">
                <div className="text-[10px] font-bold text-ui-fg-muted uppercase tracking-wider">{kpi.label}</div>
                <div className="text-base font-bold font-mono text-ui-fg-base mt-1">{kpi.value}</div>
                <div className={`text-[11px] font-medium mt-0.5 ${kpi.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {kpi.delta}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global Filter & Search Control Bar */}
      <div className="bg-ui-bg-base border border-ui-border-base rounded-xl p-4 space-y-3.5 shadow-sm">
        {/* Top Row: Search & Count */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[280px] max-w-md relative">
            <Input
              type="text"
              placeholder="Search across all 36 charts (e.g. silo, OEE, vitals, cashflow, radar)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8"
            />
            <MagnifyingGlass className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <XMark className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Showing <strong>{filteredCharts.length}</strong> of <strong>36</strong> Charts</span>
            {(selectedDomain !== 'all' || selectedFamily !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDomain('all');
                  setSelectedFamily('all');
                  setSearchQuery('');
                }}
                className="text-blue-600 hover:underline ml-2 font-sans font-semibold cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Quick Domain Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-ui-border-base text-xs">
          <span className="text-[11px] font-mono text-slate-400 uppercase font-semibold mr-1">Sector:</span>
          {[
            { id: 'all', label: 'All charts' },
            { id: 'farming', label: '🌾 Smart Farming' },
            { id: 'energy', label: '⚡ Energy & Grid' },
            { id: 'logistics', label: '🚚 Fleet Logistics' },
            { id: 'manufacturing', label: '🏭 Manufacturing IIoT' },
            { id: 'healthcare', label: '🏥 Clinical Healthcare' },
            { id: 'finops', label: '💰 Enterprise FinOps' },
          ].map((sector) => ({
            ...sector,
            // WI-OI-102e (catalogue truth): counts come from the charts the API returned, never fixed numbers.
            label: `${sector.label} (${
              sector.id === 'all' ? charts.length : charts.filter((chart) => chart.industryId === sector.id).length
            })`,
          })).map((d) => {
            const active = selectedDomain === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDomain(d.id)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white font-semibold shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {/* Quick Chart Family Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] font-mono text-slate-400 uppercase font-semibold mr-1">Family:</span>
          {[
            { id: 'all', label: 'All Engines' },
            { id: 'combo', label: 'Combo Bar+Line' },
            { id: 'bar', label: 'Bar & Column' },
            { id: 'line', label: 'Line & Stepped' },
            { id: 'area', label: 'Spline Area' },
            { id: 'circular', label: 'Donut & Polar' },
            { id: 'correlation', label: 'Scatter & Bubble' },
            { id: 'radar', label: 'Radar' },
            { id: 'specialized', label: 'Gauges & Funnels' },
          ].map((f) => {
            const active = selectedFamily === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFamily(f.id as any)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-purple-600 text-white font-semibold shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Charts Grid or Honest Empty State */}
      {isLoading ? (
        <div className="p-12 text-center border border-ui-border-base rounded-2xl bg-ui-bg-base">
          <div className="text-sm font-semibold text-ui-fg-base">Loading Authoritative Telemetry Charts...</div>
          <div className="text-xs text-ui-fg-muted mt-1 font-mono">Querying gigalibs_analytics.telemetry_series...</div>
        </div>
      ) : filteredCharts.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-ui-border-base rounded-2xl bg-ui-bg-subtle">
          <Heading level="h3" className="text-ui-fg-base font-bold mb-2">No Authoritative Telemetry Series Found</Heading>
          <Text className="text-sm text-ui-fg-muted max-w-md mx-auto mb-4">
            No telemetry series records were found in PostgreSQL for this tenant workspace. Live industrial telemetry charts will appear here when telemetry streams or IoT devices are connected.
          </Text>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredCharts.map((chart, index) => {
            const isTableActive = isAllTable || (tableViewMap[chart.id] ?? false);
            const sector = getSectorInfo(chart.industryId);

            return (
            <Container
              key={chart.id}
              className="p-6 bg-ui-bg-base border border-ui-border-base rounded-2xl shadow-2xs flex flex-col justify-between hover:border-ui-border-strong transition-all"
            >
              <div>
                {/* Card Top Row */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-xs font-mono font-bold text-slate-400">
                        #{String(index + 1).padStart(2, '0')}
                      </span>
                      <Badge color="purple" size="small" className="text-[10px] font-mono uppercase">
                        {chart.chartType}
                      </Badge>
                      <Badge color={sector.badgeColor} size="small" className="text-[10px] font-medium">
                        {sector.icon} {sector.name}
                      </Badge>
                      <span className="text-[10px] font-mono text-slate-400 uppercase">
                        {chart.family}
                      </span>
                      {chart.lineageSha256 && (
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-emerald-500" />
                          <span>DB SHA-256: {chart.lineageSha256.slice(0, 8)}</span>
                        </span>
                      )}
                    </div>
                    <Heading level="h3" className="text-base font-bold text-ui-fg-base">
                      {chart.title}
                    </Heading>
                    <Text size="small" className="text-ui-fg-subtle mt-0.5">
                      {chart.subtitle}
                    </Text>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleTableView(chart.id)}
                      title={isTableActive ? 'Show Visual Chart' : 'Show Raw Data Table'}
                      className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                        isTableActive
                          ? 'bg-purple-100 text-purple-700 font-bold'
                          : 'hover:bg-slate-100 text-slate-500'
                      }`}
                    >
                      <GridList className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        exportCsv(chart.title, [
                          {
                            Metric: chart.title,
                            ChartType: chart.chartType,
                            Industry: sector.name,
                            Dimensions: chart.dimensions.join('; '),
                            Payload: JSON.stringify(chart.payload),
                          },
                        ])
                      }
                      title="Export CSV"
                      className="p-1.5 rounded-md text-xs hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                    >
                      <ArrowDownTray className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => exportJson(chart)}
                      title="Download JSON Payload"
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono hover:bg-slate-100 text-slate-500 border border-slate-200 transition-colors cursor-pointer"
                    >
                      JSON
                    </button>
                  </div>
                </div>

                {/* Chart Visualization OR Raw Table */}
                <div className="min-h-[220px] flex items-center justify-center bg-ui-bg-subtle/50 rounded-xl p-4 border border-ui-border-base overflow-hidden">
                  {isTableActive ? (
                    <div className="w-full max-h-[260px] overflow-auto text-xs font-mono">
                      <pre className="p-3 bg-slate-900 text-emerald-400 rounded-lg overflow-x-auto text-[11px] leading-relaxed">
                        {JSON.stringify(chart.payload, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col justify-center">
                      <ChartErrorBoundary>
                        {renderIndustryChart(chart)}
                      </ChartErrorBoundary>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer Dimensions & Tags */}
              <div className="mt-4 pt-3 border-t border-ui-border-base flex flex-wrap items-center justify-between gap-2 text-[11px] text-ui-fg-muted">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-slate-400">Dimensions:</span>
                  {chart.dimensions.map((dim, dIdx) => (
                    <span key={dIdx} className="bg-ui-bg-subtle px-1.5 py-0.5 rounded text-slate-600 font-mono">
                      {dim}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {chart.tags.map((tag, tIdx) => (
                    <span key={tIdx} className="text-[10px] text-slate-400">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </Container>
          );
        })}
        </div>
      )}
    </div>
  );
}
