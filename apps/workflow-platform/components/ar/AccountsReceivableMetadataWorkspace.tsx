'use client';

import { createRecordClient, MetadataWindow, usePublishedManifest } from '@gigalibs/configuration-react';
import { useMemo, useState } from 'react';

const BASE_PATH = '/api/ar';

type ArSurface = 'ar-invoices' | 'ar-customers';

function ArMetadataPanel({
  surfaceKey,
  permissions,
  client,
}: {
  readonly surfaceKey: ArSurface;
  readonly permissions: readonly string[];
  readonly client: ReturnType<typeof createRecordClient>;
}) {
  const state = usePublishedManifest({
    moduleKey: 'accounts-receivable',
    entityKey: surfaceKey,
    surfaceKey,
  });

  if (state.status === 'loading') {
    return <p className="text-sm text-ui-fg-muted">Loading the window…</p>;
  }
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
  return <MetadataWindow manifest={state.manifest} client={client} permissions={permissions} />;
}

export interface AccountsReceivableMetadataWorkspaceProps {
  readonly permissions?: readonly string[];
}

export default function AccountsReceivableMetadataWorkspace({
  permissions = [],
}: AccountsReceivableMetadataWorkspaceProps) {
  const [surface, setSurface] = useState<ArSurface>('ar-invoices');
  const client = useMemo(() => createRecordClient({ basePath: BASE_PATH }), []);

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-ui-fg-base">Accounts Receivable</h1>
          <p className="text-sm text-ui-fg-subtle">Customers and invoices backed by the AR service (metadata windows).</p>
        </div>
        <div className="inline-flex rounded-lg border border-ui-border-base bg-ui-bg-subtle p-1 text-sm font-medium">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 transition-colors ${surface === 'ar-invoices' ? 'bg-ui-bg-base text-ui-fg-base shadow-sm' : 'text-ui-fg-muted hover:text-ui-fg-base'}`}
            onClick={() => setSurface('ar-invoices')}
          >
            Invoices
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 transition-colors ${surface === 'ar-customers' ? 'bg-ui-bg-base text-ui-fg-base shadow-sm' : 'text-ui-fg-muted hover:text-ui-fg-base'}`}
            onClick={() => setSurface('ar-customers')}
          >
            Customers
          </button>
        </div>
      </header>
      <ArMetadataPanel surfaceKey={surface} permissions={permissions} client={client} />
    </div>
  );
}
