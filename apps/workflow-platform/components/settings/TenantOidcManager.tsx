'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

interface OidcConfiguration {
  issuer: string;
  clientId: string;
  scopes: string[];
  enabled: boolean;
  allowJitProvisioning: boolean;
  defaultRole: 'MEMBER' | 'VIEWER';
  hasClientSecret: boolean;
  updatedAt: string;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    detail?: unknown;
    message?: unknown;
  } | null;
  if (typeof payload?.detail === 'string') return payload.detail;
  if (typeof payload?.message === 'string') return payload.message;
  return fallback;
}

export function TenantOidcManager({ canUpdate }: { canUpdate: boolean }) {
  const [configuration, setConfiguration] = useState<OidcConfiguration | null>(null);
  const [issuer, setIssuer] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scopes, setScopes] = useState('openid email profile');
  const [enabled, setEnabled] = useState(false);
  const [allowJit, setAllowJit] = useState(false);
  const [defaultRole, setDefaultRole] = useState<'MEMBER' | 'VIEWER'>('MEMBER');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/control/auth/oidc/config', { cache: 'no-store' });
      if (!response.ok)
        throw new Error(await errorMessage(response, 'OIDC configuration failed to load.'));
      const value = (await response.json()) as OidcConfiguration | null;
      setConfiguration(value);
      setIssuer(value?.issuer ?? '');
      setClientId(value?.clientId ?? '');
      setScopes(value?.scopes.join(' ') ?? 'openid email profile');
      setEnabled(value?.enabled ?? false);
      setAllowJit(value?.allowJitProvisioning ?? false);
      setDefaultRole(value?.defaultRole ?? 'MEMBER');
      setClientSecret('');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'OIDC configuration failed to load.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/control/auth/oidc/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issuer,
          clientId,
          ...(clientSecret ? { clientSecret } : {}),
          scopes: scopes.split(/\s+/).filter(Boolean),
          enabled,
          allowJitProvisioning: allowJit,
          defaultRole,
          expectedUpdatedAt: configuration?.updatedAt ?? null,
          reason,
        }),
      });
      if (!response.ok)
        throw new Error(await errorMessage(response, 'OIDC configuration was rejected.'));
      const saved = (await response.json()) as OidcConfiguration & { sessionsRevoked?: boolean };
      setNotice(
        saved.sessionsRevoked
          ? 'OIDC trust settings were saved. Existing workspace sessions were revoked; sign in again.'
          : 'OIDC settings were saved and audited.',
      );
      setReason('');
      setClientSecret('');
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'OIDC configuration was rejected.',
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/control/auth/oidc/config?reason=${encodeURIComponent(reason)}`,
        { method: 'DELETE' },
      );
      if (!response.ok)
        throw new Error(await errorMessage(response, 'OIDC configuration was not removed.'));
      setConfiguration(null);
      setIssuer('');
      setClientId('');
      setClientSecret('');
      setScopes('openid email profile');
      setEnabled(false);
      setAllowJit(false);
      setDefaultRole('MEMBER');
      setReason('');
      setNotice('OIDC was removed and existing workspace sessions were revoked.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'OIDC configuration was not removed.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization OIDC</CardTitle>
        <CardDescription>
          Configure Authorization Code login with PKCE. Enabling performs live provider discovery.
          Client secrets and PKCE verifiers are encrypted and never returned by this page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {loading ? <p className="text-sm text-zinc-500">Loading OIDC configuration…</p> : null}
        {error ? (
          <p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
        {notice ? (
          <output className="block rounded bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </output>
        ) : null}
        {!loading ? (
          <form className="grid gap-4" onSubmit={save}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs font-medium text-zinc-700">
                Issuer URL
                <input
                  type="url"
                  required
                  disabled={!canUpdate}
                  value={issuer}
                  placeholder="https://identity.company.com"
                  onChange={(event) => setIssuer(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                />
              </label>
              <label className="text-xs font-medium text-zinc-700">
                Client ID
                <input
                  required
                  disabled={!canUpdate}
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                />
              </label>
              <label className="text-xs font-medium text-zinc-700">
                Client secret{' '}
                {configuration?.hasClientSecret ? '(leave blank to keep current)' : ''}
                <input
                  type="password"
                  required={!configuration?.hasClientSecret}
                  disabled={!canUpdate}
                  autoComplete="new-password"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                />
              </label>
              <label className="text-xs font-medium text-zinc-700">
                Scopes
                <input
                  required
                  disabled={!canUpdate}
                  value={scopes}
                  onChange={(event) => setScopes(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3 font-mono"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={!canUpdate}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
                Enable SSO
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowJit}
                  disabled={!canUpdate}
                  onChange={(event) => setAllowJit(event.target.checked)}
                />
                Allow JIT users from the exact verified domain
              </label>
              <label className="flex items-center gap-2">
                JIT role
                <select
                  value={defaultRole}
                  disabled={!canUpdate}
                  onChange={(event) => setDefaultRole(event.target.value as 'MEMBER' | 'VIEWER')}
                  className="rounded border border-zinc-200 bg-white px-2 py-1"
                >
                  <option value="MEMBER">MEMBER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </label>
            </div>
            {canUpdate ? (
              <div className="grid gap-3 md:grid-cols-[minmax(16rem,1fr)_auto_auto]">
                <label className="text-xs font-medium text-zinc-700">
                  Change reason
                  <input
                    required
                    minLength={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                  />
                </label>
                <Button
                  className="self-end"
                  type="submit"
                  variant="primary"
                  disabled={reason.trim().length < 3}
                  isLoading={saving}
                >
                  Save OIDC
                </Button>
                {configuration ? (
                  <Button
                    className="self-end"
                    type="button"
                    variant="danger"
                    disabled={reason.trim().length < 3}
                    isLoading={saving}
                    onClick={() => void remove()}
                  >
                    Remove and revoke sessions
                  </Button>
                ) : null}
              </div>
            ) : null}
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
