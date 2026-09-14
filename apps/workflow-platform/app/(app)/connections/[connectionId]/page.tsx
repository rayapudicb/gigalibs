'use client';

import type { SourceConnection, SourceFileImport } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Container, Heading, Text, Button, Badge, StatusBadge, Alert } from '@medusajs/ui';

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
    <div className="space-y-6 p-8 font-sans text-ui-fg-base">
      <Link href="/connections" className="text-xs text-ui-fg-muted hover:text-ui-fg-base">
        ← Integration Hub
      </Link>
      {error && (
        <Alert variant="error" className="text-xs">
          {error}
        </Alert>
      )}
      {!connection ? (
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-12 text-center text-xs text-ui-fg-muted">
          Loading connection…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Heading level="h1" className="text-2xl font-bold text-ui-fg-base">{connection.name}</Heading>
              <Text size="small" className="mt-1 text-ui-fg-muted font-mono text-xs">{connection.endpoint}</Text>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="small"
                disabled={working !== null || connection.interfaceType === 'FILE_UPLOAD'}
                onClick={() => void run('test')}
                isLoading={working === 'test'}
              >
                Test connection
              </Button>
              <Button
                type="button"
                variant="primary"
                size="small"
                disabled={working !== null}
                onClick={() => void run('profile')}
                isLoading={working === 'profile'}
              >
                Profile schema
              </Button>
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
            <Container className="p-5 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
              <Heading level="h2" className="text-base font-semibold text-ui-fg-base">Latest readiness result</Heading>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {Object.entries(testResult.checks).map(([key, value]) => (
                  <Metric key={key} label={key.replaceAll('_', ' ')} value={String(value)} />
                ))}
              </div>
              <Text size="xsmall" className="mt-3 text-ui-fg-muted font-mono">Trace {testResult.traceId}</Text>
            </Container>
          )}
          <section className="space-y-3">
            <Text size="xsmall" weight="plus" className="uppercase tracking-wide text-ui-fg-muted">
              Versioned schema profiles
            </Text>
            {connection.schemaVersions?.length ? (
              connection.schemaVersions.map((schema) => (
                <details
                  key={schema.id}
                  className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-elevation-card-rest"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-ui-fg-base">
                    Version {schema.version} ·{' '}
                    {schema.breakingChange ? 'breaking change' : 'compatible'} ·{' '}
                    {new Date(schema.observedAt).toLocaleString()}
                  </summary>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <JsonPanel title="Inferred schema" value={schema.schema} />
                    <JsonPanel title="Masked sample" value={schema.maskedSample} />
                  </div>
                  <p className="mt-3 break-all font-mono text-xs text-ui-fg-muted">SHA-256 {schema.checksum}</p>
                </details>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-ui-border-base p-10 text-center text-xs text-ui-fg-muted">
                No schema profile has been captured.
              </div>
            )}
          </section>
          <section className="space-y-3">
            <Text size="xsmall" weight="plus" className="uppercase tracking-wide text-ui-fg-muted">
              Recent attempts
            </Text>
            <Container className="p-0 overflow-hidden border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
              {connection.attempts?.length ? (
                connection.attempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="grid grid-cols-5 gap-3 border-b border-ui-border-base px-4 py-3 text-xs last:border-0"
                  >
                    <span className="text-ui-fg-base font-medium">{attempt.operation.toLowerCase()}</span>
                    <span>
                      <StatusBadge color={attempt.status === 'SUCCEEDED' ? 'green' : 'red'}>
                        {attempt.status.toLowerCase()}
                      </StatusBadge>
                    </span>
                    <span className="text-ui-fg-subtle font-mono">
                      {attempt.latencyMs === null ? '—' : `${attempt.latencyMs} ms`}
                    </span>
                    <span className="truncate text-ui-fg-muted">{attempt.errorCode ?? '—'}</span>
                    <span className="text-right text-ui-fg-muted font-mono">
                      {new Date(attempt.startedAt).toLocaleString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-ui-fg-muted">No attempts recorded.</div>
              )}
            </Container>
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
    <Container className="space-y-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-elevation-card-rest">
      <div>
        <Heading level="h2" className="text-base font-semibold text-ui-fg-base">Verified source file</Heading>
        <Text size="small" className="mt-1 text-ui-fg-muted">
          The server verifies size and SHA-256, profiles a masked sample, and removes the temporary
          object after processing.
        </Text>
      </div>
      {error && (
        <Alert variant="error" className="text-xs">
          {error}
        </Alert>
      )}
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-4">
        <input
          name="sourceFile"
          type="file"
          accept="application/json,text/csv,.json,.csv"
          required
          className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-xs text-ui-fg-base shadow-borders-base"
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
        <Button
          type="submit"
          disabled={working}
          variant="primary"
          size="small"
          isLoading={working}
        >
          Upload source file
        </Button>
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
      <div className="overflow-hidden rounded-lg border border-ui-border-base">
        {files.length === 0 ? (
          <div className="p-6 text-center text-xs text-ui-fg-muted">No source files processed.</div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="grid gap-3 border-b border-ui-border-base px-4 py-3 text-xs last:border-0 md:grid-cols-5"
            >
              <span className="truncate text-ui-fg-base font-medium">{file.originalName}</span>
              <span className="text-ui-fg-subtle">{file.status.toLowerCase()}</span>
              <span className="text-ui-fg-subtle">{file.classification?.toLowerCase() ?? 'pending'}</span>
              <span className="truncate font-mono text-[11px] text-ui-fg-muted">
                {file.checksumSha256}
              </span>
              <span className="text-right text-ui-fg-muted font-mono">
                {new Date(file.createdAt).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </Container>
  );
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const controlStyle =
  'rounded-md border border-ui-border-base bg-ui-bg-base px-2.5 py-1.5 text-xs text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Container className="p-3 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-lg">
      <div className="text-[11px] uppercase tracking-wider text-ui-fg-muted font-semibold">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-ui-fg-base">{value}</div>
    </Container>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ui-fg-muted">{title}</h3>
      <pre className="max-h-96 overflow-auto rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3.5 font-mono text-xs text-ui-fg-base">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
