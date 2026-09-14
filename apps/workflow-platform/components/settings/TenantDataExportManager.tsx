'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

interface TenantDataExportRow {
  id: string;
  status: 'REQUESTED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  requestReason: string;
  attempts: number;
  completedAt: string | null;
  expiresAt: string | null;
  archiveSha256: string | null;
  archiveBytes: number | null;
  totalRecords: number | null;
  failureCode: string | null;
  createdAt: string;
}

interface ApiErrorPayload {
  detail?: unknown;
  message?: unknown;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  if (typeof payload?.detail === 'string') return payload.detail;
  if (typeof payload?.message === 'string') return payload.message;
  return fallback;
}

function formatInstant(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString();
}

function formatBytes(value: number | null): string {
  if (!value) return '—';
  return `${(value / 1024).toFixed(1)} KiB`;
}

export function TenantDataExportManager({ enabled }: { enabled: boolean }) {
  const [rows, setRows] = useState<TenantDataExportRow[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return [];
    const response = await fetch('/api/control/tenants/current/data-exports', { cache: 'no-store' });
    if (!response.ok) throw new Error(await readError(response, 'Data exports could not be loaded.'));
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error('Data export service returned an invalid response.');
    const nextRows = payload as TenantDataExportRow[];
    setRows(nextRows);
    return nextRows;
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        await load();
        if (!cancelled) timer = setTimeout(() => void refresh(), 3_000);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Data exports could not be loaded.');
        }
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const requestExport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/control/tenants/current/data-exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Data export could not be requested.'));
      setReason('');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Data export could not be requested.');
    } finally {
      setBusy(false);
    }
  };

  const download = async (exportId: string) => {
    setError(null);
    const response = await fetch(`/api/control/tenants/current/data-exports/${exportId}/download`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      setError(await readError(response, 'Data export download could not be authorized.'));
      return;
    }
    const payload = (await response.json()) as { downloadUrl?: unknown };
    if (typeof payload.downloadUrl !== 'string') {
      setError('Data export service returned an invalid download response.');
      return;
    }
    window.location.assign(payload.downloadUrl);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenant data portability</CardTitle>
        <CardDescription>
          Generate a signed ZIP containing tenant-owned database records in JSON and CSV. Archives
          expire and are deleted automatically; authentication credentials and provider secrets are
          excluded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {!enabled ? (
          <p className="text-sm text-zinc-600">You do not have permission to create or download tenant exports.</p>
        ) : (
          <>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={requestExport}>
              <label className="flex-1 text-xs font-medium text-zinc-700">
                Audit reason
                <input
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                  minLength={3}
                  maxLength={500}
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Reason for creating this tenant archive"
                />
              </label>
              <Button
                className="self-end"
                type="submit"
                variant="primary"
                disabled={reason.trim().length < 3 || rows.some((row) => ['REQUESTED', 'RUNNING'].includes(row.status))}
                isLoading={busy}
              >
                Generate export
              </Button>
            </form>
            {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}
            {rows.length === 0 ? (
              <p className="text-sm text-zinc-500">No tenant export has been requested.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="py-2 pr-4">Requested</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Records</th>
                      <th className="py-2 pr-4">Archive</th>
                      <th className="py-2 pr-4">Expires</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr className="border-b border-zinc-100 align-top" key={row.id}>
                        <td className="py-3 pr-4">
                          {formatInstant(row.createdAt)}
                          <p className="mt-1 max-w-64 text-xs text-zinc-500">{row.requestReason}</p>
                        </td>
                        <td className="py-3 pr-4">
                          {row.status.replaceAll('_', ' ')}
                          {row.failureCode ? <p className="text-xs text-rose-700">{row.failureCode}</p> : null}
                        </td>
                        <td className="py-3 pr-4">{row.totalRecords ?? '—'}</td>
                        <td className="py-3 pr-4">
                          {formatBytes(row.archiveBytes)}
                          {row.archiveSha256 ? (
                            <p className="mt-1 max-w-48 break-all font-mono text-[10px] text-zinc-500" title={row.archiveSha256}>
                              SHA-256 {row.archiveSha256}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4">{formatInstant(row.expiresAt)}</td>
                        <td className="py-3">
                          {row.status === 'SUCCEEDED' ? (
                            <Button type="button" size="small" variant="secondary" onClick={() => void download(row.id)}>
                              Download ZIP
                            </Button>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
