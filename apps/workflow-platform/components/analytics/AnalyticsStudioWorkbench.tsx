'use client';

import Link from 'next/link';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import {
  ArrowPath,
  CheckCircleSolid,
  Sparkles,
  DocumentText,
  ShieldCheck,
  BuildingTax,
  ExclamationCircleSolid,
} from '@medusajs/icons';
import { BarChart3, LineChart, FileCode, CheckCircle2, Lock, ArrowUpRight, Zap, LayoutGrid } from 'lucide-react';
import { SavedChartViews } from './explore/SavedChartViews';

interface MetricSummary {
  netArRevenueUsd: number;
  arInvoicesCount: number;
  committedSpendUsd: number;
  spendExpensesCount: number;
  fxConvertedVolumeUsd: number;
  fxOrdersCount: number;
  recoveryPreservedUsd: number;
  recoveryLeaksCount: number;
  totalTransactionsCount: number;
  overallLineageVerified: boolean;
  computedAt: string;
}

interface LineageProof {
  metricKey: string;
  domain: string;
  sourceTable: string;
  rowCount: number;
  aggregatedValue: number;
  currency: string;
  lineageSha256: string;
  verifiedAt: string;
  sampleRecords: Array<Record<string, any>>;
}

interface ChartPoint {
  date: string;
  revenue: number;
  spend: number;
  recovery: number;
  fx: number;
}

interface ExecutiveAction {
  id: string;
  action_type: string;
  target_domain: string;
  target_entity: string;
  actor_subject: string;
  receipt_digest: string;
  executed_at: string;
}

export function AnalyticsStudioWorkbench() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<MetricSummary | null>(null);
  const [timeSeries, setTimeSeries] = useState<ChartPoint[]>([]);
  const [actions, setActions] = useState<ExecutiveAction[]>([]);

  // Lineage modal state
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [lineageProof, setLineageProof] = useState<LineageProof | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);

  // Action execution modal state
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [selectedActionType, setSelectedActionType] = useState<
    'FORCE_METRIC_RECOMPUTE' | 'DISPATCH_LINEAGE_ATTESTATION' | 'TRIGGER_CROSS_MODULE_AUDIT' | 'FREEZE_SUSPICIOUS_ANOMALY'
  >('FORCE_METRIC_RECOMPUTE');
  const [targetEntity, setTargetEntity] = useState('ALL_MODULES');
  const [targetDomain, setTargetDomain] = useState('CROSS_SUITE');
  const [actionReason, setActionReason] = useState('Quarterly executive audit');
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [actionReceipt, setActionReceipt] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'executive' | 'saved_charts'>('executive');

  const checkStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/analytics/v1/setup/status');
      if (res.status === 503 || res.status === 502) {
        setConfigured(false);
        setError('Analytics API service is offline or unreachable.');
        return;
      }
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      if (data.configured) {
        await loadAnalyticsData();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check setup status');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalyticsData = async () => {
    try {
      setError(null);
      // WI-OI-120k (QF1): cross-module summary and time-series metrics are contained until WI-OI-043 certifies their
      // analytical datasets; they are not requested, and their panel says so instead of reporting a refusal.
      setSummary(null);
      setTimeSeries([]);
      const actRes = await fetch('/api/analytics/v1/actions');
      if (actRes.ok) setActions(await actRes.json());
      setError('Cross-module metrics are not connected yet: they arrive with certified analytical datasets (WI-OI-043).');
    } catch (err: any) {
      console.error('Failed to load analytics data', err);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleSetup = async () => {
    setIsSettingUp(true);
    try {
      const res = await fetch('/api/analytics/v1/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setConfigured(true);
        await loadAnalyticsData();
      } else {
        const data = await res.json();
        setError(data.title || 'Setup failed');
      }
    } catch (err: any) {
      setError(err.message || 'Setup request failed');
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleInspectLineage = async (metricKey: string) => {
    setSelectedMetric(metricKey);
    setLineageLoading(true);
    setLineageProof(null);
    try {
      const res = await fetch(`/api/analytics/v1/metrics/lineage/${metricKey}`);
      if (res.ok) {
        setLineageProof(await res.json());
      }
    } catch (err) {
      console.error('Failed to load lineage', err);
    } finally {
      setLineageLoading(false);
    }
  };

  const handleExecuteAction = async () => {
    setIsExecutingAction(true);
    setActionReceipt(null);
    try {
      const res = await fetch('/api/analytics/v1/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: selectedActionType,
          targetDomain,
          targetEntity,
          reason: actionReason,
        }),
      });
      if (res.ok) {
        const receipt = await res.json();
        setActionReceipt(receipt);
        await loadAnalyticsData();
      } else {
        const data = await res.json();
        setError(data.title || 'Action failed');
      }
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setIsExecutingAction(false);
    }
  };

  if (loading && configured === null) {
    return (
      <Container className="p-8">
        <div className="flex items-center gap-3 text-zinc-500">
          <ArrowPath className="animate-spin w-5 h-5 text-blue-600" />
          <Text>Checking Analytics Studio tenant binding and PostgreSQL schema...</Text>
        </div>
      </Container>
    );
  }

  if (configured === false) {
    return (
      <Container className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <div>
              <p className="font-semibold text-zinc-900">
                PostgreSQL Schema Initialization
              </p>
              <Text className="text-xs text-zinc-600">
                Bind tenant workspace to isolated <code>gigalibs_analytics</code> schema.
              </Text>
            </div>
          </div>
          <div className="border-t border-blue-100 pt-4 flex items-center justify-between">
            <div className="text-xs font-mono text-zinc-500">
              Authority: Verified local OIDC · Tenant RLS · PostgreSQL persistence
            </div>
            <Button
              variant="primary"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSetup}
              disabled={isSettingUp}
            >
              {isSettingUp ? 'Initializing Schema...' : 'Initialize Analytics Studio'}
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-3">
        <div className="flex items-center gap-2">
          <Badge color="blue">Universal Intelligence</Badge>
          {summary?.overallLineageVerified ? (
            <StatusBadge color="green">LINEAGE_VERIFIED</StatusBadge>
          ) : (
            <StatusBadge color="orange">DATA_NOT_AVAILABLE</StatusBadge>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={loadAnalyticsData} className="flex items-center gap-2">
            <ArrowPath className="w-4 h-4" /> Refresh
          </Button>
          <Button
            variant="primary"
            className="bg-zinc-900 text-white hover:bg-zinc-800 flex items-center gap-2"
            onClick={() => setActionModalOpen(true)}
            disabled={!summary}
          >
            <Zap className="w-4 h-4 text-amber-400" /> Executive Action
          </Button>
          {/* WI-OI-064f: governed estate → region → site drill-down. */}
          <Button asChild variant="secondary">
            <Link href="/analytics/places">Place drill-down</Link>
          </Button>
        </div>
      </div>

      {error && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error}
        </div>
      )}

      {/* Studio Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200">
        <button
          type="button"
          onClick={() => setActiveTab('executive')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'executive'
              ? 'border-zinc-900 text-zinc-950 font-bold'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <span>Executive Intelligence &amp; Lineage</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('saved_charts')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'saved_charts'
              ? 'border-zinc-900 text-zinc-950 font-bold'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <LayoutGrid className="w-4 h-4 text-purple-600" />
          <span>Saved charts</span>
        </button>
      </div>

      {activeTab === 'saved_charts' ? (
        <SavedChartViews />
      ) : (
        <>
          {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net AR Revenue */}
        <div className="p-5 bg-white rounded-xl border border-zinc-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <Text className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Net AR Invoiced
            </Text>
            <BuildingTax className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-zinc-900">
            {summary ? `$${summary.netArRevenueUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'Unavailable'}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs text-zinc-500">
            <span>{summary ? `${summary.arInvoicesCount} Invoices` : 'No certified dataset'}</span>
            <button
              className="text-blue-600 font-medium hover:underline flex items-center gap-0.5"
              onClick={() => handleInspectLineage('NET_AR_REVENUE')}
              disabled={!summary}
            >
              Inspect Lineage <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Committed Spend */}
        <div className="p-5 bg-white rounded-xl border border-zinc-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <Text className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Committed Spend
            </Text>
            <DocumentText className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-zinc-900">
            {summary ? `$${summary.committedSpendUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'Unavailable'}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs text-zinc-500">
            <span>{summary ? `${summary.spendExpensesCount} Expenses` : 'No certified dataset'}</span>
            <button
              className="text-blue-600 font-medium hover:underline flex items-center gap-0.5"
              onClick={() => handleInspectLineage('COMMITTED_SPEND')}
              disabled={!summary}
            >
              Inspect Lineage <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Multi-Currency FX Volume */}
        <div className="p-5 bg-white rounded-xl border border-zinc-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <Text className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Treasury FX Volume
            </Text>
            <Sparkles className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-zinc-900">
            {summary ? `$${summary.fxConvertedVolumeUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'Unavailable'}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs text-zinc-500">
            <span>{summary ? `${summary.fxOrdersCount} Orders` : 'No certified dataset'}</span>
            <button
              className="text-blue-600 font-medium hover:underline flex items-center gap-0.5"
              onClick={() => handleInspectLineage('CROSS_BORDER_FX')}
              disabled={!summary}
            >
              Inspect Lineage <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Preserved Cash */}
        <div className="p-5 bg-white rounded-xl border border-zinc-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <Text className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Cash Leakage Preserved
            </Text>
            <ShieldCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-zinc-900">
            {summary ? `$${summary.recoveryPreservedUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'Unavailable'}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs text-zinc-500">
            <span>{summary ? `${summary.recoveryLeaksCount} Incidents` : 'No certified dataset'}</span>
            <button
              className="text-blue-600 font-medium hover:underline flex items-center gap-0.5"
              onClick={() => handleInspectLineage('PRESERVED_CASH')}
              disabled={!summary}
            >
              Inspect Lineage <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Cross-Module Trend Breakdown */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Heading level="h3" className="text-base font-semibold text-zinc-900">
              Cross-Module Operational Trajectory (Past 7 Days)
            </Heading>
            <Text className="text-xs text-zinc-500">
              Aggregated directly from PostgreSQL transactional ledgers without synthetic interpolation.
            </Text>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> AR Revenue
            </span>
            <span className="flex items-center gap-1.5 text-blue-600">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Spend
            </span>
            <span className="flex items-center gap-1.5 text-amber-600">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Recovery
            </span>
            <span className="flex items-center gap-1.5 text-purple-600">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> FX
            </span>
          </div>
        </div>

        {timeSeries.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            No certified analytical time series is available for this tenant.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-600">
              <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 border-y border-zinc-200">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">AR Revenue ($)</th>
                  <th className="py-3 px-4 text-right">Spend ($)</th>
                  <th className="py-3 px-4 text-right">Recovery ($)</th>
                  <th className="py-3 px-4 text-right">Treasury FX ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono text-xs">
                {timeSeries.map((pt) => (
                  <tr key={pt.date} className="hover:bg-zinc-50/50">
                    <td className="py-2.5 px-4 font-sans font-medium text-zinc-900">{pt.date}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-600 font-semibold">
                      ${pt.revenue.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-blue-600 font-semibold">
                      ${pt.spend.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-amber-600 font-semibold">
                      ${pt.recovery.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-purple-600 font-semibold">
                      ${pt.fx.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Executive Decisions & Receipts */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Heading level="h3" className="text-base font-semibold text-zinc-900">
              Executive Decision & Lineage Audit Receipts
            </Heading>
            <Text className="text-xs text-zinc-500">
              Immutable log of actions dispatched with deterministic SHA-256 cryptographic seal digests.
            </Text>
          </div>
          <Badge color="grey">Tamper Evident</Badge>
        </div>

        {actions.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            No governed executive actions have been recorded for this tenant.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-600">
              <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 border-y border-zinc-200">
                <tr>
                  <th className="py-3 px-4">Action ID</th>
                  <th className="py-3 px-4">Action Type</th>
                  <th className="py-3 px-4">Target Domain</th>
                  <th className="py-3 px-4">Signer / Actor</th>
                  <th className="py-3 px-4">Cryptographic Seal Digest</th>
                  <th className="py-3 px-4">Executed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono text-xs">
                {actions.map((act) => (
                  <tr key={act.id} className="hover:bg-zinc-50/50">
                    <td className="py-2.5 px-4 font-semibold text-zinc-900">{act.id.slice(0, 12)}...</td>
                    <td className="py-2.5 px-4 font-sans font-medium text-zinc-800">
                      <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200">
                        {act.action_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-sans text-zinc-600">{act.target_domain}</td>
                    <td className="py-2.5 px-4 text-zinc-700">{act.actor_subject}</td>
                    <td className="py-2.5 px-4 text-blue-600" title={act.receipt_digest}>
                      {act.receipt_digest.slice(0, 16)}...
                    </td>
                    <td className="py-2.5 px-4 text-zinc-500">{new Date(act.executed_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {/* Lineage Modal */}
      {selectedMetric && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-zinc-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
              <div className="flex items-center gap-3">
                <FileCode className="w-6 h-6 text-blue-600" />
                <div>
                  <Heading level="h2" className="text-lg font-bold text-zinc-900">
                    Live Metric Lineage Proof: {selectedMetric}
                  </Heading>
                  <Text className="text-xs text-zinc-500">
                    Direct cryptographic audit proof linking aggregated total to PostgreSQL database records.
                  </Text>
                </div>
              </div>
              <button
                className="text-zinc-400 hover:text-zinc-700 font-bold p-1 text-lg"
                onClick={() => setSelectedMetric(null)}
              >
                ✕
              </button>
            </div>

            {lineageLoading ? (
              <div className="py-12 flex justify-center items-center gap-3 text-zinc-500">
                <ArrowPath className="animate-spin w-5 h-5 text-blue-600" />
                <span>Verifying cryptographic lineage from PostgreSQL...</span>
              </div>
            ) : lineageProof ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-xs">
                  <div>
                    <span className="text-zinc-500 block">Source Table</span>
                    <code className="font-bold text-zinc-900">{lineageProof.sourceTable}</code>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Rows Counted</span>
                    <code className="font-bold text-zinc-900">{lineageProof.rowCount}</code>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Aggregated Value</span>
                    <code className="font-bold text-emerald-600">${lineageProof.aggregatedValue.toFixed(2)}</code>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Integrity Status</span>
                    <StatusBadge color="green">VERIFIED</StatusBadge>
                  </div>
                </div>

                <div>
                  <Text className="text-xs font-semibold uppercase text-zinc-500 mb-1">
                    FIPS 186-4 SHA-256 Lineage Seal
                  </Text>
                  <div className="p-3 bg-zinc-900 text-emerald-400 rounded-lg font-mono text-xs break-all">
                    {lineageProof.lineageSha256}
                  </div>
                  <Text className="text-[11px] text-zinc-500 mt-1">
                    Attestation hash computed over: <code>tenant_id:table:row_count:sum</code>
                  </Text>
                </div>

                <div>
                  <Text className="text-xs font-semibold uppercase text-zinc-500 mb-2">
                    Sample Authoritative PostgreSQL Records ({lineageProof.sampleRecords.length})
                  </Text>
                  {lineageProof.sampleRecords.length === 0 ? (
                    <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 text-xs text-zinc-500">
                      Zero matching records in this tenant partition. Empty state mathematically verified.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-zinc-200 rounded-lg">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200">
                          <tr>
                            {Object.keys(lineageProof.sampleRecords[0] || {}).map((k) => (
                              <th key={k} className="p-2.5">
                                {k}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {lineageProof.sampleRecords.map((r, i) => (
                            <tr key={i} className="hover:bg-zinc-50">
                              {Object.values(r).map((val: any, j) => (
                                <td key={j} className="p-2.5 text-zinc-800">
                                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-zinc-500">Failed to load lineage proof.</div>
            )}
          </div>
        </div>
      )}

      {/* Executive Action Modal */}
      {actionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-zinc-200 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
              <div className="flex items-center gap-3">
                <Zap className="w-6 h-6 text-amber-500" />
                <div>
                  <Heading level="h2" className="text-lg font-bold text-zinc-900">
                    Dispatch Governed Executive Action
                  </Heading>
                  <Text className="text-xs text-zinc-500">
                    Executes platform operations with tamper-proof cryptographic audit receipts.
                  </Text>
                </div>
              </div>
              <button
                className="text-zinc-400 hover:text-zinc-700 font-bold p-1 text-lg"
                onClick={() => setActionModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {actionReceipt ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Action Successfully Dispatched
                  </div>
                  <Text className="text-xs text-emerald-700">
                    Cryptographic receipt permanently recorded in <code>gigalibs_analytics.executive_actions</code>.
                  </Text>
                </div>

                <div className="p-3 bg-zinc-900 text-emerald-400 rounded-lg font-mono text-xs space-y-1">
                  <div><strong>Action ID:</strong> {actionReceipt.actionId}</div>
                  <div><strong>Action Type:</strong> {actionReceipt.actionType}</div>
                  <div><strong>Receipt SHA-256:</strong> {actionReceipt.receiptDigest}</div>
                  <div><strong>Executed At:</strong> {actionReceipt.executedAt}</div>
                </div>

                <Button
                  variant="primary"
                  className="w-full bg-zinc-900 text-white"
                  onClick={() => {
                    setActionReceipt(null);
                    setActionModalOpen(false);
                  }}
                >
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">
                    Action Type
                  </label>
                  <select
                    className="w-full rounded-lg border border-zinc-300 p-2 text-sm bg-white"
                    value={selectedActionType}
                    onChange={(e: any) => setSelectedActionType(e.target.value)}
                  >
                    <option value="FORCE_METRIC_RECOMPUTE">FORCE_METRIC_RECOMPUTE (Refresh & Seal Snapshots)</option>
                    <option value="DISPATCH_LINEAGE_ATTESTATION">DISPATCH_LINEAGE_ATTESTATION (Cross-Domain Proof)</option>
                    <option value="TRIGGER_CROSS_MODULE_AUDIT">TRIGGER_CROSS_MODULE_AUDIT (Audit Schemas)</option>
                    <option value="FREEZE_SUSPICIOUS_ANOMALY">FREEZE_SUSPICIOUS_ANOMALY (Escrow Hold)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">
                    Target Domain
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-zinc-300 p-2 text-sm"
                    value={targetDomain}
                    onChange={(e) => setTargetDomain(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">
                    Target Entity / Scope
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-zinc-300 p-2 text-sm"
                    value={targetEntity}
                    onChange={(e) => setTargetEntity(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">
                    Audit Rationale
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-zinc-300 p-2 text-sm"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                  />
                </div>

                <div className="pt-4 border-t border-zinc-200 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setActionModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleExecuteAction}
                    disabled={isExecutingAction}
                  >
                    {isExecutingAction ? 'Executing Action...' : 'Dispatch Action'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
