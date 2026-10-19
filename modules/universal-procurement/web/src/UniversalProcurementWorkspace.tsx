'use client';

import { PLATFORM_LOOKUP_BASE_PATHS } from '@gigalibs/contracts';
import { createRecordClient, MetadataWindow, usePublishedManifest } from '@gigalibs/configuration-react';
import { useMemo, useState } from 'react';

// WI-OI-120gh/gn: Procurement metadata windows (purchase orders and vendor bills).

const BASE_PATH = '/api/universal-procurement';
const INVENTORY_PATH = '/api/universal-inventory';
const CATALOGUE_PATH = '/api/product-catalogue';

const LOOKUP_BASE_PATHS = {
  ...PLATFORM_LOOKUP_BASE_PATHS,
  'inventory-warehouses': INVENTORY_PATH,
  'catalogue-products': CATALOGUE_PATH,
  'catalogue-uoms': CATALOGUE_PATH,
};

type ProcurementSurface =
  | 'procurement-requisitions'
  | 'procurement-purchase-orders'
  | 'procurement-vendor-bills'
  | 'procurement-debit-memos';

export interface UniversalProcurementWorkspaceProps {
  readonly permissions?: readonly string[];
}

function ProcurementMetadataPanel({
  surfaceKey,
  permissions,
  client,
  clients,
}: {
  readonly surfaceKey: ProcurementSurface;
  readonly permissions: readonly string[];
  readonly client: ReturnType<typeof createRecordClient>;
  readonly clients: Record<string, ReturnType<typeof createRecordClient>>;
}) {
  const state = usePublishedManifest({
    moduleKey: 'universal-procurement',
    entityKey: surfaceKey,
    surfaceKey,
  });

  if (state.status === 'loading') {
    return <p className="text-sm text-ui-fg-muted">Loading the window…</p>;
  }
  if (state.status !== 'ready') {
    return (
      <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
        <p className="text-sm font-medium text-ui-fg-error">{state.status === 'forbidden' ? 'No access' : 'This window is not available'}</p>
        <p className="mt-1 text-sm text-ui-fg-subtle">{state.message}</p>
      </div>
    );
  }
  return <MetadataWindow manifest={state.manifest} client={client} clients={clients} permissions={permissions} />;
}

export function UniversalProcurementWorkspace({ permissions = [] }: UniversalProcurementWorkspaceProps = {}) {
  const [surface, setSurface] = useState<ProcurementSurface>('procurement-requisitions');
  const client = useMemo(() => createRecordClient({ basePath: BASE_PATH, lookupBasePaths: LOOKUP_BASE_PATHS }), []);
  const clients = useMemo(
    () => ({
      'universal-inventory': createRecordClient({ basePath: INVENTORY_PATH }),
      'product-catalogue': createRecordClient({ basePath: CATALOGUE_PATH }),
    }),
    [],
  );

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-ui-fg-base">Procurement &amp; Payables</h1>
          <p className="text-sm text-ui-fg-subtle">Requisitions, POs, vendor bills, and debit memos backed by the Universal Procurement service.</p>
        </div>
        <div className="inline-flex flex-wrap rounded-lg border border-ui-border-base bg-ui-bg-subtle p-1 text-sm font-medium">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 transition-colors ${surface === 'procurement-requisitions' ? 'bg-ui-bg-base text-ui-fg-base shadow-sm' : 'text-ui-fg-muted hover:text-ui-fg-base'}`}
            onClick={() => setSurface('procurement-requisitions')}
          >
            Requisitions
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 transition-colors ${surface === 'procurement-purchase-orders' ? 'bg-ui-bg-base text-ui-fg-base shadow-sm' : 'text-ui-fg-muted hover:text-ui-fg-base'}`}
            onClick={() => setSurface('procurement-purchase-orders')}
          >
            Purchase orders
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 transition-colors ${surface === 'procurement-vendor-bills' ? 'bg-ui-bg-base text-ui-fg-base shadow-sm' : 'text-ui-fg-muted hover:text-ui-fg-base'}`}
            onClick={() => setSurface('procurement-vendor-bills')}
          >
            Vendor bills
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 transition-colors ${surface === 'procurement-debit-memos' ? 'bg-ui-bg-base text-ui-fg-base shadow-sm' : 'text-ui-fg-muted hover:text-ui-fg-base'}`}
            onClick={() => setSurface('procurement-debit-memos')}
          >
            Debit memos
          </button>
        </div>
      </header>
      <ProcurementMetadataPanel surfaceKey={surface} permissions={permissions} client={client} clients={clients} />
    </div>
  );
}
