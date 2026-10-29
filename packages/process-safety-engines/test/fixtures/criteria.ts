import type { ScreeningCriteria } from '../../src/index.js';

/**
 * TEST FIXTURE. The criteria values written in SPEED-BRD-FRD-001 v0.1 (§15, §15.1) and BP-01 §4.A (OB band), used to
 * reproduce the BRD's reference cases. The product's criteria are imported, cited data per workspace, not this file.
 */
export const BRD_CRITERIA: ScreeningCriteria = {
  version: 'test-fixture-brd-0.1',
  elementBalanceTolerance: 0.001,
  oxygenBalanceAlertBandPercent: { lowerExclusive: -160, upperExclusive: 80 },
  severityByAdiabaticRiseK: { mediumFromK: 50, highAboveK: 200 },
  probabilityByTmrHours: { lowAboveHours: 24, highBelowHours: 8 },
  td24SearchRangeC: { min: -50, max: 500 },
  td24ConservativeOnsetOffsetK: 100,
  inputRanges: {
    temperatureC: { min: -100, max: 500 },
    heatCapacityJPerGK: { block: { min: 0.5, max: 5 }, warn: { min: 1, max: 4 } },
    accumulationPercent: { min: 0, max: 100 },
    reactionEnthalpyKJPerMol: { block: { min: -3000, max: 500 }, warnBelow: -1000 },
    activationEnergyKJPerMol: { min: 20, max: 400 },
  },
};
