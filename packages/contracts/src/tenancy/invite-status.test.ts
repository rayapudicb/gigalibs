/** WI-OI-120p slice 5 (R14, join tracker): the derived invite status. */
import { describe, expect, it } from 'vitest';
import { inviteStatus } from './index.js';

const now = new Date('2026-10-25T12:00:00Z');
const future = new Date('2026-10-28T12:00:00Z');
const past = new Date('2026-10-24T12:00:00Z');

describe('inviteStatus', () => {
  it('is PENDING while open and unexpired', () => {
    expect(inviteStatus({ acceptedAt: null, revokedAt: null, expiresAt: future }, now)).toBe('PENDING');
  });

  it('is EXPIRED once past expiry and never accepted or revoked', () => {
    expect(inviteStatus({ acceptedAt: null, revokedAt: null, expiresAt: past }, now)).toBe('EXPIRED');
  });

  it('is REVOKED when explicitly revoked, even if not yet expired', () => {
    expect(inviteStatus({ acceptedAt: null, revokedAt: past, expiresAt: future }, now)).toBe('REVOKED');
  });

  it('is ACCEPTED once accepted, and acceptance outranks a later expiry or revoke', () => {
    expect(inviteStatus({ acceptedAt: past, revokedAt: null, expiresAt: future }, now)).toBe('ACCEPTED');
    expect(inviteStatus({ acceptedAt: past, revokedAt: past, expiresAt: past }, now)).toBe('ACCEPTED');
  });
});
