import { describe, expect, it } from 'vitest';
import { InvestigationV1InputSchema, ReportHazardV1Schema, hazardRisk } from './safety.js';

// WI-OI-141 M-INC: report shape, risk banding, investigation bounds.
describe('frontline safety contracts (WI-OI-141)', () => {
  it('bands likelihood × consequence', () => {
    expect(hazardRisk(1, 4)).toEqual({ score: 4, band: 'LOW' });
    expect(hazardRisk(2, 3)).toEqual({ score: 6, band: 'MEDIUM' });
    expect(hazardRisk(3, 4)).toEqual({ score: 12, band: 'HIGH' });
    expect(hazardRisk(5, 4)).toEqual({ score: 20, band: 'EXTREME' });
  });

  it('needs a description and an area, and a type with a photo', () => {
    const base = { clientOperationId: '10000000-0000-4000-8000-000000000001', severity: 'STOP_WORK', category: 'LEAK_SPILL',
      description: 'Oil on the ladder rung', area: 'Catwalk B2', observedAt: '2026-11-02T06:00:00.000Z' };
    expect(ReportHazardV1Schema.safeParse(base).success).toBe(true);
    expect(ReportHazardV1Schema.safeParse({ ...base, area: ' ' }).success).toBe(false);
    expect(ReportHazardV1Schema.safeParse({ ...base, photoBase64: 'A'.repeat(40) }).success).toBe(false);
  });

  it('takes one to five whys', () => {
    const base = { expectedVersion: 0, rootCause: 'Seal not on the PM list' };
    expect(InvestigationV1InputSchema.safeParse({ ...base, whys: [] }).success).toBe(false);
    expect(InvestigationV1InputSchema.safeParse({ ...base, whys: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false);
    expect(InvestigationV1InputSchema.parse({ ...base, whys: ['Leak'] })).toMatchObject({ contributingFactors: [], complete: false });
  });
});
