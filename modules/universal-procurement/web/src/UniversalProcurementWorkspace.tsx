'use client';

import { PLATFORM_LOOKUP_BASE_PATHS } from '@gigalibs/contracts';
import { createRecordClient, MetadataWindow, usePublishedManifest } from '@gigalibs/configuration-react';
import { ModulePage } from '@gigalibs/web-sdk';
import { useMemo } from 'react';
import { LandedCostWizardPanel } from './components/LandedCostWizardPanel.js';

// WI-OI-120gh/gn: Procurement metadata windows (purchase orders and vendor bills).

const BASE_PATH = '/api/universal-procurement';
const INVENTORY_PATH = '/api/universal-inventory';
const CATALOGUE_PATH = '/api/product-catalogue';

const LOOKUP_BASE_PATHS = {
  ...PLATFORM_LOOKUP_BASE_PATHS,
  'inventory-warehouses': INVENTORY_PATH,
  'catalogue-products': CATALOGUE_PATH,
  'catalogue-uoms': CATALOGUE_PATH,
  // WI-OI-149: the customer or vendor picker, over the Business partners module.
  'business-partners-parties': '/api/business-partners',
};

type ProcurementSurface =
  | 'procurement-requisitions'
  | 'procurement-purchase-orders'
  | 'procurement-vendor-bills'
  | 'procurement-debit-memos'
  | 'procurement-landed-cost';

export interface UniversalProcurementWorkspaceProps {
  readonly permissions?: readonly string[];
  /** The screen this route shows (WI-OI-145: the sidebar lists them). */
  readonly section?: ProcurementSection;
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

/** Procurement's screens, one per sidebar entry and route (WI-OI-145). */
export type ProcurementSection = 'requisitions' | 'purchase-orders' | 'vendor-bills' | 'debit-memos' | 'landed-cost';

export const PROCUREMENT_SECTIONS: Readonly<
  Record<ProcurementSection, { readonly title: string; readonly description: string; readonly surface: ProcurementSurface }>
> = {
  requisitions: {
    title: 'Requisitions',
    description: 'Requests to buy, waiting for approval or turned into purchase orders.',
    surface: 'procurement-requisitions',
  },
  'purchase-orders': {
    title: 'Purchase orders',
    description: 'Orders sent to vendors and what has been received against them.',
    surface: 'procurement-purchase-orders',
  },
  'vendor-bills': { title: 'Vendor bills', description: 'Bills from vendors, matched to orders and receipts.', surface: 'procurement-vendor-bills' },
  'debit-memos': { title: 'Debit memos', description: 'Amounts claimed back from vendors.', surface: 'procurement-debit-memos' },
  'landed-cost': {
    title: 'Landed cost',
    description: 'Freight, duty and other costs spread over received goods.',
    surface: 'procurement-landed-cost',
  },
};

export function UniversalProcurementWorkspace({ permissions = [], section = 'requisitions' }: UniversalProcurementWorkspaceProps = {}) {
  const screen = PROCUREMENT_SECTIONS[section];
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
      {surface === 'procurement-landed-cost' ? (
        <LandedCostWizardPanel />
      ) : (
        <ProcurementMetadataPanel surfaceKey={surface} permissions={permissions} client={client} clients={clients} />
      )}
    </ModulePage>
  );
}
