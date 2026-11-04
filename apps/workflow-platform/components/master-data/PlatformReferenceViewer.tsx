'use client';

import { type ReferenceSetKey } from '@gigalibs/contracts';
import { EmptyState, ModulePage } from '@gigalibs/web-sdk';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { REFERENCE_SET_LABELS } from '@/lib/platform-reference';

type ReferenceEntry = Readonly<Record<string, unknown>> & { code: string; name: string };

interface ReferencePayload {
  readonly setKey: ReferenceSetKey;
  readonly provenance: {
    readonly source: string;
    readonly version: string;
    readonly checksum: string;
    readonly entryCount: number;
    readonly loadedAt: string;
  } | null;
  readonly entries: readonly ReferenceEntry[];
}

export function PlatformReferenceViewer({ setKey }: { setKey: ReferenceSetKey }) {
  const [query, setQuery] = useState('');
  const [payload, setPayload] = useState<ReferencePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      const response = await fetch(`/api/control/v1/platform-reference/${setKey}`, { cache: 'no-store' });
      if (!response.ok) {
        if (!cancelled) setError(response.status === 403 ? 'You cannot read this reference set.' : 'Reference data is unavailable.');
        return;
      }
      const body = (await response.json()) as ReferencePayload;
      if (!cancelled) setPayload(body);
    })();
    return () => {
      cancelled = true;
    };
  }, [setKey]);

  const filtered = useMemo(() => {
    if (!payload) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return payload.entries;
    return payload.entries.filter(
      (entry) =>
        entry.code.toLowerCase().includes(needle) ||
        String(entry.name).toLowerCase().includes(needle),
    );
  }, [payload, query]);

  const selected = filtered.find((entry) => entry.code === selectedCode) ?? filtered[0] ?? null;

  return (
    <ModulePage title={REFERENCE_SET_LABELS[setKey] ?? setKey}>
      <p className="mb-4 text-sm text-ui-fg-subtle">
        Platform reference data is read-only in your workspace.{' '}
        <Link href="/master-data/reference-data" className="font-semibold text-ui-fg-interactive">
          Back to Master data
        </Link>
      </p>
      {error ? (
        <EmptyState title="Reference unavailable" description={error} />
      ) : !payload ? (
        <p className="text-sm text-ui-fg-muted">Loading reference entries…</p>
      ) : payload.provenance === null ? (
        <EmptyState
          title="Not loaded yet"
          description="A platform operator must load this reference set before entries appear here."
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 text-sm">
            <p>
              <span className="font-medium">Version:</span> {payload.provenance.version}
            </p>
            <p>
              <span className="font-medium">Source:</span> {payload.provenance.source}
            </p>
            <p>
              <span className="font-medium">Checksum:</span> {payload.provenance.checksum}
            </p>
            <p>
              <span className="font-medium">Loaded:</span>{' '}
              {new Date(payload.provenance.loadedAt).toLocaleString()}
            </p>
            <p>
              <span className="font-medium">Entries:</span> {payload.provenance.entryCount.toLocaleString()}
            </p>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-ui-fg-base">Search</span>
            <input
              className="mt-1 w-full max-w-md rounded-md border border-ui-border-base px-3 py-2"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Code or name"
            />
          </label>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-ui-border-base">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-ui-bg-subtle">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((entry) => (
                    <tr
                      key={entry.code}
                      className={`cursor-pointer border-t border-ui-border-base ${selected?.code === entry.code ? 'bg-ui-bg-highlight' : ''}`}
                      onClick={() => setSelectedCode(entry.code)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{entry.code}</td>
                      <td className="px-3 py-2">{entry.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-ui-border-base p-4 text-sm">
              {selected ? (
                <>
                  <h2 className="text-base font-semibold">{selected.name}</h2>
                  <p className="mt-1 font-mono text-xs text-ui-fg-subtle">{selected.code}</p>
                  <dl className="mt-4 space-y-2">
                    {Object.entries(selected)
                      .filter(([key]) => key !== 'code' && key !== 'name')
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</dt>
                          <dd className="text-ui-fg-subtle">{String(value ?? '—')}</dd>
                        </div>
                      ))}
                  </dl>
                </>
              ) : (
                <p className="text-ui-fg-muted">Select an entry.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </ModulePage>
  );
}
