/**
 * WI-OI-067 — booking rules enforced before or around SQL: qualification gaps by proficiency, the lifecycle table
 * and request contracts. Headcount, availability and overlap under concurrency are certified live by
 * verify-workforce-bookings.sh.
 */
import { BOOKING_TRANSITIONS, ChangeBookingStatusV1Schema, CreateBookingV1Schema, CreateWorkRequirementV1Schema } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { qualificationGaps } from './bookings.service.js';

const electrical = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const hydraulics = '0b9c7d1e-2f3a-4b5c-8d6e-7f8091a2b3c4';

describe('booking rules', () => {
  it('requires every capability at or above the minimum proficiency', () => {
    const required = [
      { capabilityDefinitionId: electrical, minimumProficiency: 'ADVANCED' as const },
      { capabilityDefinitionId: hydraulics, minimumProficiency: 'STANDARD' as const },
    ];
    expect(qualificationGaps(required, [{ capabilityDefinitionId: electrical, proficiency: 'EXPERT' }, { capabilityDefinitionId: hydraulics, proficiency: 'STANDARD' }])).toEqual([]);
    expect(qualificationGaps(required, [{ capabilityDefinitionId: electrical, proficiency: 'STANDARD' }, { capabilityDefinitionId: hydraulics, proficiency: 'MASTER' }])).toEqual([electrical]);
    expect(qualificationGaps(required, [])).toEqual([electrical, hydraulics]);
    expect(qualificationGaps([], [])).toEqual([]);
  });

  it('moves bookings forward only, with COMPLETED and CANCELLED terminal and no cancel once on site', () => {
    expect(BOOKING_TRANSITIONS.DRAFT).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(BOOKING_TRANSITIONS.ON_SITE).toEqual(['COMPLETED']);
    expect(BOOKING_TRANSITIONS.COMPLETED).toEqual([]);
    expect(BOOKING_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('validates requirements, bookings and status changes', () => {
    const base = { requestKey: electrical, title: 'Pump overhaul', startsAt: '2026-10-05T08:00:00Z', endsAt: '2026-10-05T16:00:00Z' };
    expect(CreateWorkRequirementV1Schema.parse(base)).toMatchObject({ sourceType: 'MANUAL', headcount: 1 });
    expect(CreateWorkRequirementV1Schema.safeParse({ ...base, sourceRef: 'x' }).success).toBe(false);
    expect(CreateWorkRequirementV1Schema.safeParse({ ...base, sourceType: 'CMMS_WORK_ORDER' }).success).toBe(false);
    expect(CreateWorkRequirementV1Schema.safeParse({ ...base, endsAt: '2026-11-20T00:00:00Z' }).success).toBe(false);
    expect(CreateBookingV1Schema.safeParse({ requestKey: electrical, requirementId: electrical, resourceId: electrical, startsAt: '2026-10-05T08:00:00Z' }).success).toBe(false);
    expect(ChangeBookingStatusV1Schema.safeParse({ expectedVersion: 1, status: 'CANCELLED' }).success).toBe(false);
    expect(ChangeBookingStatusV1Schema.safeParse({ expectedVersion: 1, status: 'DRAFT' }).success).toBe(false);
  });
});
