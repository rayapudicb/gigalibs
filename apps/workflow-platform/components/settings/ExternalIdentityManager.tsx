'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

interface ExternalIdentityState {
  provider: { issuer: string; enabled: boolean } | null;
  localPasswordConfigured: boolean;
  identities: Array<{
    id: string;
    issuer: string;
    status: 'ACTIVE' | 'REVOKED';
    statusReason: string | null;
    lastLoginAt: string;
    revokedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export function ExternalIdentityManager() {
  const [state, setState] = useState<ExternalIdentityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('Connect my verified company identity');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/control/auth/external-identities', {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(payload, 'Sign-in methods could not be loaded.'));
      setState(payload as ExternalIdentityState);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign-in methods could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('identityLinked') === '1') {
      setSuccess('The external identity was verified and connected to this account.');
    }
    void load();
  }, [load]);

  async function startLink(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/control/auth/oidc/link/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(payload, 'External identity verification could not start.'));
      if (!payload || typeof payload.authorizationUrl !== 'string') {
        throw new Error('The identity provider returned an invalid authorization destination.');
      }
      const target = new URL(payload.authorizationUrl);
      const localDevelopment =
        process.env.NODE_ENV !== 'production' &&
        ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
      if (target.protocol !== 'https:' && !(localDevelopment && target.protocol === 'http:')) {
        throw new Error('The identity provider authorization destination is not trusted.');
      }
      window.location.assign(target.toString());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'External identity verification could not start.',
      );
      setBusy(false);
    }
  }

  async function disconnect(identity: ExternalIdentityState['identities'][number]) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/control/auth/external-identities/${encodeURIComponent(identity.id)}/revoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedUpdatedAt: identity.updatedAt,
            currentPassword,
            reason: reason.trim(),
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(payload, 'External identity could not be disconnected.'));
      setCurrentPassword('');
      setSuccess('External sign-in was disconnected. Other active sessions were revoked.');
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'External identity could not be disconnected.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-ui-fg-muted">Loading persisted sign-in methods…</p>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {success}
        </div>
      )}

      <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest space-y-5">
        <div>
          <h3 className="text-base font-semibold text-ui-fg-base">Company identity provider</h3>
          <p className="mt-1 text-xs text-ui-fg-muted">
            Connect this signed-in account only after the provider proves the same verified email address.
          </p>
        </div>

        {state?.provider ? (
          <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-ui-fg-muted">Issuer</p>
                <p className="mt-1 break-all font-mono text-xs text-ui-fg-base">{state.provider.issuer}</p>
              </div>
              <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${state.provider.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}>
                {state.provider.enabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 text-sm text-ui-fg-muted">
            This workspace has no configured OIDC identity provider.
          </p>
        )}

        <form className="space-y-3 max-w-xl" onSubmit={startLink}>
          <label className="block text-sm font-medium text-ui-fg-base" htmlFor="identity-reason">
            Change reason
          </label>
          <input
            id="identity-reason"
            value={reason}
            minLength={3}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            className="block h-9 w-full rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base"
          />
          <button
            type="submit"
            disabled={busy || !state?.provider?.enabled || reason.trim().length < 3}
            className="h-9 rounded-lg bg-ui-fg-base px-5 text-sm font-medium text-ui-bg-base disabled:opacity-50"
          >
            {busy ? 'Starting verification…' : 'Verify and connect identity'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest space-y-4">
        <div>
          <h3 className="text-base font-semibold text-ui-fg-base">Connected identities</h3>
          <p className="mt-1 text-xs text-ui-fg-muted">
            Disconnecting requires the current local password and revokes other active sessions.
          </p>
        </div>

        <div className="divide-y divide-ui-border-base">
          {state?.identities.map((identity) => (
            <div className="flex flex-wrap items-center justify-between gap-4 py-4" key={identity.id}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ui-fg-base">{identity.issuer}</span>
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${identity.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}>
                    {identity.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ui-fg-muted">
                  Last verified {formatDate(identity.lastLoginAt)}
                  {identity.statusReason ? ` · ${identity.statusReason}` : ''}
                </p>
              </div>
              {identity.status === 'ACTIVE' && (
                <button
                  type="button"
                  disabled={busy || !state.localPasswordConfigured || currentPassword.length === 0 || reason.trim().length < 3}
                  onClick={() => void disconnect(identity)}
                  className="h-9 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  Disconnect
                </button>
              )}
            </div>
          ))}
          {state?.identities.length === 0 && (
            <p className="py-5 text-sm text-ui-fg-muted">No provider identity is connected to this account.</p>
          )}
        </div>

        {state?.identities.some((identity) => identity.status === 'ACTIVE') && (
          <div className="max-w-xl space-y-2">
            <label className="block text-sm font-medium text-ui-fg-base" htmlFor="identity-current-password">
              Current password for disconnect
            </label>
            <input
              id="identity-current-password"
              type="password"
              maxLength={128}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={!state.localPasswordConfigured}
              className="block h-9 w-full rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base disabled:opacity-50"
            />
            {!state.localPasswordConfigured && (
              <p className="text-xs text-amber-700">
                Add a local password through an authorized recovery process before disconnecting your only sign-in method.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function message(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  const value = (payload as { message?: unknown }).message;
  if (typeof detail === 'string') return detail;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  return fallback;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'unavailable' : parsed.toLocaleString();
}
