import type { PlatformModuleMaturity } from '@gigalibs/contracts';

/**
 * The product vision's maturity states (§5), as users read them (ADR-0016, WI-OI-102e). Readiness decides whether a
 * screen can be opened; maturity tells users how much evidence stands behind it.
 */
export const moduleMaturityLabel: Readonly<Record<PlatformModuleMaturity, string>> = {
  CONCEPT: 'Concept',
  UI_PROTOTYPE: 'UI prototype',
  CORE_IMPLEMENTED: 'Core implemented',
  INTEGRATED_CANDIDATE: 'Integrated candidate',
  CERTIFIED: 'Certified',
  PRODUCTION_PROVEN: 'Production proven',
};

export const moduleMaturityColor: Readonly<
  Record<PlatformModuleMaturity, 'grey' | 'orange' | 'purple' | 'blue' | 'green'>
> = {
  CONCEPT: 'grey',
  UI_PROTOTYPE: 'orange',
  CORE_IMPLEMENTED: 'purple',
  INTEGRATED_CANDIDATE: 'blue',
  CERTIFIED: 'green',
  PRODUCTION_PROVEN: 'green',
};

/** Only certified entries may be advertised as available (vision §5). */
export const advertisableMaturity: readonly PlatformModuleMaturity[] = ['CERTIFIED', 'PRODUCTION_PROVEN'];
