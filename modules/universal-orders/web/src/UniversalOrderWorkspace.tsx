'use client';

import { PLATFORM_LOOKUP_BASE_PATHS } from '@gigalibs/contracts';
import { createRecordClient, MetadataWindow, usePublishedManifest } from '@gigalibs/configuration-react';
import { ModulePage } from '@gigalibs/web-sdk';
import { useMemo } from 'react';

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

type OrdersSurface =
  | 'orders-sales-quotes'
  | 'orders-sales-orders'
  | 'orders-fulfillment-orders'
  | 'orders-customer-invoices'
  | 'orders-customer-credit-memos';

export interface UniversalOrderWorkspaceProps {
  readonly permissions?: readonly string[];
  /** The screen this route shows (WI-OI-145: the sidebar lists them). */
  readonly section?: OrdersSection;
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

/** Orders' screens, one per sidebar entry and route (WI-OI-145). */
export type OrdersSection = 'quotes' | 'sales-orders' | 'fulfillment' | 'invoices' | 'credit-memos';

export const ORDERS_SECTIONS: Readonly<
  Record<OrdersSection, { readonly title: string; readonly description: string; readonly surface: OrdersSurface }>
> = {
  quotes: { title: 'Quotes', description: 'Prices offered to customers, waiting for their answer.', surface: 'orders-sales-quotes' },
  'sales-orders': { title: 'Sales orders', description: 'Orders customers have placed.', surface: 'orders-sales-orders' },
  fulfillment: { title: 'Fulfillment', description: 'Picking, packing and shipping what was ordered.', surface: 'orders-fulfillment-orders' },
  invoices: { title: 'Invoices', description: 'Invoices sent to customers.', surface: 'orders-customer-invoices' },
  'credit-memos': { title: 'Credit memos', description: 'Amounts credited back to customers.', surface: 'orders-customer-credit-memos' },
};

export function UniversalOrderWorkspace({ permissions = [], section = 'quotes' }: UniversalOrderWorkspaceProps = {}) {
  const screen = ORDERS_SECTIONS[section];
  const surface = screen.surface;
  const client = useMemo(() => createRecordClient({ basePath: BASE_PATH, lookupBasePaths: LOOKUP_BASE_PATHS }), []);
  const clients = useMemo(
    () => ({
      'universal-inventory': createRecordClient({ basePath: INVENTORY_PATH }),
      'product-catalogue': createRecordClient({ basePath: CATALOGUE_PATH }),
    }),
    [],
  );
  return (
    <ModulePage title={screen.title} description={screen.description}>
      <OrdersMetadataPanel surfaceKey={surface} permissions={permissions} client={client} clients={clients} />
    </ModulePage>
  );
}
