'use client';

import {
  MetadataWindow,
  createRecordClient,
  usePublishedManifest,
} from '@gigalibs/configuration-react';
import { PLATFORM_LOOKUP_BASE_PATHS } from '@gigalibs/contracts';
import { useMemo } from 'react';

// WI-OI-120bw (SPEED S3; plan v1.4 §3.3): SPEED's screens are metadata windows drawn from the dictionary each workspace
// has published, over the module's own record dispatcher. Labels, fields, actions and permissions all come from the
// published window; this component adds no text of its own. Sites and people come from the platform lookups.

const BASE_PATH = '/api/speed';
const MODULE_KEY = 'process-safety-screening';
const PROJECTS = 'speed-projects';

export interface SpeedWorkspaceProps {
  /** The signed-in user's permissions, for the windows' deny-by-default rules (the server still decides). */
  readonly permissions?: readonly string[];
}

export function SpeedWorkspace({ permissions = [] }: SpeedWorkspaceProps = {}) {
  const client = useMemo(
    () => createRecordClient({ basePath: BASE_PATH, lookupBasePaths: PLATFORM_LOOKUP_BASE_PATHS }),
    [],
  );
  const state = usePublishedManifest({
    moduleKey: MODULE_KEY,
    entityKey: PROJECTS,
    surfaceKey: PROJECTS,
  });
  return (
    <div className="space-y-6 p-6">
      {state.status === 'loading' ? (
        <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />
      ) : state.status === 'ready' ? (
        <MetadataWindow manifest={state.manifest} client={client} permissions={permissions} />
      ) : (
        <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
          <p className="text-sm text-ui-fg-error">{state.message}</p>
        </div>
      )}
    </div>
  );
}
