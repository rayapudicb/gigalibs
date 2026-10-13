'use client';

import {
  MetadataWindow,
  createRecordClient,
  usePublishedManifest,
} from '@gigalibs/configuration-react';
import { PLATFORM_LOOKUP_BASE_PATHS } from '@gigalibs/contracts';
import { useMemo } from 'react';

// WI-OI-120u (M-WF1, ADR-0033 D1): Workforce screens that are metadata windows, drawn from the dictionary each workspace
// has published, over Workforce's own record dispatcher. The login picker reads the workspace's members through the
// platform lookup, as the signed-in user; the server still decides every read and write.

const BASE_PATH = '/api/workforce';

const SURFACES = {
  'wf-resources': {
    title: 'People',
    description:
      'People, teams and resource pools, their skills and the login each person signs in with.',
  },
} as const;

export interface WorkforceWorkspaceProps {
  readonly surface: keyof typeof SURFACES;
  /** The signed-in user's permissions, for the windows' deny-by-default rules (the server still decides). */
  readonly permissions?: readonly string[];
}

export function WorkforceWorkspace({ surface, permissions = [] }: WorkforceWorkspaceProps) {
  const client = useMemo(
    () => createRecordClient({ basePath: BASE_PATH, lookupBasePaths: PLATFORM_LOOKUP_BASE_PATHS }),
    [],
  );
  const state = usePublishedManifest({
    moduleKey: 'gigaops',
    entityKey: surface,
    surfaceKey: surface,
  });
  const { title, description } = SURFACES[surface];
  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ui-fg-base">{title}</h1>
        <p className="text-sm text-ui-fg-subtle">{description}</p>
      </header>
      {state.status === 'loading' ? (
        <p className="text-sm text-ui-fg-muted">Loading the window…</p>
      ) : state.status !== 'ready' ? (
        <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
          <p className="text-sm font-medium text-ui-fg-error">
            {state.status === 'forbidden' ? 'No access' : 'This window is not available'}
          </p>
          <p className="mt-1 text-sm text-ui-fg-subtle">{state.message}</p>
        </div>
      ) : (
        <MetadataWindow manifest={state.manifest} client={client} permissions={permissions} />
      )}
    </div>
  );
}
