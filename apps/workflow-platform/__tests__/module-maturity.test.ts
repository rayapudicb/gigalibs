/**
 * WI-OI-102e — catalogue truth (vision §5): every entry states its maturity, and nothing is advertised as available
 * unless it is certified.
 */
import { platformModuleCatalog } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { advertisableMaturity, moduleMaturityLabel } from '../lib/module-maturity';

describe('catalogue truth', () => {
  it('gives every entry a known maturity', () => {
    for (const entry of platformModuleCatalog) {
      expect(moduleMaturityLabel[entry.maturity], entry.key).toBeTypeOf('string');
    }
  });

  it('advertises an entry as available only when it is certified', () => {
    const overclaimed = platformModuleCatalog.filter(
      (entry) => entry.readiness === 'AVAILABLE' && !advertisableMaturity.includes(entry.maturity),
    );
    expect(overclaimed.map((entry) => entry.key)).toEqual([]);
  });
});
