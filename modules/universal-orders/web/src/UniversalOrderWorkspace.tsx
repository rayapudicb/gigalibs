'use client';

import { PLATFORM_LOOKUP_BASE_PATHS } from '@gigalibs/contracts';
import { createRecordClient, MetadataWindow, usePublishedManifest } from '@gigalibs/configuration-react';
import { useMemo, useState } from 'react';

// WI-OI-120gj/gk: Orders metadata windows (sales quotes and sales orders).

const BASE_PATH = '/api/universal-orders';
const INVENTORY_PATH = '/api/universal-inventory';
const CATALOGUE_PATH = '/api/product-catalogue';

const LOOKUP_BASE_PATHS = {
  ...PLATFORM_LOOKUP_BASE_PATHS,
  'inventory-warehouses': INVENTORY_PATH,
  'catalogue-products': CATALOGUE_PATH,
  'catalogue-uoms': CATALOGUE_PATH,
};

type OrdersSurface = 'orders-sales-quotes' | 'orders-sales-orders';

export interface UniversalOrderWorkspaceProps {
  readonly permissions?: readonly string[];
}

function OrdersMetadataPanel({
  surfaceKey,
  permissions,
  client,
  clients,
}: {
  readonly surfaceKey: OrdersSurface;
  readonly permissions: readonly string[];
  readonly client: ReturnType<typeof createRecordClient>;
  readonly clients: Record<string, ReturnType<typeof createRecordClient>>;
}) {
  const state = usePublishedManifest({
    moduleKey: 'universal-orders',
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

export function UniversalOrderWorkspace({ permissions = [] }: UniversalOrderWorkspaceProps = {}) {
  const [surface, setSurface] = useState<OrdersSurface>('orders-sales-quotes');
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
          <h1 className="text-xl font-semibold text-ui-fg-base">Universal Order Management &amp; Fulfillment</h1>
          <p className="text-sm text-ui-fg-subtle">Sales quotes and orders backed by the Universal Orders service.</p>
        </div>
        <div className="inline-flex rounded-lg border border-ui-border-base bg-ui-bg-subtle p-1 text-sm font-medium">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 transition-colors ${surface === 'orders-sales-quotes' ? 'bg-ui-bg-base text-ui-fg-base shadow-sm' : 'text-ui-fg-muted hover:text-ui-fg-base'}`}
            onClick={() => setSurface('orders-sales-quotes')}
          >
            Sales quotes
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 transition-colors ${surface === 'orders-sales-orders' ? 'bg-ui-bg-base text-ui-fg-base shadow-sm' : 'text-ui-fg-muted hover:text-ui-fg-base'}`}
            onClick={() => setSurface('orders-sales-orders')}
          >
            Sales orders
          </button>
        </div>
      </header>
      <OrdersMetadataPanel surfaceKey={surface} permissions={permissions} client={client} clients={clients} />
    </div>
  );
}
