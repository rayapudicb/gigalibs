import type { InteractionSeverity, ScreeningLibrary } from './library.js';
import type { MaterialInput } from './types.js';

const SEVERITY_RANK: Readonly<Record<InteractionSeverity, number>> = { High: 3, Medium: 2, Low: 1 };

export interface InteractionFinding {
  readonly materialAId: string;
  readonly materialBId: string;
  readonly ruleId: string;
  readonly severity: InteractionSeverity;
  readonly citation: string;
  readonly reviewed: boolean;
  /** From the rule, when the library names a Stage 2 test for it. */
  readonly recommendedTest?: string;
}

export interface MaterialNote {
  readonly materialId: string;
  readonly noteKey: string;
  readonly citation: string;
}

export interface InteractionResult {
  readonly status: 'OK';
  readonly findings: readonly InteractionFinding[];
  readonly notes: readonly MaterialNote[];
  /** Materials with no library entry: the screener cannot say anything about them (shown as such, never as safe). */
  readonly unclassifiedMaterialIds: readonly string[];
  readonly usesUnreviewedLibrary: boolean;
  readonly libraryVersion: string;
}

/**
 * The binary interaction screener (FR-HAZ-01 to 06; BP-01 2.3). For every pair of materials in a step, the most severe
 * library rule whose two classes match. The rules and classes are library data; the engine only matches them.
 */
export function screenInteractions(
  materials: readonly MaterialInput[],
  library: ScreeningLibrary,
): InteractionResult {
  const linked = materials.map((material) => ({
    material,
    entry: material.libraryMaterialId
      ? library.materials.find((m) => m.id === material.libraryMaterialId)
      : undefined,
  }));
  let unreviewed = false;
  const findings: InteractionFinding[] = [];
  for (let i = 0; i < linked.length; i += 1) {
    for (let j = i + 1; j < linked.length; j += 1) {
      const a = linked[i];
      const b = linked[j];
      if (!a?.entry || !b?.entry) continue;
      const classesA = a.entry.classes;
      const classesB = b.entry.classes;
      let best: (typeof library.rules)[number] | undefined;
      for (const rule of library.rules) {
        const hit =
          (classesA.includes(rule.classA) && classesB.includes(rule.classB)) ||
          (classesA.includes(rule.classB) && classesB.includes(rule.classA));
        if (hit && (!best || SEVERITY_RANK[rule.severity] > SEVERITY_RANK[best.severity]))
          best = rule;
      }
      if (!best) continue;
      unreviewed ||= !best.reviewed || !a.entry.reviewed || !b.entry.reviewed;
      findings.push({
        materialAId: a.material.id,
        materialBId: b.material.id,
        ruleId: best.id,
        severity: best.severity,
        citation: best.citation,
        reviewed: best.reviewed,
        ...(best.recommendedTest ? { recommendedTest: best.recommendedTest } : {}),
      });
    }
  }
  const notes: MaterialNote[] = [];
  for (const { material, entry } of linked) {
    if (entry?.noteKey) {
      unreviewed ||= !entry.reviewed;
      notes.push({ materialId: material.id, noteKey: entry.noteKey, citation: entry.citation });
    }
  }
  return {
    status: 'OK',
    findings,
    notes,
    unclassifiedMaterialIds: linked.filter((l) => !l.entry).map((l) => l.material.id),
    usesUnreviewedLibrary: unreviewed,
    libraryVersion: library.version,
  };
}
