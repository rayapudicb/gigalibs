// UAT preview (WI-OI-120a; owner decision 2026-10-05: on the UAT instance every module is visible and nothing is
// hidden). The preview never changes a module's readiness: a PLANNED or CONTAINED module stays labelled as such, and
// testers see what each screen can and cannot be trusted for.

/** The deployment setting that turns the preview on. Only the exact value `enabled` counts. */
export const UAT_PREVIEW_SETTING = 'GIGALIBS_UAT_PREVIEW';

/**
 * Whether this server runs as the UAT instance. In the browser the setting is never present, so client components
 * receive the answer from the server layout instead of calling this.
 */
export function uatPreviewEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  return environment[UAT_PREVIEW_SETTING] === 'enabled';
}

export type UatScreenStatus =
  /** Screens show hard-coded figures that are not records in any database. */
  | 'sample-figures'
  /** The module has not been checked for UAT yet. */
  | 'not-verified';

export interface UatModuleStatus {
  readonly status: UatScreenStatus;
  /** The UAT readiness card that connects this module to real data (docs/audits/2026-10-04-production-readiness). */
  readonly card: string;
}

// Each Stage 2 card removes its module from this list when the module's screens show real data.
export const uatModuleStatus: Readonly<Record<string, UatModuleStatus>> = {
  'universal-inventory': { status: 'sample-figures', card: 'U8' },
  'universal-procurement': { status: 'sample-figures', card: 'U9' },
  'universal-orders': { status: 'sample-figures', card: 'U10' },
  'financial-operations': { status: 'sample-figures', card: 'U12–U18' },
};

/** What testers should be told about a module during UAT, or null when nothing needs saying. */
export function uatStatusFor(moduleKey: string, readiness: string): UatModuleStatus | null {
  const listed = uatModuleStatus[moduleKey];
  if (listed) return listed;
  if (readiness === 'PLANNED' || readiness === 'CONTAINED') return { status: 'not-verified', card: 'U4–U21' };
  return null;
}
