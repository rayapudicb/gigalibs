'use client';

import {
  type MetadataPanelRegistry,
  MetadataWindow,
  type PublishedManifestState,
  createRecordClient,
  usePublishedManifest,
} from '@gigalibs/configuration-react';
import { PLATFORM_LOOKUP_BASE_PATHS } from '@gigalibs/contracts';
import { useMemo, useState } from 'react';
import { GateWorkbenchPanel } from './GateWorkbenchPanel.js';
import { RouteSummaryPanel } from './RouteSummaryPanel.js';

// WI-OI-120bw/120bx (SPEED S3, S4; plan v1.4 §3.3): SPEED's screens are metadata windows drawn from the dictionary each
// workspace has published, over the module's own record dispatcher. Labels, fields, actions and permissions come from
// the published windows, which also place SPEED's registered panels; this component adds no text of its own. Sites and
// people come from the platform lookups.

const BASE_PATH = '/api/speed';
const MODULE_KEY = 'process-safety-screening';
const SURFACES = ['speed-projects', 'speed-routes', 'speed-substances'] as const;
type Surface = (typeof SURFACES)[number];

/** The components SPEED registers in `spec.ui.panels`; the dictionary decides where each appears. */
const PANELS: MetadataPanelRegistry = {
  'speed.route-summary': RouteSummaryPanel,
  'speed.gate-workbench': GateWorkbenchPanel,
};

export interface SpeedWorkspaceProps {
  /** The signed-in user's permissions, for the windows' deny-by-default rules (the server still decides). */
  readonly permissions?: readonly string[];
}

function label(state: PublishedManifestState): string | null {
  return state.status === 'ready' ? (state.manifest.views[0]?.label ?? null) : null;
}

export function SpeedWorkspace({ permissions = [] }: SpeedWorkspaceProps = {}) {
  const client = useMemo(
    () => createRecordClient({ basePath: BASE_PATH, lookupBasePaths: PLATFORM_LOOKUP_BASE_PATHS }),
    [],
  );
  const clients = useMemo(() => ({ [MODULE_KEY]: client }), [client]);
  const states: Record<Surface, PublishedManifestState> = {
    'speed-projects': usePublishedManifest({
      moduleKey: MODULE_KEY,
      entityKey: 'speed-projects',
      surfaceKey: 'speed-projects',
    }),
    'speed-routes': usePublishedManifest({
      moduleKey: MODULE_KEY,
      entityKey: 'speed-routes',
      surfaceKey: 'speed-routes',
    }),
    'speed-substances': usePublishedManifest({
      moduleKey: MODULE_KEY,
      entityKey: 'speed-substances',
      surfaceKey: 'speed-substances',
    }),
  };
  const available = SURFACES.filter((surface) => states[surface].status !== 'forbidden');
  const [chosen, setChosen] = useState<Surface>('speed-projects');
  const surface = available.includes(chosen) ? chosen : (available[0] ?? 'speed-projects');
  const state = states[surface];
  return (
    <div className="space-y-6 p-6">
      {available.length > 1 ? (
        <nav role="tablist" className="flex flex-wrap gap-1 border-b border-ui-border-base">
          {available.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={entry === surface}
              className={`px-3 py-2 text-sm ${entry === surface ? 'border-b-2 border-ui-border-interactive font-medium text-ui-fg-base' : 'text-ui-fg-subtle hover:text-ui-fg-base'}`}
              onClick={() => setChosen(entry)}
            >
              {label(states[entry]) ?? '…'}
            </button>
          ))}
        </nav>
      ) : null}
      {state.status === 'loading' ? (
        <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />
      ) : state.status === 'ready' ? (
        <MetadataWindow
          key={surface}
          manifest={state.manifest}
          client={client}
          clients={clients}
          permissions={permissions}
          panels={PANELS}
        />
      ) : (
        <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
          <p className="text-sm text-ui-fg-error">{state.message}</p>
        </div>
      )}
    </div>
  );
}
