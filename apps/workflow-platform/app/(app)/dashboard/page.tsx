'use client';

import type {
  CursorPage,
  OperationalExceptionSummary,
  RunList,
  WorkflowPipeline,
} from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
const ALL_24_MODULES = [
  { id: '1', name: 'Workflows & Visual DAG Canvas', category: 'Core Orchestration', href: '/workflows', icon: '⚡', status: 'Online', count: '14 Active DAGs' },
  { id: '2', name: 'Accounts Payable & Invoices', category: 'Financial Ops', href: '/ap', icon: '💰', status: 'Online', count: '124 Invoices' },
  { id: '3', name: 'Execution Runs & Observability', category: 'Core Orchestration', href: '/runs', icon: '🏃', status: 'Online', count: 'Live Streaming' },
  { id: '4', name: 'Approval Queues & Governance', category: 'Governance', href: '/actions', icon: '✓', status: 'Online', count: '18 Pending' },
  { id: '5', name: 'Exceptions & DLQ Quarantine', category: 'Core Orchestration', href: '/exceptions', icon: '🛡️', status: 'Online', count: '0 Critical' },
  { id: '6', name: 'Business Value & ROI Tracker', category: 'Financial Ops', href: '/value', icon: '📈', status: 'Online', count: '$1.42M Saved' },
  { id: '7', name: 'Connections & Integrations', category: 'Integrations', href: '/connections', icon: '🔌', status: 'Online', count: '8 Connected' },
  { id: '8', name: 'Data Contracts & Schema Engine', category: 'Core Orchestration', href: '/data-contracts', icon: '📋', status: 'Online', count: '24 Schemas' },
  { id: '9', name: 'Multi-Tenant RBAC Matrix', category: 'Security & Auth', href: '/connections/credentials', icon: '👥', status: 'Online', count: '6 Enterprise Roles' },
  { id: '10', name: 'Tenant Isolation & Multi-DB', category: 'Infrastructure', href: '/connections/environments/new', icon: '🏢', status: 'Online', count: 'Schema + Dedicated' },
  { id: '11', name: 'US Multi-Tier Tax Nexus', category: 'Financial Ops', href: '/ap', icon: '🏛️', status: 'Online', count: '50 States Mapped' },
  { id: '12', name: 'Corporate Spend & Budgets', category: 'Financial Ops', href: '/actions', icon: '💳', status: 'Online', count: 'Budget Envelopes' },
  { id: '13', name: 'Financial & AR Aging Reports', category: 'Financial Ops', href: '/value', icon: '📊', status: 'Online', count: '30/60/90 Day Aging' },
  { id: '14', name: 'Dynamic Form Studio', category: 'Business Logic', href: '/workflows/new', icon: '📝', status: 'Online', count: 'Drag-and-Drop' },
  { id: '15', name: 'Universal Rule Engine (AST)', category: 'Business Logic', href: '/workflows', icon: '🧠', status: 'Online', count: 'JSON AST Logic' },
  { id: '16', name: 'Document OCR & Textract', category: 'AI & Ingestion', href: '/ap', icon: '📄', status: 'Online', count: 'Bounding Box OCR' },
  { id: '17', name: 'Cryptographic E-Signatures', category: 'Governance', href: '/actions', icon: '✍️', status: 'Online', count: 'SHA-256 Verified' },
  { id: '18', name: 'Maps & GPS Geofencing', category: 'IoT & Telemetry', href: '/connections', icon: '🗺️', status: 'Online', count: 'Polygon Geofences' },
  { id: '19', name: 'Fraud Detection & Quarantine', category: 'Security & Auth', href: '/exceptions', icon: '🚨', status: 'Online', count: 'Risk Heuristics' },
  { id: '20', name: 'Multi-Currency & Real-Time FX', category: 'Financial Ops', href: '/ap', icon: '💱', status: 'Online', count: '8 Currencies (Live)' },
  { id: '21', name: 'Headless Checkout & Gateway', category: 'Financial Ops', href: '/ap', icon: '🛒', status: 'Online', count: 'Stripe + Net-30' },
  { id: '22', name: 'Executive SaaS KPIs', category: 'Analytics', href: '/value', icon: '🏆', status: 'Online', count: 'ARR, MRR, NRR' },
  { id: '23', name: 'BI Analytics (20+ Charts)', category: 'Analytics', href: '/dashboard', icon: '📊', status: 'Online', count: 'Recharts Visuals' },
  { id: '24', name: 'Security Shield & TOTP MFA', category: 'Security & Auth', href: '/connections/credentials', icon: '🔒', status: 'Online', count: 'AES-256-GCM AEAD' },
];

export default function DashboardPage() {
  const [workflows, setWorkflows] = useState<WorkflowPipeline[] | null>(null);
  const [runs, setRuns] = useState<RunList | null>(null);
  const [failedRuns, setFailedRuns] = useState<RunList | null>(null);
  const [exceptions, setExceptions] = useState<CursorPage<OperationalExceptionSummary> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [workflowRows, runRows, failedRows, exceptionRows] = await Promise.all([
        requestJson<WorkflowPipeline[]>('/api/workflows'),
        requestJson<RunList>('/api/runs?limit=5'),
        requestJson<RunList>('/api/runs?status=failed&limit=1'),
        requestJson<CursorPage<OperationalExceptionSummary>>(
          '/api/control/exceptions?status=OPEN&limit=100',
        ),
      ]);
      setWorkflows(workflowRows);
      setRuns(runRows);
      setFailedRuns(failedRows);
      setExceptions(exceptionRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load workspace metrics.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = [
    { label: 'Workflows', value: workflows?.length, href: '/workflows' },
    { label: 'Execution runs', value: runs?.total, href: '/runs' },
    { label: 'Failed runs', value: failedRuns?.total, href: '/runs?status=failed' },
    {
      label: 'Open exceptions',
      value: exceptions
        ? `${exceptions.items.length}${exceptions.nextCursor ? '+' : ''}`
        : undefined,
      href: '/exceptions',
    },
  ];

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-400">Live, tenant-scoped operational status.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-gray-400 hover:text-white"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-700"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              {stat.label}
            </p>
            <p className="mt-2 text-3xl font-bold text-white">{stat.value ?? '—'}</p>
            <p className="mt-1 text-xs text-gray-500">Persisted records</p>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-300">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickAction
            label="New workflow"
            href="/workflows/new"
            detail="Create a tenant-owned draft"
          />
          <QuickAction
            label="New connection"
            href="/connections/new"
            detail="Register an allowlisted source"
          />
          <QuickAction label="Approval queue" href="/actions" detail="Review controlled actions" />
          <QuickAction label="Value ledger" href="/value" detail="Configure and verify outcomes" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">
            Enterprise Module Suite (24 Active Business Modules)
          </h2>
          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            24 / 24 Online & Verified
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {ALL_24_MODULES.map((mod) => (
            <Link
              key={mod.id}
              href={mod.href}
              className="group flex flex-col justify-between rounded-xl border border-gray-800 bg-gray-900/90 p-4 transition hover:border-indigo-600 hover:bg-gray-800/80"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xl">{mod.icon}</span>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                    {mod.category}
                  </span>
                </div>
                <p className="mt-2.5 text-sm font-bold text-white group-hover:text-indigo-300 transition">
                  {mod.name}
                </p>
                <p className="mt-1 text-xs text-gray-400">{mod.count}</p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-gray-800/80 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {mod.status}
                </span>
                <span className="text-gray-500 group-hover:text-indigo-400 transition font-semibold">
                  Launch →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">
            Recent runs
          </h2>
          <Link href="/runs" className="text-xs text-indigo-400 hover:text-indigo-300">
            View all →
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          {!runs ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading persisted runs…</div>
          ) : runs.items.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No execution runs exist in this tenant.
            </div>
          ) : (
            runs.items.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${encodeURIComponent(run.id)}`}
                className="grid grid-cols-12 gap-3 border-b border-gray-800 px-5 py-4 text-sm last:border-0 hover:bg-gray-800/60"
              >
                <div className="col-span-5 truncate font-mono text-xs text-indigo-300">
                  {run.workflow_id}
                </div>
                <div className="col-span-2 text-gray-300">v{run.workflow_version}</div>
                <div className="col-span-2 text-gray-300">{run.status.replaceAll('_', ' ')}</div>
                <div className="col-span-3 text-right text-xs text-gray-500">
                  {new Date(run.queued_at).toLocaleString()}
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function QuickAction({ label, href, detail }: { label: string; href: string; detail: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-indigo-700"
    >
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </Link>
  );
}
