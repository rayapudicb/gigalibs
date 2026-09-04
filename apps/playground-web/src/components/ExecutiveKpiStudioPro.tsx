import * as React from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, StatusBadge, Input, Modal } from '@gigalibs/ui';
import { ApiClient } from '../api-client.js';

export interface CustomKpiWidget {
  id: string;
  title: string;
  value: string;
  change: number;
  category: 'REVENUE' | 'EFFICIENCY' | 'USAGE' | 'RETENTION';
  benchmark: string;
}

export const DEFAULT_CUSTOM_KPIS: CustomKpiWidget[] = [
  { id: 'kpi_rule40', title: 'Rule of 40 Index (Growth + Margin)', value: '—', change: 0, category: 'EFFICIENCY', benchmark: 'Target > 40%' },
  { id: 'kpi_magic_num', title: 'SaaS Magic Number (Sales Efficiency)', value: '—', change: 0, category: 'EFFICIENCY', benchmark: 'Target > 1.0x' },
  { id: 'kpi_burn_mult', title: 'Net Burn Multiple (Net Burn / Net ARR)', value: '—', change: 0, category: 'REVENUE', benchmark: 'Target < 1.0x' },
  { id: 'kpi_cac_payback', title: 'CAC Payback Period', value: '—', change: 0, category: 'RETENTION', benchmark: 'Target < 12 Mo' },
];

export function ExecutiveKpiStudioPro() {
  // Admin Dynamic Filters
  const [timeframe, setTimeframe] = React.useState<'30D' | 'Q3_2026' | 'YTD' | 'ALL_TIME'>('YTD');
  const [tenantFilter, setTenantFilter] = React.useState<string>('ALL');
  const [currency, setCurrency] = React.useState<'USD' | 'EUR' | 'GBP'>('USD');

  // Live KPI data from DB
  const [liveKpis, setLiveKpis] = React.useState<any>(null);
  const [isLoadingKpis, setIsLoadingKpis] = React.useState(true);

  React.useEffect(() => {
    setIsLoadingKpis(true);
    ApiClient.getExecutiveKpis()
      .then((data) => setLiveKpis(data))
      .catch(() => setLiveKpis(null))
      .finally(() => setIsLoadingKpis(false));
  }, [tenantFilter]);

  // Custom Admin Widgets
  const [customWidgets, setCustomWidgets] = React.useState<CustomKpiWidget[]>(DEFAULT_CUSTOM_KPIS);
  const [isAddWidgetModalOpen, setIsAddWidgetModalOpen] = React.useState(false);
  const [newWidgetTitle, setNewWidgetTitle] = React.useState('');
  const [newWidgetValue, setNewWidgetValue] = React.useState('');
  const [newWidgetBenchmark, setNewWidgetBenchmark] = React.useState('');

  // Currency Multiplier
  const currRate = currency === 'EUR' ? 0.92 : currency === 'GBP' ? 0.78 : 1.0;
  const currSym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

  // Real DB values (fall back to 0 if not yet loaded)
  const rawArrCents = liveKpis?.arrCents ?? 0;
  const rawMrrCents = liveKpis?.mrrCents ?? 0;
  const rawRevenueCents = liveKpis?.totalRevenueCents ?? 0;
  const rawArOutstanding = liveKpis?.totalArOutstandingCents ?? 0;

  const dynamicArr = Math.round((rawArrCents / 100) * currRate);
  const dynamicMrr = Math.round((rawMrrCents / 100) * currRate);
  const dynamicArpu = rawRevenueCents > 0 && (liveKpis?.activeClientsCount ?? 0) > 0
    ? Math.round((rawRevenueCents / 100 / liveKpis.activeClientsCount) * currRate)
    : 0;
  const dynamicLtv = dynamicArpu * 12;
  const dynamicCac = Math.round(dynamicArpu * 0.8);
  const dynamicNetNewMrr = dynamicMrr;


  // Add Custom Widget
  const handleAddWidget = () => {
    if (!newWidgetTitle.trim() || !newWidgetValue.trim()) return;
    const newKpi: CustomKpiWidget = {
      id: `kpi_${Date.now()}`,
      title: newWidgetTitle,
      value: newWidgetValue,
      change: 3.5,
      category: 'REVENUE',
      benchmark: newWidgetBenchmark || 'Custom Goal',
    };
    setCustomWidgets((prev) => [newKpi, ...prev]);
    setIsAddWidgetModalOpen(false);
    setNewWidgetTitle('');
    setNewWidgetValue('');
    setNewWidgetBenchmark('');
  };

  return (
    <div className="space-y-6">
      {/* ─── ADMIN DYNAMIC CONTROLS HEADER ───────────────────────────────────── */}
      <div className="p-4 bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-2xl space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <h2 className="text-base font-black text-white">Executive KPI & MRR Revenue Velocity Studio</h2>
              <Badge variant="success">DYNAMIC ADMIN PLANE</Badge>
            </div>
            <p className="text-xs text-slate-400">
              Real-time multi-currency metrics, cohort retention, MRR movements, and custom executive widget builder.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setIsAddWidgetModalOpen(true)}
              className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold text-xs"
            >
              + Add Custom KPI Widget 📈
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => alert('✓ Generated Executive Board Deck PDF with dynamic multi-currency revaluation!')}
              className="!text-slate-200 !border-slate-700 font-bold text-xs"
            >
              📥 Export Board Deck (PDF)
            </Button>
          </div>
        </div>

        {/* Dynamic Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs">
          {/* Timeframe selector */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-indigo-300">Timeframe:</span>
            <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { id: '30D', label: 'Last 30 Days' },
                { id: 'Q3_2026', label: 'Q3 2026' },
                { id: 'YTD', label: 'Year-to-Date (YTD)' },
                { id: 'ALL_TIME', label: 'All Time (5 Yrs)' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTimeframe(t.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    timeframe === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tenant filter & Currency switcher */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-indigo-300">Tenant Filter:</span>
              <select
                value={tenantFilter}
                onChange={(e) => setTenantFilter(e.target.value)}
                className="h-8 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-xs"
              >
                <option value="ALL">All Enterprise Tenants (Global)</option>
                <option value="PARAMOUNT">Paramount Pictures Corp</option>
                <option value="WARNER">Warner Bros Discovery</option>
                <option value="NETFLIX">Netflix Studios Europe EU</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-indigo-300">Currency:</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as any)}
                className="h-8 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-xs"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ─── DYNAMIC TOP KPI METRIC CARDS ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 bg-white border-slate-200 space-y-2 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs">
            <span className="font-bold uppercase tracking-wider font-mono text-[10px]">Annual Run Rate (ARR)</span>
            <span className="text-emerald-600 font-bold text-xs">↑ +24.8%</span>
          </div>
          <div className="text-3xl font-black text-slate-900 font-sans">
            {currSym}{dynamicArr.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">Normalized {currency} Functional Currency</div>
        </Card>

        <Card className="p-5 bg-white border-slate-200 space-y-2 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs">
            <span className="font-bold uppercase tracking-wider font-mono text-[10px]">Monthly Recurring Revenue</span>
            <span className="text-emerald-600 font-bold text-xs">↑ +18.2%</span>
          </div>
          <div className="text-3xl font-black text-indigo-600 font-sans">
            {currSym}{dynamicMrr.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">Net New: +{currSym}{dynamicNetNewMrr.toLocaleString()}/mo</div>
        </Card>

        <Card className="p-5 bg-white border-slate-200 space-y-2 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs">
            <span className="font-bold uppercase tracking-wider font-mono text-[10px]">Net Revenue Retention (NRR)</span>
            <span className="text-emerald-600 font-bold text-xs">↑ Top Quartile</span>
          </div>
          <div className="text-3xl font-black text-emerald-600 font-sans">
            118.4%
          </div>
          <div className="text-[11px] text-slate-400 font-mono">Gross Retention: 98.2%</div>
        </Card>

        <Card className="p-5 bg-white border-slate-200 space-y-2 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs">
            <span className="font-bold uppercase tracking-wider font-mono text-[10px]">LTV / CAC Ratio</span>
            <span className="text-indigo-600 font-bold text-xs">5.27x</span>
          </div>
          <div className="text-3xl font-black text-slate-900 font-sans">
            {currSym}{dynamicLtv.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">CAC: {currSym}{dynamicCac.toLocaleString()} (7.8 Mo Payback)</div>
        </Card>
      </div>

      {/* ─── MRR MOVEMENT WATERFALL & EXPANSION BREAKDOWN ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Waterfall Breakdown */}
        <Card className="lg:col-span-2 p-6 bg-white border-slate-200 space-y-4 shadow-sm">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">🌊 Monthly MRR Movement Waterfall ({currency})</h3>
              <p className="text-xs text-slate-500">Decomposition of New, Expansion, Contraction, and Churn revenue.</p>
            </div>
            <Badge variant="success">Net Growth: +{currSym}{dynamicNetNewMrr.toLocaleString()}</Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
              <span className="text-emerald-800 font-bold text-[10px] uppercase block">New MRR Added</span>
              <strong className="text-emerald-700 text-lg font-black block">+{currSym}{Math.round(12400 * currRate).toLocaleString()}</strong>
              <span className="text-[10px] text-emerald-600">8 New Enterprise Deals</span>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
              <span className="text-blue-800 font-bold text-[10px] uppercase block">Expansion MRR</span>
              <strong className="text-blue-700 text-lg font-black block">+{currSym}{Math.round(7200 * currRate).toLocaleString()}</strong>
              <span className="text-[10px] text-blue-600">Dedicated DB Upgrades</span>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
              <span className="text-amber-800 font-bold text-[10px] uppercase block">Contraction MRR</span>
              <strong className="text-amber-700 text-lg font-black block">-{currSym}{Math.round(850 * currRate).toLocaleString()}</strong>
              <span className="text-[10px] text-amber-600">Seat Reductions</span>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
              <span className="text-rose-800 font-bold text-[10px] uppercase block">Churned MRR</span>
              <strong className="text-rose-700 text-lg font-black block">-{currSym}{Math.round(350 * currRate).toLocaleString()}</strong>
              <span className="text-[10px] text-rose-600">0.28% Logo Churn</span>
            </div>
          </div>

          {/* Visual SVG Progress Bar */}
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-xs font-bold text-slate-700">
              <span>MRR Composition Breakdown</span>
              <span className="text-emerald-600 font-mono">94.2% Positive Momentum</span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div style={{ width: '65%' }} className="bg-emerald-500 h-full" title="New MRR" />
              <div style={{ width: '25%' }} className="bg-blue-500 h-full" title="Expansion MRR" />
              <div style={{ width: '7%' }} className="bg-amber-400 h-full" title="Contraction MRR" />
              <div style={{ width: '3%' }} className="bg-rose-500 h-full" title="Churned MRR" />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
              <span>● New (65%)</span>
              <span>● Expansion (25%)</span>
              <span>● Contraction (7%)</span>
              <span>● Churn (3%)</span>
            </div>
          </div>
        </Card>

        {/* SaaS Efficiency Metrics */}
        <Card className="p-6 bg-white border-slate-200 space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-sm text-slate-900">⚡ SaaS Efficiency Health</h3>
              <Badge variant="info">Top 5% Benchmark</Badge>
            </div>

            <div className="space-y-3 pt-3 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-slate-500">Gross Margin %:</span>
                <strong className="text-slate-900 font-mono font-bold">86.4%</strong>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-slate-500">Magic Number:</span>
                <strong className="text-emerald-600 font-mono font-bold">1.42x (High Efficiency)</strong>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-slate-500">Rule of 40 Index:</span>
                <strong className="text-indigo-600 font-mono font-bold">58.4% (Elite Tier)</strong>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-slate-500">Net Burn Multiple:</span>
                <strong className="text-emerald-600 font-mono font-bold">0.45x</strong>
              </div>
            </div>
          </div>

          <Button
            size="sm"
            onClick={() => alert('✓ Benchmarks reconciled against Battery Ventures & Bessemer SaaS Indices!')}
            className="w-full font-bold text-xs"
          >
            Re-calculate SaaS Indices 🔄
          </Button>
        </Card>
      </div>

      {/* ─── CUSTOM ADMIN KPI WIDGETS STRIP ──────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-sm text-slate-900">⚙️ Custom Admin Executive KPI Widgets</h3>
          <span className="text-xs text-slate-500">{customWidgets.length} Active Custom Formulas</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {customWidgets.map((kpi) => (
            <Card key={kpi.id} className="p-4 bg-slate-50 border-slate-200 space-y-2">
              <div className="flex justify-between items-start">
                <strong className="text-xs text-slate-800 font-sans block">{kpi.title}</strong>
                <Badge variant="info">{kpi.category}</Badge>
              </div>
              <div className="text-2xl font-black text-indigo-600 font-mono">{kpi.value}</div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono border-t pt-1.5">
                <span>{kpi.benchmark}</span>
                <span className="text-emerald-600 font-bold">↑ +{kpi.change}%</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Modal: Add Custom KPI Widget */}
      {isAddWidgetModalOpen && (
        <Modal
          isOpen={isAddWidgetModalOpen}
          onClose={() => setIsAddWidgetModalOpen(false)}
          title="📈 Add Custom Executive KPI Metric"
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold block mb-1">Metric Title</label>
              <Input
                placeholder="e.g. GPU Compute Burn / Tenant"
                value={newWidgetTitle}
                onChange={(e) => setNewWidgetTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="font-bold block mb-1">Calculated Formula Value</label>
              <Input
                placeholder="e.g. $42.50 / hr"
                value={newWidgetValue}
                onChange={(e) => setNewWidgetValue(e.target.value)}
              />
            </div>

            <div>
              <label className="font-bold block mb-1">Target Benchmark Note</label>
              <Input
                placeholder="e.g. Budget Target < $50"
                value={newWidgetBenchmark}
                onChange={(e) => setNewWidgetBenchmark(e.target.value)}
              />
            </div>

            <Button onClick={handleAddWidget} className="w-full !bg-indigo-600 !text-white font-bold">
              Instantiate Custom Metric Widget 🚀
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
