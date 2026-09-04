'use client';

import type { CredentialReferenceSummary, TenantEnvironment } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

type AuthType = Exclude<CredentialReferenceSummary['authType'], 'NONE'>;

export default function CredentialReferencesPage() {
  const [environments, setEnvironments] = useState<TenantEnvironment[]>([]);
  const [references, setReferences] = useState<CredentialReferenceSummary[]>([]);
  const [authType, setAuthType] = useState<AuthType>('BEARER_TOKEN');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [environmentRows, referenceRows] = await Promise.all([
        requestJson<TenantEnvironment[]>('/api/operational-intelligence/environments'),
        requestJson<CredentialReferenceSummary[]>(
          '/api/operational-intelligence/credential-references',
        ),
      ]);
      setEnvironments(environmentRows.filter((environment) => environment.status === 'ACTIVE'));
      setReferences(referenceRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load credential references.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await requestJson('/api/operational-intelligence/credential-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environmentId: data.get('environmentId'),
          label: data.get('label'),
          provider: data.get('provider'),
          reference: data.get('reference'),
          authType,
          headerName: authType === 'API_KEY_HEADER' ? data.get('headerName') : null,
        }),
      });
      form.reset();
      setAuthType('BEARER_TOKEN');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save credential reference.');
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id: string) {
    setSaving(true);
    setError(null);
    try {
      await requestJson(
        `/api/operational-intelligence/credential-references/${encodeURIComponent(id)}/revoke`,
        { method: 'POST' },
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to revoke credential reference.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 p-8">
      <Link href="/connections" className="text-sm text-gray-400 hover:text-white">
        ← Integration Hub
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-white">Credential references</h1>
        <p className="mt-1 text-sm text-gray-400">
          Register vault pointers only. Secret material is resolved server-side and is never returned.
        </p>
      </div>
      {error && <Alert message={error} />}
      <form
        onSubmit={submit}
        className="grid gap-4 rounded-xl border border-gray-800 bg-gray-900 p-5 md:grid-cols-2"
      >
        <Field name="label" label="Reference label" maxLength={120} />
        <div>
          <Label text="Environment" htmlFor="environmentId" />
          <select id="environmentId" name="environmentId" required defaultValue="" className={control}>
            <option value="" disabled>
              Select environment
            </option>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label text="Secret provider" htmlFor="provider" />
          <select id="provider" name="provider" required defaultValue="" className={control}>
            <option value="" disabled>
              Select provider
            </option>
            <option value="DEPLOYMENT_SECRET">Deployment secret</option>
            <option value="EXTERNAL_VAULT">External vault</option>
          </select>
        </div>
        <Field name="reference" label="Secret reference URI" maxLength={512} />
        <div>
          <Label text="Authentication type" htmlFor="authType" />
          <select
            id="authType"
            value={authType}
            onChange={(event) => setAuthType(event.target.value as AuthType)}
            className={control}
          >
            <option value="BEARER_TOKEN">Bearer token</option>
            <option value="API_KEY_HEADER">API key header</option>
            <option value="HMAC_SHA256">HMAC SHA-256</option>
            <option value="USERNAME_PASSWORD">Username and password JSON</option>
          </select>
        </div>
        {authType === 'API_KEY_HEADER' ? (
          <Field name="headerName" label="API key header name" maxLength={128} />
        ) : (
          <div />
        )}
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={saving || environments.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Register reference'}
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading references…</div>
        ) : references.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            No credential references are registered.
          </div>
        ) : (
          references.map((reference) => (
            <div
              key={reference.id}
              className="grid gap-3 border-b border-gray-800 px-5 py-4 last:border-0 md:grid-cols-5"
            >
              <div className="font-semibold text-white">{reference.label}</div>
              <div className="text-sm text-gray-400">{reference.provider}</div>
              <div className="text-sm text-gray-400">{reference.authType}</div>
              <div className="text-sm text-gray-400">{reference.status.toLowerCase()}</div>
              <div className="text-right">
                {reference.status === 'ACTIVE' ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void revoke(reference.id)}
                    className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                ) : (
                  <span className="text-xs text-gray-600">Unavailable</span>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

const control =
  'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-indigo-500';

function Label({ text, htmlFor }: { text: string; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-300">
      {text}
    </label>
  );
}

function Field({ name, label, maxLength }: { name: string; label: string; maxLength: number }) {
  return (
    <div>
      <Label text={label} htmlFor={name} />
      <input id={name} name={name} required maxLength={maxLength} className={control} />
    </div>
  );
}

function Alert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300"
    >
      {message}
    </div>
  );
}
