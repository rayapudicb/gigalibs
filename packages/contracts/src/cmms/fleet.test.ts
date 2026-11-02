import { describe, expect, it } from 'vitest';
import { FleetZonesV1Schema, SubmitFleetInspectionV1Schema, fleetItemKeys, fleetReadinessState } from './fleet.js';

// WI-OI-139 M-DVIR: template and inspection shapes, and readiness.
const zones = [
  { key: 'front', title: 'Front', items: [{ key: 'forks', label: 'Forks and mast chains' }, { key: 'lights', label: 'Headlights' }] },
  { key: 'cab', title: 'Cab', items: [{ key: 'brakes', label: 'Brake pedal travel' }] },
];
const at = '2026-11-02T06:00:00.000Z';
const inspection = (results: unknown[]) => ({
  clientOperationId: '10000000-0000-4000-8000-000000000001', assetId: '10000000-0000-4000-8000-000000000002',
  templateId: '10000000-0000-4000-8000-000000000003', kind: 'PRE_TRIP', startedAt: at, submittedAt: at, certified: true, results,
});

describe('fleet contracts (WI-OI-139)', () => {
  it('keeps zone and item keys unique across a template', () => {
    expect(FleetZonesV1Schema.safeParse(zones).success).toBe(true);
    expect(fleetItemKeys(zones)).toEqual(['forks', 'lights', 'brakes']);
    expect(FleetZonesV1Schema.safeParse([...zones, { key: 'rear', title: 'Rear', items: [{ key: 'forks', label: 'x' }] }]).success).toBe(false);
  });

  it('needs a note on each defect, photos only on defects, and each item once', () => {
    expect(SubmitFleetInspectionV1Schema.safeParse(inspection([{ itemKey: 'forks', outcome: 'PASS' }])).success).toBe(true);
    expect(SubmitFleetInspectionV1Schema.safeParse(inspection([{ itemKey: 'forks', outcome: 'CRITICAL' }])).success).toBe(false);
    expect(SubmitFleetInspectionV1Schema.safeParse(inspection([{ itemKey: 'forks', outcome: 'PASS', note: 'fine' }])).success).toBe(false);
    expect(SubmitFleetInspectionV1Schema.safeParse(inspection([
      { itemKey: 'forks', outcome: 'PASS', photoContentType: 'image/png', photoBase64: 'A'.repeat(40) },
    ])).success).toBe(false);
    expect(SubmitFleetInspectionV1Schema.safeParse(inspection([{ itemKey: 'forks', outcome: 'PASS' }, { itemKey: 'forks', outcome: 'NA' }])).success).toBe(false);
  });

  it('derives readiness from the open grounding and the due time', () => {
    const now = new Date(at);
    expect(fleetReadinessState({ openGroundingStatus: 'GROUNDED', dueAt: new Date(now.getTime() + 1), now })).toBe('GROUNDED');
    expect(fleetReadinessState({ openGroundingStatus: 'REPAIRED', dueAt: null, now })).toBe('AWAITING_CLEARANCE');
    expect(fleetReadinessState({ openGroundingStatus: null, dueAt: null, now })).toBe('INSPECTION_DUE');
    expect(fleetReadinessState({ openGroundingStatus: null, dueAt: now, now })).toBe('INSPECTION_DUE');
    expect(fleetReadinessState({ openGroundingStatus: null, dueAt: new Date(now.getTime() + 60_000), now })).toBe('OPERATIONAL');
  });
});
