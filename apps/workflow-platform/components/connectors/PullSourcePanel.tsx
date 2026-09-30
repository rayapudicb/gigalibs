'use client';

/**
 * WI-OI-104d: set up how Connector Hub pulls one connection's source (where the records are, how pages turn, how to
 * log in), store its login secrets (write-only), pull now, and see recent pulls and quarantined records. Connector
 * Hub validates everything and decides who may do what (connections:read, :write, :sync).
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Input, Label, Text } from '@medusajs/ui';
import { requestJson } from '@/lib/client-api';
import {
  type LoginKind,
  type PagingStyle,
  type PullSourceForm,
  credentialFields,
  formFromSource,
  sourceFromForm,
} from '@/lib/connectors/pull-source-form';

const HUB = '/api/connectors-hub/connections';
const selectClass =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive';

interface SyncJob {
  id: string;
  job_type: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  records_ingested: number;
  duplicates_skipped: number;
  records_quarantined: number;
  pages_fetched: number;
  truncated: boolean;
  error_details: { message?: string } | null;
  started_at: string;
}

interface QuarantinedRecord {
  id: string;
  source_id: string | null;
  reason: string;
  raw_payload: unknown;
  received_at: string;
}

const JOB_COLOR: Record<SyncJob['status'], 'green' | 'red' | 'orange'> = { COMPLETED: 'green', FAILED: 'red', RUNNING: 'orange' };

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} size="xsmall">{label}</Label>
      {children}
      {hint ? <Text size="xsmall" className="text-ui-fg-subtle">{hint}</Text> : null}
    </div>
  );
}

export function PullSourcePanel({ connectionId, source, deliverToAnalytics = false }: { connectionId: string; source: unknown; deliverToAnalytics?: boolean }) {
  const configured = Boolean(source);
  const [form, setForm] = useState<PullSourceForm>(() => formFromSource(source));
  const [editing, setEditing] = useState(!configured);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [jobs, setJobs] = useState<SyncJob[] | null>(null);
  const [quarantine, setQuarantine] = useState<QuarantinedRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedLogin, setSavedLogin] = useState<LoginKind>(formFromSource(source).loginKind);
  const [toAnalytics, setToAnalytics] = useState(deliverToAnalytics);
  const id = (name: string) => `${name}-${connectionId}`;
  const set = <K extends keyof PullSourceForm>(key: K) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value as PullSourceForm[K] }));

  const refresh = useCallback(() => {
    const path = `${HUB}/${encodeURIComponent(connectionId)}`;
    requestJson<{ jobs: SyncJob[] }>(`${path}/sync-jobs`)
      .then((result) => setJobs(result.jobs))
      .catch(() => setJobs([]));
    requestJson<{ records: QuarantinedRecord[] }>(`${path}/quarantine`)
      .then((result) => setQuarantine(result.records))
      .catch(() => setQuarantine([]));
  }, [connectionId]);

  useEffect(refresh, [refresh]);

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      refresh();
    } catch (cause) {
      setError((cause as Error).message);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const post = <T,>(path: string, body: unknown) =>
    requestJson<T>(`${HUB}/${encodeURIComponent(connectionId)}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const saveSource = () =>
    run('source', async () => {
      await post('source', sourceFromForm(form));
      setEditing(false);
      setSavedLogin(form.loginKind);
      return 'Pull source saved.';
    });

  const saveSecrets = () =>
    run('secrets', async () => {
      await post('credentials', { kind: savedLogin, ...secrets });
      setSecrets({});
      return 'Login secrets stored. They are encrypted and cannot be shown again.';
    });

  const pullNow = () =>
    run('pull', async () => {
      const result = await post<{ records_synced: number; duplicates_skipped: number; records_quarantined: number; pages: number; truncated: boolean }>('sync', {});
      return `Pulled ${result.pages} page(s): ${result.records_synced} new, ${result.duplicates_skipped} unchanged, ${result.records_quarantined} quarantined.${
        result.truncated ? ' The page limit was reached; the next pull continues.' : ''
      }`;
    });

  // WI-OI-104e: newly pulled records also go to Analytics, where they appear as a Connector Hub source to map.
  // The switch moves at once and moves back if Connector Hub refuses (found by the WI-OI-104e browser proof).
  const setDelivery = (analytics: boolean) =>
    run('delivery', async () => {
      setToAnalytics(analytics);
      try {
        await post('delivery', { analytics });
      } catch (error) {
        setToAnalytics(!analytics);
        throw error;
      }
      return analytics
        ? 'New records will also go to Analytics, where this connection appears as a source to map into a dataset.'
        : 'New records stay in Connector Hub.';
    });

  const secretFields = credentialFields(savedLogin);
  const summary = sourceFromForm(form);

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id={id('base')} label="Base URL" hint="The API's address, without query. Its host must be on the workspace's outbound allowlist.">
              <Input id={id('base')} size="small" value={form.baseUrl} placeholder="https://farm.example.com" onChange={set('baseUrl')} />
            </Field>
            <Field id={id('path')} label="Resource path">
              <Input id={id('path')} size="small" value={form.resourcePath} placeholder="/api/log/harvest" onChange={set('resourcePath')} />
            </Field>
            <Field id={id('records')} label="Records are at" hint="Dot path to the list in each response; empty when the response is the list.">
              <Input id={id('records')} size="small" value={form.recordsPath} placeholder="data" onChange={set('recordsPath')} />
            </Field>
            <Field id={id('idfield')} label="Id field">
              <Input id={id('idfield')} size="small" value={form.idField} onChange={set('idField')} />
            </Field>
            <Field id={id('wm-field')} label="Changed-at field (optional)" hint="Lets each pull ask only for records changed since the last one.">
              <Input id={id('wm-field')} size="small" value={form.watermarkField} placeholder="updated_at" onChange={set('watermarkField')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id={id('wm-param')} label="Sent as parameter">
                <Input id={id('wm-param')} size="small" value={form.watermarkParam} placeholder="updated_since" onChange={set('watermarkParam')} />
              </Field>
              <Field id={id('wm-format')} label="Time format">
                <select id={id('wm-format')} className={selectClass} value={form.watermarkFormat} onChange={set('watermarkFormat')}>
                  <option value="iso">ISO 8601</option>
                  <option value="epoch-seconds">Unix seconds</option>
                  <option value="epoch-millis">Unix milliseconds</option>
                </select>
              </Field>
            </div>
            <Field id={id('query')} label="Fixed query parameters (optional)" hint="One key=value per line.">
              <textarea id={id('query')} className={`${selectClass} min-h-16 font-mono`} value={form.query} onChange={set('query')} />
            </Field>
            <Field id={id('maxpages')} label="Most pages per pull">
              <Input id={id('maxpages')} size="small" value={form.maxPages} onChange={set('maxPages')} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field id={id('paging')} label="Paging">
              <select id={id('paging')} className={selectClass} value={form.pagingStyle} onChange={(event) => setForm({ ...form, pagingStyle: event.target.value as PagingStyle })}>
                <option value="none">One response</option>
                <option value="page">Page number</option>
                <option value="offset">Offset and limit</option>
                <option value="cursor">Cursor</option>
                <option value="next-link">Next link (JSON:API)</option>
              </select>
            </Field>
            {form.pagingStyle === 'page' ? (
              <>
                <Field id={id('pageparam')} label="Page and size parameters">
                  <div className="flex gap-2">
                    <Input id={id('pageparam')} size="small" value={form.pageParam} onChange={set('pageParam')} />
                    <Input aria-label="Size parameter" size="small" value={form.sizeParam} onChange={set('sizeParam')} />
                  </div>
                </Field>
                <Field id={id('size')} label="Page size, first page">
                  <div className="flex gap-2">
                    <Input id={id('size')} size="small" value={form.size} onChange={set('size')} />
                    <select aria-label="First page" className={selectClass} value={form.firstPage} onChange={set('firstPage')}>
                      <option value="1">1</option>
                      <option value="0">0</option>
                    </select>
                  </div>
                </Field>
              </>
            ) : null}
            {form.pagingStyle === 'offset' ? (
              <>
                <Field id={id('offsetparam')} label="Offset and limit parameters">
                  <div className="flex gap-2">
                    <Input id={id('offsetparam')} size="small" value={form.offsetParam} onChange={set('offsetParam')} />
                    <Input aria-label="Limit parameter" size="small" value={form.limitParam} onChange={set('limitParam')} />
                  </div>
                </Field>
                <Field id={id('size')} label="Page size">
                  <Input id={id('size')} size="small" value={form.size} onChange={set('size')} />
                </Field>
              </>
            ) : null}
            {form.pagingStyle === 'cursor' ? (
              <>
                <Field id={id('cursorparam')} label="Cursor parameter">
                  <Input id={id('cursorparam')} size="small" value={form.cursorParam} onChange={set('cursorParam')} />
                </Field>
                <Field id={id('nextcursor')} label="Next cursor is at">
                  <Input id={id('nextcursor')} size="small" value={form.nextCursorPath} placeholder="meta.next_cursor" onChange={set('nextCursorPath')} />
                </Field>
              </>
            ) : null}
            {form.pagingStyle === 'next-link' ? (
              <Field id={id('nextlink')} label="Next link is at">
                <Input id={id('nextlink')} size="small" value={form.nextLinkPath} onChange={set('nextLinkPath')} />
              </Field>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field id={id('login')} label="Login">
              <select id={id('login')} className={selectClass} value={form.loginKind} onChange={(event) => setForm({ ...form, loginKind: event.target.value as LoginKind })}>
                <option value="none">None</option>
                <option value="api-key">API key</option>
                <option value="bearer">Bearer token</option>
                <option value="oauth2-client-credentials">OAuth2 client credentials</option>
              </select>
            </Field>
            {form.loginKind === 'api-key' ? (
              <Field id={id('keyname')} label="Sent as">
                <div className="flex gap-2">
                  <select aria-label="Key location" className={selectClass} value={form.apiKeyIn} onChange={set('apiKeyIn')}>
                    <option value="header">Header</option>
                    <option value="query">Query parameter</option>
                  </select>
                  <Input id={id('keyname')} size="small" value={form.apiKeyName} onChange={set('apiKeyName')} />
                </div>
              </Field>
            ) : null}
            {form.loginKind === 'oauth2-client-credentials' ? (
              <>
                <Field id={id('tokenurl')} label="Token URL">
                  <Input id={id('tokenurl')} size="small" value={form.tokenUrl} placeholder="https://farm.example.com/oauth/token" onChange={set('tokenUrl')} />
                </Field>
                <Field id={id('scope')} label="Scope, client login">
                  <div className="flex gap-2">
                    <Input id={id('scope')} size="small" value={form.scope} placeholder="optional" onChange={set('scope')} />
                    <select aria-label="Client login" className={selectClass} value={form.clientAuth} onChange={set('clientAuth')}>
                      <option value="basic">Basic header</option>
                      <option value="body">In the form</option>
                    </select>
                  </div>
                </Field>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="small" isLoading={busy === 'source'} disabled={busy !== null || !form.baseUrl.trim()} onClick={() => void saveSource()}>
              Save pull source
            </Button>
            {configured ? (
              <Button type="button" size="small" variant="transparent" disabled={busy !== null} onClick={() => setEditing(false)}>Cancel</Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text size="small" weight="plus" className="break-all">{`${String(summary.baseUrl)}${summary.resourcePath === '/' ? '' : String(summary.resourcePath)}`}</Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {`Paging: ${form.pagingStyle} · Login: ${form.loginKind}${form.watermarkField ? ` · Changes since "${form.watermarkField}"` : ' · Full read each time'}`}
            </Text>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="small" variant="secondary" onClick={() => setEditing(true)}>Edit source</Button>
            <Button type="button" size="small" isLoading={busy === 'pull'} disabled={busy !== null} onClick={() => void pullNow()}>Pull now</Button>
          </div>
        </div>
      )}

      {!editing ? (
        <label className="flex items-start gap-2 text-sm text-ui-fg-base">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={toAnalytics}
            disabled={busy !== null}
            onChange={(event) => void setDelivery(event.target.checked)}
          />
          <span>
            Send pulled records to Analytics
            <Text as="span" size="xsmall" className="block text-ui-fg-subtle">
              Records pulled from now on are delivered to Analytics, where you map them into a dataset.
            </Text>
          </span>
        </label>
      ) : null}

      {!editing && secretFields.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-ui-border-base p-3">
          <Text size="small" weight="plus">Login secrets</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">Stored encrypted and never shown again. Entering new ones replaces the old.</Text>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {secretFields.map((field) => (
              <Field key={field.key} id={id(field.key)} label={field.label}>
                <Input
                  id={id(field.key)}
                  size="small"
                  type={field.key === 'clientId' ? 'text' : 'password'}
                  autoComplete="off"
                  value={secrets[field.key] ?? ''}
                  onChange={(event) => setSecrets({ ...secrets, [field.key]: event.target.value })}
                />
              </Field>
            ))}
            <Button
              type="button"
              size="small"
              variant="secondary"
              isLoading={busy === 'secrets'}
              disabled={busy !== null || secretFields.some((field) => !secrets[field.key]?.trim())}
              onClick={() => void saveSecrets()}
            >
              Store secrets
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Text size="small" weight="plus">Recent pulls</Text>
        {jobs === null ? (
          <Text size="xsmall" className="text-ui-fg-subtle">Loading…</Text>
        ) : jobs.length === 0 ? (
          <Text size="xsmall" className="text-ui-fg-subtle">No pulls yet.</Text>
        ) : (
          <ul className="flex flex-col gap-1">
            {jobs.slice(0, 8).map((job) => (
              <li key={job.id} className="flex flex-wrap items-center gap-2">
                <Badge size="2xsmall" color={JOB_COLOR[job.status] ?? 'grey'}>{job.status.toLowerCase()}</Badge>
                <Text size="xsmall" className="tabular-nums text-ui-fg-subtle">{new Date(job.started_at).toLocaleString()}</Text>
                <Text size="xsmall" className="text-ui-fg-subtle">{job.job_type === 'SCHEDULED' ? 'scheduled' : 'manual'}</Text>
                <Text size="xsmall" className="tabular-nums">
                  {`${job.records_ingested} new · ${job.duplicates_skipped} unchanged · ${job.records_quarantined} quarantined · ${job.pages_fetched} page(s)${job.truncated ? ' · page limit reached' : ''}`}
                </Text>
                {job.error_details?.message ? <Text size="xsmall" className="text-ui-fg-error">{job.error_details.message}</Text> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {quarantine.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Text size="small" weight="plus">{`Quarantined records (${quarantine.length}${quarantine.length === 100 ? '+' : ''})`}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">Records a pull could not use. They are kept here with the reason and never reach the data.</Text>
          <ul className="flex flex-col gap-1">
            {quarantine.slice(0, 20).map((record) => (
              <li key={record.id}>
                <details>
                  <summary className="cursor-pointer text-xs text-ui-fg-base">
                    {`${record.reason}${record.source_id ? ` (id ${record.source_id})` : ''} · ${new Date(record.received_at).toLocaleString()}`}
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-ui-bg-subtle p-2 text-xs text-ui-fg-subtle">
                    {record.raw_payload === null ? 'Not kept (too large or not JSON).' : JSON.stringify(record.raw_payload, null, 2).slice(0, 4000)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
