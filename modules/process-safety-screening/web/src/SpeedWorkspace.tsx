'use client';

import {
  type MetadataPanelRegistry,
  MetadataWindow,
  createRecordClient,
  usePublishedManifest,
} from '@gigalibs/configuration-react';
import { PLATFORM_LOOKUP_BASE_PATHS } from '@gigalibs/contracts';
import { useMemo } from 'react';
import { AuditTrailPage } from './AuditTrailPanel.js';
import { CriteriaValuesPanel } from './CriteriaValuesPanel.js';
import { DossierPreviewPanel } from './DossierPreviewPanel.js';
import { GateWorkbenchPanel } from './GateWorkbenchPanel.js';
import { GreenScorecardPanel } from './GreenScorecardPanel.js';
import { InteractionMatrixPanel } from './InteractionMatrixPanel.js';
import { LibraryEntriesPanel } from './LibraryEntriesPanel.js';
import { OutcomesPage } from './OutcomesPanel.js';
import { ObChartPanel } from './ObChartPanel.js';
import { RouteSummaryPanel } from './RouteSummaryPanel.js';
import { ThermalPanel } from './ThermalPanel.js';
import { WriteupParserPanel } from './WriteupParserPanel.js';

// WI-OI-120bw/120bx (SPEED S3, S4; plan v1.4 §3.3): SPEED's screens are metadata windows drawn from the dictionary each
// workspace has published, over the module's own record dispatcher. Labels, fields, actions and permissions come from
// the published windows, which also place SPEED's registered panels; this component adds no text of its own. Sites and
// people come from the platform lookups. WI-OI-120cb: each screen is its own page, reached from the sidebar entry's
// menu as EAM's are.

const BASE_PATH = '/api/speed';
const MODULE_KEY = 'process-safety-screening';

/** The components SPEED registers in `spec.ui.panels`; the dictionary decides where each appears. */
const PANELS: MetadataPanelRegistry = {
  'speed.route-summary': RouteSummaryPanel,
  'speed.gate-workbench': GateWorkbenchPanel,
  'speed.ob-chart': ObChartPanel,
  'speed.thermal-panel': ThermalPanel,
  'speed.green-scorecard': GreenScorecardPanel,
  'speed.criteria-values': CriteriaValuesPanel,
  'speed.interaction-matrix': InteractionMatrixPanel,
  'speed.library-entries': LibraryEntriesPanel,
  'speed.dossier-preview': DossierPreviewPanel,
  'speed.writeup-parser': WriteupParserPanel,
};

/** The page's screen and its window (WI-OI-120cb): each has its own page, reached from the sidebar entry's menu. */
export const SPEED_SECTIONS = {
  projects: 'speed-projects',
  routes: 'speed-routes',
  substances: 'speed-substances',
  library: 'speed-library',
  criteria: 'speed-criteria',
} as const;
export type SpeedSection = keyof typeof SPEED_SECTIONS;
type Surface = (typeof SPEED_SECTIONS)[SpeedSection];

/** The window a section shows; an unknown section shows Projects. */
export function surfaceOf(section: string | undefined): Surface {
  return section && section in SPEED_SECTIONS
    ? SPEED_SECTIONS[section as SpeedSection]
    : 'speed-projects';
}

export interface SpeedWorkspaceProps {
  /** The screen this page shows: a window's section, `outcomes` or `audit`. */
  readonly section?: string;
  /** The signed-in user's permissions, for the windows' deny-by-default rules (the server still decides). */
  readonly permissions?: readonly string[];
  /** The Outcomes page's targets (WI-OI-120cc), from its page settings in the module manifest. */
  readonly screeningTargetHours?: number;
  readonly screenedTargetPercent?: number;
}

/** The Outcomes page (a module page, screen spec §3.4) or the window of a section. */
export function SpeedWorkspace({
  section,
  permissions = [],
  screeningTargetHours,
  screenedTargetPercent,
}: SpeedWorkspaceProps = {}) {
  if (
    section === 'outcomes' &&
    typeof screeningTargetHours === 'number' &&
    typeof screenedTargetPercent === 'number'
  )
    return (
      <div className="p-6">
        <OutcomesPage
          targets={{ screeningHours: screeningTargetHours, screenedPercent: screenedTargetPercent }}
        />
      </div>
    );
  if (section === 'audit')
    return (
      <div className="p-6">
        <AuditTrailPage />
      </div>
    );
  return <SpeedWindow section={section} permissions={permissions} />;
}

function SpeedWindow({
  section,
  permissions,
}: { section: string | undefined; permissions: readonly string[] }) {
  const client = useMemo(
    () => createRecordClient({ basePath: BASE_PATH, lookupBasePaths: PLATFORM_LOOKUP_BASE_PATHS }),
    [],
  );
  const clients = useMemo(() => ({ [MODULE_KEY]: client }), [client]);
  const surface = surfaceOf(section);
  const state = usePublishedManifest({
    moduleKey: MODULE_KEY,
    entityKey: surface,
    surfaceKey: surface,
  });
  return (
    <div className="space-y-6 p-6">
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
