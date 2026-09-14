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
      throw new Error(errorMessage(catalogPayload, 'Module catalog failed.'));
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

  if (!catalog && !error) {
    return <div className="p-10 text-sm text-zinc-500">Loading the platform tenant registry…</div>;
  }

  return (
    <div className="min-h-full bg-[#f7f8fa] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
              Global authority
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              Platform tenant control
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              Create trials, assign eligible modules, control tenant lifecycle, reserve subdomains,
              and request an isolation tier. Every result below comes from the canonical
              control-plane database.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
            <p className="font-semibold text-zinc-900">Tenant base domain</p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              {catalog?.tenantBaseDomain ?? 'PLATFORM_TENANT_BASE_DOMAIN is not configured'}
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
        {notice && (
          <output className="mt-5 block rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </output>
        )}
        {!canMutate && (
          <p className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Platform auditor mode is read-only. Tenant, entitlement and infrastructure mutations are disabled.
          </p>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <div className="space-y-6">
            <form
              onSubmit={(event) => void createTenant(event)}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-base font-semibold text-zinc-950">Register a tenant</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                The owner must already have an active account. Creation starts a time-bounded trial.
              </p>
              <div className="mt-5 space-y-3">
                <Field label="Organization name">
                  <input
                    required
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
                <Field label="URL slug">
                  <input
                    required
                    pattern="[a-z0-9][a-z0-9-]{1,47}"
                    value={create.slug}
                    onChange={(event) =>
                      setCreate({ ...create, slug: slugify(event.target.value) })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Owner email">
                  <input
                    required
                    type="email"
                    value={create.ownerEmail}
                    onChange={(event) => setCreate({ ...create, ownerEmail: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Trial days">
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
                  <Field label="Region">
                    <input
                      required
                      value={create.region}
                      onChange={(event) => setCreate({ ...create, region: event.target.value })}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label="Requested isolation">
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
                    <option value="ROW_LEVEL_SECURITY">Shared / row-scoped</option>
                    <option value="SCHEMA_ISOLATED">Schema isolated</option>
                    <option value="DEDICATED_DATABASE">Dedicated database</option>
                  </select>
                </Field>
                <Field label="Audit reason">
                  <input
                    required
                    minLength={3}
                    value={create.reason}
                    onChange={(event) => setCreate({ ...create, reason: event.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
              <ModuleChecklist
                modules={catalog?.modules ?? []}
                selected={createModules}
                onChange={setCreateModules}
                compact
                disabled={!canMutate}
              />
              <button type="submit" disabled={!canMutate || busy !== null} className={primaryButton}>
                Create 7-day trial tenant
              </button>
            </form>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between px-1 pb-3">
                <h2 className="text-sm font-semibold">Tenant registry</h2>
                <span className="text-xs text-zinc-500">{tenants.length} records</span>
              </div>
              <div className="space-y-2">
                {tenants.map((tenant) => (
                  <button
                    key={tenant.id}
                    type="button"
                    onClick={() => setSelectedId(tenant.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${selectedId === tenant.id ? 'border-blue-300 bg-blue-50' : 'border-zinc-200 hover:border-zinc-300'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-zinc-900">{tenant.name}</span>
                      <State value={tenant.trialExpired ? 'EXPIRED' : tenant.status} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-zinc-500">{tenant.slug}</p>
                  </button>
                ))}
                {tenants.length === 0 && (
                  <p className="px-2 py-5 text-sm text-zinc-500">No tenant records exist.</p>
                )}
              </div>
            </section>
          </div>

          {selected ? (
            <div className="space-y-6">
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-semibold text-zinc-950">{selected.name}</h2>
                      <State value={selected.trialExpired ? 'EXPIRED' : selected.status} />
                    </div>
                    <p className="mt-2 font-mono text-xs text-zinc-500">
                      {selected.id} · {selected.slug}
                    </p>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <p>{selected.owner?.user.email ?? 'No active tenant administrator'}</p>
                    <p className="mt-1">{selected._count.members} member(s)</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Plan" value={selected.plan ?? 'Unassigned'} />
                  <Metric label="Trial ends" value={formatDate(selected.trialEndsAt)} />
                  <Metric
                    label="Subdomain"
                    value={selected.subdomainBinding?.hostname ?? 'Not reserved'}
                  />
                  <Metric
                    label="Isolation"
                    value={`${selected.isolationBinding?.status ?? 'NOT REQUESTED'} · ${selected.isolationMode}`}
                  />
                </div>
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                  Subdomain status is{' '}
                  <strong>{selected.subdomainBinding?.status ?? 'NOT RESERVED'}</strong>. Isolation
                  status is <strong>{selected.isolationBinding?.status ?? 'NOT REQUESTED'}</strong>.
                  These are not presented as active infrastructure until DNS/TLS and database
                  workers store provider evidence.
                </div>
              </section>

              <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold">Trial and tenant status</h3>
                  <Field label="Reason">
                    <input
                      value={reason}
                      minLength={3}
                      onChange={(event) => setReason(event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Payment or billing reference (optional)">
                    <input
                      value={billingReference}
                      onChange={(event) => setBillingReference(event.target.value)}
                      className={inputClass}
                      placeholder="External verified reference"
                    />
                  </Field>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton
                      disabled={!canMutate || busy !== null}
                      onClick={() =>
                        void tenantMutation(
                          'trial-extension',
                          'POST',
                          { days: 7, reason },
                          'Trial extension',
                        )
                      }
                    >
                      Extend trial 7 days
                    </ActionButton>
                    <ActionButton
                      disabled={!canMutate || busy !== null}
                      onClick={() =>
                        void tenantMutation(
                          'status',
                          'PATCH',
                          {
                            status: 'ACTIVE',
                            plan: 'MANUAL',
                            ...(billingReference.trim()
                              ? { billingReference: billingReference.trim() }
                              : {}),
                            reason,
                          },
                          'Tenant activation',
                        )
                      }
                    >
                      Activate
                    </ActionButton>
                    <ActionButton
                      disabled={!canMutate || busy !== null}
                      onClick={() =>
                        void tenantMutation(
                          'status',
                          'PATCH',
                          { status: 'SUSPENDED', reason },
                          'Tenant suspension',
                        )
                      }
                    >
                      Suspend
                    </ActionButton>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-zinc-500">
                    Activation without a billing reference is recorded as a platform override.
                    Automatic payment conversion remains unavailable until a payment adapter and
                    signed webhook contract are selected.
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold">Isolation request</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Field label="Mode">
                      <select
                        value={isolationMode}
                        onChange={(event) =>
                          setIsolationMode(event.target.value as CreateForm['isolationMode'])
                        }
                        className={inputClass}
                      >
                        <option value="ROW_LEVEL_SECURITY">Shared / row-scoped</option>
                        <option value="SCHEMA_ISOLATED">Schema isolated</option>
                        <option value="DEDICATED_DATABASE">Dedicated database</option>
                      </select>
                    </Field>
                    <Field label="Region">
                      <input
                        value={region}
                        onChange={(event) => setRegion(event.target.value)}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    disabled={!canMutate || busy !== null}
                    onClick={() =>
                      void tenantMutation(
                        'isolation-requests',
                        'POST',
                        { isolationMode, region, reason },
                        'Isolation request',
                      )
                    }
                    className={`${secondaryButton} mt-4`}
                  >
                    Record isolation request
                  </button>
                  <p className="mt-4 text-xs leading-5 text-zinc-500">
                    This stores desired state and audit evidence. It cannot create a database until
                    an approved infrastructure provider worker is connected.
                  </p>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-base font-semibold">Module entitlements</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Contained and planned capabilities are visible for scope clarity and cannot be
                      enabled.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canMutate || busy !== null}
                    onClick={() =>
                      void tenantMutation(
                        'entitlements',
                        'PUT',
                        { moduleKeys: editModules, reason },
                        'Entitlement update',
                      )
                    }
                    className={primaryButton}
                  >
                    Save entitlements
                  </button>
                </div>
                <ModuleChecklist
                  modules={catalog?.modules ?? []}
                  selected={editModules}
                  onChange={setEditModules}
                  disabled={!canMutate}
                />
              </section>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
              Create or select a tenant to manage it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-3 block text-xs font-medium text-zinc-700">
      <legend className="mb-1.5 block">{label}</legend>
      {children}
    </fieldset>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-1 break-words text-xs font-medium text-zinc-800">{value}</p>
    </div>
  );
}

function State({ value }: { value: string }) {
  const color =
    value === 'ACTIVE' || value === 'READY'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : value === 'TRIAL'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : value === 'EXPIRED' || value === 'SUSPENDED' || value === 'FAILED'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${color}`}>
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
    <div className={`mt-5 grid gap-2 ${compact ? '' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
      {visible.map((module) => (
        <label
          key={module.key}
          title={module.reason}
          className={`flex items-start gap-3 rounded-xl border p-3 ${module.entitlementEligible ? 'border-zinc-200 bg-white' : 'border-zinc-100 bg-zinc-50 text-zinc-400'}`}
        >
          <input
            type="checkbox"
            className="mt-0.5"
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
            <span className="block text-xs font-medium">{module.name}</span>
            <span className="mt-1 block text-[10px] uppercase tracking-wide text-zinc-400">
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
  'h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const primaryButton =
  'inline-flex h-9 items-center justify-center rounded-lg bg-zinc-950 px-4 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50';
