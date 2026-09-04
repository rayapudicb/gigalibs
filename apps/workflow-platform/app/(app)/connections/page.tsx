'use client';

import type { SourceConnection, TenantEnvironment } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const STATUS_STYLE: Record<SourceConnection['status'], string> = {
  READY: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
  READY_WITH_LIMITS: 'border-amber-800 bg-amber-950/40 text-amber-300',
  NOT_READY: 'border-red-900 bg-red-950/40 text-red-300',
  UNTESTED: 'border-gray-700 bg-gray-800 text-gray-300',
  DISABLED: 'border-gray-800 bg-gray-900 text-gray-500',
};

export default function ConnectionsPage() {
  const [environments, setEnvironments] = useState<TenantEnvironment[]>([]);
  const [connections, setConnections] = useState<SourceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [environmentRows, connectionRows] = await Promise.all([
        requestJson<TenantEnvironment[]>('/api/operational-intelligence/environments'),
        requestJson<SourceConnection[]>('/api/operational-intelligence/connections'),
      ]);
      setEnvironments(environmentRows);
      setConnections(connectionRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the Integration Hub.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 p-8 font-sans text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Integration Hub</h1>
          <p className="mt-1 text-xs text-zinc-400">
            Tenant-scoped source environments, readiness, profiles, and contracts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/data-contracts"
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition shadow-xs"
          >
            Data contracts
          </Link>
          <Link
            href="/connections/credentials"
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition shadow-xs"
          >
            Credentials
          </Link>
          <Link
            href="/connections/environments/new"
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition shadow-xs"
          >
            New environment
          </Link>
          <Link
            href="/connections/new"
            className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-950 hover:bg-zinc-200 transition shadow-xs"
          >
            + New connection
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-xs text-zinc-400 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
            <span>{error} — Showing local configuration mode.</span>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-medium text-zinc-200 hover:text-white underline underline-offset-2 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* ─── FEATURED FEDERAL & ENTERPRISE CONNECTORS ────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Featured Federal & Enterprise Connectors
          </h2>
          <span className="text-[11px] text-zinc-500 font-mono">Zero-Training Automated Pipelines</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {/* SAM.gov Gateway Card */}
          <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-b from-indigo-950/30 to-zinc-900/70 p-5 space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-lg">
                  🏛️
                </div>
                <div>
                  <div className="font-semibold text-sm text-zinc-100">SAM.gov Federal Gateway</div>
                  <div className="text-xs text-zinc-400 font-mono">api.sam.gov · Open Tech GSA</div>
                </div>
              </div>
              <span className="rounded-md border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                CONNECTED
              </span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Streams active federal RFPs, NAICS-matched solicitations, and FAR 9.405 debarment screening into GigaLibs modules.
            </p>

            <div className="grid grid-cols-2 gap-2 text-center text-xs py-1 border-y border-zinc-800/80">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Target NAICS</span>
                <span className="font-mono font-bold text-zinc-200">541512</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Quota Guard</span>
                <span className="font-mono font-bold text-emerald-400">1,000 / day</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Link
                href="/opportunities"
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-xs"
              >
                View Opportunities 🎯
              </Link>
              <Link
                href="/workflows"
                className="rounded-lg border border-zinc-700 bg-zinc-800/70 hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition"
              >
                ⚡ View DAG Pipeline
              </Link>
            </div>
          </div>

          {/* Stripe Inbound Payments */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 border border-zinc-700 text-lg">
                  💳
                </div>
                <div>
                  <div className="font-semibold text-sm text-zinc-100">Stripe Billing & Webhooks</div>
                  <div className="text-xs text-zinc-400 font-mono">api.stripe.com/v1</div>
                </div>
              </div>
              <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                STANDBY
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Synchronizes invoice settlements, customer credit cards, and ledger double-entry reconciliation.
            </p>
            <div className="pt-5">
              <Link
                href="/connections/new"
                className="rounded-lg border border-zinc-700 bg-zinc-800/70 hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition block text-center"
              >
                Configure Webhook Secret
              </Link>
            </div>
          </div>

          {/* Custom Webhook Ingestion */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 border border-zinc-700 text-lg">
                  ⚡
                </div>
                <div>
                  <div className="font-semibold text-sm text-zinc-100">Universal Inbound Webhook</div>
                  <div className="text-xs text-zinc-400 font-mono">/api/v1/webhooks/inbound</div>
                </div>
              </div>
              <span className="rounded-md border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              HMAC-SHA256 authenticated webhook receiver executing tenant-scoped DAG pipelines with idempotency keys.
            </p>
            <div className="pt-5">
              <Link
                href="/data-contracts"
                className="rounded-lg border border-zinc-700 bg-zinc-800/70 hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition block text-center"
              >
                Manage Payload Contracts
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          Environments
        </h2>
        {loading ? (
          <Loading />
        ) : environments.length === 0 ? (
          <Empty
            title="No environments configured"
            detail="Set up an isolated environment before registering upstream enterprise connectors."
            actionHref="/connections/environments/new"
            actionLabel="Create environment"
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {environments.map((environment) => (
              <div
                key={environment.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-sm text-zinc-100">{environment.displayName}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      {environment.kind.toLowerCase()} · {environment.region}
                    </div>
                  </div>
                  <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300 font-mono">
                    {environment.status.toLowerCase()}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <Metric label="Sources" value={environment._count.connections} />
                  <Metric label="Contracts" value={environment._count.dataContracts} />
                  <Metric label="Events" value={environment._count.sourceEvents} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Connections
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-xs text-zinc-400 hover:text-white disabled:opacity-50 transition"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <Loading />
        ) : connections.length === 0 ? (
          <Empty
            title="No source connections"
            detail="Register an allowlisted HTTP or webhook source to stream events and execute workflows."
            actionHref="/connections/new"
            actionLabel="Register connection"
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/60">
            {connections.map((connection) => (
              <Link
                key={connection.id}
                href={`/connections/${encodeURIComponent(connection.id)}`}
                className="grid grid-cols-12 gap-4 border-b border-zinc-800/80 px-5 py-4 last:border-0 hover:bg-zinc-850/60 transition"
              >
                <div className="col-span-4 min-w-0">
                  <div className="truncate font-medium text-sm text-zinc-100">{connection.name}</div>
                  <div className="mt-0.5 truncate text-xs text-zinc-400 font-mono">{connection.endpoint}</div>
                </div>
                <div className="col-span-2 self-center text-xs text-zinc-300">
                  {connection.environment?.displayName ?? connection.environmentId}
                </div>
                <div className="col-span-2 self-center text-xs text-zinc-300 font-mono">
                  {connection.interfaceType}
                </div>
                <div className="col-span-2 self-center">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[connection.status]}`}
                  >
                    {connection.status.toLowerCase().replaceAll('_', ' ')}
                  </span>
                </div>
                <div className="col-span-2 self-center text-right text-xs text-zinc-400">
                  {connection.lastTestedAt
                    ? new Date(connection.lastTestedAt).toLocaleString()
                    : 'Not tested'}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/60 p-2">
      <div className="font-semibold text-zinc-200">{value}</div>
      <div className="mt-0.5 text-[11px] text-zinc-400">{label}</div>
    </div>
  );
}

function Loading() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center text-xs text-zinc-400">
      Loading…
    </div>
  );
}

function Empty({ title, detail, actionHref, actionLabel }: { title: string; detail: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-10 text-center space-y-3">
      <div className="mx-auto h-10 w-10 rounded-xl bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-400 text-sm">
        🔌
      </div>
      <div>
        <h3 className="font-medium text-sm text-zinc-100">{title}</h3>
        <p className="mt-1 text-xs text-zinc-400 max-w-sm mx-auto">{detail}</p>
      </div>
      {actionHref && actionLabel && (
        <div className="pt-1">
          <Link
            href={actionHref}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition"
          >
            {actionLabel}
          </Link>
        </div>
      )}
    </div>
  );
}
