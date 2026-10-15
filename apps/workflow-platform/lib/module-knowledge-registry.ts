/**
 * The help shown in each page's "Knowledge Hub" drawer.
 *
 * WI-OI-120ak (S6, owner decision D7a): help is built from the module catalogue, not written by hand. A module's entry
 * gives its catalogue name and area, the catalogue's own status line (`reason`, which says what runs and what does not),
 * its pages from the generated menu, and the rule the access check enforces for it. Nothing else is claimed. The 27
 * hand-written entries this file used to hold made claims nothing checked ("immutable audit trail", "data isolation
 * enforced at the database layer", "biometric punches", "AES-256-GCM", internal ports and schemas).
 *
 * Two pages keep a hand-written entry because each sentence in it was checked against the code: Time & attendance
 * (WI-OI-120an, against the Workforce API) and Connectors (WI-OI-120ak S3). A page outside every module gets an entry
 * that claims nothing.
 */
import { platformModuleCatalog } from '@gigalibs/contracts';
import { generatedModuleMenus } from './generated/module-navigation';

export interface ModuleKnowledgeEntry {
  category: string;
  businessTitle: string;
  summary: string;
  /** What a person can do, or the pages they can open. */
  actions: string[];
  /** Rules the system enforces. */
  guardrails: string[];
  /** Limits a person should know about (not guarantees). */
  limitations: string[];
}

const VERIFIED: Record<string, ModuleKnowledgeEntry> = {
  // WI-OI-120an: describes the real Time & attendance screen and only what the Workforce API enforces
  // (modules/gigaops/apps/api/src/time/time.service.ts).
  '/gigaops/time': {
    category: 'Workforce Operations',
    businessTitle: 'Time & Attendance',
    summary:
      'Clock in and out at a site, review and submit the weekly timesheet, approve the weeks of others, and resolve time exceptions.',
    actions: [
      "Clock in, take breaks and clock out; when you pick a site and share your location, the punch is checked against that site's boundary",
      'Review the week built from your punches and submit it for approval',
      'Approve or return the submitted weeks of others (if your role may approve timesheets)',
      'Resolve time exceptions, void a wrong punch or add a missed one, with a reason (if your role may manage time)',
    ],
    guardrails: [
      'Flagged for a manager: punches outside the chosen site, at a site that could not be checked, at a site with no location shared, sent late, or after the week was submitted',
      'A punch made offline is kept on this device and sent later with its original time; a resend never records twice',
      'Another manager decides, corrects or resolves your own time; nobody approves a week they submitted or their own',
      'An approved week cannot change, and corrections are refused for punches dated in a submitted or approved week',
      'Corrections are added, never overwritten, and each carries a reason code and a note',
    ],
    limitations: [
      "Location and time come from the device's browser and are not tamper-proof",
      'Not checked: punches with no site, and punches at a site with no boundary drawn',
    ],
  },
  // WI-OI-120ak (S3): the page says connecting to outside services is not available yet.
  '/connectors': {
    category: 'Studio & Orchestration',
    businessTitle: 'Connectors',
    summary:
      'Connecting to outside services is planned in the Connector Hub and not available yet. Webhooks and scheduled pulls are under Connections.',
    actions: ['Open Connections to receive signed webhooks or set up a scheduled pull'],
    guardrails: [],
    limitations: ['Nothing can be connected from this page'],
  },
};

const READINESS_NOTE: Record<string, string | null> = {
  AVAILABLE: null,
  REVIEW: 'This module is in review.',
  PLANNED: 'This module is not released; it opens on the UAT instance only, for testing.',
  CONTAINED: 'This module is not released.',
};

type CatalogueModule = (typeof platformModuleCatalog)[number];

/** The rule `canOpenPlatformModule` enforces for the module (lib/module-access.ts), in words. */
function accessRule(module: CatalogueModule): string {
  if (module.key === 'platform-control') return 'Only platform operators can open it.';
  if (module.readiness === 'CONTAINED') return 'Nobody can open it until it is released.';
  const rule = `Opening it needs the ${module.requiredPermission} permission and the module in your workspace's plan.`;
  return module.platformInspection
    ? `${rule} Platform operators can also open it inside a workspace, to inspect it.`
    : rule;
}

function titleFromPath(pathname: string): string {
  const last = pathname.split('/').filter(Boolean).at(-1) ?? 'Home';
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getKnowledgeEntry(pathname: string): ModuleKnowledgeEntry {
  const verified = VERIFIED[pathname];
  if (verified) return verified;

  // The module whose route is the most specific match for this page.
  const module = platformModuleCatalog
    .filter(
      (entry) =>
        entry.route &&
        entry.route !== '/' &&
        (pathname === entry.route || pathname.startsWith(`${entry.route}/`)),
    )
    .sort((left, right) => right.route.length - left.route.length)[0];
  if (module) {
    const note = READINESS_NOTE[module.readiness] ?? null;
    return {
      category: module.area,
      businessTitle: module.name,
      summary: module.reason,
      actions: (generatedModuleMenus[module.key] ?? []).map(
        (item) => `${item.label} (${item.path})`,
      ),
      guardrails: [accessRule(module)],
      limitations: note ? [note] : [],
    };
  }

  return {
    category: 'GigaLibs',
    businessTitle: titleFromPath(pathname),
    summary: 'No help is written for this page yet.',
    actions: [],
    guardrails: [],
    limitations: [],
  };
}
