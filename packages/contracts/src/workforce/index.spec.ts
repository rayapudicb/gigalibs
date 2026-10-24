/** WI-OI-120hj: the person→login link must be a platform user UUID, never free text (e.g. an email). */
import { describe, expect, it } from 'vitest';
import { CreateWorkforceResourceV1Schema, UpdateWorkforceResourceV1Schema } from './index.js';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const base = { referenceCode: 'TECH-001', displayName: 'Alex Rivera', resourceType: 'HUMAN' as const };

describe('CreateWorkforceResourceV1Schema platformUserId', () => {
  it('accepts a platform user UUID', () => {
    expect(CreateWorkforceResourceV1Schema.safeParse({ ...base, platformUserId: UUID }).success).toBe(true);
  });
  it('rejects an email (the B1 stale-manifest input)', () => {
    expect(CreateWorkforceResourceV1Schema.safeParse({ ...base, platformUserId: 'tech@gigalibs.io' }).success).toBe(false);
  });
  it('rejects any non-UUID string', () => {
    expect(CreateWorkforceResourceV1Schema.safeParse({ ...base, platformUserId: 'not-a-uuid' }).success).toBe(false);
  });
  it('accepts null and omission (an unlinked person)', () => {
    expect(CreateWorkforceResourceV1Schema.safeParse({ ...base, platformUserId: null }).success).toBe(true);
    expect(CreateWorkforceResourceV1Schema.safeParse(base).success).toBe(true);
  });
});

describe('UpdateWorkforceResourceV1Schema platformUserId', () => {
  it('accepts a UUID and rejects an email', () => {
    expect(UpdateWorkforceResourceV1Schema.safeParse({ expectedVersion: 1, platformUserId: UUID }).success).toBe(true);
    expect(UpdateWorkforceResourceV1Schema.safeParse({ expectedVersion: 1, platformUserId: 'tech@gigalibs.io' }).success).toBe(false);
  });
  it('accepts null to unlink a login', () => {
    expect(UpdateWorkforceResourceV1Schema.safeParse({ expectedVersion: 1, platformUserId: null }).success).toBe(true);
  });
});
