'use client';

import { EmptyState, ModulePage, PageTabs } from '@gigalibs/web-sdk';
import Link from 'next/link';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Text,
} from '@medusajs/ui';
import { ArrowPath } from '@medusajs/icons';
import { BarChart3, CheckCircle2, LayoutGrid, Zap } from 'lucide-react';
import { SavedChartViews } from './explore/SavedChartViews';
import { CentralModuleAnalyticsPanel } from './module/CentralModuleAnalyticsPanel';

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
  const [actions, setActions] = useState<ExecutiveAction[]>([]);

  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [selectedActionType, setSelectedActionType] = useState<
    'FORCE_METRIC_RECOMPUTE' | 'DISPATCH_LINEAGE_ATTESTATION' | 'TRIGGER_CROSS_MODULE_AUDIT' | 'FREEZE_SUSPICIOUS_ANOMALY'
  >('FORCE_METRIC_RECOMPUTE');
  const [targetEntity, setTargetEntity] = useState('ALL_MODULES');
  const [targetDomain, setTargetDomain] = useState('CROSS_SUITE');
  const [actionReason, setActionReason] = useState('Quarterly executive audit');
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [actionReceipt, setActionReceipt] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'modules' | 'saved_charts'>('modules');

  const loadActions = useCallback(async () => {
    try {
      const actRes = await fetch('/api/analytics/v1/actions');
      if (actRes.ok) setActions(await actRes.json());
    } catch (err) {
      console.error('Failed to load executive actions', err);
    }
  }, []);

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
        await loadActions();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check setup status');
    } finally {
      setLoading(false);
    }
  }, [loadActions]);

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
        await loadActions();
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
        await loadActions();
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
      <ModulePage title="Overview">
        <Text size="small" className="text-ui-fg-subtle">Loading…</Text>
      </ModulePage>
    );
  }

  if (configured === false) {
    return (
      <ModulePage title="Overview" description="Trends from your modules' data, your saved charts and the decisions recorded against them.">
        <EmptyState
          title="Analytics is not set up for your workspace yet"
          description="Set it up once to start building trends from your modules' data."
          action={
            <Button size="small" variant="primary" onClick={handleSetup} disabled={isSettingUp}>
              {isSettingUp ? 'Setting up…' : 'Set up Analytics'}
            </Button>
          }
        />
      </ModulePage>
    );
  }

  return (
    <ModulePage
      title="Overview"
      description="Trends from your modules' data, your saved charts and the decisions recorded against them."
      actions={
        <>
          <Button size="small" variant="secondary" onClick={() => void loadActions()}>
            <ArrowPath className="w-4 h-4" /> Refresh
          </Button>
          <Button size="small" variant="secondary" asChild>
            <Link href="/analytics/places">Place drill-down</Link>
          </Button>
          <Button size="small" variant="primary" onClick={() => setActionModalOpen(true)}>
            Record a decision
          </Button>
        </>
      }
    >
      {error && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error}
        </div>
      )}

      <PageTabs
        label="Analytics views"
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: 'modules', label: 'Trends' },
          { key: 'saved_charts', label: 'Saved charts' },
        ]}
      />

      {activeTab === 'saved_charts' ? (
        <SavedChartViews />
      ) : (
        <>
          <CentralModuleAnalyticsPanel />

          <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Heading level="h3" className="text-base font-semibold text-zinc-900">
                  Executive decision receipts
                </Heading>
                <Text className="text-xs text-zinc-500">Governed actions recorded in analytics audit storage.</Text>
              </div>
              <Badge color="grey">Tamper evident</Badge>
            </div>
            {actions.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">No executive actions recorded for this tenant.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-600">
                  <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 border-y border-zinc-200">
                    <tr>
                      <th className="py-3 px-4">Action ID</th>
                      <th className="py-3 px-4">Action Type</th>
                      <th className="py-3 px-4">Target Domain</th>
                      <th className="py-3 px-4">Signer / Actor</th>
                      <th className="py-3 px-4">Receipt digest</th>
                      <th className="py-3 px-4">Executed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-mono text-xs">
                    {actions.map((act) => (
                      <tr key={act.id} className="hover:bg-zinc-50/50">
                        <td className="py-2.5 px-4 font-semibold text-zinc-900">{act.id.slice(0, 12)}...</td>
                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-800">
                          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200">{act.action_type}</span>
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

      {actionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-zinc-200 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
              <div className="flex items-center gap-3">
                <Zap className="w-6 h-6 text-amber-500" />
                <div>
                  <Heading level="h2" className="text-lg font-bold text-zinc-900">
                    Dispatch governed executive action
                  </Heading>
                  <Text className="text-xs text-zinc-500">Audit receipts are stored in analytics persistence.</Text>
                </div>
              </div>
              <button type="button" className="text-zinc-400 hover:text-zinc-700 font-bold p-1 text-lg" onClick={() => setActionModalOpen(false)}>
                ✕
              </button>
            </div>

            {actionReceipt ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Action dispatched
                  </div>
                </div>
                <div className="p-3 bg-zinc-900 text-emerald-400 rounded-lg font-mono text-xs space-y-1">
                  <div>
                    <strong>Action ID:</strong> {actionReceipt.actionId}
                  </div>
                  <div>
                    <strong>Receipt SHA-256:</strong> {actionReceipt.receiptDigest}
                  </div>
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
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">Action Type</label>
                  <select
                    className="w-full rounded-lg border border-zinc-300 p-2 text-sm bg-white"
                    value={selectedActionType}
                    onChange={(e: any) => setSelectedActionType(e.target.value)}
                  >
                    <option value="FORCE_METRIC_RECOMPUTE">FORCE_METRIC_RECOMPUTE</option>
                    <option value="DISPATCH_LINEAGE_ATTESTATION">DISPATCH_LINEAGE_ATTESTATION</option>
                    <option value="TRIGGER_CROSS_MODULE_AUDIT">TRIGGER_CROSS_MODULE_AUDIT</option>
                    <option value="FREEZE_SUSPICIOUS_ANOMALY">FREEZE_SUSPICIOUS_ANOMALY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">Target Domain</label>
                  <input type="text" className="w-full rounded-lg border border-zinc-300 p-2 text-sm" value={targetDomain} onChange={(e) => setTargetDomain(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">Target Entity / Scope</label>
                  <input type="text" className="w-full rounded-lg border border-zinc-300 p-2 text-sm" value={targetEntity} onChange={(e) => setTargetEntity(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">Audit Rationale</label>
                  <Input value={actionReason} onChange={(e) => setActionReason(e.target.value)} />
                </div>
                <div className="pt-4 border-t border-zinc-200 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setActionModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleExecuteAction} disabled={isExecutingAction}>
                    {isExecutingAction ? 'Executing…' : 'Dispatch'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ModulePage>
  );
}
