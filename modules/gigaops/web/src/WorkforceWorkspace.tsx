'use client';

import {
  MetadataWindow,
  createRecordClient,
  usePublishedManifest,
} from '@gigalibs/configuration-react';
import { PLATFORM_LOOKUP_BASE_PATHS, holdsPermission } from '@gigalibs/contracts';
import { useMemo, useState } from 'react';
import { WhoIsAvailable } from './WhoIsAvailable.js';

// WI-OI-120u (M-WF1, ADR-0033 D1): Workforce screens that are metadata windows, drawn from the dictionary each workspace
// has published, over Workforce's own record dispatcher. Pickers of members and places read the platform lookups as the
// signed-in user. A section shows the windows the user may open as tabs; the server still decides every read and write.

const BASE_PATH = '/api/workforce';

type RecordClient = ReturnType<typeof createRecordClient>;

interface Tab {
  readonly key: string;
  readonly label: string;
  /** Shown to holders of this permission (the window denies by default as well). */
  readonly permission: string;
}

const SECTIONS = {
  people: {
    title: 'People',
    description:
      'People, teams and resource pools: their skills, working weeks, absences and the login each person signs in with.',
    tabs: [{ key: 'wf-resources', label: 'People', permission: 'workforce.resources.read' }],
  },
  availability: {
    title: 'Availability',
    description:
      'Absences with a decision by someone else, working weeks, absence types, site calendars and who is available.',
    tabs: [
      { key: 'wf-absences', label: 'Absence requests', permission: 'workforce.absences.read' },
      { key: 'wf-my-absences', label: 'My absences', permission: 'workforce.absences.request-own' },
      {
        key: 'wf-working-weeks',
        label: 'Working weeks',
        permission: 'workforce.availability.read',
      },
      {
        key: 'who-is-available',
        label: 'Who is available',
        permission: 'workforce.availability.read',
      },
      { key: 'wf-absence-types', label: 'Absence types', permission: 'workforce.absences.read' },
      { key: 'wf-calendars', label: 'Site calendars', permission: 'workforce.calendars.read' },
      { key: 'wf-closures', label: 'Closures', permission: 'workforce.calendars.read' },
    ],
  },
  bookings: {
    title: 'Bookings',
    description:
      'Who is booked on which work, when and where. Bookings are made and moved on Scheduling & dispatch.',
    tabs: [{ key: 'wf-bookings', label: 'Bookings', permission: 'workforce.bookings.read' }],
  },
} as const satisfies Record<string, { title: string; description: string; tabs: readonly Tab[] }>;

export interface WorkforceWorkspaceProps {
  readonly section: keyof typeof SECTIONS;
  /** The signed-in user's permissions, for the windows' deny-by-default rules (the server still decides). */
  readonly permissions?: readonly string[];
}

export function WorkforceWorkspace({ section, permissions = [] }: WorkforceWorkspaceProps) {
  const client = useMemo(
    () => createRecordClient({ basePath: BASE_PATH, lookupBasePaths: PLATFORM_LOOKUP_BASE_PATHS }),
    [],
  );
  const { title, description, tabs } = SECTIONS[section];
  const open: readonly Tab[] = tabs.filter((tab) => holdsPermission(permissions, tab.permission));
  const [chosen, setChosen] = useState<string | null>(null);
  const current = open.find((tab) => tab.key === chosen) ?? open[0];
  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ui-fg-base">{title}</h1>
        <p className="text-sm text-ui-fg-subtle">{description}</p>
      </header>
      {open.length > 1 ? (
        <nav
          role="tablist"
          aria-label={title}
          className="flex flex-wrap gap-1 border-b border-ui-border-base"
        >
          {open.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.key === current?.key}
              className={`px-3 py-2 text-sm ${tab.key === current?.key ? 'border-b-2 border-ui-border-interactive font-medium text-ui-fg-base' : 'text-ui-fg-subtle hover:text-ui-fg-base'}`}
              onClick={() => setChosen(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      ) : null}
      {!current ? (
        <Notice
          title="No access"
          text="Your role does not include this part of Workforce. Ask an administrator if you need it."
        />
      ) : current.key === 'who-is-available' ? (
        <WhoIsAvailable />
      ) : (
        <WorkforceWindow
          key={current.key}
          surface={current.key}
          client={client}
          permissions={permissions}
        />
      )}
    </div>
  );
}

function WorkforceWindow({
  surface,
  client,
  permissions,
}: { surface: string; client: RecordClient; permissions: readonly string[] }) {
  const state = usePublishedManifest({
    moduleKey: 'gigaops',
    entityKey: surface,
    surfaceKey: surface,
  });
  if (state.status === 'loading')
    return <p className="text-sm text-ui-fg-muted">Loading the window…</p>;
  if (state.status !== 'ready')
    return (
      <Notice
        title={state.status === 'forbidden' ? 'No access' : 'This window is not available'}
        text={state.message}
      />
    );
  return <MetadataWindow manifest={state.manifest} client={client} permissions={permissions} />;
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
      <p className="text-sm font-medium text-ui-fg-error">{title}</p>
      <p className="mt-1 text-sm text-ui-fg-subtle">{text}</p>
    </div>
  );
}
