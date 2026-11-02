'use client';

import { ModulePage } from '@gigalibs/web-sdk';
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
import { SetsPage } from './SetsPage.js';
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

// WI-OI-145: each SPEED screen has the shared page header, named as its sidebar entry.
const SCREENS: Readonly<Record<string, { readonly title: string; readonly description: string }>> = {
  projects: { title: 'Projects', description: 'Process development projects and the sites they belong to.' },
  routes: { title: 'Routes', description: 'Synthesis routes, their steps and how each step screens.' },
  substances: { title: 'Substances', description: 'The materials your routes use and their hazard data.' },
  library: { title: 'Screening library', description: 'The thermal and interaction data screening uses, and which version is in force.' },
  criteria: { title: 'Screening criteria', description: 'The limits a step must meet to pass, and which version is in force.' },
  outcomes: { title: 'Outcomes', description: 'How fast routes are screened and how many pass.' },
  audit: { title: 'Audit trail', description: 'Every change to projects, routes and screening results.' },
};

/** The Outcomes page (a module page, screen spec §3.4) or the window of a section. */
export function SpeedWorkspace(props: SpeedWorkspaceProps = {}) {
  const screen = SCREENS[props.section ?? 'projects'] ?? SCREENS.projects!;
  return (
    <ModulePage title={screen.title} description={screen.description}>
      <SpeedScreen {...props} />
    </ModulePage>
  );
}

function SpeedScreen({
  section,
  permissions = [],
  screeningTargetHours,
  screenedTargetPercent,
}: SpeedWorkspaceProps) {
  if (
    section === 'outcomes' &&
    typeof screeningTargetHours === 'number' &&
    typeof screenedTargetPercent === 'number'
  )
    return (
      <OutcomesPage
        targets={{ screeningHours: screeningTargetHours, screenedPercent: screenedTargetPercent }}
      />
    );
  if (section === 'audit') return <AuditTrailPage />;
  // WI-OI-120ce: the Library and Criteria pages show the set in force and the pack import above every version.
  if (section === 'library' || section === 'criteria')
    return (
      <SetsPage kind={section} permissions={permissions}>
        {(refresh, changed) => (
          <SpeedWindow
            section={section}
            permissions={permissions}
            refresh={refresh}
            onChanged={changed}
          />
        )}
      </SetsPage>
    );
  return <SpeedWindow section={section} permissions={permissions} />;
}

function SpeedWindow({
  section,
  permissions,
  refresh = 0,
  onChanged,
}: {
  section: string | undefined;
  permissions: readonly string[];
  /** A new value reloads the window's list (after an import on the page). */
  refresh?: number;
  onChanged?: () => void;
}) {
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
    <div className="space-y-6">
      {state.status === 'loading' ? (
        <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />
      ) : state.status === 'ready' ? (
        <MetadataWindow
          key={`${surface}-${refresh}`}
          manifest={state.manifest}
          client={client}
          clients={clients}
          permissions={permissions}
          panels={PANELS}
          {...(onChanged ? { onChanged } : {})}
        />
      ) : (
        <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
          <p className="text-sm text-ui-fg-error">{state.message}</p>
        </div>
      )}
    </div>
  );
}
