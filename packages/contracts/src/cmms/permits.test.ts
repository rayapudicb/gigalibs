import { describe, expect, it } from 'vitest';
import { IsolationPointsV1Schema, RequestPermitV1Schema, gasWithinLimits } from './permits.js';

// WI-OI-142 M-LOTO: permit shapes and gas limits.
describe('permit contracts (WI-OI-142)', () => {
  it('flags each gas outside its safe-entry limit', () => {
    expect(gasWithinLimits({ oxygenPercent: 20.9, lelPercent: 0, coPpm: 2, h2sPpm: 0 })).toEqual({ withinLimits: true, flags: [] });
    expect(gasWithinLimits({ oxygenPercent: 19, lelPercent: 12, coPpm: 30, h2sPpm: 6 }).flags).toEqual(['OXYGEN', 'LEL', 'CO', 'H2S']);
  });

  it('bounds a permit to 12 hours and needs unique point keys', () => {
    const base = { clientOperationId: '10000000-0000-4000-8000-000000000001', type: 'LOTO', procedureId: '10000000-0000-4000-8000-000000000002',
      title: 'Replace pump seal', validFrom: '2026-11-02T06:00:00.000Z' };
    expect(RequestPermitV1Schema.safeParse({ ...base, validUntil: '2026-11-02T18:00:00.000Z' }).success).toBe(true);
    expect(RequestPermitV1Schema.safeParse({ ...base, validUntil: '2026-11-02T18:00:01.000Z' }).success).toBe(false);
    const point = { label: 'Breaker', energy: 'ELECTRICAL', isolationTag: 'mcc-04-12', method: 'Switch off and lock' };
    expect(IsolationPointsV1Schema.parse([{ key: 'breaker', ...point }])[0]!.isolationTag).toBe('MCC-04-12');
    expect(IsolationPointsV1Schema.safeParse([{ key: 'a', ...point }, { key: 'a', ...point }]).success).toBe(false);
  });
});
