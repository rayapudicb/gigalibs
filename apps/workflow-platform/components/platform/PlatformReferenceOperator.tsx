'use client';

import type { ReferenceSetKey } from '@gigalibs/contracts';

const LOADABLE_REFERENCE_SETS: ReferenceSetKey[] = [
  'CURRENCIES',
  'TIME_ZONES',
  'COUNTRIES',
  'LANGUAGES',
  'UNITS_OF_MEASURE',
  'REGIONS',
  'TAX_JURISDICTIONS',
  'TRADE_TERMS',
];
import { ModulePage } from '@gigalibs/web-sdk';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { REFERENCE_SET_LABELS } from '@/lib/platform-reference';

interface VersionRow {
  readonly id: string;
  readonly setKey: ReferenceSetKey;
  readonly source: string;
  readonly version: string;
  readonly checksum: string;
  readonly entryCount: number;
  readonly loadedAt: string;
  readonly retiredAt: string | null;
}

export function PlatformReferenceOperator() {
  const [versions, setVersions] = useState<readonly VersionRow[]>([]);
  const [reason, setReason] = useState('Initial load from operator console');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<ReferenceSetKey | null>(null);

  useEffect(() => {
    void fetch('/api/control/v1/platform-reference/versions')
      .then(async (response) => (response.ok ? ((await response.json()) as VersionRow[]) : []))
      .then(setVersions);
  }, [message]);

  const load = async (setKey: ReferenceSetKey) => {
    setPending(setKey);
    setMessage(null);
    const response = await fetch(`/api/control/v1/platform-reference/${setKey}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setPending(null);
    setMessage(
      response.ok
        ? `Loaded ${setKey}.`
        : `Load refused (${response.status}). Check your platform role and reason.`,
    );
  };

  return (
    <ModulePage title="Platform reference data">
      <p className="mb-4 text-sm text-ui-fg-subtle">
        Load generated ISO/CLDR reference sets into the control plane. Workspace members read them from{' '}
        <Link href="/master-data/reference-data" className="font-semibold text-ui-fg-interactive">
          Master data → Reference data
        </Link>
        .
      </p>
      <label className="mb-4 block max-w-xl text-sm">
        <span className="font-medium">Audit reason</span>
        <input
          className="mt-1 w-full rounded-md border border-ui-border-base px-3 py-2"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {message ? <p className="mb-4 text-sm text-ui-fg-base">{message}</p> : null}
      <div className="space-y-6">
        {LOADABLE_REFERENCE_SETS.map((setKey) => {
          const rows = versions.filter((row) => row.setKey === setKey);
          const live = rows.find((row) => row.retiredAt === null);
          return (
            <section key={setKey} className="rounded-lg border border-ui-border-base p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{REFERENCE_SET_LABELS[setKey] ?? setKey}</h2>
                <button
                  type="button"
                  className="rounded-md bg-ui-fg-interactive px-3 py-1.5 text-sm font-semibold text-ui-fg-on-color disabled:opacity-50"
                  disabled={pending === setKey || reason.trim().length < 3}
                  onClick={() => void load(setKey)}
                >
                  Load new version
                </button>
              </div>
              {live ? (
                <p className="mt-2 text-sm text-ui-fg-subtle">
                  Live: {live.version} · {live.entryCount} entries · {live.checksum.slice(0, 20)}…
                </p>
              ) : (
                <p className="mt-2 text-sm text-ui-tag-orange-text">Not loaded on this environment.</p>
              )}
              {rows.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-ui-fg-muted">
                  {rows.slice(0, 5).map((row) => (
                    <li key={row.id}>
                      {row.version} — {new Date(row.loadedAt).toLocaleString()}
                      {row.retiredAt ? ' (retired)' : ' (live)'}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </ModulePage>
  );
}
