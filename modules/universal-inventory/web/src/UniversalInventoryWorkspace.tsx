'use client';

import {
  MetadataWindow,
  createRecordClient,
  usePublishedManifest,
} from '@gigalibs/configuration-react';
import { type BarcodeResolutionResultV1, PLATFORM_LOOKUP_BASE_PATHS } from '@gigalibs/contracts';
import { ModulePage } from '@gigalibs/web-sdk';
import { Button } from '@medusajs/ui';
import { type FormEvent, useMemo, useState } from 'react';
import { AtpLivePanel } from './AtpLivePanel.js';
import { InventoryScannerDrawer } from './InventoryScannerDrawer.js';
import { KanbanTransferBoard } from './KanbanTransferBoard.js';
import { ReplenishmentRadarPanel } from './ReplenishmentRadarPanel.js';
import { ValuationSettingsPanel } from './ValuationSettingsPanel.js';
import { WarehouseMapPanel } from './WarehouseMapPanel.js';

// WI-OI-120f (F0.5, ADR-0033 D1; owner decisions 2026-10-05): Inventory's screens are metadata windows drawn from the
// dictionary each tenant has published, over Inventory's own record dispatcher. The hand-written screen with
// hard-coded figures and a simulated barcode scanner is gone; the barcode resolver now asks Inventory's API.

const BASE_PATH = '/api/universal-inventory';
const CATALOGUE_PATH = '/api/product-catalogue';
// Product and unit pickers are served by the Product Catalogue through its own gateway; the organization-unit picker
// (warehouse owning unit, QA-024) by the control plane, like every platform lookup.
const LOOKUP_BASE_PATHS = {
  ...PLATFORM_LOOKUP_BASE_PATHS,
  'catalogue-products': CATALOGUE_PATH,
  'catalogue-uoms': CATALOGUE_PATH,
};

type View =
  | 'inventory-warehouses'
  | 'inventory-items'
  | 'inventory-lots'
  | 'inventory-receipts'
  | 'inventory-balances'
  | 'inventory-reservations'
  | 'inventory-ledger'
  | 'inventory-cost-layers'
  | 'inventory-posted-receipt-costs'
  | 'barcode'
  | 'warehouse-map'
  | 'valuation-settings'
  | 'atp'
  | 'transfers'
  | 'replenishment';

/** Inventory's screens: one tab in the module tab bar, one sidebar entry and one route each (WI-OI-145). */
export type InventorySection =
  | 'warehouses'
  | 'items'
  | 'lots'
  | 'receipts'
  | 'balances'
  | 'reservations'
  | 'ledger'
  | 'movement-costs'
  | 'posted-receipt-costs'
  | 'warehouse-map'
  | 'transfers'
  | 'replenishment'
  | 'availability'
  | 'valuation'
  | 'barcode';

export const INVENTORY_SECTIONS: Readonly<Record<InventorySection, { readonly title: string; readonly view: View }>> = {
  warehouses: { title: 'Warehouses', view: 'inventory-warehouses' },
  items: { title: 'Items', view: 'inventory-items' },
  lots: { title: 'Lots', view: 'inventory-lots' },
  receipts: { title: 'Receipts', view: 'inventory-receipts' },
  balances: { title: 'Balances', view: 'inventory-balances' },
  reservations: { title: 'Reservations', view: 'inventory-reservations' },
  ledger: { title: 'Stock ledger', view: 'inventory-ledger' },
  'movement-costs': { title: 'Movement costs', view: 'inventory-cost-layers' },
  'posted-receipt-costs': { title: 'Posted receipt costs', view: 'inventory-posted-receipt-costs' },
  'warehouse-map': { title: 'Warehouse map', view: 'warehouse-map' },
  transfers: { title: 'Transfers', view: 'transfers' },
  replenishment: { title: 'Replenishment', view: 'replenishment' },
  availability: { title: 'Availability', view: 'atp' },
  valuation: { title: 'Valuation setup', view: 'valuation-settings' },
  barcode: { title: 'Barcode lookup', view: 'barcode' },
};

export interface UniversalInventoryWorkspaceProps {
  /** The signed-in user's permissions, for the windows' deny-by-default rules (the server still decides). */
  readonly permissions?: readonly string[];
  /** The screen this route shows (WI-OI-145: the sidebar lists them; there is no in-page module menu). */
  readonly section?: InventorySection;
}

export function UniversalInventoryWorkspace({
  permissions = [],
  section = 'warehouses',
}: UniversalInventoryWorkspaceProps = {}) {
  const screen = INVENTORY_SECTIONS[section];
  const tab = screen.view;
  const [scannerOpen, setScannerOpen] = useState(false);
  const client = useMemo(
    () => createRecordClient({ basePath: BASE_PATH, lookupBasePaths: LOOKUP_BASE_PATHS }),
    [],
  );
  // WI-OI-120 (F0.6): "Add new product" or "Add new unit" from a picker opens the Catalogue's own window.
  const clients = useMemo(
    () => ({ 'product-catalogue': createRecordClient({ basePath: CATALOGUE_PATH }) }),
    [],
  );
  return (
    <ModulePage
      title={screen.title}
      actions={
        <Button size="small" variant="secondary" onClick={() => setScannerOpen(true)}>
          Open scanner
        </Button>
      }
    >
      {tab === 'barcode' ? (
        <BarcodeLookup />
      ) : tab === 'warehouse-map' ? (
        <WarehouseMapPanel />
      ) : tab === 'transfers' ? (
        <KanbanTransferBoard />
      ) : tab === 'replenishment' ? (
        <ReplenishmentRadarPanel />
      ) : tab === 'atp' ? (
        <AtpLivePanel />
      ) : tab === 'valuation-settings' ? (
        <ValuationSettingsPanel />
      ) : (
        <InventoryWindow
          key={tab}
          surface={tab}
          client={client}
          clients={clients}
          permissions={permissions}
        />
      )}
      {scannerOpen ? <InventoryScannerDrawer onClose={() => setScannerOpen(false)} /> : null}
    </ModulePage>
  );
}

function InventoryWindow({
  surface,
  client,
  clients,
  permissions,
}: {
  surface: string;
  client: ReturnType<typeof createRecordClient>;
  clients: Readonly<Record<string, ReturnType<typeof createRecordClient>>>;
  permissions: readonly string[];
}) {
  const state = usePublishedManifest({
    moduleKey: 'universal-inventory',
    entityKey: surface,
    surfaceKey: surface,
  });
  if (state.status === 'loading')
    return <p className="text-sm text-ui-fg-muted">Loading the window…</p>;
  if (state.status !== 'ready') {
    return (
      <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
        <p className="text-sm font-medium text-ui-fg-error">
          {state.status === 'forbidden' ? 'No access' : 'This window is not available'}
        </p>
        <p className="mt-1 text-sm text-ui-fg-subtle">{state.message}</p>
      </div>
    );
  }
  return (
    <MetadataWindow
      manifest={state.manifest}
      client={client}
      clients={clients}
      permissions={permissions}
    />
  );
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
        const message =
          body && typeof body === 'object' && 'message' in body
            ? String((body as { message: unknown }).message)
            : `Lookup failed (${response.status}).`;
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
      <p className="text-sm text-ui-fg-subtle">
        Scan or type a barcode to find the location, lot or product it belongs to in your
        organization.
      </p>
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
          <dd className="col-span-2 text-ui-fg-base">
            {result.entityType === 'UNKNOWN'
              ? 'Nothing in your organization has this barcode.'
              : result.entityType}
          </dd>
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
