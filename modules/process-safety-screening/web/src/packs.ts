import {
  ImportSpeedCriteriaSetInputV1Schema,
  ImportSpeedLibrarySetInputV1Schema,
} from '@gigalibs/contracts';
import starterCriteria from './packs/speed-criteria-brd-0.1.json';
import starterLibrary from './packs/speed-library-starter-0.1.json';
import type { SpeedPackBody } from './speed-api.js';

// WI-OI-120ce: the packs an administrator can import from the Criteria and Library pages. The starter packs are the
// BRD's own criteria (SPEED-BRD-FRD-001 v0.1 §15, each value cited) and the design-review prototype's starter library,
// every entry unreviewed: SPEED marks every result and dossier "library not reviewed" until the process safety
// specialist reviews it (BRD 16.2, FR-HAZ-05). Nothing is imported unless an administrator chooses to.

export type PackKind = 'criteria' | 'library';

export interface StarterPack {
  readonly key: string;
  readonly kind: PackKind;
  readonly body: SpeedPackBody;
}

const schemas = {
  criteria: ImportSpeedCriteriaSetInputV1Schema.omit({ requestKey: true }),
  library: ImportSpeedLibrarySetInputV1Schema.omit({ requestKey: true }),
} as const;

/** A pack as the import takes it, or the first reason it is not one. */
export function parsePack(
  kind: PackKind,
  value: unknown,
): { ok: true; body: SpeedPackBody } | { ok: false; detail: string } {
  const parsed = schemas[kind].safeParse(value);
  if (parsed.success) return { ok: true, body: parsed.data };
  const issue = parsed.error.issues[0];
  return {
    ok: false,
    detail: issue ? `${issue.path.join('.') || '(file)'}: ${issue.message}` : 'invalid',
  };
}

/** A pack file's text, parsed and checked. */
export function parsePackFile(
  kind: PackKind,
  text: string,
): { ok: true; body: SpeedPackBody } | { ok: false; detail: string } {
  try {
    return parsePack(kind, JSON.parse(text));
  } catch {
    return { ok: false, detail: 'not JSON' };
  }
}

function starter(key: string, kind: PackKind, value: unknown): StarterPack {
  const parsed = parsePack(kind, value);
  if (!parsed.ok) throw new Error(`Starter pack ${key} is invalid: ${parsed.detail}`);
  return { key, kind, body: parsed.body };
}

export const STARTER_PACKS: readonly StarterPack[] = [
  starter('speed-criteria-brd-0.1', 'criteria', starterCriteria),
  starter('speed-library-starter-0.1', 'library', starterLibrary),
];

/** What a pack holds, for its preview. */
export function packCounts(kind: PackKind, body: SpeedPackBody): Record<string, number> {
  if (kind === 'criteria' && 'citations' in body)
    return { values: Object.keys(body.citations).length };
  if (kind === 'library' && 'library' in body)
    return {
      materials: body.library.materials.length,
      rules: body.library.rules.length,
      classes: body.library.reactionClasses.length,
      groups: body.library.energeticGroups.length,
      gases: Object.keys(body.library.gases).length,
    };
  return {};
}
