'use client';

import { FormEngineConfigurationForm, type ConfigurationValues } from '@gigalibs/configuration-react';
import type { ConfigurationDefinition } from '@gigalibs/contracts';
import { Save } from 'lucide-react';
import { Button } from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';

type RuntimeManifest = {
  publishedVersionId: string;
  checksum: string;
  manifest: ConfigurationDefinition;
};

type ExtensionRecord = {
  version: number;
  values: ConfigurationValues;
  manifestChecksum: string;
} | null;

export function ConfiguredTenantFields({ tenantId, canUpdate }: { tenantId: string; canUpdate: boolean }) {
  const [runtime, setRuntime] = useState<RuntimeManifest | null>(null);
  const [record, setRecord] = useState<ExtensionRecord>(null);
  const [values, setValues] = useState<ConfigurationValues>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const query = new URLSearchParams({ moduleKey: 'tenant-settings', entityKey: 'tenant-profile', surfaceKey: 'profile-extension', environmentKey: 'local-uat', cohortKey: 'all-users' });
    const manifestResponse = await fetch(`/api/control/configuration/runtime/manifest?${query}`, { cache: 'no-store' });
    if (manifestResponse.status === 404) return;
    if (!manifestResponse.ok) throw new Error(await responseMessage(manifestResponse));
    const loadedRuntime = await manifestResponse.json() as RuntimeManifest;
    const valuesResponse = await fetch(`/api/control/configuration/extension-values/tenant-profile/${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
    if (!valuesResponse.ok) throw new Error(await responseMessage(valuesResponse));
    const loadedRecord = await valuesResponse.json() as ExtensionRecord;
    setRuntime(loadedRuntime);
    setRecord(loadedRecord);
    setValues(loadedRecord?.values ?? {});
  }, [tenantId]);

  useEffect(() => { void load().catch((error: unknown) => setStatus(error instanceof Error ? error.message : 'Configured fields could not be loaded.')); }, [load]);

  async function save() {
    if (!runtime) return;
    setBusy(true);
    setStatus(null);
    setFieldErrors({});
    try {
      const response = await fetch(`/api/control/configuration/extension-values/tenant-profile/${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishedVersionId: runtime.publishedVersionId, expectedVersion: record?.version ?? 0, values, reason: 'Update configured tenant profile fields', idempotencyKey: crypto.randomUUID() }),
      });
      if (!response.ok) { const failure = await responseFailure(response); setFieldErrors(failure.errors); throw new Error(failure.message); }
      await load();
      setStatus('Configured tenant fields were saved with the active manifest version.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Configured fields could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  if (!runtime) return null;
  return (
    <section className="mt-6 border-t border-ui-border-base pt-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div><h2 className="text-base font-semibold text-ui-fg-base">Configured tenant fields</h2><p className="mt-1 text-xs text-ui-fg-muted">Rendered from active checksum <span className="font-mono">{runtime.checksum.slice(0, 24)}…</span></p></div>
        <Button variant="primary" disabled={!canUpdate || busy} onClick={save}><Save className="h-4 w-4" /> Save configured fields</Button>
      </div>
      {status ? <p role="status" className="mb-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3 text-sm text-ui-fg-subtle">{status}</p> : null}
      <FormEngineConfigurationForm key={`${runtime.checksum}:${record?.version ?? 0}`} definition={runtime.manifest} values={values} errors={fieldErrors} onChange={setValues} disabled={!canUpdate || busy} />
    </section>
  );
}

async function responseFailure(response: Response) {
  const payload = await response.json().catch(() => null) as { message?: string | string[]; detail?: string; errors?: Record<string, string> } | null;
  return { message: Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message ?? payload?.detail ?? `Request failed (${response.status}).`, errors: payload?.errors ?? {} };
}

async function responseMessage(response: Response) {
  const payload = await response.json().catch(() => null) as { message?: string | string[]; detail?: string } | null;
  return Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message ?? payload?.detail ?? `Request failed (${response.status}).`;
}
