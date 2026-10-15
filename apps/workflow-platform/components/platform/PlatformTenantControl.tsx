'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { VerifiedSession } from '@/lib/verified-session';

type Readiness = 'AVAILABLE' | 'REVIEW' | 'CONTAINED' | 'PLANNED';

interface ModuleDefinition {
  key: string;
  name: string;
  area: string;
  readiness: Readiness;
  entitlementEligible: boolean;
  trialEligible: boolean;
  reason: string;
}

interface Catalog {
  modules: ModuleDefinition[];
  tenantBaseDomain: string | null;
  policy: {
    selfServiceTrialDays: number;
    automaticPaymentConversion: boolean;
    dedicatedDatabaseProvisioning: boolean;
    domainActivation: boolean;
  };
}

interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: string;
  isolationMode: string;
  region: string;
  plan: string | null;
  trialEndsAt: string | null;
  trialExpired: boolean;
  createdAt: string;
  owner: { role: string; user: { id: string; email: string; name: string } } | null;
  moduleEntitlements: Array<{
    moduleKey: string;
    status: 'ENABLED' | 'DISABLED';
    source: string;
    endsAt: string | null;
  }>;
  isolationBinding: {
    requestedMode: string;
    effectiveMode: string | null;
    status: string;
    region: string;
    bindingReference: string | null;
    failureCode: string | null;
    failureMessage: string | null;
  } | null;
  subdomainBinding: {
    hostname: string;
    status: string;
    verificationRef: string | null;
    failureCode: string | null;
    failureMessage: string | null;
  } | null;
  _count: { members: number };
}

interface CreateForm {
  name: string;
  slug: string;
  ownerEmail: string;
  trialDays: number;
  isolationMode: 'ROW_LEVEL_SECURITY' | 'SCHEMA_ISOLATED' | 'DEDICATED_DATABASE';
  region: string;
  reason: string;
}

const emptyCreate: CreateForm = {
  name: '',
  slug: '',
  ownerEmail: '',
  trialDays: 7,
  isolationMode: 'ROW_LEVEL_SECURITY',
  region: 'local',
  reason: 'Create tenant trial',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.detail === 'string') return record.detail;
    if (typeof record.message === 'string') return record.message;
    if (Array.isArray(record.message)) return record.message.join(', ');
  }
  return fallback;
}

export default function PlatformTenantControl({ session }: { session: VerifiedSession }) {
  const [activeTab, setActiveTab] = useState<'directory' | 'detail' | 'register'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [create, setCreate] = useState<CreateForm>(emptyCreate);
  const [createModules, setCreateModules] = useState<string[]>([]);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [reason, setReason] = useState('Platform administrator review');
  const [billingReference, setBillingReference] = useState('');
  const [isolationMode, setIsolationMode] =
    useState<CreateForm['isolationMode']>('ROW_LEVEL_SECURITY');
  const [region, setRegion] = useState('local');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canMutate =
    session.platformRoles.includes('PLATFORM_OWNER') ||
    session.platformRoles.includes('PLATFORM_ADMIN');

  const selected = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedId) ?? null,
    [selectedId, tenants],
  );

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.owner?.user.email && t.owner.user.email.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'EXPIRED' ? t.trialExpired : t.status === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [tenants, searchQuery, statusFilter]);

  const load = useCallback(async () => {
    setError(null);
    const [catalogResponse, tenantsResponse] = await Promise.all([
      fetch('/api/control/platform/catalog', { cache: 'no-store' }),
      fetch('/api/control/platform/tenants', { cache: 'no-store' }),
    ]);
    const [catalogPayload, tenantsPayload] = await Promise.all([
      catalogResponse.json().catch(() => null),
      tenantsResponse.json().catch(() => null),
    ]);
    if (!catalogResponse.ok)
      throw new Error(errorMessage(catalogPayload, 'Platform catalog failed.'));
    if (!tenantsResponse.ok)
      throw new Error(errorMessage(tenantsPayload, 'Tenant registry failed.'));
    if (
      !catalogPayload ||
      !Array.isArray(catalogPayload.modules) ||
      !Array.isArray(tenantsPayload)
    ) {
      throw new Error('The platform API returned an invalid contract.');
    }
    const nextCatalog = catalogPayload as Catalog;
    const nextTenants = tenantsPayload as TenantRecord[];
    setCatalog(nextCatalog);
    setTenants(nextTenants);
    setCreateModules(
      nextCatalog.modules.filter((module) => module.trialEligible).map((module) => module.key),
    );
    setSelectedId((current) => current ?? nextTenants[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void load().catch((failure) =>
      setError(failure instanceof Error ? failure.message : 'Platform data could not be loaded.'),
    );
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setEditModules(
      selected.moduleEntitlements
        .filter((entitlement) => entitlement.status === 'ENABLED')
        .map((entitlement) => entitlement.moduleKey),
    );
    setIsolationMode(selected.isolationMode as CreateForm['isolationMode']);
    setRegion(selected.region);
  }, [selected]);

  async function mutate(
    path: string,
    method: 'POST' | 'PATCH' | 'PUT',
    body: unknown,
    label: string,
  ) {
    if (!canMutate) throw new Error('Platform auditor authority is read-only.');
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/control/platform/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, `${label} failed.`));
      await load();
      setNotice(`${label} completed and was recorded in PostgreSQL.`);
      return payload as TenantRecord;
    } finally {
      setBusy(null);
    }
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canMutate) {
      setError('Platform auditor authority is read-only.');
      return;
    }
    try {
      const created = await mutate(
        'tenants',
        'POST',
        { ...create, moduleKeys: createModules },
        'Tenant creation',
      );
      setCreate(emptyCreate);
      setSelectedId(created.id);
      setActiveTab('detail');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Tenant creation failed.');
    }
  }

  async function tenantMutation(
    suffix: string,
    method: 'POST' | 'PATCH' | 'PUT',
    body: unknown,
    label: string,
  ) {
    if (!selected) return;
    try {
      await mutate(`tenants/${selected.id}/${suffix}`, method, body, label);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : `${label} failed.`);
    }
  }

  function handleSelectTenantRow(tenantId: string) {
    setSelectedId(tenantId);
    setActiveTab('detail');
  }

  if (!catalog && !error) {
    return <div className="p-10 text-sm text-zinc-500">Loading the platform tenant registry…</div>;
  }

  return (
    <div className="min-h-full bg-[#f7f8fa] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        {/* Global Module Switcher Tabs & Fleet Info */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-3 text-xs font-semibold">
          <div className="flex flex-wrap gap-2">
            <a
              href="/platform-admin"
              className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-blue-700 border border-blue-200"
            >
              🏢 Tenant Workspaces & Licensing
            </a>
            <a
              href="/platform-admin/users"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition"
            >
              👥 Global Users & Platform RBAC
            </a>
            <a
              href="/platform-admin/master-data"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition"
            >
              🛡️ Master Data
            </a>
            <a
              href="/platform-admin/infra"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition"
            >
              ⚙️ Infrastructure
            </a>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs shadow-xs">
              <span className="font-semibold text-zinc-700">Domain Root: </span>
              <span className="font-mono text-zinc-500">
                {catalog?.tenantBaseDomain ?? 'Local Host'}
              </span>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs shadow-xs">
              <span className="font-semibold text-zinc-700">Workspaces: </span>
              <span className="font-bold text-blue-600">{tenants.length}</span>
            </div>
          </div>
        </div>

        {/* Global Notifications */}
        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <output className="mt-4 block rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </output>
        )}
        {!canMutate && (
          <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800">
            Platform auditor mode is read-only. Tenant mutations and license changes are restricted.
          </p>
        )}

        {/* Navigation Tabs */}
        <div className="mt-6 flex border-b border-zinc-200">
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-semibold transition ${
              activeTab === 'directory'
                ? 'border-blue-600 text-blue-600 bg-white/50'
                : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <span>🏢 Tenant Directory</span>
            <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-[10px] text-zinc-700">
              {filteredTenants.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('detail')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-semibold transition ${
              activeTab === 'detail'
                ? 'border-blue-600 text-blue-600 bg-white/50'
                : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <span>⚙️ Tenant Management & Entitlements</span>
            {selected && (
              <span className="rounded-md bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] text-blue-800">
                {selected.name}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-semibold transition ${
              activeTab === 'register'
                ? 'border-blue-600 text-blue-600 bg-white/50'
                : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <span>➕ Provision New Trial Tenant</span>
          </button>
        </div>

        {/* TAB 1: FULL TABLE DIRECTORY */}
        {activeTab === 'directory' && (
          <div className="mt-6 space-y-4">
            {/* Search and Filters Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="flex flex-1 items-center gap-2 min-w-[280px]">
                <span className="text-zinc-400">🔍</span>
                <input
                  type="text"
                  placeholder="Search by organization name, slug, or owner email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs text-zinc-800 outline-none placeholder:text-zinc-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-800 outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="TRIAL">Trial</option>
                  <option value="EXPIRED">Trial Expired</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
                <button
                  type="button"
                  onClick={() => setActiveTab('register')}
                  className={primaryButton}
                >
                  + New Trial
                </button>
              </div>
            </div>

            {/* Wide Full-Detail Table */}
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
                <thead className="bg-zinc-50/80 font-semibold text-zinc-600">
                  <tr>
                    <th scope="col" className="px-5 py-3">Tenant / Workspace</th>
                    <th scope="col" className="px-4 py-3">Slug</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Plan / Tier</th>
                    <th scope="col" className="px-4 py-3">Trial Ends</th>
                    <th scope="col" className="px-4 py-3">Isolation</th>
                    <th scope="col" className="px-4 py-3">Active Modules</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-700">
                  {filteredTenants.map((t) => {
                    const isSelected = selectedId === t.id;
                    const activeModCount = t.moduleEntitlements.filter((m) => m.status === 'ENABLED').length;
                    return (
                      <tr
                        key={t.id}
                        className={`transition hover:bg-zinc-50 cursor-pointer ${
                          isSelected ? 'bg-blue-50/60 font-medium' : ''
                        }`}
                        onClick={() => handleSelectTenantRow(t.id)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white shadow-sm">
                              {t.name.slice(0, 1).toUpperCase()}
                            </span>
                            <div>
                              <div className="font-semibold text-zinc-900">{t.name}</div>
                              <div className="text-[10px] text-zinc-400">
                                {t.owner?.user.email ?? 'No admin owner'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-500">
                          {t.slug}
                        </td>
                        <td className="px-4 py-3.5">
                          <State value={t.trialExpired ? 'EXPIRED' : t.status} />
                        </td>
                        <td className="px-4 py-3.5 text-zinc-800">
                          {t.plan ?? 'Standard Trial'}
                        </td>
                        <td className="px-4 py-3.5 text-zinc-600">
                          {formatDate(t.trialEndsAt)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-600">
                            {t.isolationMode}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                            {activeModCount} modules
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectTenantRow(t.id);
                            }}
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition"
                          >
                            Manage →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTenants.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-sm text-zinc-400">
                        No tenant workspaces match your search filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: TENANT MANAGEMENT DETAIL & ENTITLEMENTS */}
        {activeTab === 'detail' && (
          <div className="mt-6 space-y-6">
            {selected ? (
              <>
                {/* Tenant Overview Card */}
                <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-950 text-xl font-bold text-white shadow-md">
                        {selected.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-2xl font-bold text-zinc-950">{selected.name}</h2>
                          <State value={selected.trialExpired ? 'EXPIRED' : selected.status} />
                        </div>
                        <p className="mt-1 font-mono text-xs text-zinc-500">
                          Tenant UUID: {selected.id} · Workspace Slug: {selected.slug}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveTab('directory')}
                        className={secondaryButton}
                      >
                        ← Back to Directory
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label="Current Plan" value={selected.plan ?? '7-Day Self-Service Trial'} />
                    <Metric label="Trial Expiration" value={formatDate(selected.trialEndsAt)} />
                    <Metric
                      label="Assigned Vanity Subdomain"
                      value={selected.subdomainBinding?.hostname ?? 'Not reserved (Default path routed)'}
                    />
                    <Metric
                      label="Infrastructure Isolation"
                      value={`${selected.isolationBinding?.status ?? 'ACTIVE'} · ${selected.isolationMode}`}
                    />
                  </div>
                </section>

                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Left Box: Trial & Lifecycle Control */}
                  <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
                    <div className="border-b border-zinc-100 pb-3">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
                        1. Trial & Lifecycle Control
                      </h3>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Extend trial periods, convert to enterprise contract, or suspend delinquent access.
                      </p>
                    </div>

                    <Field label="Audit Reason (Mandatory for Compliance)">
                      <input
                        value={reason}
                        minLength={3}
                        onChange={(event) => setReason(event.target.value)}
                        className={inputClass}
                      />
                    </Field>

                    <Field label="Billing / PO Reference (Optional)">
                      <input
                        placeholder="e.g. STRIPE-CUST-901 or PO-2026-4401"
                        value={billingReference}
                        onChange={(event) => setBillingReference(event.target.value)}
                        className={inputClass}
                      />
                    </Field>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <ActionButton
                        disabled={!canMutate || busy !== null}
                        onClick={() =>
                          void tenantMutation(
                            'trial-extension',
                            'POST',
                            { extensionDays: 14, reason },
                            'Trial extension',
                          )
                        }
                      >
                        ⏱️ Extend 14 Days
                      </ActionButton>
                      <ActionButton
                        disabled={!canMutate || busy !== null}
                        onClick={() =>
                          void tenantMutation(
                            'status',
                            'PATCH',
                            { status: 'ACTIVE', plan: 'ENTERPRISE', reason, billingReference },
                            'Convert to paid enterprise plan',
                          )
                        }
                      >
                        💳 Convert to Paid
                      </ActionButton>
                      <ActionButton
                        disabled={!canMutate || busy !== null}
                        onClick={() =>
                          void tenantMutation(
                            'status',
                            'PATCH',
                            {
                              status: selected.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                              reason,
                            },
                            `${selected.status === 'SUSPENDED' ? 'Activate' : 'Suspend'} workspace`,
                          )
                        }
                      >
                        {selected.status === 'SUSPENDED' ? '🔓 Reactivate' : '🛑 Suspend Workspace'}
                      </ActionButton>
                    </div>
                  </div>

                  {/* Right Box: Infrastructure Isolation Tier */}
                  <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
                    <div className="border-b border-zinc-100 pb-3">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
                        2. Database & Infrastructure Isolation
                      </h3>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Tier isolation between shared tenant RLS and dedicated cloud infrastructure.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Requested Isolation Tier">
                        <select
                          value={isolationMode}
                          onChange={(event) =>
                            setIsolationMode(event.target.value as CreateForm['isolationMode'])
                          }
                          className={inputClass}
                        >
                          <option value="ROW_LEVEL_SECURITY">Shared / Row-Level Security</option>
                          <option value="SCHEMA_ISOLATED">Schema Isolated</option>
                          <option value="DEDICATED_DATABASE">Dedicated Database Cluster</option>
                        </select>
                      </Field>
                      <Field label="Target Cloud Region">
                        <input
                          value={region}
                          onChange={(event) => setRegion(event.target.value)}
                          className={inputClass}
                        />
                      </Field>
                    </div>

                    <div className="pt-2">
                      <ActionButton
                        disabled={!canMutate || busy !== null}
                        onClick={() =>
                          void tenantMutation(
                            'isolation-requests',
                            'POST',
                            { isolationMode, region, reason },
                            'Request isolation upgrade',
                          )
                        }
                      >
                        🚀 Apply Infrastructure Mode
                      </ActionButton>
                    </div>
                  </div>
                </div>

                {/* Module Entitlements Card */}
                <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="border-b border-zinc-100 pb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
                      3. Licensed Enterprise Modules
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Select which operational suites this tenant is licensed to access. Unchecked modules will fail closed with 403 Forbidden.
                    </p>
                  </div>
                  <ModuleChecklist
                    modules={catalog?.modules ?? []}
                    selected={editModules}
                    onChange={setEditModules}
                    disabled={!canMutate}
                  />
                  <div className="mt-6 border-t border-zinc-100 pt-4">
                    <button
                      type="button"
                      disabled={!canMutate || busy !== null}
                      onClick={() =>
                        void tenantMutation(
                          'entitlements',
                          'PUT',
                          {
                            moduleKeys: editModules,
                            reason: `${reason} (Licensed entitlements updated)`,
                          },
                          'Update module licenses',
                        )
                      }
                      className={primaryButton}
                    >
                      Save Licensed Module Entitlements
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center">
                <p className="text-sm text-zinc-500">Select a tenant from the directory to inspect its configuration.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('directory')}
                  className={`${primaryButton} mt-4`}
                >
                  View Tenant Directory
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PROVISION NEW TRIAL TENANT */}
        {activeTab === 'register' && (
          <div className="mt-6 max-w-2xl mx-auto">
            <form
              onSubmit={(event) => void createTenant(event)}
              className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm space-y-5"
            >
              <div className="border-b border-zinc-100 pb-4">
                <h2 className="text-lg font-bold text-zinc-950">Provision a New Enterprise Trial</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Starts a time-bounded corporate workspace in PostgreSQL with Row-Level Security isolation.
                </p>
              </div>

              <div className="space-y-4">
                <Field label="Customer Organization Name">
                  <input
                    required
                    placeholder="e.g. Roche Pharmaceuticals"
                    value={create.name}
                    onChange={(event) =>
                      setCreate({
                        ...create,
                        name: event.target.value,
                        slug: create.slug || slugify(event.target.value),
                      })
                    }
                    className={inputClass}
                  />
                </Field>

                <Field label="Workspace URL Slug">
                  <input
                    required
                    pattern="[a-z0-9][a-z0-9-]{1,47}"
                    placeholder="e.g. roche-pharma"
                    value={create.slug}
                    onChange={(event) =>
                      setCreate({ ...create, slug: slugify(event.target.value) })
                    }
                    className={inputClass}
                  />
                </Field>

                <Field label="Initial Admin Owner Email">
                  <input
                    required
                    type="email"
                    placeholder="e.g. admin@roche.com"
                    value={create.ownerEmail}
                    onChange={(event) => setCreate({ ...create, ownerEmail: event.target.value })}
                    className={inputClass}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Trial Period (Days)">
                    <input
                      required
                      type="number"
                      min={1}
                      max={90}
                      value={create.trialDays}
                      onChange={(event) =>
                        setCreate({ ...create, trialDays: Number(event.target.value) })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Deployment Region">
                    <input
                      required
                      value={create.region}
                      onChange={(event) => setCreate({ ...create, region: event.target.value })}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="Database Isolation Tier">
                  <select
                    value={create.isolationMode}
                    onChange={(event) =>
                      setCreate({
                        ...create,
                        isolationMode: event.target.value as CreateForm['isolationMode'],
                      })
                    }
                    className={inputClass}
                  >
                    <option value="ROW_LEVEL_SECURITY">Shared / Row-Scoped (PostgreSQL RLS)</option>
                    <option value="SCHEMA_ISOLATED">Schema Isolated (Separate DB Schema)</option>
                    <option value="DEDICATED_DATABASE">Dedicated Database Cluster</option>
                  </select>
                </Field>

                <Field label="Audit Reason (Required)">
                  <input
                    required
                    minLength={3}
                    placeholder="e.g. Inbound Enterprise RevOps Pilot"
                    value={create.reason}
                    onChange={(event) => setCreate({ ...create, reason: event.target.value })}
                    className={inputClass}
                  />
                </Field>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Modules to Entitle during Trial
                  </label>
                  <ModuleChecklist
                    modules={catalog?.modules ?? []}
                    selected={createModules}
                    onChange={setCreateModules}
                    compact
                    disabled={!canMutate}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('directory')}
                  className={secondaryButton}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canMutate || busy !== null}
                  className={primaryButton}
                >
                  Create {create.trialDays}-Day Trial Tenant
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-900 truncate" title={value}>
        {value}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function State({ value }: { value: string }) {
  const color =
    value === 'ACTIVE' || value === 'ENABLED'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : value === 'TRIAL'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : value === 'EXPIRED' || value === 'SUSPENDED' || value === 'FAILED'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${color}`}>
      {value.replaceAll('_', ' ')}
    </span>
  );
}

function ModuleChecklist({
  modules,
  selected,
  onChange,
  compact = false,
  disabled = false,
}: {
  modules: ModuleDefinition[];
  selected: string[];
  onChange: (value: string[]) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const selectedSet = new Set(selected);
  const visible = compact ? modules.filter((module) => module.entitlementEligible) : modules;
  return (
    <div className={`mt-3 grid gap-2 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
      {visible.map((module) => (
        <label
          key={module.key}
          title={module.reason}
          className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
            selectedSet.has(module.key)
              ? 'border-blue-300 bg-blue-50/40 text-blue-950'
              : module.entitlementEligible
                ? 'border-zinc-200 bg-white hover:border-zinc-300'
                : 'border-zinc-100 bg-zinc-50 text-zinc-400 cursor-not-allowed'
          }`}
        >
          <input
            type="checkbox"
            className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
            checked={selectedSet.has(module.key)}
            disabled={disabled || !module.entitlementEligible}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, module.key]
                  : selected.filter((key) => key !== module.key),
              )
            }
          />
          <span className="min-w-0">
            <span className="block text-xs font-semibold leading-tight">{module.name}</span>
            <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-zinc-400">
              {module.area}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={secondaryButton}>
      {children}
    </button>
  );
}

const inputClass =
  'h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const primaryButton =
  'inline-flex h-9 items-center justify-center rounded-lg bg-zinc-950 px-4 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50';
