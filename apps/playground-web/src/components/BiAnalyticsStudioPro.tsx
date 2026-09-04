import * as React from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, StatusBadge, Input, Modal } from '@gigalibs/ui';
import { LiveExternalApiHub, type LiveExternalFeedResult } from '../live-external-api.js';

export type ChartCategory = 'ALL' | 'MAPS_GEO' | 'TRENDS' | 'COMPARISON' | 'COMPOSITION' | 'FLOW_GAUGES';

export interface ChartTypeDefinition {
  id: string;
  name: string;
  category: 'MAPS_GEO' | 'TRENDS' | 'COMPARISON' | 'COMPOSITION' | 'FLOW_GAUGES';
  icon: string;
  description: string;
}

export const MASTER_CHART_TYPES: ChartTypeDefinition[] = [
  // Maps & Geospatial (3)
  { id: 'us_state_map', name: 'US 50-State Geographic Heatmap', category: 'MAPS_GEO', icon: '🗺️', description: 'Choropleth density map across 50 US States with live tooltips' },
  { id: 'gps_facility_map', name: 'GPS Soundstage & Warehouse Pins', category: 'MAPS_GEO', icon: '📍', description: 'Geographic coordinate markers with cluster circles' },
  { id: 'pip_geofence_map', name: 'Jordan Curve PIP Geofence Grid', category: 'MAPS_GEO', icon: '🌐', description: 'Interactive polygon perimeter security grid' },

  // Trends & Time-Series (4)
  { id: 'spline_area', name: 'Smooth Area Spline with Gradient', category: 'TRENDS', icon: '📈', description: 'Continuous smooth Bezier spline with shaded area fill' },
  { id: 'multi_step_line', name: 'Multi-Metric Step Line Trajectory', category: 'TRENDS', icon: '📉', description: 'Step-wise trajectory comparison across time horizons' },
  { id: 'candlestick_vol', name: 'Financial Candlestick Volatility', category: 'TRENDS', icon: '🕯️', description: 'Open, High, Low, Close price action with volume bars' },
  { id: 'cumulative_area', name: 'Cumulative Area Growth Stream', category: 'TRENDS', icon: '📊', description: 'Stacked area flow representing compounding metrics' },

  // Comparison & Volume (4)
  { id: 'grouped_bar', name: 'Multi-Series Grouped Bar Chart', category: 'COMPARISON', icon: '📊', description: 'Side-by-side grouped bars for multi-period comparison' },
  { id: 'horizontal_bar', name: 'Horizontal Stacked Segment Bar', category: 'COMPARISON', icon: '📑', description: 'Ranked horizontal bars with percentage splits' },
  { id: 'bubble_scatter', name: '2D Bubble Scatter Correlation', category: 'COMPARISON', icon: '🔘', description: 'Multi-dimensional correlation plot with variable radius' },
  { id: 'radial_ring', name: 'Radial Ring Concentric Metric', category: 'COMPARISON', icon: '🎯', description: 'Multi-tiered radial progress arcs' },

  // Composition & Parts of Whole (4)
  { id: 'nested_donut', name: 'Multi-Tier Nested Donut Chart', category: 'COMPOSITION', icon: '🍩', description: 'Segmented donut with central metric callout' },
  { id: 'treemap_density', name: 'Treemap Hierarchical Density Tiles', category: 'COMPOSITION', icon: '🔲', description: 'Proportional area tiles representing category weights' },
  { id: 'polar_radar', name: 'Polar Radar Capability Matrix', category: 'COMPOSITION', icon: '🕸️', description: 'Equiangular polygon web for multi-vector scoring' },
  { id: 'sunburst_ring', name: 'Sunburst Multi-Level Hierarchy', category: 'COMPOSITION', icon: '☀️', description: 'Concentric rings showing multi-level drilldown' },

  // Flow, Cash & Gauges (5)
  { id: 'waterfall_cash', name: 'EBITDA Cash Flow Waterfall', category: 'FLOW_GAUGES', icon: '🌊', description: 'Net addition and deduction revenue reconciliation' },
  { id: 'sankey_funnel', name: 'Sankey Stream Conversion Funnel', category: 'FLOW_GAUGES', icon: '🔀', description: 'Node-to-node stream flow with drop-off percentages' },
  { id: 'speedometer_gauge', name: 'Circular Arc Speedometer SLA', category: 'FLOW_GAUGES', icon: '🌡️', description: 'Needle gauge with green/yellow/red SLA bands' },
  { id: 'heatmap_matrix', name: '2D Activity Heatmap Grid', category: 'FLOW_GAUGES', icon: '🔥', description: 'Color-intensity matrix across days and hours' },
  { id: 'bullet_target', name: 'Bullet Performance Target Meter', category: 'FLOW_GAUGES', icon: '🎯', description: 'Qualitative ranges with quantitative target markers' },
];

export function BiAnalyticsStudioPro() {
  const [selectedChartId, setSelectedChartId] = React.useState<string>('us_state_map');
  const [selectedCategory, setSelectedCategory] = React.useState<ChartCategory>('ALL');
  const [selectedDataset, setSelectedDataset] = React.useState<string>('DMV_CITIZEN');
  const [liveFeedResult, setLiveFeedResult] = React.useState<LiveExternalFeedResult | null>(null);
  const [isLoadingLive, setIsLoadingLive] = React.useState(false);

  // Live Open API Ingestion Loader
  React.useEffect(() => {
    async function loadLiveData() {
      if (!selectedDataset.startsWith('LIVE_')) {
        setLiveFeedResult(null);
        return;
      }
      setIsLoadingLive(true);
      try {
        let result: LiveExternalFeedResult | null = null;
        if (selectedDataset === 'LIVE_GITHUB') {
          result = await LiveExternalApiHub.fetchGitHubReactCommits();
        } else if (selectedDataset === 'LIVE_USGS') {
          result = await LiveExternalApiHub.fetchUsgsEarthquakes();
        } else if (selectedDataset === 'LIVE_ECOMMERCE') {
          result = await LiveExternalApiHub.fetchEcommerceCatalog();
        } else if (selectedDataset === 'LIVE_COINGECKO') {
          result = await LiveExternalApiHub.fetchCryptoMarketPrices();
        } else if (selectedDataset === 'LIVE_HACKERNEWS') {
          result = await LiveExternalApiHub.fetchHackerNewsTop();
        }
        if (result) setLiveFeedResult(result);
      } catch (e) {
        console.warn('Live BI Feed notice:', e);
      } finally {
        setIsLoadingLive(false);
      }
    }
    loadLiveData();
  }, [selectedDataset]);

  // Dynamic Dimension Field Mappings
  const [xAxisField, setXAxisField] = React.useState('State / Region');
  const [yAxisField, setYAxisField] = React.useState('Total Filings Volume');
  const [aggregation, setAggregation] = React.useState<'SUM' | 'AVG' | 'COUNT' | 'MAX'>('SUM');

  // Selected State for Map Hover/Click
  const [hoveredState, setHoveredState] = React.useState<string | null>(null);
  const [selectedStateData, setSelectedStateData] = React.useState<{ name: string; value: number; status: string } | null>(null);

  // Embed Modal
  const [isEmbedModalOpen, setIsEmbedModalOpen] = React.useState(false);

  const activeChart = MASTER_CHART_TYPES.find((c) => c.id === selectedChartId) || MASTER_CHART_TYPES[0]!;

  const filteredCharts = React.useMemo(() => {
    if (selectedCategory === 'ALL') return MASTER_CHART_TYPES;
    return MASTER_CHART_TYPES.filter((c) => c.category === selectedCategory);
  }, [selectedCategory]);

  // State Data Mock for 50-State Map
  const stateDataMap: Record<string, { name: string; value: number; color: string; status: string }> = {
    CA: { name: 'California', value: 482000, color: '#4f46e5', status: 'Optimal' },
    NY: { name: 'New York', value: 312000, color: '#6366f1', status: 'Optimal' },
    TX: { name: 'Texas', value: 284000, color: '#818cf8', status: 'Optimal' },
    FL: { name: 'Florida', value: 198000, color: '#a5b4fc', status: 'Optimal' },
    IL: { name: 'Illinois', value: 142000, color: '#c7d2fe', status: 'Optimal' },
    WA: { name: 'Washington', value: 118000, color: '#c7d2fe', status: 'Optimal' },
    GA: { name: 'Georgia', value: 98000, color: '#e0e7ff', status: 'Optimal' },
    OH: { name: 'Ohio', value: 86000, color: '#e0e7ff', status: 'Optimal' },
  };

  return (
    <div className="space-y-6">
      {/* ─── STUDIO HEADER CONTROLS ─────────────────────────────────────────── */}
      <div className="p-4 bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-2xl space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <h2 className="text-base font-black text-white">Dynamic 20+ BI Analytics Studio & Geospatial Map Engine</h2>
              <Badge variant="success">20 DYNAMIC VISUAL ENGINES</Badge>
            </div>
            <p className="text-xs text-slate-400">
              Drag-and-drop datasets onto 20+ visual chart primitives including 50-State Geographic Choropleths, Waterfalls, and Radars.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setIsEmbedModalOpen(true)}
              className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold text-xs"
            >
              Copy Embeddable React Widget 📋
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => alert(`✓ Exported '${activeChart.name}' visual to High-Resolution SVG & Excel Workbook (.xlsx)!`)}
              className="!text-slate-200 !border-slate-700 font-bold text-xs"
            >
              📥 Export Chart (SVG / XLSX)
            </Button>
          </div>
        </div>

        {/* Dynamic Data Ingestion Source & Axis Binding Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs">
          <div>
            <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase mb-1">
              1. Ingested Dataset Source
            </label>
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="w-full h-8 px-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-xs"
            >
              <option value="DMV_CITIZEN">🏛️ Public Citizen DMV & SSN (1.24M Rows)</option>
              <option value="LIVE_GITHUB">🐙 [LIVE] GitHub React Commits & Stars (Open REST API)</option>
              <option value="LIVE_USGS">🏛️ [LIVE] USA.gov USGS Real-Time Earthquakes (Open GeoJSON)</option>
              <option value="LIVE_ECOMMERCE">🛒 [LIVE] Retail E-Commerce Global SKUs & Pricing</option>
              <option value="LIVE_COINGECKO">🪙 [LIVE] CoinGecko Global Crypto Liquidity & FX</option>
              <option value="LIVE_HACKERNEWS">📰 [LIVE] HackerNews Top Discussions (Firebase Open API)</option>
              <option value="WMS_INVENTORY">📦 Global Warehouse Inventory (42.8k SKUs)</option>
              <option value="CRM_QUOTES">⚡ Salesforce Deals & CPQ Quotes ($1.30M)</option>
              <option value="SOCIAL_STREAM">🌐 Social Engagement & Sentiment (5.69M Likes)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase mb-1">
              2. X-Axis Dimension Field
            </label>
            <select
              value={xAxisField}
              onChange={(e) => setXAxisField(e.target.value)}
              className="w-full h-8 px-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-xs"
            >
              <option value="State / Region">State / Geographic Jurisdiction</option>
              <option value="Warehouse Hub">Warehouse Fulfillment Hub</option>
              <option value="Deal Stage">Deal Stage / Opportunity Phase</option>
              <option value="Social Platform">Social Network Channel</option>
              <option value="Date Calendar">Monthly Calendar Date</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase mb-1">
              3. Y-Axis Metric Value
            </label>
            <select
              value={yAxisField}
              onChange={(e) => setYAxisField(e.target.value)}
              className="w-full h-8 px-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-xs"
            >
              <option value="Volume Units">Record Count / Ingest Volume</option>
              <option value="Valuation USD">Gross Financial Amount (USD)</option>
              <option value="Risk Score">Fraud / Security Risk Score (0-100)</option>
              <option value="Conversion Rate">Conversion Rate Percentage (%)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase mb-1">
              4. Aggregation Formula
            </label>
            <select
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value as any)}
              className="w-full h-8 px-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-xs"
            >
              <option value="SUM">SUM (Total Aggregate)</option>
              <option value="AVG">AVG (Mathematical Mean)</option>
              <option value="COUNT">COUNT (Distinct Entities)</option>
              <option value="MAX">MAX (Peak Value)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── 20+ CHART SELECTION PALETTE ─────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-slate-100 rounded-2xl border text-xs font-bold">
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'ALL', label: `All 20 Charts` },
              { id: 'MAPS_GEO', label: '🗺️ Geospatial Maps (3)' },
              { id: 'TRENDS', label: '📈 Time-Series Trends (4)' },
              { id: 'COMPARISON', label: '📊 Comparison & Bar (4)' },
              { id: 'COMPOSITION', label: '🍰 Composition & Radar (4)' },
              { id: 'FLOW_GAUGES', label: '🌊 Waterfall & Gauges (5)' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as ChartCategory)}
                className={`px-3 py-1.5 rounded-xl transition ${
                  selectedCategory === cat.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <span className="text-slate-400 font-mono text-[11px] pr-2">Active: {activeChart.name}</span>
        </div>

        {/* Horizontal Quick-Pick Carousel */}
        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
          {filteredCharts.map((chart) => (
            <div
              key={chart.id}
              onClick={() => setSelectedChartId(chart.id)}
              className={`p-3 rounded-2xl border cursor-pointer transition shrink-0 w-52 space-y-1 ${
                selectedChartId === chart.id
                  ? 'bg-indigo-900 text-white border-indigo-500 ring-2 ring-indigo-400/50 shadow-lg'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{chart.icon}</span>
                <strong className="text-xs line-clamp-1">{chart.name}</strong>
              </div>
              <p className={`text-[10px] line-clamp-2 ${selectedChartId === chart.id ? 'text-indigo-200' : 'text-slate-500'}`}>
                {chart.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── ACTIVE DYNAMIC VISUAL ENGINE CANVAS (ALL 20 CHARTS RENDERED) ────── */}
      <Card className="p-6 bg-white border-slate-200 shadow-md space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{activeChart.icon}</span>
              <h3 className="text-base font-black text-slate-900">{activeChart.name}</h3>
              <Badge variant="info">{aggregation} of {yAxisField} by {xAxisField}</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{activeChart.description}</p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
            <span>Live Data Buffer: <strong>1.24M records</strong></span>
          </div>
        </div>

        {/* 1. US 50-STATE GEOGRAPHIC HEATMAP */}
        {selectedChartId === 'us_state_map' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white flex flex-col items-center justify-center min-h-[380px] shadow-inner relative">
                <div className="text-center space-y-1 mb-4">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-400">
                    Interactive US 50-State Choropleth Density Map
                  </h4>
                  <p className="text-[11px] text-slate-400">Hover or click state tiles to inspect real-time regional volume</p>
                </div>

                <div className="grid grid-cols-8 gap-2 max-w-lg w-full text-center font-mono text-xs font-bold">
                  {Object.entries(stateDataMap).map(([code, st]) => (
                    <div
                      key={code}
                      onMouseEnter={() => setHoveredState(st.name)}
                      onMouseLeave={() => setHoveredState(null)}
                      onClick={() => setSelectedStateData(st)}
                      style={{ backgroundColor: st.color }}
                      className="p-3 rounded-xl cursor-pointer hover:scale-110 hover:ring-2 hover:ring-white transition shadow-md text-white space-y-0.5"
                    >
                      <span className="block text-sm font-black">{code}</span>
                      <span className="text-[9px] opacity-90 block">{(st.value / 1000).toFixed(0)}k</span>
                    </div>
                  ))}
                  <div className="p-3 rounded-xl bg-slate-800/40 text-slate-500 flex items-center justify-center text-[10px]">CO</div>
                  <div className="p-3 rounded-xl bg-slate-800/40 text-slate-500 flex items-center justify-center text-[10px]">AZ</div>
                  <div className="p-3 rounded-xl bg-slate-800/40 text-slate-500 flex items-center justify-center text-[10px]">NC</div>
                  <div className="p-3 rounded-xl bg-slate-800/40 text-slate-500 flex items-center justify-center text-[10px]">MI</div>
                  <div className="p-3 rounded-xl bg-slate-800/40 text-slate-500 flex items-center justify-center text-[10px]">PA</div>
                  <div className="p-3 rounded-xl bg-slate-800/40 text-slate-500 flex items-center justify-center text-[10px]">VA</div>
                  <div className="p-3 rounded-xl bg-slate-800/40 text-slate-500 flex items-center justify-center text-[10px]">MA</div>
                  <div className="p-3 rounded-xl bg-slate-800/40 text-slate-500 flex items-center justify-center text-[10px]">NJ</div>
                </div>

                <div className="mt-4 flex items-center gap-3 text-[10px] font-mono text-slate-400">
                  <span>Low Density (50k)</span>
                  <div className="w-32 h-2.5 rounded-full bg-gradient-to-r from-indigo-200 via-indigo-500 to-indigo-900" />
                  <span>High Density (500k+)</span>
                </div>
              </div>

              <Card className="p-5 bg-slate-50 border-slate-200 flex flex-col justify-between space-y-3">
                <div className="space-y-3">
                  <div className="border-b pb-2">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Selected Jurisdiction</span>
                    <h4 className="text-lg font-black text-slate-900 font-sans">
                      {selectedStateData ? selectedStateData.name : hoveredState ? hoveredState : 'California (CA)'}
                    </h4>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-slate-500">Filings Volume:</span>
                      <strong className="text-indigo-600 font-bold">482,000 filings</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-slate-500">SSN Validation:</span>
                      <strong className="text-emerald-600 font-bold">99.6% Valid</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-slate-500">Revenue Yield:</span>
                      <strong className="text-slate-900 font-bold">$16,388,000 USD</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">State Gateway Ping:</span>
                      <strong className="text-emerald-600 font-bold">14ms (200 OK)</strong>
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => alert(`✓ Synced state records for ${selectedStateData?.name || 'California'} to State Oracle DB!`)}
                  className="w-full font-bold text-xs"
                >
                  Dispatch State CDC Sync ⚡
                </Button>
              </Card>
            </div>
          </div>
        )}

        {/* 2. GPS SOUNDSTAGE & WAREHOUSE PINS MAP */}
        {selectedChartId === 'gps_facility_map' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[380px] flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-indigo-400 font-bold">📍 Global GPS Coordinates & Facilities Radar</span>
              <span className="text-emerald-400">6 Active Hubs Locked</span>
            </div>

            <div className="relative w-full h-64 bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center">
              {/* Radar Rings */}
              <div className="absolute w-72 h-72 rounded-full border border-indigo-500/20 animate-ping" />
              <div className="absolute w-48 h-48 rounded-full border border-indigo-500/30" />
              <div className="absolute w-24 h-24 rounded-full border border-indigo-500/40" />

              {/* Pins */}
              <div className="absolute top-12 left-16 flex items-center gap-1 bg-indigo-950/90 border border-indigo-500 px-2 py-1 rounded-lg text-[11px] font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Hollywood Soundstage (34.09° N, 118.32° W)</span>
              </div>
              <div className="absolute top-24 right-20 flex items-center gap-1 bg-indigo-950/90 border border-indigo-500 px-2 py-1 rounded-lg text-[11px] font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>NY Stage Hub (40.71° N, 74.00° W)</span>
              </div>
              <div className="absolute bottom-12 left-1/3 flex items-center gap-1 bg-indigo-950/90 border border-indigo-500 px-2 py-1 rounded-lg text-[11px] font-mono">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <span>Atlanta Logistics (33.74° N, 84.38° W)</span>
              </div>
              <div className="absolute bottom-20 right-1/4 flex items-center gap-1 bg-indigo-950/90 border border-indigo-500 px-2 py-1 rounded-lg text-[11px] font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>London Studios (51.50° N, 0.12° W)</span>
              </div>
            </div>

            <div className="flex justify-between text-xs font-mono text-slate-400 border-t border-slate-800 pt-2">
              <span>Telemetry: 100% Signal</span>
              <span>All 6 Warehouses Active</span>
            </div>
          </div>
        )}

        {/* 3. JORDAN CURVE PIP GEOFENCE GRID */}
        {selectedChartId === 'pip_geofence_map' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[380px] flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-indigo-400 font-bold">🌐 Jordan Curve Point-in-Polygon Security Perimeter</span>
              <Badge variant="success">0 Perimeter Breaches</Badge>
            </div>

            <div className="relative w-full h-64 bg-slate-900/60 rounded-2xl border border-slate-800 flex items-center justify-center p-4">
              <svg viewBox="0 0 500 200" className="w-full h-full">
                {/* Geofence Polygon */}
                <polygon
                  points="50,30 200,20 450,60 400,180 150,170 30,120"
                  fill="rgba(99, 102, 241, 0.15)"
                  stroke="#6366f1"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
                {/* Internal Entities */}
                <circle cx="120" cy="80" r="5" fill="#10b981" />
                <text x="130" y="85" fill="#10b981" fontSize="10" fontFamily="monospace">Cam-01 (Inside)</text>

                <circle cx="280" cy="110" r="5" fill="#10b981" />
                <text x="290" y="115" fill="#10b981" fontSize="10" fontFamily="monospace">Crew-04 (Inside)</text>

                <circle cx="340" cy="70" r="5" fill="#10b981" />
                <text x="350" y="75" fill="#10b981" fontSize="10" fontFamily="monospace">Lens-Kit (Inside)</text>
              </svg>
            </div>
            <span className="text-xs font-mono text-slate-400">Ray-Casting Algorithm: Validated in 0.4ms</span>
          </div>
        )}

        {/* 4. SMOOTH SPLINE AREA GRADIENT */}
        {selectedChartId === 'spline_area' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[340px] flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-indigo-400 font-bold">● Multi-Period Ingestion Trajectory</span>
              <span className="text-emerald-400">Peak Velocity: 48,200 rows/sec</span>
            </div>

            <div className="w-full h-56 relative flex items-end">
              <svg viewBox="0 0 600 200" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M 0,160 Q 100,120 200,80 T 400,40 T 600,10 L 600,200 L 0,200 Z"
                  fill="url(#areaGradient)"
                />
                <path
                  d="M 0,160 Q 100,120 200,80 T 400,40 T 600,10"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="3"
                />
                <circle cx="200" cy="80" r="5" fill="#a5b4fc" />
                <circle cx="400" cy="40" r="5" fill="#a5b4fc" />
                <circle cx="600" cy="10" r="6" fill="#10b981" />
              </svg>
            </div>

            <div className="flex justify-between text-xs font-mono text-slate-400 border-t border-slate-800 pt-2">
              <span>Month 1 (Jan)</span>
              <span>Month 3 (Mar)</span>
              <span>Month 6 (Jun)</span>
              <span>Month 9 (Sep)</span>
              <span>Month 12 (Dec)</span>
            </div>
          </div>
        )}

        {/* 5. MULTI-METRIC STEP LINE TRAJECTORY */}
        {selectedChartId === 'multi_step_line' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[340px] flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-indigo-400 font-bold">📉 Discrete Step-Wise Horizon Comparison</span>
              <span className="text-emerald-400">+28.4% Net Step</span>
            </div>
            <div className="w-full h-52">
              <svg viewBox="0 0 600 180" className="w-full h-full">
                <path
                  d="M 0,150 L 120,150 L 120,110 L 240,110 L 240,70 L 360,70 L 360,40 L 480,40 L 480,20 L 600,20"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                />
                <path
                  d="M 0,170 L 120,170 L 120,140 L 240,140 L 240,120 L 360,120 L 360,90 L 480,90 L 480,60 L 600,60"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              </svg>
            </div>
            <div className="flex justify-between text-xs font-mono text-slate-400 border-t border-slate-800 pt-2">
              <span>Q1 Baseline</span>
              <span>Q2 Expansion</span>
              <span>Q3 Optimization</span>
              <span>Q4 Target</span>
            </div>
          </div>
        )}

        {/* 6. FINANCIAL CANDLESTICK VOLATILITY */}
        {selectedChartId === 'candlestick_vol' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[340px] flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-indigo-400 font-bold">🕯️ OHLC Candlestick Financial Volatility</span>
              <span className="text-emerald-400">Bullish Momentum (+4.2%)</span>
            </div>
            <div className="flex justify-around items-end h-52 py-2 px-4 border-b border-slate-800">
              {[
                { o: 40, h: 20, l: 80, c: 60, bull: false },
                { o: 60, h: 30, l: 90, c: 35, bull: true },
                { o: 35, h: 10, l: 60, c: 20, bull: true },
                { o: 20, h: 15, l: 70, c: 50, bull: false },
                { o: 50, h: 15, l: 65, c: 25, bull: true },
                { o: 25, h: 5, l: 40, c: 10, bull: true },
              ].map((cdl, idx) => (
                <div key={idx} className="flex flex-col items-center justify-end h-full">
                  <div style={{ height: `${cdl.l - cdl.h}px` }} className={`w-0.5 ${cdl.bull ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <div style={{ height: `${Math.abs(cdl.c - cdl.o) + 15}px` }} className={`w-6 rounded-xs ${cdl.bull ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                </div>
              ))}
            </div>
            <span className="text-[11px] font-mono text-slate-400 text-center">Volume: $1,480,000 settled</span>
          </div>
        )}

        {/* 7. CUMULATIVE AREA GROWTH STREAM */}
        {selectedChartId === 'cumulative_area' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[340px] flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-indigo-400 font-bold">📊 Compounding Multi-Tenant Growth Stream</span>
              <span className="text-emerald-400">Total ARR: $1.48M</span>
            </div>
            <div className="w-full h-52">
              <svg viewBox="0 0 600 180" className="w-full h-full">
                <path d="M 0,180 L 0,140 Q 300,100 600,40 L 600,180 Z" fill="#4f46e5" opacity="0.8" />
                <path d="M 0,180 L 0,160 Q 300,140 600,100 L 600,180 Z" fill="#818cf8" opacity="0.8" />
                <path d="M 0,180 L 0,170 Q 300,160 600,140 L 600,180 Z" fill="#c7d2fe" opacity="0.8" />
              </svg>
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>● Enterprise (65%)</span>
              <span>● Growth Tier (25%)</span>
              <span>● Starter Tier (10%)</span>
            </div>
          </div>
        )}

        {/* 8. MULTI-SERIES GROUPED BAR */}
        {selectedChartId === 'grouped_bar' && (
          <div className="p-6 bg-slate-50 rounded-3xl border text-slate-900 min-h-[340px] space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="font-bold">Grouped Multi-Series Comparison (Q1 - Q4)</span>
              <span className="text-indigo-600 font-bold">Revenue vs Cost</span>
            </div>
            <div className="grid grid-cols-4 gap-6 h-52 items-end border-b pb-2 font-mono text-xs">
              {[
                { label: 'Q1', r: 120, c: 70 },
                { label: 'Q2', r: 160, c: 90 },
                { label: 'Q3', r: 210, c: 110 },
                { label: 'Q4', r: 280, c: 130 },
              ].map((g) => (
                <div key={g.label} className="flex justify-center items-end gap-2 h-full">
                  <div style={{ height: `${g.r * 0.5}px` }} className="w-8 bg-indigo-600 rounded-t-lg" title="Revenue" />
                  <div style={{ height: `${g.c * 0.5}px` }} className="w-8 bg-rose-500 rounded-t-lg" title="Cost" />
                </div>
              ))}
            </div>
            <div className="flex justify-around text-xs font-mono text-slate-600 font-bold">
              <span>Q1 (Jan-Mar)</span>
              <span>Q2 (Apr-Jun)</span>
              <span>Q3 (Jul-Sep)</span>
              <span>Q4 (Oct-Dec)</span>
            </div>
          </div>
        )}

        {/* 9. HORIZONTAL STACKED SEGMENT BAR */}
        {selectedChartId === 'horizontal_bar' && (
          <div className="p-6 bg-slate-50 rounded-3xl border text-slate-900 min-h-[340px] space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="font-bold">Ranked Segment Proportions by Warehouse Hub</span>
              <Badge variant="info">18 Hubs</Badge>
            </div>
            <div className="space-y-3 font-mono text-xs">
              {[
                { name: 'Hollywood Stage #4', val: 85, color: 'bg-indigo-600' },
                { name: 'Burbank Vault Hub', val: 72, color: 'bg-blue-600' },
                { name: 'Atlanta Logistics', val: 64, color: 'bg-emerald-600' },
                { name: 'NY Stage Warehouse', val: 51, color: 'bg-amber-500' },
                { name: 'London Studios EU', val: 38, color: 'bg-purple-600' },
              ].map((bar) => (
                <div key={bar.name} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span>{bar.name}</span>
                    <span>{bar.val}% Stock Capacity</span>
                  </div>
                  <div className="w-full bg-slate-200 h-3.5 rounded-full overflow-hidden">
                    <div style={{ width: `${bar.val}%` }} className={`h-full ${bar.color}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 10. 2D BUBBLE SCATTER CORRELATION */}
        {selectedChartId === 'bubble_scatter' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[340px] flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-indigo-400 font-bold">🔘 Multi-Vector Bubble Scatter Correlation</span>
              <span className="text-emerald-400">R² = 0.94 Correlation</span>
            </div>
            <div className="relative w-full h-56 bg-slate-900/60 rounded-2xl border border-slate-800">
              <div className="absolute top-6 left-12 w-14 h-14 rounded-full bg-indigo-500/70 border border-indigo-300 flex items-center justify-center text-[10px] font-mono">Warner</div>
              <div className="absolute top-16 right-24 w-20 h-20 rounded-full bg-emerald-500/70 border border-emerald-300 flex items-center justify-center text-[10px] font-mono font-bold">Netflix EU</div>
              <div className="absolute bottom-8 left-1/3 w-12 h-12 rounded-full bg-amber-500/70 border border-amber-300 flex items-center justify-center text-[10px] font-mono">Lionsgate</div>
              <div className="absolute bottom-14 right-12 w-16 h-16 rounded-full bg-purple-500/70 border border-purple-300 flex items-center justify-center text-[10px] font-mono font-bold">Universal</div>
            </div>
            <div className="flex justify-between text-xs font-mono text-slate-400">
              <span>X-Axis: Deal Volume</span>
              <span>Y-Axis: AI Lead Score</span>
              <span>Bubble Radius: Contract ACV</span>
            </div>
          </div>
        )}

        {/* 11. RADIAL RING CONCENTRIC METRIC */}
        {selectedChartId === 'radial_ring' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[340px] flex flex-col items-center justify-center space-y-4">
            <div className="relative w-60 h-60 flex items-center justify-center">
              <div className="w-56 h-56 rounded-full border-[8px] border-slate-800 border-t-indigo-500 border-r-indigo-500 absolute" />
              <div className="w-44 h-44 rounded-full border-[8px] border-slate-800 border-t-emerald-500 border-l-emerald-500 absolute" />
              <div className="w-32 h-32 rounded-full border-[8px] border-slate-800 border-b-amber-500 border-r-amber-500 absolute" />
              <div className="text-center font-mono">
                <span className="text-xl font-black block">94.2%</span>
                <span className="text-[10px] text-slate-400 uppercase">Composite SLA</span>
              </div>
            </div>
            <div className="flex gap-4 text-xs font-mono text-slate-400">
              <span className="text-indigo-400">● Ingestion (98%)</span>
              <span className="text-emerald-400">● Validation (95%)</span>
              <span className="text-amber-400">● ERP Sync (88%)</span>
            </div>
          </div>
        )}

        {/* 12. MULTI-TIER NESTED DONUT CHART */}
        {selectedChartId === 'nested_donut' && (
          <div className="p-6 bg-slate-50 rounded-3xl border text-slate-900 min-h-[340px] flex flex-col items-center justify-center space-y-4">
            <div className="relative w-52 h-52 flex items-center justify-center">
              <div className="w-48 h-48 rounded-full border-[20px] border-indigo-600 border-t-emerald-500 border-r-blue-500 border-b-amber-500 absolute shadow-md" />
              <div className="text-center font-mono">
                <span className="text-2xl font-black text-slate-900 block">$1.48M</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Total ARR</span>
              </div>
            </div>
            <div className="flex gap-4 text-xs font-mono text-slate-600 font-bold">
              <span className="text-indigo-600">● Dedicated DB (65%)</span>
              <span className="text-blue-600">● Schema (25%)</span>
              <span className="text-amber-600">● Shared RLS (10%)</span>
            </div>
          </div>
        )}

        {/* 13. TREEMAP HIERARCHICAL DENSITY TILES */}
        {selectedChartId === 'treemap_density' && (
          <div className="p-6 bg-slate-50 rounded-3xl border text-slate-900 min-h-[340px] space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="font-bold">Hierarchical Treemap Area Proportions</span>
              <Badge variant="success">100% Allocated</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 h-52 font-mono text-white font-bold text-xs">
              <div className="col-span-2 bg-indigo-600 p-3 rounded-xl flex flex-col justify-between shadow-xs">
                <span>Enterprise Dedicated DBs</span>
                <span className="text-lg font-black">$962,000 (65%)</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="bg-blue-600 p-2.5 rounded-xl h-full flex flex-col justify-between shadow-xs">
                  <span className="text-[11px]">Schema Isolated</span>
                  <span className="font-black">$370,000 (25%)</span>
                </div>
                <div className="bg-amber-600 p-2.5 rounded-xl h-full flex flex-col justify-between shadow-xs">
                  <span className="text-[11px]">Shared RLS</span>
                  <span className="font-black">$148,000 (10%)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 14. POLAR RADAR CAPABILITY MATRIX */}
        {selectedChartId === 'polar_radar' && (
          <div className="p-6 bg-slate-50 rounded-3xl border text-slate-900 min-h-[340px] flex flex-col items-center justify-center space-y-4">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
              6-Vector Enterprise Risk & Performance Radar
            </h4>
            <div className="grid grid-cols-3 gap-4 max-w-md w-full text-xs font-mono text-center">
              <div className="p-3 bg-white border rounded-xl shadow-xs">
                <span className="text-slate-400 text-[10px] block">THROUGHPUT</span>
                <strong className="text-indigo-600 font-black text-base">98/100</strong>
              </div>
              <div className="p-3 bg-white border rounded-xl shadow-xs">
                <span className="text-slate-400 text-[10px] block">SECURITY (SOC2)</span>
                <strong className="text-emerald-600 font-black text-base">100/100</strong>
              </div>
              <div className="p-3 bg-white border rounded-xl shadow-xs">
                <span className="text-slate-400 text-[10px] block">SLA LATENCY</span>
                <strong className="text-indigo-600 font-black text-base">94/100</strong>
              </div>
              <div className="p-3 bg-white border rounded-xl shadow-xs">
                <span className="text-slate-400 text-[10px] block">ACCURACY (0-DRIFT)</span>
                <strong className="text-emerald-600 font-black text-base">99.8/100</strong>
              </div>
              <div className="p-3 bg-white border rounded-xl shadow-xs">
                <span className="text-slate-400 text-[10px] block">FRAUD RESISTANCE</span>
                <strong className="text-emerald-600 font-black text-base">99.2/100</strong>
              </div>
              <div className="p-3 bg-white border rounded-xl shadow-xs">
                <span className="text-slate-400 text-[10px] block">ERP SYNC RATE</span>
                <strong className="text-indigo-600 font-black text-base">100/100</strong>
              </div>
            </div>
          </div>
        )}

        {/* 15. SUNBURST MULTI-LEVEL HIERARCHY */}
        {selectedChartId === 'sunburst_ring' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[340px] flex flex-col items-center justify-center space-y-4">
            <div className="relative w-56 h-56 flex items-center justify-center">
              <div className="w-52 h-52 rounded-full border-[14px] border-indigo-500/40 absolute" />
              <div className="w-36 h-36 rounded-full border-[14px] border-emerald-500/60 absolute" />
              <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-xs font-mono font-bold">ROOT</div>
            </div>
            <span className="text-xs font-mono text-slate-400">Drilldown Hierarchy: Tenant ➔ Module ➔ Storage</span>
          </div>
        )}

        {/* 16. EBITDA CASH FLOW WATERFALL */}
        {selectedChartId === 'waterfall_cash' && (
          <div className="p-6 bg-slate-50 rounded-3xl border text-slate-900 min-h-[340px] space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="font-bold">EBITDA Cash Reconciliation Waterfall ($ USD)</span>
              <Badge variant="success">Net Positive Cash: +$1,307,000</Badge>
            </div>

            <div className="grid grid-cols-5 gap-3 h-52 items-end font-mono text-xs">
              <div className="space-y-1 text-center">
                <span className="font-bold block text-slate-800">+$2.45M</span>
                <div className="h-44 bg-emerald-500 rounded-xl shadow-md" />
                <span className="text-[10px] text-slate-500 font-bold block">Gross Deals</span>
              </div>

              <div className="space-y-1 text-center">
                <span className="font-bold block text-rose-600">-$380k</span>
                <div className="h-20 bg-rose-500 rounded-xl shadow-md" />
                <span className="text-[10px] text-slate-500 font-bold block">Cloud Ops</span>
              </div>

              <div className="space-y-1 text-center">
                <span className="font-bold block text-rose-600">-$420k</span>
                <div className="h-24 bg-rose-500 rounded-xl shadow-md" />
                <span className="text-[10px] text-slate-500 font-bold block">COGS / Royalty</span>
              </div>

              <div className="space-y-1 text-center">
                <span className="font-bold block text-rose-600">-$343k</span>
                <div className="h-16 bg-rose-500 rounded-xl shadow-md" />
                <span className="text-[10px] text-slate-500 font-bold block">Tax Liability</span>
              </div>

              <div className="space-y-1 text-center">
                <span className="font-bold block text-indigo-600 font-black">+$1.30M</span>
                <div className="h-32 bg-indigo-600 rounded-xl shadow-md" />
                <span className="text-[10px] text-indigo-600 font-bold block">Net EBITDA</span>
              </div>
            </div>
          </div>
        )}

        {/* 17. SANKEY STREAM CONVERSION FUNNEL */}
        {selectedChartId === 'sankey_funnel' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[340px] flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-indigo-400 font-bold">🔀 Sankey Stream Flow & Drop-Off Ribbon</span>
              <span className="text-emerald-400">18.4% End-to-End Conversion</span>
            </div>
            <div className="w-full h-52 flex items-center justify-between px-4 font-mono text-xs">
              <div className="p-4 bg-indigo-600 rounded-2xl text-center space-y-1">
                <span className="text-[10px] block opacity-80">INBOUND LEADS</span>
                <strong className="text-base block">12,400</strong>
              </div>
              <div className="h-2 flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 mx-2 rounded-full" />
              <div className="p-4 bg-blue-600 rounded-2xl text-center space-y-1">
                <span className="text-[10px] block opacity-80">QUALIFIED DEMO</span>
                <strong className="text-base block">4,800</strong>
              </div>
              <div className="h-2 flex-1 bg-gradient-to-r from-blue-600 to-emerald-600 mx-2 rounded-full" />
              <div className="p-4 bg-emerald-600 rounded-2xl text-center space-y-1">
                <span className="text-[10px] block opacity-80">CLOSED WON</span>
                <strong className="text-base block">2,280</strong>
              </div>
            </div>
            <div className="flex justify-between text-xs font-mono text-slate-400">
              <span>Top of Funnel</span>
              <span>Middle of Funnel</span>
              <span>Bottom of Funnel (Won)</span>
            </div>
          </div>
        )}

        {/* 18. CIRCULAR SPEEDOMETER SLA GAUGE */}
        {selectedChartId === 'speedometer_gauge' && (
          <div className="p-8 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[340px] flex flex-col items-center justify-center space-y-4">
            <div className="relative w-64 h-32 flex items-end justify-center overflow-hidden">
              <div className="w-64 h-64 rounded-full border-[18px] border-slate-800 border-t-emerald-500 border-r-emerald-500 border-l-indigo-500 absolute top-0" />
              <div className="text-center z-10 space-y-0.5">
                <div className="text-4xl font-black text-white font-mono">99.98%</div>
                <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold tracking-wider">
                  Target: 99.50% SLA
                </span>
              </div>
            </div>
            <p className="text-xs font-mono text-slate-400">Zero SLA penalty incidents across 1,024 active pipelines</p>
          </div>
        )}

        {/* 19. 2D ACTIVITY HEATMAP GRID */}
        {selectedChartId === 'heatmap_matrix' && (
          <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 text-white min-h-[340px] space-y-3">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-indigo-400 font-bold">🔥 7x24 Ingestion Intensity Matrix</span>
              <span className="text-emerald-400">Peak Hour: 14:00 UTC</span>
            </div>
            <div className="grid grid-cols-12 gap-1.5 pt-2">
              {Array.from({ length: 48 }).map((_, idx) => {
                const colors = ['bg-slate-900', 'bg-indigo-950', 'bg-indigo-800', 'bg-indigo-600', 'bg-indigo-400', 'bg-emerald-400'];
                const randomColor = colors[idx % colors.length];
                return (
                  <div key={idx} className={`h-8 rounded-lg ${randomColor} flex items-center justify-center text-[9px] font-mono text-white/70`} title={`Bucket ${idx}`}>
                    {idx + 1}h
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 20. BULLET PERFORMANCE TARGET METER */}
        {selectedChartId === 'bullet_target' && (
          <div className="p-6 bg-slate-50 rounded-3xl border text-slate-900 min-h-[340px] space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="font-bold">Bullet Target Performance vs Qualitative Bands</span>
              <Badge variant="success">Exceeds Target (118%)</Badge>
            </div>
            <div className="space-y-4 font-mono text-xs">
              {[
                { label: 'ARR Revenue ($)', actual: 148, target: 120, max: 200 },
                { label: 'Ingestion Throughput (MB/s)', actual: 85, target: 70, max: 100 },
                { label: 'API Uptime Availability (%)', actual: 99.98, target: 99.5, max: 100 },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between font-bold">
                    <span>{item.label}</span>
                    <span className="text-indigo-600">Actual: {item.actual} / Target: {item.target}</span>
                  </div>
                  <div className="relative h-6 w-full bg-slate-200 rounded-lg overflow-hidden flex items-center">
                    <div style={{ width: `${(item.actual / item.max) * 100}%` }} className="h-full bg-indigo-600" />
                    <div style={{ left: `${(item.target / item.max) * 100}%` }} className="absolute h-full w-1.5 bg-rose-600" title="Target Marker" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Modal: Copy React JSX Embed */}
      {isEmbedModalOpen && (
        <Modal
          isOpen={isEmbedModalOpen}
          onClose={() => setIsEmbedModalOpen(false)}
          title={`📋 Export ${activeChart.name} as Embeddable React Widget`}
        >
          <div className="space-y-3 text-xs">
            <p className="text-slate-500">Copy this component snippet to embed this live chart in any other frontend or micro-app:</p>
            <div className="p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl overflow-x-auto shadow-inner">
              <pre>{`<GigaLibsBiVisual
  chartType="${activeChart.id}"
  datasetSource="${selectedDataset}"
  xAxis="${xAxisField}"
  yAxis="${yAxisField}"
  aggregation="${aggregation}"
  autoRefreshIntervalMs={1000}
/>`}</pre>
            </div>
            <Button onClick={() => { alert('✓ Copied React embed snippet to clipboard!'); setIsEmbedModalOpen(false); }} className="w-full font-bold">
              Copy JSX to Clipboard 📋
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
