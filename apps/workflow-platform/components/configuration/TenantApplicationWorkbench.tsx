'use client';

import { FormEngineConfigurationForm, type ConfigurationValues } from '@gigalibs/configuration-react';
import type { ConfigurationDefinition } from '@gigalibs/contracts';
import { Edit3, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';

type RuntimeApp = { entityKey: string; surfaceKey: string; publishedVersionId: string; checksum: string; sequence: number; manifest: ConfigurationDefinition };
type RuntimeRecord = { id: string; values: ConfigurationValues; version: number; manifestChecksum: string; updatedAt: string };

export function TenantApplicationWorkbench({ appKey, canWrite }: { appKey: string; canWrite: boolean }) {
  const [app, setApp] = useState<RuntimeApp | null>(null);
  const [records, setRecords] = useState<RuntimeRecord[]>([]);
  const [editing, setEditing] = useState<RuntimeRecord | null>(null);
  const [values, setValues] = useState<ConfigurationValues>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formEpoch, setFormEpoch] = useState(0);

  const load = useCallback(async () => {
    const appsResponse = await fetch('/api/control/configuration/apps', { cache: 'no-store' });
    if (!appsResponse.ok) throw new Error(await responseMessage(appsResponse));
    const apps = await appsResponse.json() as RuntimeApp[];
    const activeApp = apps.find((item) => item.entityKey === appKey);
    if (!activeApp) throw new Error('This tenant application is not active.');
    const recordsResponse = await fetch(`/api/control/configuration/apps/${encodeURIComponent(appKey)}/records`, { cache: 'no-store' });
    if (!recordsResponse.ok) throw new Error(await responseMessage(recordsResponse));
    setApp(activeApp);
    setRecords(await recordsResponse.json() as RuntimeRecord[]);
  }, [appKey]);

  useEffect(() => { void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Application could not be loaded.')); }, [load]);

  async function save() {
    if (!app) return;
    setBusy(true); setMessage(null); setFieldErrors({});
    try {
      const url = editing ? `/api/control/configuration/apps/${encodeURIComponent(appKey)}/records/${encodeURIComponent(editing.id)}` : `/api/control/configuration/apps/${encodeURIComponent(appKey)}/records`;
      const body = { publishedVersionId: app.publishedVersionId, ...(editing ? { expectedVersion: editing.version } : {}), values, reason: editing ? 'Update tenant application record' : 'Create tenant application record', idempotencyKey: crypto.randomUUID() };
      const response = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) { const failure = await responseFailure(response); setFieldErrors(failure.errors); throw new Error(failure.message); }
      setEditing(null); setValues({}); setFormEpoch((current) => current + 1); await load(); setMessage(editing ? 'Record updated.' : 'Record created.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Record could not be saved.'); } finally { setBusy(false); }
  }

  async function remove(record: RuntimeRecord) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/control/configuration/apps/${encodeURIComponent(appKey)}/records/${encodeURIComponent(record.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: record.version, reason: 'Delete tenant application record', idempotencyKey: crypto.randomUUID() }) });
      if (!response.ok) throw new Error(await responseMessage(response));
      if (editing?.id === record.id) { setEditing(null); setValues({}); }
      await load(); setMessage('Record deleted and retained in the audit trail.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Record could not be deleted.'); } finally { setBusy(false); }
  }

  if (!app) return <main className="p-8"><p role="status" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-5 text-sm text-ui-fg-subtle">{message ?? 'Loading tenant application…'}</p></main>;
  return <main className="min-h-full bg-ui-bg-subtle p-6 lg:p-8"><header className="mb-6 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-ui-fg-muted">Tenant application · version {app.sequence}</p><h1 className="mt-1 text-2xl font-semibold">{app.manifest.title}</h1><p className="mt-2 font-mono text-xs text-ui-fg-muted">{app.checksum}</p></div><Button variant="secondary" onClick={() => { setEditing(null); setValues({}); setFieldErrors({}); setFormEpoch((current) => current + 1); }} disabled={!canWrite || busy}><Plus className="h-4 w-4" /> New record</Button></header>{message ? <p role="status" className="mb-5 rounded-lg border border-ui-border-base bg-ui-bg-base p-3 text-sm">{message}</p> : null}<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]"><section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">{editing ? 'Edit record' : 'Create record'}</h2>{editing ? <Button variant="secondary" onClick={() => { setEditing(null); setValues({}); setFieldErrors({}); setFormEpoch((current) => current + 1); }}><X className="h-4 w-4" /> Cancel</Button> : null}</div><FormEngineConfigurationForm key={`${app.checksum}:${editing?.id ?? 'new'}:${editing?.version ?? 0}:${formEpoch}`} definition={app.manifest} values={values} errors={fieldErrors} onChange={setValues} disabled={!canWrite || busy} /><div className="mt-5 flex justify-end"><Button variant="primary" onClick={save} disabled={!canWrite || busy}><Save className="h-4 w-4" /> {editing ? 'Update record' : 'Create record'}</Button></div></section><section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-xs"><h2 className="px-2 text-sm font-semibold">Saved records</h2><div className="mt-3 space-y-2">{records.map((record) => <article key={record.id} className="rounded-lg border border-ui-border-base p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-mono text-xs text-ui-fg-muted">{record.id}</p><p className="mt-1 text-xs text-ui-fg-subtle">v{record.version} · {new Date(record.updatedAt).toLocaleString()}</p></div><div className="flex gap-1"><button aria-label="Edit record" className="rounded p-2 hover:bg-ui-bg-subtle" onClick={() => { setEditing(record); setValues(record.values); setFieldErrors({}); setFormEpoch((current) => current + 1); }} disabled={!canWrite || busy}><Edit3 className="h-4 w-4" /></button><button aria-label="Delete record" className="rounded p-2 text-ui-fg-error hover:bg-ui-bg-subtle" onClick={() => void remove(record)} disabled={!canWrite || busy}><Trash2 className="h-4 w-4" /></button></div></div><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">{Object.entries(record.values).slice(0, 6).map(([key, value]) => <div key={key} className="contents"><dt className="truncate text-ui-fg-muted">{key}</dt><dd className="truncate text-right text-ui-fg-base">{Array.isArray(value) ? value.join(', ') : String(value ?? '')}</dd></div>)}</dl></article>)}{records.length === 0 ? <p className="p-8 text-center text-sm text-ui-fg-muted">No records have been created.</p> : null}</div></section></div></main>;
}

async function responseMessage(response: Response) { const payload = await response.json().catch(() => null) as { message?: string | string[]; detail?: string } | null; return Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message ?? payload?.detail ?? `Request failed (${response.status}).`; }
async function responseFailure(response: Response) { const payload = await response.json().catch(() => null) as { message?: string | string[]; detail?: string; errors?: Record<string, string> } | null; return { message: Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message ?? payload?.detail ?? `Request failed (${response.status}).`, errors: payload?.errors ?? {} }; }
