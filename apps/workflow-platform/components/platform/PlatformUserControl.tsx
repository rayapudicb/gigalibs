'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { VerifiedSession } from '@/lib/verified-session';

type UserStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'DEACTIVATED';
type PlatformRole = 'PLATFORM_OWNER' | 'PLATFORM_ADMIN' | 'PLATFORM_AUDITOR';

interface PlatformUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: UserStatus;
  hasLocalPassword: boolean;
  lastLoginAt: string | null;
  updatedAt: string;
  memberships: Array<{
    id: string;
    role: string;
    status: string;
    tenant: { id: string; name: string; slug: string; status: string; plan: string | null };
  }>;
  platformRoleAssignments: Array<{
    id: string;
    role: PlatformRole;
    status: string;
    reason: string;
    expiresAt: string | null;
    updatedAt: string;
  }>;
  externalIdentities: Array<{
    id: string;
    issuer: string;
    status: 'ACTIVE' | 'REVOKED';
    statusReason: string | null;
    lastLoginAt: string;
    revokedAt: string | null;
    createdAt: string;
    updatedAt: string;
    configuration: {
      tenant: { id: string; name: string; slug: string };
    };
  }>;
  _count: { sessions: number; externalIdentities: number };
}

interface ResetCredential {
  token: string;
  resetPath: string;
  expiresAt: string;
  delivery: 'DISPLAY_ONCE';
}

const roles: PlatformRole[] = ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_AUDITOR'];

export function PlatformUserControl({ session }: { session: VerifiedSession }) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [reason, setReason] = useState('Platform identity administration');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reset, setReset] = useState<ResetCredential | null>(null);
  const [total, setTotal] = useState(0);

  const isOwner = session.platformRoles.includes('PLATFORM_OWNER');
  const canMutate = isOwner || session.platformRoles.includes('PLATFORM_ADMIN');
  const selected = useMemo(
    () => users.find((user) => user.id === selectedId) ?? null,
    [selectedId, users],
  );
  const selectedIdentities = selected?.externalIdentities ?? [];

  const load = useCallback(async () => {
    const query = new URLSearchParams({ limit: '100' });
    if (appliedSearch) query.set('search', appliedSearch);
    const response = await fetch(`/api/control/platform/users?${query.toString()}`, {
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: PlatformUser[]; total?: number; detail?: string; message?: string }
      | null;
    if (!response.ok || !Array.isArray(payload?.data)) {
      throw new Error(errorMessage(payload, 'Platform users could not be loaded.'));
    }
    setUsers(payload.data);
    setTotal(payload.total ?? payload.data.length);
    setSelectedId((current) =>
      payload.data?.some((user) => user.id === current)
        ? current
        : (payload.data?.[0]?.id ?? null),
    );
  }, [appliedSearch]);

  useEffect(() => {
    void load().catch((failure) =>
      setError(failure instanceof Error ? failure.message : 'Platform users could not be loaded.'),
    );
  }, [load]);

  async function mutate(
    path: string,
    method: 'POST' | 'PATCH' | 'PUT',
    body: unknown,
    label: string,
  ) {
    setBusy(label);
    setError(null);
    setNotice(null);
    setReset(null);
    try {
      const response = await fetch(`/api/control/platform/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, `${label} failed.`));
      await load();
      setNotice(`${label} completed and was recorded in the audit log.`);
      return payload;
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED') {
    if (!selected) return;
    try {
      await mutate(
        `users/${selected.id}/status`,
        'PATCH',
        { status, expectedUpdatedAt: selected.updatedAt, reason },
        `User ${status.toLowerCase()}`,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'User status change failed.');
    }
  }

  async function toggleRole(role: PlatformRole) {
    if (!selected) return;
    const current = selected.platformRoleAssignments.find((assignment) => assignment.role === role);
    const enabled = !isEffectiveAssignment(current);
    try {
      await mutate(
        `users/${selected.id}/platform-role`,
        'PUT',
        {
          role,
          enabled,
          expiresAt: null,
          expectedUpdatedAt: current?.updatedAt ?? null,
          reason,
        },
        `${enabled ? 'Grant' : 'Revoke'} ${role}`,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Platform role change failed.');
    }
  }

  async function issueReset() {
    if (!selected) return;
    try {
      const payload = (await mutate(
        `users/${selected.id}/password-reset`,
        'POST',
        { expiresInMinutes: 30, reason },
        'Password recovery issuance',
      )) as ResetCredential;
      setReset(payload);
      setNotice('Transfer this display-once recovery link through an approved secure channel.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Password recovery issuance failed.');
    }
  }

  async function toggleExternalIdentity(
    identity: PlatformUser['externalIdentities'][number],
  ) {
    if (!selected) return;
    const enabled = identity.status !== 'ACTIVE';
    try {
      await mutate(
        `users/${selected.id}/external-identities/${identity.id}`,
        'PUT',
        { enabled, expectedUpdatedAt: identity.updatedAt, reason },
        `${enabled ? 'Reactivate' : 'Revoke'} external identity`,
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'External identity change failed.',
      );
    }
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(search.trim());
  }

  const resetUrl =
    reset && typeof window !== 'undefined' ? `${window.location.origin}${reset.resetPath}` : '';

  return (
    <div className="min-h-full bg-[#f7f8fa] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <div className="border-b border-zinc-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
            Global authority
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Platform users and RBAC
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            Inspect real identities, memberships and global authority. Status, role and recovery
            changes are enforced by the control plane and audited.
          </p>
        </div>

        {error && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <output className="mt-5 block rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {notice}
          </output>
        )}
        {reset && (
          <section className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-5">
            <h2 className="font-semibold text-amber-950">Display-once password recovery link</h2>
            <p className="mt-1 text-xs text-amber-900">
              Expires {formatDate(reset.expiresAt)}. Issuing another link invalidates this one.
            </p>
            <input
              className="mt-3 h-10 w-full rounded-lg border border-amber-300 bg-white px-3 font-mono text-xs"
              readOnly
              value={resetUrl}
              aria-label="Password recovery link"
            />
          </section>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[370px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <form className="flex gap-2" onSubmit={applySearch}>
              <input
                className={inputClass}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or email"
              />
              <button className={secondaryButton} type="submit">Search</button>
            </form>
            <p className="mt-3 px-1 text-xs text-zinc-500">
              {users.length} shown · {total} matching identities
            </p>
            <div className="mt-3 max-h-[650px] space-y-2 overflow-y-auto">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(user.id);
                    setReset(null);
                  }}
                  className={`w-full rounded-xl border p-3 text-left ${selectedId === user.id ? 'border-blue-300 bg-blue-50' : 'border-zinc-200 hover:border-zinc-300'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{user.name}</span>
                    <Status value={user.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">{user.email}</p>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    {user.memberships.length} workspace(s) ·{' '}
                    {user.platformRoleAssignments.filter(isEffectiveAssignment).length} platform role(s)
                  </p>
                </button>
              ))}
              {users.length === 0 && (
                <p className="p-4 text-sm text-zinc-500">No matching users exist.</p>
              )}
            </div>
          </section>

          {selected ? (
            <div className="space-y-6">
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-950">{selected.name}</h2>
                    <p className="mt-1 text-sm text-zinc-600">{selected.email}</p>
                    <p className="mt-2 font-mono text-[11px] text-zinc-400">{selected.id}</p>
                  </div>
                  <Status value={selected.status} />
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Local password" value={selected.hasLocalPassword ? 'Configured' : 'Not configured'} />
                  <Metric label="External identities" value={String(selected._count.externalIdentities)} />
                  <Metric label="Sessions recorded" value={String(selected._count.sessions)} />
                  <Metric label="Last login" value={formatDate(selected.lastLoginAt)} />
                </div>
              </section>

              <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-zinc-950">Identity lifecycle</h3>
                  <label className="mt-4 block text-xs font-medium text-zinc-600" htmlFor="identity-reason">
                    Required audit reason
                  </label>
                  <input
                    id="identity-reason"
                    className={`${inputClass} mt-1`}
                    minLength={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className={secondaryButton} disabled={!canMutate || busy !== null} onClick={() => void changeStatus('ACTIVE')} type="button">Activate</button>
                    <button className={secondaryButton} disabled={!canMutate || busy !== null} onClick={() => void changeStatus('SUSPENDED')} type="button">Suspend</button>
                    <button className={dangerButton} disabled={!canMutate || busy !== null} onClick={() => void changeStatus('DEACTIVATED')} type="button">Deactivate</button>
                  </div>
                  <button className={`${secondaryButton} mt-3`} disabled={!canMutate || busy !== null} onClick={() => void issueReset()} type="button">
                    Issue secure password recovery
                  </button>
                  {!canMutate && <p className="mt-3 text-xs text-zinc-500">Auditor authority is read-only.</p>}
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-zinc-950">Global platform authority</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Only a PLATFORM_OWNER can grant or revoke these roles. Tenant roles never grant global access.
                  </p>
                  <div className="mt-4 space-y-2">
                    {roles.map((role) => {
                      const assignment = selected.platformRoleAssignments.find((item) => item.role === role);
                      const enabled = isEffectiveAssignment(assignment);
                      return (
                        <div className="flex items-center justify-between rounded-xl border border-zinc-200 p-3" key={role}>
                          <div>
                            <p className="text-sm font-semibold">{role}</p>
                            <p className="mt-1 text-[11px] text-zinc-500">
                              {assignment ? `${assignment.status} · ${assignment.reason}` : 'Never assigned'}
                            </p>
                          </div>
                          <button className={enabled ? dangerButton : secondaryButton} disabled={!isOwner || busy !== null} onClick={() => void toggleRole(role)} type="button">
                            {enabled ? 'Revoke' : 'Grant'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-zinc-950">External identity bindings</h3>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  These bindings were established by a cryptographically validated OIDC login. Revoking
                  one signs the user out everywhere. Reactivation is allowed only for the same configured
                  issuer; a changed issuer requires a new validated login.
                </p>
                <div className="mt-4 divide-y divide-zinc-100">
                  {selectedIdentities.map((identity) => (
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={identity.id}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-zinc-900">
                            {identity.configuration.tenant.name}
                          </p>
                          <Status value={identity.status} />
                        </div>
                        <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">
                          {identity.issuer}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          Last validated {formatDate(identity.lastLoginAt)}
                          {identity.statusReason ? ` · ${identity.statusReason}` : ''}
                        </p>
                      </div>
                      <button
                        className={identity.status === 'ACTIVE' ? dangerButton : secondaryButton}
                        disabled={
                          !canMutate ||
                          busy !== null ||
                          (identity.status === 'REVOKED' && selected.status !== 'ACTIVE')
                        }
                        onClick={() => void toggleExternalIdentity(identity)}
                        type="button"
                      >
                        {identity.status === 'ACTIVE' ? 'Revoke binding' : 'Reactivate binding'}
                      </button>
                    </div>
                  ))}
                  {selectedIdentities.length === 0 && (
                    <p className="py-4 text-sm text-zinc-500">
                      No external sign-in identity has been linked to this user.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-zinc-950">Tenant memberships</h3>
                <div className="mt-4 divide-y divide-zinc-100">
                  {selected.memberships.map((membership) => (
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={membership.id}>
                      <div>
                        <p className="text-sm font-medium">{membership.tenant.name}</p>
                        <p className="text-xs text-zinc-500">
                          {membership.tenant.slug} · {membership.tenant.status} · {membership.tenant.plan ?? 'No plan'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Status value={membership.status} />
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">{membership.role}</span>
                      </div>
                    </div>
                  ))}
                  {selected.memberships.length === 0 && (
                    <p className="py-4 text-sm text-zinc-500">This identity has no tenant membership.</p>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <section className="rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500">Select a user.</section>
          )}
        </div>
      </div>
    </div>
  );
}

function isEffectiveAssignment(
  assignment: PlatformUser['platformRoleAssignments'][number] | undefined,
) {
  return (
    !!assignment &&
    assignment.status === 'ACTIVE' &&
    (!assignment.expiresAt || new Date(assignment.expiresAt).getTime() > Date.now())
  );
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const value = payload as { detail?: unknown; message?: unknown };
    if (typeof value.detail === 'string') return value.detail;
    if (typeof value.message === 'string') return value.message;
    if (Array.isArray(value.message)) return value.message.join(', ');
  }
  return fallback;
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Never';
}

function Status({ value }: { value: string }) {
  const active = value === 'ACTIVE';
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      {value}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

const inputClass =
  'h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const secondaryButton =
  'rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40';
const dangerButton =
  'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40';
