import type { SpeedLibraryPackV1 } from '@gigalibs/contracts';
import { missingCriteria } from '@gigalibs/process-safety-engines';
import { BRD_CRITERIA } from '../../../../../../packages/process-safety-engines/test/fixtures/criteria.js';
import { PROTOTYPE_LIBRARY } from '../../../../../../packages/process-safety-engines/test/fixtures/library.js';

// WI-OI-120by/120bz: TEST FIXTURE data for SPEED's PostgreSQL proofs, built from the engine package's own fixtures (the
// BRD criteria and the design prototype's library). Every citation says it is a fixture; nothing here is product data.

export const FIXTURE = 'TEST FIXTURE: SPEED-BRD-FRD-001 v0.1 and the design prototype';

const { version: _version, ...values } = BRD_CRITERIA;
/** The BRD criteria values, without the fixture's version label. */
export const BRD_VALUES = values;
/** A citation for each of the criteria's values. */
export const CRITERIA_CITATIONS = Object.fromEntries(
  missingCriteria({})
    .filter((path) => path !== 'version')
    .map((path) => [path, FIXTURE]),
);

/** The prototype library as a pack, every entry cited; notes as text; two energetic groups for the tagging tests. */
export const PROTOTYPE_PACK: SpeedLibraryPackV1 = {
  materials: PROTOTYPE_LIBRARY.materials.map((entry) => ({
    id: entry.id,
    classes: [...entry.classes],
    ...(entry.noteKey ? { note: `TEST FIXTURE note ${entry.noteKey}` } : {}),
    citation: entry.citation,
  })),
  rules: PROTOTYPE_LIBRARY.rules.map((entry) => ({
    id: entry.id,
    classA: entry.classA,
    classB: entry.classB,
    severity: entry.severity,
    finding: `TEST FIXTURE finding ${entry.id}`,
    ...(entry.severity === 'High' ? { control: `TEST FIXTURE control ${entry.id}` } : {}),
    citation: entry.citation,
    ...(entry.recommendedTest ? { recommendedTest: entry.recommendedTest } : {}),
  })),
  reactionClasses: PROTOTYPE_LIBRARY.reactionClasses.map((entry) => ({
    id: entry.id,
    typicalReactionEnthalpyKJPerMol: entry.typicalReactionEnthalpyKJPerMol,
    citation: entry.citation,
  })),
  formationEnthalpies: Object.fromEntries(
    Object.entries(PROTOTYPE_LIBRARY.formationEnthalpies).map(([hill, entry]) => [
      hill,
      { kJPerMol: entry.kJPerMol, phase: entry.phase, citation: entry.citation },
    ]),
  ),
  gases: Object.fromEntries(
    Object.entries(PROTOTYPE_LIBRARY.gases).map(([hill, entry]) => [
      hill,
      { id: entry.id, citation: entry.citation },
    ]),
  ),
  energeticGroups: [
    { id: 'peroxide', citation: FIXTURE },
    { id: 'azide', citation: FIXTURE },
  ],
};
