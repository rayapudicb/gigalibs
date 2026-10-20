/** Shared types for the SPEED Stage 1 engines (WI-OI-120br). Units are part of every field name. */

export type ElementSymbol = string;

/** Element counts of one formula, for example { C: 7, H: 5, F: 1, O: 1 }. */
export type ElementCounts = Readonly<Record<ElementSymbol, number>>;

export interface ElementData {
  /** Atomic weight, g/mol. */
  readonly weight: number;
  /** Metals make oxygen balance not applicable (BRD FR-OB-02). */
  readonly metal: boolean;
  /** Halogens are counted as HX in the oxygen balance (BRD §15). */
  readonly halogen: boolean;
}

/** A versioned, cited element table. Every result records the version it used. */
export interface ElementTable {
  readonly version: string;
  readonly citation: string;
  readonly elements: Readonly<Record<ElementSymbol, ElementData>>;
}

export type MaterialRole =
  | 'Reactant'
  | 'Additive'
  | 'Solvent'
  | 'Work-up'
  | 'Product'
  | 'By-product';

/** A material as the user enters it on a step. */
export interface MaterialInput {
  readonly id: string;
  readonly role: MaterialRole;
  readonly formula: string;
  /** Stoichiometric coefficient; required for reactants, the product and by-products. */
  readonly coefficient?: number | null;
  /** Charged or isolated mass, g. */
  readonly massG?: number | null;
  /** Link to a library material, for the interaction screener. */
  readonly libraryMaterialId?: string | null;
  /** Energetic groups tagged on this material (manual in R1). */
  readonly energeticGroups?: readonly string[];
}

/** A coded message: the UI translates `code`; `requirement` is the BRD ID it enforces. */
export interface EngineMessage {
  readonly code: string;
  readonly requirement: string;
  readonly params?: Readonly<Record<string, string | number | readonly string[]>>;
}

/** Returned instead of a number whenever a criterion or a library value the calculation needs is missing. */
export interface DataGap {
  readonly status: 'DATA_GAP';
  readonly missing: readonly string[];
}
