'use client';

import type { BarcodeResolutionResultV1 } from '@gigalibs/contracts';
import { createRecordClient, MetadataWindow, usePublishedManifest } from '@gigalibs/configuration-react';
import { type FormEvent, useMemo, useState } from 'react';

// WI-OI-120f (F0.5, ADR-0033 D1; owner decisions 2026-10-05): Inventory's screens are metadata windows drawn from the
// dictionary each tenant has published, over Inventory's own record dispatcher. The hand-written screen with
// hard-coded figures and a simulated barcode scanner is gone; the barcode resolver now asks Inventory's API.

const BASE_PATH = '/api/universal-inventory';
// Product and unit pickers are served by the Product Catalogue through its own gateway.
const LOOKUP_BASE_PATHS = { 'catalogue-products': '/api/product-catalogue', 'catalogue-uoms': '/api/product-catalogue' };

const WINDOWS = [
  { surface: 'inventory-warehouses', label: 'Warehouses' },
  { surface: 'inventory-items', label: 'Items' },
  { surface: 'inventory-lots', label: 'Lots' },
  { surface: 'inventory-receipts', label: 'Receipts' },
  { surface: 'inventory-balances', label: 'Balances' },
  { surface: 'inventory-ledger', label: 'Stock ledger' },
] as const;

type Tab = (typeof WINDOWS)[number]['surface'] | 'barcode';

export interface UniversalInventoryWorkspaceProps {
  /** The signed-in user's permissions, for the windows' deny-by-default rules (the server still decides). */
  readonly permissions?: readonly string[];
}

export function UniversalInventoryWorkspace({ permissions = [] }: UniversalInventoryWorkspaceProps = {}) {
  const [tab, setTab] = useState<Tab>('inventory-warehouses');
  const client = useMemo(() => createRecordClient({ basePath: BASE_PATH, lookupBasePaths: LOOKUP_BASE_PATHS }), []);
  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ui-fg-base">Inventory &amp; Warehouses</h1>
        <p className="text-sm text-ui-fg-subtle">Warehouses, stocked items, lots, goods receipts, balances and the stock ledger of your organization.</p>
      </header>
      <nav role="tablist" aria-label="Inventory" className="flex flex-wrap gap-1 border-b border-ui-border-base">
        {[...WINDOWS, { surface: 'barcode' as const, label: 'Barcode lookup' }].map((entry) => (
          <button
            key={entry.surface}
            type="button"
            role="tab"
            aria-selected={tab === entry.surface}
            className={`px-3 py-2 text-sm ${tab === entry.surface ? 'border-b-2 border-ui-border-interactive font-medium text-ui-fg-base' : 'text-ui-fg-subtle hover:text-ui-fg-base'}`}
            onClick={() => setTab(entry.surface)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      {tab === 'barcode' ? <BarcodeLookup /> : <InventoryWindow key={tab} surface={tab} client={client} permissions={permissions} />}
    </div>
  );
}

function InventoryWindow({ surface, client, permissions }: { surface: string; client: ReturnType<typeof createRecordClient>; permissions: readonly string[] }) {
  const state = usePublishedManifest({ moduleKey: 'universal-inventory', entityKey: surface, surfaceKey: surface });
  if (state.status === 'loading') return <p className="text-sm text-ui-fg-muted">Loading the window…</p>;
  if (state.status !== 'ready') {
    return (
      <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
        <p className="text-sm font-medium text-ui-fg-error">{state.status === 'forbidden' ? 'No access' : 'This window is not available'}</p>
        <p className="mt-1 text-sm text-ui-fg-subtle">{state.message}</p>
      </div>
    );
  }
  return <MetadataWindow manifest={state.manifest} client={client} permissions={permissions} />;
}

function BarcodeLookup() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BarcodeResolutionResultV1 | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function resolve(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setFailure(null);
    setResult(null);
    try {
      const response = await fetch(`${BASE_PATH}/v1/barcodes/resolve`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ rawCode: code.trim() }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === 'object' && 'message' in body ? String((body as { message: unknown }).message) : `Lookup failed (${response.status}).`;
        throw new Error(message);
      }
      setResult(body as BarcodeResolutionResultV1);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Lookup failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-xl space-y-4">
      <p className="text-sm text-ui-fg-subtle">Scan or type a barcode to find the location, lot or product it belongs to in your organization.</p>
      <form className="flex gap-2" onSubmit={(event) => void resolve(event)}>
        <input
          aria-label="Barcode"
          className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Barcode"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-ui-button-inverted px-3 py-1.5 text-sm font-medium text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover disabled:opacity-50"
        >
          {busy ? 'Looking up…' : 'Look up'}
        </button>
      </form>
      {failure && (
        <p role="alert" className="text-sm text-ui-fg-error">
          {failure}
        </p>
      )}
      {result && (
        <dl className="grid grid-cols-3 gap-2 rounded-lg border border-ui-border-base bg-ui-bg-base p-4 text-sm">
          <dt className="text-ui-fg-subtle">Found</dt>
          <dd className="col-span-2 text-ui-fg-base">{result.entityType === 'UNKNOWN' ? 'Nothing in your organization has this barcode.' : result.entityType}</dd>
          {result.matchedCode ? (
            <>
              <dt className="text-ui-fg-subtle">Code</dt>
              <dd className="col-span-2 text-ui-fg-base">{result.matchedCode}</dd>
            </>
          ) : null}
        </dl>
      )}
    </section>
  );
}
