import React, { useState, useEffect } from 'react';
import {
  UniversalTrendAnalysisEngine,
  type TimeSeriesDataPoint,
} from '@gigalibs/analytics-core';
import {
  TravelAndPerDiemEngine,
  ImprestMultiWalletEngine,
  type CityTier,
  type ImprestWalletState,
} from '@gigalibs/spend-core';
import { Badge } from '@gigalibs/ui';

// Inline SVG Icon components
const DollarSign = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
);
const TrendingUp = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
);
const AlertTriangle = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);
const CheckCircle = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
const Plus = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);
const RefreshCw = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
);
const FileText = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
);
const CreditCard = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
);
const Building = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>
);
const PieChart = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
);
const Clock = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
const Plane = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
);
const Wallet = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
);
const Sparkles = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg>
);

const API_BASE = '/api/v1';

export interface SpendStudioProps {
  tenantId?: string;
}

export function SpendStudio({ tenantId = 'warner-bros' }: SpendStudioProps) {
  const [activeTab, setActiveTab] = useState<
    'budgets' | 'expenses' | 'travel' | 'imprest' | 'subscriptions' | 'trends' | 'pnl'
  >('budgets');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Data states
  const [budgets, setBudgets] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [subscriptionsData, setSubscriptionsData] = useState<{
    subscriptions: any[];
    burn: any;
    upcomingRenewals: any[];
  }>({ subscriptions: [], burn: null, upcomingRenewals: [] });
  const [pnlSummary, setPnlSummary] = useState<any>(null);

  // Travel Desk State
  const [travelRequests, setTravelRequests] = useState([
    {
      id: 'TR-101',
      travelerName: 'Marcus Vance (Director)',
      destination: 'London Studio Stage',
      cityTier: 'TIER_1_METRO' as CityTier,
      days: 5,
      hotelNightlyCents: 28000, // $280/night
      totalPerDiemCents: 47500, // $475.00
      status: 'APPROVED',
    },
    {
      id: 'TR-102',
      travelerName: 'Elena Rostova (DP)',
      destination: 'Austin Location Shoot',
      cityTier: 'TIER_2_STANDARD' as CityTier,
      days: 4,
      hotelNightlyCents: 34000, // $340/night -> Exceeds $300 policy cap
      totalPerDiemCents: 30000,
      status: 'POLICY_EXCEPTION',
    },
  ]);

  // Imprest Petty Cash Multi-Wallets State
  const [imprestWallets, setImprestWallets] = useState<ImprestWalletState[]>([
    {
      walletId: 'WAL-STAGE-4',
      locationName: 'Warner Bros Stage 4 Production Float',
      floatLimitCents: 500000, // $5,000.00
      minThresholdCents: 150000, // $1,500.00
      currentBalanceCents: 120000, // $1,200.00 -> Needs replenishment
    },
    {
      walletId: 'WAL-VANCOUVER',
      locationName: 'Vancouver Second Unit Float',
      floatLimitCents: 1000000, // $10,000.00
      minThresholdCents: 300000, // $3,000.00
      currentBalanceCents: 680000, // $6,800.00 -> Healthy
    },
  ]);

  // AI Trend & Anomaly Engine State
  const [trendStream, setTrendStream] = useState<TimeSeriesDataPoint[]>([
    { timestamp: 'Jan 2026', value: 12000, label: 'Crew Shift Labor' },
    { timestamp: 'Feb 2026', value: 14500, label: 'Crew Shift Labor' },
    { timestamp: 'Mar 2026', value: 13800, label: 'Crew Shift Labor' },
    { timestamp: 'Apr 2026', value: 16200, label: 'Crew Shift Labor' },
    { timestamp: 'May 2026', value: 34000, label: 'Overtime Spike (Anomaly)' },
    { timestamp: 'Jun 2026', value: 17100, label: 'Crew Shift Labor' },
    { timestamp: 'Jul 2026', value: 18500, label: 'Crew Shift Labor' },
    { timestamp: 'Aug 2026', value: 19800, label: 'Crew Shift Labor' },
  ]);
  const [whatIfMultiplier, setWhatIfMultiplier] = useState<number>(0.85); // -15% cost optimization

  // Modals
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showTravelModal, setShowTravelModal] = useState(false);

  // Form states
  const [newBudget, setNewBudget] = useState({
    name: '',
    code: '',
    projectId: tenantId,
    department: 'Production',
    totalLimitDollars: '50000',
    warnThresholdPct: '80',
  });

  const [newExpense, setNewExpense] = useState({
    claimantName: 'Sarah Jenkins (Gaffer)',
    claimantEmail: 'sarah.jenkins@production.wb.com',
    merchant: 'Cinelease Lighting Rental',
    category: 'Equipment Rental',
    amountDollars: '450.00',
    passThrough: 'BILLABLE',
    markupPercent: '15',
    receiptOcrText: 'INVOICE #9921 - Cinelease Grip & Lighting - Total: $450.00 - Date: 2026-09-01',
    budgetId: '',
  });

  const [newSub, setNewSub] = useState({
    vendorName: 'AWS Cloud Services',
    serviceCategory: 'Cloud Infrastructure',
    cadence: 'MONTHLY',
    amountDollars: '1250.00',
    nextRenewalDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    ownerEmail: 'devops@warner-bros.com',
    seatsAllocated: '10',
  });

  const [newTravel, setNewTravel] = useState({
    travelerName: 'David Cho (Sound Engineer)',
    destination: 'Atlanta Location Soundstage',
    cityTier: 'TIER_2_STANDARD' as CityTier,
    days: '4',
    hotelNightlyDollars: '240.00',
    mealsProvidedCount: '1',
  });

  const formatCurrency = (cents: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  };

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const bRes = await fetch(`${API_BASE}/spend/budgets/${tenantId}`);
      if (bRes.ok) {
        const bData = await bRes.json();
        setBudgets(bData);
        if (bData.length > 0 && !newExpense.budgetId) {
          setNewExpense((prev) => ({ ...prev, budgetId: bData[0].id }));
        }
      }

      const eRes = await fetch(`${API_BASE}/spend/expenses/${tenantId}`);
      if (eRes.ok) setExpenses(await eRes.json());

      const sRes = await fetch(`${API_BASE}/spend/subscriptions/${tenantId}`);
      if (sRes.ok) setSubscriptionsData(await sRes.json());

      const pRes = await fetch(`${API_BASE}/spend/summary/${tenantId}`);
      if (pRes.ok) setPnlSummary(await pRes.json());
    } catch (err: any) {
      showNotify('error', `Failed to load Spend data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [tenantId]);

  // Actions
  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/spend/budgets/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBudget.name,
          code: newBudget.code,
          projectId: tenantId,
          department: newBudget.department,
          totalLimitCents: Math.round(parseFloat(newBudget.totalLimitDollars) * 100),
          warnThresholdPct: parseInt(newBudget.warnThresholdPct, 10),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create budget');
      }

      showNotify('success', `Budget "${newBudget.name}" created successfully!`);
      setShowBudgetModal(false);
      fetchAllData();
    } catch (err: any) {
      showNotify('error', err.message);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/spend/expenses/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimantName: newExpense.claimantName,
          claimantEmail: newExpense.claimantEmail,
          merchant: newExpense.merchant,
          category: newExpense.category,
          amountCents: Math.round(parseFloat(newExpense.amountDollars) * 100),
          passThrough: newExpense.passThrough,
          markupPercent: parseFloat(newExpense.markupPercent) || 0,
          receiptOcrText: newExpense.receiptOcrText,
          budgetId: budgets.some((b) => b.id === newExpense.budgetId) ? newExpense.budgetId : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to submit expense claim');
      }

      showNotify('success', 'Expense claim submitted for manager review!');
      setShowExpenseModal(false);
      fetchAllData();
    } catch (err: any) {
      showNotify('error', err.message);
    }
  };

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/spend/subscriptions/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName: newSub.vendorName,
          serviceCategory: newSub.serviceCategory,
          cadence: newSub.cadence,
          amountCents: Math.round(parseFloat(newSub.amountDollars) * 100),
          nextRenewalDate: new Date(newSub.nextRenewalDate).toISOString(),
          ownerEmail: newSub.ownerEmail,
          seatsAllocated: parseInt(newSub.seatsAllocated, 10) || 1,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to register subscription contract');
      }

      showNotify('success', `Vendor Contract "${newSub.vendorName}" registered!`);
      setShowSubModal(false);
      fetchAllData();
    } catch (err: any) {
      showNotify('error', err.message);
    }
  };

  const handleExpenseAction = async (id: string, action: 'APPROVE' | 'REJECT') => {
    try {
      const res = await fetch(`${API_BASE}/spend/expenses/${tenantId}/${id}/approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Approval action failed');
      }

      showNotify('success', `Expense claim ${action === 'APPROVE' ? 'Approved' : 'Rejected'}!`);
      fetchAllData();
    } catch (err: any) {
      showNotify('error', err.message);
    }
  };

  const handleReimburseExpense = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/spend/expenses/${tenantId}/${id}/reimburse`, {
        method: 'PATCH',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Reimbursement failed');
      }

      showNotify('success', 'Expense claim Reimbursed & Settled in General Ledger!');
      fetchAllData();
    } catch (err: any) {
      showNotify('error', err.message);
    }
  };

  const handleReplenishWallet = (walletId: string) => {
    setImprestWallets((prev) =>
      prev.map((w) => {
        if (w.walletId === walletId) {
          const evalRes = ImprestMultiWalletEngine.evaluateReplenishment(w);
          return {
            ...w,
            currentBalanceCents: w.floatLimitCents,
          };
        }
        return w;
      })
    );
    showNotify('success', `Imprest Float auto-replenished back to 100% capacity!`);
  };

  const handleCreateTravelRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const days = parseInt(newTravel.days, 10) || 1;
    const hotelNightlyCents = Math.round(parseFloat(newTravel.hotelNightlyDollars) * 100);
    const mealsProvided = parseInt(newTravel.mealsProvidedCount, 10) || 0;

    const perDiemRes = TravelAndPerDiemEngine.calculatePerDiem(newTravel.cityTier, days, mealsProvided);
    const hotelCheck = TravelAndPerDiemEngine.validateHotelBooking(hotelNightlyCents);

    const req = {
      id: `TR-${100 + travelRequests.length + 1}`,
      travelerName: newTravel.travelerName,
      destination: newTravel.destination,
      cityTier: newTravel.cityTier,
      days,
      hotelNightlyCents,
      totalPerDiemCents: perDiemRes.totalPerDiemCents,
      status: hotelCheck.isCompliant ? 'APPROVED' : 'POLICY_EXCEPTION',
    };

    setTravelRequests([req, ...travelRequests]);
    showNotify('success', `Travel Desk request registered with auto per-diem of ${formatCurrency(perDiemRes.totalPerDiemCents)}!`);
    setShowTravelModal(false);
  };

  // Trend Analysis Computations
  const anomalyResults = UniversalTrendAnalysisEngine.detectAnomalies(trendStream, 2.0);
  const forecastResult = UniversalTrendAnalysisEngine.forecastTrajectory(trendStream, 4);
  const whatIfResult = UniversalTrendAnalysisEngine.simulateWhatIf(trendStream, { multiplier: whatIfMultiplier });

  // Aggregated KPI Stats
  const totalBudgetCents = budgets.reduce((sum, b) => sum + (b.totalLimitCents || 0), 0);
  const totalSpentCents = budgets.reduce((sum, b) => sum + (b.spentCents || 0), 0);
  const pendingClaimsCount = expenses.filter((e) => e.status === 'SUBMITTED').length;
  const monthlySaaSBurnCents = subscriptionsData.burn?.totalMonthlyBurnCents || 0;

  return (
    <div className="space-y-6">
      {/* Top Header & Master Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>💰 Enterprise Spend, Project Budgeting & Expense Suite</span>
            <Badge variant="info">Zaggle + Axelor ERP Standard</Badge>
          </h2>
          <p className="text-xs text-slate-500">
            Universal Project Budget Caps, Multi-Tier Travel Desks, Imprest Petty Cash Wallets, Vendor SaaS Burn, and Industry-Agnostic Predictive AI Trend & Anomaly Engine.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="h-9 px-3.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-xs transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync Spend
          </button>
          <button
            onClick={() => setShowBudgetModal(true)}
            className="h-9 px-3.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            + New Budget
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="h-9 px-3.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            + Submit Expense
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 border shadow-xs animate-in fade-in duration-150 ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
          {notification.message}
        </div>
      )}

      {/* 4-Pillar KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Allocated Budgets</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(totalBudgetCents)}</div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">{budgets.length} active project caps</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
            <Building className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Spend Utilization</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(totalSpentCents)}</div>
            <div className="text-xs font-semibold text-emerald-600 mt-0.5">
              {totalBudgetCents > 0 ? Math.round((totalSpentCents / totalBudgetCents) * 100) : 0}% of allocated capacity
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Pending Claims</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{pendingClaimsCount}</div>
            <div className="text-xs font-semibold text-amber-600 mt-0.5">Awaiting manager approval</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Monthly SaaS / Vendor Burn</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(monthlySaaSBurnCents)}</div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">
              {subscriptionsData.subscriptions.length} active vendor contracts
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 7-Tab Navigation Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
        <button
          onClick={() => setActiveTab('budgets')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'budgets'
              ? 'bg-white text-slate-900 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <PieChart className="w-3.5 h-3.5" />
          Project Budgets ({budgets.length})
        </button>

        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'expenses'
              ? 'bg-white text-slate-900 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Expense Claims Queue ({expenses.length})
        </button>

        <button
          onClick={() => setActiveTab('travel')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'travel'
              ? 'bg-white text-slate-900 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <Plane className="w-3.5 h-3.5" />
          Travel Desk & Per-Diems ({travelRequests.length})
        </button>

        <button
          onClick={() => setActiveTab('imprest')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'imprest'
              ? 'bg-white text-slate-900 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          Petty Cash & Imprest ({imprestWallets.length})
        </button>

        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'subscriptions'
              ? 'bg-white text-slate-900 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Vendor Subscriptions ({subscriptionsData.subscriptions.length})
        </button>

        <button
          onClick={() => setActiveTab('trends')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'trends'
              ? 'bg-white text-slate-900 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
          AI Trend & Anomaly Engine
        </button>

        <button
          onClick={() => setActiveTab('pnl')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'pnl'
              ? 'bg-white text-slate-900 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Project P&L Matrix
        </button>
      </div>

      {/* TAB 1: BUDGETS */}
      {activeTab === 'budgets' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {budgets.length === 0 ? (
            <div className="col-span-2 p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs text-slate-500">
              <PieChart className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">No project budgets created yet</p>
              <p className="text-xs text-slate-400 mt-1">Click "+ New Budget" to create your first spending cap.</p>
            </div>
          ) : (
            budgets.map((b) => {
              const spentPct = b.health?.spentPercentage || 0;
              const isOver = b.health?.isOverBudget;
              const isWarn = b.health?.alertLevel === 'WARN_THRESHOLD';

              return (
                <div key={b.id} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4 hover:border-slate-300 transition">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-base">{b.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono font-bold">
                          {b.code}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Department: {b.department || 'General'} • Project: {b.projectId || 'Global'}
                      </p>
                    </div>

                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                        isOver
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : isWarn
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {isOver ? '⚠️ BREACHED' : isWarn ? '⚡ WARNING' : '✓ HEALTHY'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-500">Burn Rate: {spentPct}%</span>
                      <span className="text-slate-900">
                        {formatCurrency(b.spentCents)} / {formatCurrency(b.totalLimitCents)}
                      </span>
                    </div>
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isOver ? 'bg-rose-500' : isWarn ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, spentPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-500">Remaining Capacity:</span>
                      <p className="font-bold text-slate-900 mt-0.5">
                        {formatCurrency(b.health?.remainingCents || 0)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Alert Ceiling:</span>
                      <p className="font-bold text-slate-900 mt-0.5">{b.warnThresholdPct}% threshold</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: EXPENSES QUEUE */}
      {activeTab === 'expenses' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4 whitespace-nowrap">Claim ID</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Worker / Claimant</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Merchant & Category</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Amount</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Pass-Through</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3.5 px-4 whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No expense claims submitted yet.
                    </td>
                  </tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {e.claimNumber}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{e.claimantName}</div>
                        <div className="text-[11px] text-slate-500">{e.claimantEmail || '—'}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{e.merchant}</div>
                        <div className="text-[11px] text-slate-500">{e.category}</div>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(e.amountCents)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                            e.passThrough === 'BILLABLE'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {e.passThrough} {e.markupPercent > 0 ? `(+${e.markupPercent}%)` : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-[11px] px-2.5 py-1 rounded-full font-bold border ${
                            e.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : e.status === 'REIMBURSED'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : e.status === 'REJECTED'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap shrink-0 whitespace-nowrap">
                          {e.status === 'SUBMITTED' && (
                            <>
                              <button
                                onClick={() => handleExpenseAction(e.id, 'APPROVE')}
                                className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg shadow-xs transition whitespace-nowrap inline-flex items-center"
                              >
                                Approve ✓
                              </button>
                              <button
                                onClick={() => handleExpenseAction(e.id, 'REJECT')}
                                className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg shadow-xs transition whitespace-nowrap inline-flex items-center"
                              >
                                Reject ✕
                              </button>
                            </>
                          )}
                          {e.status === 'APPROVED' && (
                            <button
                              onClick={() => handleReimburseExpense(e.id)}
                              className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg shadow-xs transition whitespace-nowrap inline-flex items-center"
                            >
                              Reimburse 💵
                            </button>
                          )}
                          {e.status === 'REIMBURSED' && (
                            <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">Settled ✓</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TRAVEL & PER-DIEMS */}
      {activeTab === 'travel' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Travel Desk, Hotel Caps & Per-Diem Entitlements</h3>
              <p className="text-xs text-slate-500">Automated city tier rates (Tier 1: $95/day, Tier 2: $75/day, Tier 3: $55/day).</p>
            </div>
            <button
              onClick={() => setShowTravelModal(true)}
              className="h-9 px-3.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              + New Travel Request
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {travelRequests.map((tr) => (
              <div key={tr.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3 hover:border-slate-300 transition">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{tr.travelerName}</h4>
                    <p className="text-xs text-slate-500">{tr.destination} • {tr.days} Days</p>
                  </div>
                  <span
                    className={`text-[11px] px-2.5 py-1 rounded-full font-bold border ${
                      tr.status === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {tr.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-500">Calculated Per-Diem:</span>
                    <p className="font-bold text-emerald-600 mt-0.5">{formatCurrency(tr.totalPerDiemCents)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Nightly Hotel Rate:</span>
                    <p className="font-bold text-slate-900 mt-0.5">{formatCurrency(tr.hotelNightlyCents)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: IMPREST MULTI-WALLETS */}
      {activeTab === 'imprest' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="font-bold text-slate-900 text-sm">Branch & Stage Petty Cash Imprest Multi-Wallets</h3>
            <p className="text-xs text-slate-500">Pre-funded location floats with automated top-up triggers on threshold breach.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {imprestWallets.map((w) => {
              const evalRes = ImprestMultiWalletEngine.evaluateReplenishment(w);
              return (
                <div key={w.walletId} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4 hover:border-slate-300 transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">{w.locationName}</h4>
                      <span className="text-xs font-mono text-slate-500 font-bold">{w.walletId}</span>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                        evalRes.needsReplenishment
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {evalRes.needsReplenishment ? '⚠️ TOP-UP TRIGGERED' : '✓ FLOAT HEALTHY'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-500">Current Balance:</span>
                      <span className="text-slate-900 font-bold">
                        {formatCurrency(w.currentBalanceCents)} / {formatCurrency(w.floatLimitCents)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          evalRes.needsReplenishment ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.round((w.currentBalanceCents / w.floatLimitCents) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500 font-medium">Min Threshold: {formatCurrency(w.minThresholdCents)}</span>
                    {evalRes.needsReplenishment && (
                      <button
                        onClick={() => handleReplenishWallet(w.walletId)}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
                      >
                        Auto Top-Up ({formatCurrency(evalRes.topUpAmountCents)})
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: SUBSCRIPTIONS */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => setShowSubModal(true)}
              className="h-9 px-3.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              + Add Vendor Contract
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-800">
                <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 whitespace-nowrap">Vendor Name</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Service Category</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Cadence</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Cost</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Next Renewal</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Owner</th>
                    <th className="py-3.5 px-4 whitespace-nowrap text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subscriptionsData.subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No vendor contracts or SaaS subscriptions registered yet.
                      </td>
                    </tr>
                  ) : (
                    subscriptionsData.subscriptions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">{s.vendorName}</td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{s.serviceCategory}</td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono font-semibold">{s.cadence}</td>
                        <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(s.amountCents)}
                        </td>
                        <td className="py-3 px-4 text-amber-700 font-mono font-semibold whitespace-nowrap">
                          {new Date(s.nextRenewalDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{s.ownerEmail || '—'}</td>
                        <td className="py-3 px-4 whitespace-nowrap text-right">
                          <span className="text-[11px] px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: AI TREND & ANOMALY ENGINE */}
      {activeTab === 'trends' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-purple-50/70 to-blue-50/90 border border-indigo-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                Universal Predictive Forecasting & Anomaly AI
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 font-bold">
                R² Confidence: {forecastResult.rSquared * 100}%
              </span>
            </div>
            <p className="text-xs text-slate-800 leading-relaxed font-mono bg-white/90 p-3 rounded-xl border border-indigo-100 shadow-xs">
              🤖 {forecastResult.narrativeSummary}
            </p>
          </div>

          {/* Anomaly Detection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <span>1. Statistical Z-Score Spike Detector</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">|z| ≥ 2.0</span>
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {anomalyResults.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between text-xs p-2.5 rounded-xl border transition ${
                      a.isAnomaly
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div>
                      <span className="font-bold">{String(a.point.timestamp)}: </span>
                      <span className="font-mono font-bold">${a.point.value.toLocaleString()}</span>
                      {a.point.label && <span className="text-[11px] text-slate-500 block">{a.point.label}</span>}
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          a.isAnomaly ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {a.type} (Z: {a.zScore})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What-If Scenario Sandbox */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                2. What-If Scenario Simulation Sandbox
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Simulated Multiplier / Policy Shift:</span>
                  <span className="font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    {Math.round((whatIfMultiplier - 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={whatIfMultiplier}
                  onChange={(e) => setWhatIfMultiplier(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Baseline Total:</span>
                  <span className="text-slate-900 font-bold">${whatIfResult.originalTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Simulated Total:</span>
                  <span className="text-purple-700 font-bold">${whatIfResult.simulatedTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 text-emerald-700 font-bold">
                  <span>Net Variance:</span>
                  <span>
                    {whatIfResult.deltaValue > 0 ? '+' : ''}${whatIfResult.deltaValue.toLocaleString()} ({whatIfResult.deltaPercent}%)
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 italic">"{whatIfResult.narrative}"</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: REAL-TIME P&L PROFITABILITY */}
      {activeTab === 'pnl' && pnlSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">1. Billed Client Revenue</span>
            <div className="text-3xl font-black text-emerald-600 font-mono">
              {formatCurrency(pnlSummary.billedRevenueCents || 0)}
            </div>
            <p className="text-xs text-slate-500">Total client invoices issued</p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">2. Total Direct Costs</span>
            <div className="text-3xl font-black text-rose-600 font-mono">
              {formatCurrency(pnlSummary.totalDirectCostsCents || 0)}
            </div>
            <p className="text-xs text-slate-500">WIP crew labor + approved expense claims</p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">3. Net Project Profit Margin</span>
            <div
              className={`text-3xl font-black font-mono ${
                pnlSummary.isProfitable ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {formatCurrency(pnlSummary.grossMarginCents || 0)} ({pnlSummary.grossMarginPercent}%)
            </div>
            <p className="text-xs text-slate-500">Net gross margin after all direct allocations</p>
          </div>
        </div>
      )}

      {/* MODAL 1: NEW BUDGET */}
      {showBudgetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <PieChart className="w-5 h-5 text-emerald-600" />
              Create Project Budget Cap
            </h3>

            <form onSubmit={handleCreateBudget} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Budget / Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Warner Bros Stage 4 Production"
                  value={newBudget.name}
                  onChange={(e) => setNewBudget({ ...newBudget, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Budget Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BDG-WB-STAGE4"
                    value={newBudget.code}
                    onChange={(e) => setNewBudget({ ...newBudget, code: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none uppercase transition font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    required
                    value={newBudget.department}
                    onChange={(e) => setNewBudget({ ...newBudget, department: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Total Cap ($)</label>
                  <input
                    type="number"
                    required
                    value={newBudget.totalLimitDollars}
                    onChange={(e) => setNewBudget({ ...newBudget, totalLimitDollars: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Alert Trigger (%)</label>
                  <input
                    type="number"
                    required
                    value={newBudget.warnThresholdPct}
                    onChange={(e) => setNewBudget({ ...newBudget, warnThresholdPct: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition"
                >
                  Create Budget Cap
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NEW EXPENSE */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileText className="w-5 h-5 text-indigo-600" />
              Submit Expense Claim
            </h3>

            <form onSubmit={handleCreateExpense} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Claimant / Worker</label>
                <input
                  type="text"
                  required
                  value={newExpense.claimantName}
                  onChange={(e) => setNewExpense({ ...newExpense, claimantName: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Merchant / Vendor</label>
                  <input
                    type="text"
                    required
                    value={newExpense.merchant}
                    onChange={(e) => setNewExpense({ ...newExpense, merchant: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    required
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newExpense.amountDollars}
                    onChange={(e) => setNewExpense({ ...newExpense, amountDollars: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pass-Through</label>
                  <select
                    value={newExpense.passThrough}
                    onChange={(e) => setNewExpense({ ...newExpense, passThrough: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  >
                    <option value="BILLABLE">BILLABLE (Invoice Client)</option>
                    <option value="NON_BILLABLE">NON_BILLABLE (Internal)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Receipt OCR Metadata</label>
                <textarea
                  rows={2}
                  value={newExpense.receiptOcrText}
                  onChange={(e) => setNewExpense({ ...newExpense, receiptOcrText: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition"
                >
                  Submit for Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: NEW TRAVEL REQUEST */}
      {showTravelModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Plane className="w-5 h-5 text-blue-600" />
              New Travel Desk Booking
            </h3>

            <form onSubmit={handleCreateTravelRequest} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Traveler Name</label>
                <input
                  type="text"
                  required
                  value={newTravel.travelerName}
                  onChange={(e) => setNewTravel({ ...newTravel, travelerName: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Destination</label>
                <input
                  type="text"
                  required
                  value={newTravel.destination}
                  onChange={(e) => setNewTravel({ ...newTravel, destination: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">City Tier</label>
                  <select
                    value={newTravel.cityTier}
                    onChange={(e) => setNewTravel({ ...newTravel, cityTier: e.target.value as CityTier })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  >
                    <option value="TIER_1_METRO">Tier 1 Metro ($95/day)</option>
                    <option value="TIER_2_STANDARD">Tier 2 Standard ($75/day)</option>
                    <option value="TIER_3_REGIONAL">Tier 3 Regional ($55/day)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Travel Days</label>
                  <input
                    type="number"
                    required
                    value={newTravel.days}
                    onChange={(e) => setNewTravel({ ...newTravel, days: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nightly Hotel ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newTravel.hotelNightlyDollars}
                    onChange={(e) => setNewTravel({ ...newTravel, hotelNightlyDollars: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Provided Meals</label>
                  <input
                    type="number"
                    value={newTravel.mealsProvidedCount}
                    onChange={(e) => setNewTravel({ ...newTravel, mealsProvidedCount: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTravelModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition"
                >
                  Register Travel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: NEW SUBSCRIPTION */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <CreditCard className="w-5 h-5 text-purple-600" />
              Add Vendor / SaaS Subscription
            </h3>

            <form onSubmit={handleCreateSubscription} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vendor / Tool Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AWS Cloud Services, GitHub, Slack"
                  value={newSub.vendorName}
                  onChange={(e) => setNewSub({ ...newSub, vendorName: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    required
                    value={newSub.serviceCategory}
                    onChange={(e) => setNewSub({ ...newSub, serviceCategory: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Billing Cadence</label>
                  <select
                    value={newSub.cadence}
                    onChange={(e) => setNewSub({ ...newSub, cadence: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  >
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="ANNUAL">ANNUAL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newSub.amountDollars}
                    onChange={(e) => setNewSub({ ...newSub, amountDollars: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Next Renewal Date</label>
                  <input
                    type="date"
                    required
                    value={newSub.nextRenewalDate}
                    onChange={(e) => setNewSub({ ...newSub, nextRenewalDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSubModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition"
                >
                  Register Contract
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
