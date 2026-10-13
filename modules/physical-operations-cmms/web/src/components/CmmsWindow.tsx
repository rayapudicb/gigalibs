'use client';

import {
  MetadataWindow,
  createRecordClient,
  usePublishedManifest,
} from '@gigalibs/configuration-react';
import { useMemo } from 'react';

// WI-OI-120t (M-CM1) windows Requests and Classifications, drawn on their CMMS pages (WI-OI-120u follow-up, owner
// 2026-10-13: the pages were generated without a section to draw them, which also stopped the web build). The window is
// the published dictionary over CMMS's own record dispatcher; the server decides every read and write.

const BASE_PATH = '/api/cmms';

export function CmmsWindow({
  surface,
  permissions,
}: { surface: string; permissions: readonly string[] }) {
  const client = useMemo(() => createRecordClient({ basePath: BASE_PATH }), []);
  const state = usePublishedManifest({
    moduleKey: 'physical-operations-cmms',
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
  return <MetadataWindow manifest={state.manifest} client={client} permissions={permissions} />;
}
