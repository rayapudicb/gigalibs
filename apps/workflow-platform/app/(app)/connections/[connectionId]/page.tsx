'use client';

import type { SourceConnection, SourceFileImport } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

interface TestResult {
  traceId: string;
  status: SourceConnection['status'];
  checks: Record<string, string | boolean | number | string[]>;
  latencyMs: number;
  bytesReceived: number;
  testedAt: string;
}

export default function ConnectionDetailPage() {
  const params = useParams<{ connectionId: string }>();
  const connectionId = params.connectionId;
  const [connection, setConnection] = useState<SourceConnection | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFileImport[]>([]);
  const [working, setWorking] = useState<'test' | 'profile' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const loaded = await requestJson<SourceConnection>(
        `/api/operational-intelligence/connections/${encodeURIComponent(connectionId)}`,
      );
      setConnection(loaded);
      setSourceFiles(
        loaded.interfaceType === 'FILE_UPLOAD'
          ? await requestJson<SourceFileImport[]>(
              `/api/operational-intelligence/connections/${encodeURIComponent(connectionId)}/files`,
            )
          : [],
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the connection.');
    }
  }, [connectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(operation: 'test' | 'profile') {
    setWorking(operation);
    setError(null);
    try {
      if (operation === 'test') {
        setTestResult(
          await requestJson<TestResult>(
            `/api/operational-intelligence/connections/${encodeURIComponent(connectionId)}/test`,
            { method: 'POST' },
          ),
        );
      } else {
        await requestJson(
          `/api/operational-intelligence/connections/${encodeURIComponent(connectionId)}/profile`,
          { method: 'POST' },
        );
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to ${operation} the connection.`);
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6 p-8">
      <Link href="/connections" className="text-sm text-gray-400 hover:text-white">
        ← Integration Hub
      </Link>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}
      {!connection ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center text-sm text-gray-400">
          Loading connection…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{connection.name}</h1>
              <p className="mt-1 text-sm text-gray-400">{connection.endpoint}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={working !== null || connection.interfaceType === 'FILE_UPLOAD'}
                onClick={() => void run('test')}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              >
                {working === 'test' ? 'Testing…' : 'Test connection'}
              </button>
              <button
                type="button"
                disabled={working !== null}
                onClick={() => void run('profile')}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {working === 'profile' ? 'Profiling…' : 'Profile schema'}
              </button>
            </div>
          </div>
          {connection.interfaceType === 'FILE_UPLOAD' && (
            <FileUploadPanel connectionId={connectionId} files={sourceFiles} onCompleted={load} />
          )}
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Status" value={connection.status.toLowerCase().replaceAll('_', ' ')} />
            <Metric label="Interface" value={connection.interfaceType} />
            <Metric
              label="Last latency"
              value={connection.lastLatencyMs === null ? '—' : `${connection.lastLatencyMs} ms`}
            />
            <Metric
              label="Schema version"
              value={
                connection.observedSchemaVersion === null
                  ? '—'
                  : `v${connection.observedSchemaVersion}`
              }
            />
          </div>
          {testResult && (
            <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="font-semibold text-white">Latest readiness result</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {Object.entries(testResult.checks).map(([key, value]) => (
                  <Metric key={key} label={key.replaceAll('_', ' ')} value={String(value)} />
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-500">Trace {testResult.traceId}</p>
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Versioned schema profiles
            </h2>
            {connection.schemaVersions?.length ? (
              connection.schemaVersions.map((schema) => (
                <details
                  key={schema.id}
                  className="rounded-xl border border-gray-800 bg-gray-900 p-5"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-white">
                    Version {schema.version} ·{' '}
                    {schema.breakingChange ? 'breaking change' : 'compatible'} ·{' '}
                    {new Date(schema.observedAt).toLocaleString()}
                  </summary>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <JsonPanel title="Inferred schema" value={schema.schema} />
                    <JsonPanel title="Masked sample" value={schema.maskedSample} />
                  </div>
                  <p className="mt-3 break-all text-xs text-gray-500">SHA-256 {schema.checksum}</p>
                </details>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center text-sm text-gray-400">
                No schema profile has been captured.
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Recent attempts
            </h2>
            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
              {connection.attempts?.length ? (
                connection.attempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="grid grid-cols-5 gap-3 border-b border-gray-800 px-4 py-3 text-sm last:border-0"
                  >
                    <span className="text-gray-200">{attempt.operation.toLowerCase()}</span>
                    <span
                      className={
                        attempt.status === 'SUCCEEDED' ? 'text-emerald-400' : 'text-red-400'
                      }
                    >
                      {attempt.status.toLowerCase()}
                    </span>
                    <span className="text-gray-400">
                      {attempt.latencyMs === null ? '—' : `${attempt.latencyMs} ms`}
                    </span>
                    <span className="truncate text-gray-500">{attempt.errorCode ?? '—'}</span>
                    <span className="text-right text-gray-500">
                      {new Date(attempt.startedAt).toLocaleString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-gray-400">No attempts recorded.</div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function FileUploadPanel({
  connectionId,
  files,
  onCompleted,
}: {
  connectionId: string;
  files: SourceFileImport[];
  onCompleted: () => Promise<void>;
}) {
  const [operation, setOperation] = useState<'PROFILE' | 'INGEST'>('PROFILE');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const selected = data.get('sourceFile');
    if (!(selected instanceof File) || selected.size === 0) {
      setError('Select a non-empty source file.');
      setWorking(false);
      return;
    }
    try {
      const checksumSha256 = await sha256(selected);
      const contentType = selected.type === 'text/csv' ? 'text/csv' : 'application/json';
      const upload = await requestJson<{
        fileId: string;
        uploadUrl: string;
        requiredHeaders: Record<string, string>;
      }>(
        `/api/operational-intelligence/connections/${encodeURIComponent(connectionId)}/files/upload-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: selected.name,
            contentType,
            byteSize: selected.size,
            checksumSha256,
          }),
        },
      );
      const stored = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: upload.requiredHeaders,
        body: selected,
      });
      if (!stored.ok) {
        throw new Error(`Object storage rejected the upload with status ${stored.status}.`);
      }
      const classification = data.get('classification');
      const completion =
        operation === 'PROFILE'
          ? { operation, classification }
          : {
              operation,
              classification,
              eventId: crypto.randomUUID(),
              eventType: data.get('eventType'),
              eventVersion: Number(data.get('eventVersion')),
              occurredAt: new Date(selected.lastModified).toISOString(),
              correlationId: crypto.randomUUID(),
              idempotencyKey: `${checksumSha256}:${upload.fileId}`,
              actor: { type: 'file-upload', id: upload.fileId },
              entityRefs: {},
            };
      await requestJson(
        `/api/operational-intelligence/connections/${encodeURIComponent(connectionId)}/files/${encodeURIComponent(upload.fileId)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(completion),
        },
      );
      form.reset();
      setOperation('PROFILE');
      await onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to process the source file.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div>
        <h2 className="font-semibold text-white">Verified source file</h2>
        <p className="mt-1 text-sm text-gray-400">
          The server verifies size and SHA-256, profiles a masked sample, and removes the temporary
          object after processing.
        </p>
      </div>
      {error && (
        <div role="alert" className="rounded-lg border border-red-900 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-4">
        <input
          name="sourceFile"
          type="file"
          accept="application/json,text/csv,.json,.csv"
          required
          className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-300"
        />
        <select
          value={operation}
          onChange={(event) => setOperation(event.target.value as 'PROFILE' | 'INGEST')}
          className={controlStyle}
        >
          <option value="PROFILE">Profile only</option>
          <option value="INGEST">Profile and ingest one record</option>
        </select>
        <select name="classification" required defaultValue="" className={controlStyle}>
          <option value="" disabled>
            Select classification
          </option>
          <option value="PUBLIC">Public</option>
          <option value="INTERNAL">Internal</option>
          <option value="CONFIDENTIAL">Confidential</option>
          <option value="RESTRICTED">Restricted</option>
        </select>
        <button
          type="submit"
          disabled={working}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {working ? 'Processing…' : 'Upload source file'}
        </button>
        {operation === 'INGEST' && (
          <>
            <input
              name="eventType"
              required
              placeholder="Published event type"
              className={controlStyle}
            />
            <input
              name="eventVersion"
              required
              type="number"
              min={1}
              placeholder="Contract version"
              className={controlStyle}
            />
          </>
        )}
      </form>
      <div className="overflow-hidden rounded-lg border border-gray-800">
        {files.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">No source files processed.</div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="grid gap-3 border-b border-gray-800 px-4 py-3 text-sm last:border-0 md:grid-cols-5"
            >
              <span className="truncate text-gray-200">{file.originalName}</span>
              <span className="text-gray-400">{file.status.toLowerCase()}</span>
              <span className="text-gray-400">{file.classification?.toLowerCase() ?? 'pending'}</span>
              <span className="truncate font-mono text-xs text-gray-500">
                {file.checksumSha256}
              </span>
              <span className="text-right text-gray-500">
                {new Date(file.createdAt).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const controlStyle =
  'rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
      <div className="text-xs capitalize text-gray-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-gray-200">{value}</div>
    </div>
  );
}
function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <pre className="max-h-96 overflow-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
