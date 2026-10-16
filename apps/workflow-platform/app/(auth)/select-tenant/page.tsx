'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { inviteTokenFrom, withInvite } from '@/lib/invitation-link';

interface TenantOption {
  id: string;
  name: string;
  slug: string;
  region: string;
  membershipRole: string;
  status: string;
}

function RoleLabel({ role }: { role: string }) {
  const map: Record<string, { label: string; className: string }> = {
    TENANT_ADMIN: { label: 'Admin', className: 'bg-violet-50 text-violet-700 border-violet-200' },
    TENANT_USER: { label: 'Member', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    VIEWER: { label: 'Viewer', className: 'bg-gray-50 text-gray-600 border-gray-200' },
  };
  const { label, className } = map[role] ?? {
    label: role,
    className: 'bg-gray-50 text-gray-600 border-gray-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="animate-spin"
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

export default function SelectTenantPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  // WI-OI-120az: a signed-out visitor (usually a new invitee) is asked to sign in or sign up, keeping the token.
  const [signedOut, setSignedOut] = useState(false);
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const [inviteAccepted, setInviteAccepted] = useState<string | null>(null);

  // Create workspace state
  const [showCreate, setShowCreate] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadTenants = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/tenants', { cache: 'no-store' });
      if (response.status === 401) {
        setSignedOut(true);
        return;
      }
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.detail || payload.message || 'Unable to load tenant memberships.');
      if (!Array.isArray(payload)) throw new Error('Tenant service returned an invalid response.');
      setTenants(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tenants.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTenants();
    // WI-OI-120n: links carry the token after `#` (never sent to the server); older links used `?invite=`.
    // WI-OI-120az: a link opened while this page is showing changes only the `#` part, so that is read too.
    const read = () => {
      const invitation = inviteTokenFrom(window.location.href);
      if (invitation) {
        setInviteToken(invitation);
        window.history.replaceState({}, '', '/select-tenant');
      }
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [loadTenants]);

  const handleNameChange = (value: string) => {
    setWorkspaceName(value);
    if (!slugManual) setWorkspaceSlug(slugify(value));
  };

  const handleSlugChange = (value: string) => {
    setSlugManual(true);
    setWorkspaceSlug(slugify(value));
  };

  const createWorkspace = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/control/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workspaceName.trim(),
          slug: workspaceSlug.trim(),
          isolationMode: 'ROW_LEVEL_SECURITY',
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.detail || payload.message || 'Could not create workspace.');
      setShowCreate(false);
      setWorkspaceName('');
      setWorkspaceSlug('');
      setSlugManual(false);
      // Reload tenants and auto-select the new one
      await loadTenants();
      if (payload?.id) await selectTenant(payload.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create workspace.');
    } finally {
      setCreating(false);
    }
  };

  const acceptInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAcceptingInvite(true);
    setError(null);
    setInviteAccepted(null);
    try {
      const response = await fetch('/api/control/tenants/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken.trim() }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.detail || payload.message || 'Invitation could not be accepted.');
      if (!payload?.tenant?.name)
        throw new Error('Invitation service returned an invalid response.');
      setInviteAccepted(`You now have access to ${payload.tenant.name}.`);
      setInviteToken('');
      await loadTenants();
      // WI-OI-120n: the person accepted to work in this workspace, so they go straight in (as after creating one).
      if (payload.tenant.id) await selectTenant(payload.tenant.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation could not be accepted.');
    } finally {
      setAcceptingInvite(false);
    }
  };

  const selectTenant = async (tenantId: string) => {
    setSelectingId(tenantId);
    setError(null);
    try {
      const response = await fetch('/api/auth/select-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Unable to select workspace.');
      if (payload.requiresMfa) {
        router.push('/mfa');
        router.refresh();
        return;
      }
      router.push('/modules');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to select workspace.');
      setSelectingId(null);
    }
  };

  const slugValid = /^[a-z0-9][a-z0-9-]{1,47}$/.test(workspaceSlug);

  return (
    <div className="w-full max-w-[440px] mx-auto">
      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-10 h-10 rounded-xl bg-ui-fg-base flex items-center justify-center mb-4 shadow-md">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-ui-fg-base tracking-tight">
          {showCreate ? 'Create a workspace' : 'Select workspace'}
        </h1>
        <p className="text-sm text-ui-fg-subtle mt-1">
          {showCreate
            ? 'Set up your organization to get started'
            : 'Choose the organization you want to access'}
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div
          className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2.5"
          role="alert"
        >
          <svg
            aria-hidden="true"
            className="mt-0.5 flex-shrink-0"
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {inviteAccepted && (
        <output className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center gap-2.5">
          <svg
            aria-hidden="true"
            className="flex-shrink-0"
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {inviteAccepted}
        </output>
      )}

      {signedOut && (
        <div className="mb-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3 text-sm text-ui-fg-base">
          <p>
            {inviteToken
              ? 'You have been invited to a workspace. Sign in, or create an account, to accept the invitation.'
              : 'Sign in to choose a workspace.'}
          </p>
          {/* Full page loads, so the next page reads the token from its own address (after `#`). */}
          <div className="mt-2 flex gap-4">
            <a href={withInvite('/login', inviteToken)} className="font-medium underline underline-offset-2">
              Sign in
            </a>
            <a href={withInvite('/register', inviteToken)} className="font-medium underline underline-offset-2">
              Create an account
            </a>
          </div>
        </div>
      )}

      {/* Main card */}
      {!signedOut && (
      <div className="bg-ui-bg-base border border-ui-border-base rounded-xl shadow-elevation-card-rest overflow-hidden">
        {/* ── CREATE WORKSPACE FORM ── */}
        {showCreate ? (
          <form onSubmit={createWorkspace} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="ws-name">
                Workspace name
              </label>
              <input
                id="ws-name"
                required
                maxLength={80}
                placeholder="Acme Corp"
                value={workspaceName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="ws-slug">
                URL slug
              </label>
              <div className="flex h-9 rounded-lg border border-ui-border-base bg-ui-bg-field overflow-hidden focus-within:ring-2 focus-within:ring-ui-border-interactive focus-within:border-transparent transition">
                <span className="flex items-center pl-3 pr-1 text-sm text-ui-fg-muted select-none border-r border-ui-border-base bg-ui-bg-subtle">
                  app/
                </span>
                <input
                  id="ws-slug"
                  required
                  maxLength={48}
                  placeholder="acme-corp"
                  pattern="[a-z0-9][a-z0-9\-]{1,47}"
                  value={workspaceSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="flex-1 px-3 text-sm text-ui-fg-base bg-transparent font-mono focus:outline-none"
                />
                {workspaceSlug && (
                  <span className="flex items-center pr-3 text-xs">
                    {slugValid ? (
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="#16a34a"
                        strokeWidth="2"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="#dc2626"
                        strokeWidth="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
              <p className="text-xs text-ui-fg-muted">
                Lowercase letters, numbers, and hyphens only.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setError(null);
                }}
                className="flex-1 h-9 rounded-lg border border-ui-border-base text-sm font-medium text-ui-fg-base hover:bg-ui-bg-base-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !slugValid || !workspaceName.trim()}
                className="flex-1 h-9 rounded-lg bg-ui-fg-base text-ui-bg-base text-sm font-medium hover:bg-ui-fg-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <Spinner size={14} /> Creating…
                  </>
                ) : (
                  'Create workspace'
                )}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* ── WORKSPACE LIST ── */}
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-ui-fg-muted">
                  <Spinner /> Loading workspaces…
                </div>
              ) : tenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-ui-bg-subtle border border-ui-border-base flex items-center justify-center mb-3">
                    <svg
                      aria-hidden="true"
                      width="20"
                      height="20"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-ui-fg-muted"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-ui-fg-base">No workspaces yet</p>
                  <p className="text-xs text-ui-fg-muted mt-1 max-w-[260px]">
                    Create your first workspace or accept an invitation from an administrator.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="mt-4 h-8 px-4 rounded-lg bg-ui-fg-base text-ui-bg-base text-xs font-medium hover:bg-ui-fg-subtle transition-colors"
                  >
                    Create workspace
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {tenants.map((tenant) => (
                    <button
                      key={tenant.id}
                      type="button"
                      disabled={selectingId !== null}
                      onClick={() => void selectTenant(tenant.id)}
                      className="group w-full flex items-center gap-3 rounded-lg border border-ui-border-base bg-ui-bg-base px-4 py-3 text-left hover:bg-ui-bg-base-hover hover:border-ui-border-interactive disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                    >
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-ui-bg-subtle border border-ui-border-base flex items-center justify-center text-sm font-semibold text-ui-fg-base uppercase">
                        {tenant.name.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ui-fg-base truncate">
                            {tenant.name}
                          </span>
                          <RoleLabel role={tenant.membershipRole} />
                          {tenant.status === 'PROVISIONING' ? (
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                              Finish setup
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ui-fg-muted font-mono">
                          <span>{tenant.slug}</span>
                          <span>·</span>
                          <span>{tenant.region}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-ui-fg-muted group-hover:text-ui-fg-base transition-colors">
                        {selectingId === tenant.id ? (
                          <Spinner size={15} />
                        ) : (
                          <svg
                            aria-hidden="true"
                            width="15"
                            height="15"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  ))}

                  {/* Add workspace button when tenants exist */}
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="w-full flex items-center gap-3 rounded-lg border border-dashed border-ui-border-base px-4 py-3 text-left hover:bg-ui-bg-subtle hover:border-ui-border-strong transition-all group"
                  >
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-ui-bg-subtle border border-dashed border-ui-border-base flex items-center justify-center group-hover:border-ui-border-strong transition-colors">
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-ui-fg-muted"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <span className="text-sm text-ui-fg-muted group-hover:text-ui-fg-base transition-colors">
                      Create new workspace
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-ui-border-base" />

            {/* Invitation section */}
            <form onSubmit={acceptInvite} className="p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-ui-fg-base">Accept an invitation</p>
                <p className="text-xs text-ui-fg-muted mt-0.5">
                  Paste the one-time token sent by your workspace administrator.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  aria-label="Invitation token"
                  autoComplete="off"
                  className="flex-1 min-w-0 h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 font-mono text-xs text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
                  minLength={32}
                  placeholder="Paste invitation token…"
                  required
                  type="password"
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={acceptingInvite || inviteToken.trim().length < 32}
                  className="h-9 px-4 rounded-lg bg-ui-fg-base text-ui-bg-base text-xs font-medium hover:bg-ui-fg-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center gap-1.5"
                >
                  {acceptingInvite ? (
                    <>
                      <Spinner size={12} /> Accepting…
                    </>
                  ) : (
                    'Accept'
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
      )}

      {/* Sign out */}
      {!signedOut && (
      <p className="text-center text-xs text-ui-fg-muted mt-6">
        Wrong account?{' '}
        <a
          href="/api/auth/logout"
          className="underline underline-offset-2 hover:text-ui-fg-base transition-colors"
        >
          Sign out
        </a>
      </p>
      )}
    </div>
  );
}
