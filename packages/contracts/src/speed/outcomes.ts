// WI-OI-120cc (SPEED S9b; screen spec §3.4; BRD BO-1 to BO-5): the business outcomes, computed by the module from its
// own records within the sites the member reads. R1 measures time to screen from a route's creation to its first
// dossier (submission is R2); a route counts as screened once it has a generated dossier.

export interface SpeedOutcomesV1 {
  /** Routes the member reads, archived ones aside. */
  readonly routes: number;
  /** BO-1: hazards found before the first experiment, from each step's latest result. */
  readonly hazards: {
    readonly highInteractions: number;
    readonly mediumInteractions: number;
    /** Steps whose worst Stoessel class (actual or full accumulation) is 3 or worse. */
    readonly class3OrWorseSteps: number;
    readonly gasFormingSteps: number;
  };
  /** BO-2: median minutes from a route's creation to its first dossier, over the routes that have one. */
  readonly screening: { readonly medianMinutes: number | null; readonly routesMeasured: number };
  /** BO-3: routes with a generated dossier, of all routes. */
  readonly screened: { readonly screened: number; readonly routes: number };
  /** BO-4: routes whose latest dossier shows a route PMI and atom economy, of the routes with a dossier. */
  readonly economy: { readonly withEconomy: number; readonly withDossier: number };
  /** The worst Stoessel class in the portfolio, or null before any thermal result. */
  readonly worstClass: number | null;
}
