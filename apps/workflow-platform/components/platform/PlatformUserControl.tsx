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

  const [activeTab, setActiveTab] = useState<'directory' | 'detail'>('directory');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        appliedSearch === '' ||
        u.name.toLowerCase().includes(appliedSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(appliedSearch.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [users, appliedSearch, statusFilter]);

  function handleSelectUser(userId: string) {
    setSelectedId(userId);
    setReset(null);
    setActiveTab('detail');
  }

  return (
    <div className="min-h-full bg-[#f7f8fa] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        {/* Header Bar */}
        <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-6 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                Global Operator Mode · Fleet User Directory (Cross-Tenant)
              </p>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950">
              Platform Users & Global RBAC
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-600">
              Fleet-wide directory of all registered user identities across all tenant organizations. Manage global platform authority (PLATFORM_OWNER, PLATFORM_ADMIN, PLATFORM_AUDITOR), account activation status, and emergency single-use recovery links.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs shadow-sm">
              <span className="font-semibold text-zinc-700">Total Identities: </span>
              <span className="font-bold text-blue-600">{total || users.length}</span>
            </div>
          </div>
        </div>

        {/* Global Module Switcher Tabs */}
        <div className="mt-4 flex gap-2 border-b border-zinc-200 pb-2 text-xs font-semibold">
          <a
            href="/platform-admin"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition"
          >
            🏢 Tenant Workspaces & Licensing
          </a>
          <a
            href="/platform-admin/users"
            className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-blue-700 border border-blue-200"
          >
            👥 Global Users & Platform RBAC
          </a>
          <a
            href="/platform-admin/infra"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition"
          >
            ⚙️ Infrastructure
          </a>
        </div>

        {/* Global Notifications */}
        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <output className="mt-4 block rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {notice}
          </output>
        )}
        {reset && (
          <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
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

        {/* Sub Navigation Tabs */}
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
            <span>👥 User Directory</span>
            <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-[10px] text-zinc-700">
              {filteredUsers.length}
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
            <span>⚙️ User Inspector & Authority</span>
            {selected && (
              <span className="rounded-md bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] text-blue-800">
                {selected.name}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: FULL TABLE DIRECTORY */}
        {activeTab === 'directory' && (
          <div className="mt-6 space-y-4">
            {/* Search and Filters Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
              <form className="flex flex-1 items-center gap-2 min-w-[280px]" onSubmit={applySearch}>
                <span className="text-zinc-400">🔍</span>
                <input
                  type="text"
                  placeholder="Search by full name or email address…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-xs text-zinc-800 outline-none placeholder:text-zinc-400"
                />
                <button type="submit" className={secondaryButton}>
                  Search
                </button>
              </form>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-800 outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PENDING_VERIFICATION">Pending Verification</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DEACTIVATED">Deactivated</option>
                </select>
              </div>
            </div>

            {/* Wide Full-Detail Table */}
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
                <thead className="bg-zinc-50/80 font-semibold text-zinc-600">
                  <tr>
                    <th scope="col" className="px-5 py-3">Identity / Name</th>
                    <th scope="col" className="px-4 py-3">Email Address</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Password</th>
                    <th scope="col" className="px-4 py-3">Global Platform Roles</th>
                    <th scope="col" className="px-4 py-3">Workspaces</th>
                    <th scope="col" className="px-4 py-3">Last Login</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-700">
                  {filteredUsers.map((u) => {
                    const isSelected = selectedId === u.id;
                    const effectivePlatformRoles = u.platformRoleAssignments.filter(isEffectiveAssignment);
                    return (
                      <tr
                        key={u.id}
                        className={`transition hover:bg-zinc-50 cursor-pointer ${
                          isSelected ? 'bg-blue-50/60 font-medium' : ''
                        }`}
                        onClick={() => handleSelectUser(u.id)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white shadow-sm">
                              {u.name ? u.name.slice(0, 1).toUpperCase() : u.email.slice(0, 1).toUpperCase()}
                            </span>
                            <div className="font-semibold text-zinc-900">{u.name || 'Unnamed User'}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-600">
                          {u.email}
                        </td>
                        <td className="px-4 py-3.5">
                          <Status value={u.status} />
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${u.hasLocalPassword ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                            {u.hasLocalPassword ? 'Configured' : 'None'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {effectivePlatformRoles.map((r) => (
                              <span key={r.id} className="rounded-md bg-amber-100 px-1.5 py-0.5 font-bold text-[10px] text-amber-900 border border-amber-200">
                                ★ {r.role}
                              </span>
                            ))}
                            {effectivePlatformRoles.length === 0 && (
                              <span className="text-[11px] text-zinc-400">Standard User</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 border border-violet-200">
                            {u.memberships.length} workspace(s)
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-zinc-500 text-[11px]">
                          {formatDate(u.lastLoginAt)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectUser(u.id);
                            }}
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition"
                          >
                            Inspect & Manage →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-sm text-zinc-400">
                        No platform user identities match your search filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: USER INSPECTOR & AUTHORITY */}
        {activeTab === 'detail' && (
          <div className="mt-6 space-y-6">
            {selected ? (
              <>
                {/* User Overview Card */}
                <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-950 text-xl font-bold text-white shadow-md">
                        {selected.name ? selected.name.slice(0, 1).toUpperCase() : selected.email.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-2xl font-bold text-zinc-950">{selected.name || 'Unnamed Identity'}</h2>
                          <Status value={selected.status} />
                        </div>
                        <p className="mt-1 font-mono text-xs text-zinc-500">
                          {selected.email} · UUID: {selected.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveTab('directory')}
                        className={secondaryButton}
                      >
                        ← Back to User Directory
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label="Local Password Credential" value={selected.hasLocalPassword ? 'Active' : 'Not configured'} />
                    <Metric label="External SSO / OIDC Bindings" value={String(selected._count.externalIdentities)} />
                    <Metric label="Active Session Count" value={String(selected._count.sessions)} />
                    <Metric label="Last Authenticated" value={formatDate(selected.lastLoginAt)} />
                  </div>
                </section>

                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Left Box: Identity Lifecycle & Recovery */}
                  <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
                    <div className="border-b border-zinc-100 pb-3">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
                        1. Account Lifecycle & Recovery
                      </h3>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Suspend or deactivate employee account, or issue single-use recovery credentials.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="identity-reason">
                        Compliance Audit Reason (Required)
                      </label>
                      <input
                        id="identity-reason"
                        className={inputClass}
                        minLength={3}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button className={secondaryButton} disabled={!canMutate || busy !== null} onClick={() => void changeStatus('ACTIVE')} type="button">
                        🔓 Activate
                      </button>
                      <button className={secondaryButton} disabled={!canMutate || busy !== null} onClick={() => void changeStatus('SUSPENDED')} type="button">
                        ⏸️ Suspend
                      </button>
                      <button className={dangerButton} disabled={!canMutate || busy !== null} onClick={() => void changeStatus('DEACTIVATED')} type="button">
                        🛑 Deactivate
                      </button>
                    </div>

                    <div className="pt-2 border-t border-zinc-100">
                      <button className={secondaryButton} disabled={!canMutate || busy !== null} onClick={() => void issueReset()} type="button">
                        🔑 Issue Single-Use Password Recovery Link
                      </button>
                      {!canMutate && <p className="mt-2 text-xs text-zinc-500">Auditor authority is read-only.</p>}
                    </div>
                  </div>

                  {/* Right Box: Global Platform Authority */}
                  <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
                    <div className="border-b border-zinc-100 pb-3">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
                        2. Global Platform Authority
                      </h3>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Super-admin roles for the whole platform. Only PLATFORM_OWNER can grant or revoke.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {roles.map((role) => {
                        const assignment = selected.platformRoleAssignments.find((item) => item.role === role);
                        const enabled = isEffectiveAssignment(assignment);
                        return (
                          <div className="flex items-center justify-between rounded-xl border border-zinc-200 p-3" key={role}>
                            <div>
                              <p className="text-sm font-semibold text-zinc-900">{role}</p>
                              <p className="mt-0.5 text-[11px] text-zinc-500">
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
                </div>

                {/* Tenant Memberships Card */}
                <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="border-b border-zinc-100 pb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
                      3. Tenant Workspace Memberships ({selected.memberships.length})
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Organizations this user identity can access, along with their assigned workspace role and tenant plan.
                    </p>
                  </div>
                  <div className="mt-4 divide-y divide-zinc-100">
                    {selected.memberships.map((membership) => (
                      <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={membership.id}>
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{membership.tenant.name}</p>
                          <p className="text-xs text-zinc-500">
                            Slug: <span className="font-mono">{membership.tenant.slug}</span> · Tenant Status: <span className="font-semibold">{membership.tenant.status}</span> · Plan: <span className="font-semibold">{membership.tenant.plan ?? 'Standard Trial'}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Status value={membership.status} />
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                            {membership.role}
                          </span>
                        </div>
                      </div>
                    ))}
                    {selected.memberships.length === 0 && (
                      <p className="py-6 text-sm text-zinc-400 text-center">This identity has no assigned tenant memberships.</p>
                    )}
                  </div>
                </section>

                {/* External Identity Bindings Card */}
                <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="border-b border-zinc-100 pb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
                      4. External SSO / OIDC Bindings ({selectedIdentities.length})
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Federated identity providers verified cryptographically. Revoking invalidates all active sessions.
                    </p>
                  </div>
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
                      <p className="py-6 text-sm text-zinc-400 text-center">
                        No external SSO or OIDC identities have been federated with this user.
                      </p>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center">
                <p className="text-sm text-zinc-500">Select a user identity from the directory to inspect its authorities.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('directory')}
                  className={`${secondaryButton} mt-4`}
                >
                  View User Directory
                </button>
              </div>
            )}
          </div>
        )}
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
