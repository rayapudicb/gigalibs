'use client';

import { PLATFORM_LOOKUP_BASE_PATHS } from '@gigalibs/contracts';
import { createRecordClient, MetadataWindow, usePublishedManifest } from '@gigalibs/configuration-react';
import { useMemo } from 'react';

// WI-OI-120gj: first Orders metadata window (sales orders) over the module record dispatcher.

const BASE_PATH = '/api/universal-orders';
const INVENTORY_PATH = '/api/universal-inventory';
const CATALOGUE_PATH = '/api/product-catalogue';

const LOOKUP_BASE_PATHS = {
  ...PLATFORM_LOOKUP_BASE_PATHS,
  'inventory-warehouses': INVENTORY_PATH,
  'catalogue-products': CATALOGUE_PATH,
  'catalogue-uoms': CATALOGUE_PATH,
};

export interface UniversalOrderWorkspaceProps {
  readonly permissions?: readonly string[];
}

export function UniversalOrderWorkspace({ permissions = [] }: UniversalOrderWorkspaceProps = {}) {
  const client = useMemo(() => createRecordClient({ basePath: BASE_PATH, lookupBasePaths: LOOKUP_BASE_PATHS }), []);
  const clients = useMemo(
    () => ({
      'universal-inventory': createRecordClient({ basePath: INVENTORY_PATH }),
      'product-catalogue': createRecordClient({ basePath: CATALOGUE_PATH }),
    }),
    [],
  );
  const state = usePublishedManifest({
    moduleKey: 'universal-orders',
    entityKey: 'orders-sales-orders',
    surfaceKey: 'orders-sales-orders',
  });

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ui-fg-base">Universal Order Management &amp; Fulfillment</h1>
        <p className="text-sm text-ui-fg-subtle">Sales orders backed by the Universal Orders service (first metadata window).</p>
      </header>
      {state.status === 'loading' ? (
        <p className="text-sm text-ui-fg-muted">Loading the window…</p>
      ) : state.status !== 'ready' ? (
        <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
          <p className="text-sm font-medium text-ui-fg-error">{state.status === 'forbidden' ? 'No access' : 'This window is not available'}</p>
          <p className="mt-1 text-sm text-ui-fg-subtle">{state.message}</p>
        </div>
      ) : (
        <MetadataWindow manifest={state.manifest} client={client} clients={clients} permissions={permissions} />
      )}
    </div>
  );
}
