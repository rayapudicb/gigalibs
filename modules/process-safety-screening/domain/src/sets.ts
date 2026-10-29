import type { SpeedCriteriaSetV1, SpeedLibrarySetV1 } from '@gigalibs/contracts';
import type { ScreeningCriteria, ScreeningLibrary } from '@gigalibs/process-safety-engines';

// WI-OI-120by/120ca: the stored criteria and library sets as the engines read them, the same conversion everywhere
// (the server's screening, the browser preview and the dossier).

export function engineCriteria(set: SpeedCriteriaSetV1): ScreeningCriteria {
  return { version: set.versionLabel, ...set.criteria };
}

/** A material's note is the library's own text; the engines carry its key (the entry id) and the screens look it up. */
export function engineLibrary(set: SpeedLibrarySetV1): ScreeningLibrary {
  const library = set.library;
  return {
    version: set.versionLabel,
    materials: library.materials.map((entry) => ({
      id: entry.id,
      classes: entry.classes,
      ...(entry.note ? { noteKey: entry.id } : {}),
      citation: entry.citation,
      reviewed: entry.reviewed,
    })),
    rules: library.rules.map((entry) => ({
      id: entry.id,
      classA: entry.classA,
      classB: entry.classB,
      severity: entry.severity,
      citation: entry.citation,
      reviewed: entry.reviewed,
      ...(entry.recommendedTest ? { recommendedTest: entry.recommendedTest } : {}),
    })),
    reactionClasses: library.reactionClasses.map((entry) => ({
      id: entry.id,
      typicalReactionEnthalpyKJPerMol: entry.typicalReactionEnthalpyKJPerMol,
      citation: entry.citation,
      reviewed: entry.reviewed,
    })),
    formationEnthalpies: Object.fromEntries(
      Object.entries(library.formationEnthalpies).map(([hill, entry]) => [
        hill,
        {
          kJPerMol: entry.kJPerMol,
          phase: entry.phase,
          citation: entry.citation,
          reviewed: entry.reviewed,
        },
      ]),
    ),
    gases: Object.fromEntries(
      Object.entries(library.gases).map(([hill, entry]) => [
        hill,
        { id: entry.id, citation: entry.citation, reviewed: entry.reviewed },
      ]),
    ),
  };
}
