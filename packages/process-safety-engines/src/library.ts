/**
 * The screening library: versioned, cited reference data that the engines read but never contain. Entries carry
 * `reviewed`; any result that uses an unreviewed entry says so (BRD 16.2, FR-HAZ-05).
 */

export type InteractionSeverity = 'High' | 'Medium' | 'Low';

export interface LibraryMaterial {
  readonly id: string;
  /** Reactivity classes, for example "oxidiser", "base", "dmso". */
  readonly classes: readonly string[];
  /** Key of a single-material note; the text lives in the library, not in the engine. */
  readonly noteKey?: string;
  readonly citation: string;
  readonly reviewed: boolean;
}

export interface InteractionRule {
  readonly id: string;
  readonly classA: string;
  readonly classB: string;
  readonly severity: InteractionSeverity;
  readonly citation: string;
  readonly reviewed: boolean;
}

export interface ReactionClass {
  readonly id: string;
  /** Typical ΔHr, kJ/mol of reaction as written. Always an estimate. */
  readonly typicalReactionEnthalpyKJPerMol: number;
  readonly citation: string;
  readonly reviewed: boolean;
}

export interface FormationEnthalpy {
  /** ΔHf°, kJ/mol, for the phase in `phase`. */
  readonly kJPerMol: number;
  readonly phase: string;
  readonly citation: string;
  readonly reviewed: boolean;
}

export interface GasEntry {
  readonly id: string;
  readonly citation: string;
  readonly reviewed: boolean;
}

export interface ScreeningLibrary {
  readonly version: string;
  readonly materials: readonly LibraryMaterial[];
  readonly rules: readonly InteractionRule[];
  readonly reactionClasses: readonly ReactionClass[];
  /** Keyed by Hill formula. */
  readonly formationEnthalpies: Readonly<Record<string, FormationEnthalpy>>;
  /** Species treated as evolved gas when they are by-products, keyed by Hill formula. */
  readonly gases: Readonly<Record<string, GasEntry>>;
}
