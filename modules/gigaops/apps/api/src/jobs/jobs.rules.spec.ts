/**
 * WI-OI-065 — job profile, position and engagement contract rules enforced before any SQL. Effective dating,
 * overlap refusal and scope are certified live by verify-workforce-jobs.sh.
 */
import {
  CreateEngagementV1Schema,
  CreateJobProfileV1Schema,
  CreatePositionV1Schema,
  EndEngagementV1Schema,
  UpdatePositionV1Schema,
  WorkforceDateSchema,
} from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';

const capability = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';

describe('Workforce job rules', () => {
  it('accepts only real calendar dates', () => {
    expect(WorkforceDateSchema.safeParse('2026-10-01').success).toBe(true);
    expect(WorkforceDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(WorkforceDateSchema.safeParse('2026-10-01T00:00:00Z').success).toBe(false);
  });

  it('normalises profile codes, lists each capability once and rejects unknown fields', () => {
    const parsed = CreateJobProfileV1Schema.parse({
      code: 'line-tech-2',
      effectiveFrom: '2026-10-01',
      title: 'Line technician',
      workerCategory: 'EMPLOYEE',
      requiredCapabilities: [{ capabilityDefinitionId: capability }],
    });
    expect(parsed.code).toBe('LINE-TECH-2');
    expect(parsed.requiredCapabilities[0]!.minimumProficiency).toBe('STANDARD');
    expect(
      CreateJobProfileV1Schema.safeParse({
        code: 'X', effectiveFrom: '2026-10-01', title: 'x', workerCategory: 'EMPLOYEE',
        requiredCapabilities: [{ capabilityDefinitionId: capability }, { capabilityDefinitionId: capability }],
      }).success,
    ).toBe(false);
    expect(CreateJobProfileV1Schema.safeParse({ code: 'X', effectiveFrom: '2026-10-01', title: 'x', workerCategory: 'CREW' }).success).toBe(false);
    expect(CreateJobProfileV1Schema.safeParse({ code: 'X', effectiveFrom: '2026-10-01', title: 'x', workerCategory: 'EMPLOYEE', payRate: 20 }).success).toBe(false);
  });

  it('keeps windows ordered and FTE within one', () => {
    const base = { code: 'P-1', jobProfileId: capability, effectiveFrom: '2026-10-01' };
    expect(CreatePositionV1Schema.safeParse({ ...base, effectiveTo: '2026-09-30' }).success).toBe(false);
    expect(CreatePositionV1Schema.safeParse({ ...base, fte: 1.5 }).success).toBe(false);
    expect(CreatePositionV1Schema.parse(base).fte).toBe(1);
    expect(UpdatePositionV1Schema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    const engagement = { resourceId: capability, positionId: capability, engagementType: 'EMPLOYEE', startDate: '2026-10-01' };
    expect(CreateEngagementV1Schema.safeParse({ ...engagement, endDate: '2026-10-01' }).success).toBe(false);
    expect(EndEngagementV1Schema.safeParse({ expectedVersion: 1, endDate: '2026-11-01' }).success).toBe(false);
  });
});
