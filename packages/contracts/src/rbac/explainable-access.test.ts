import { describe, expect, it } from 'vitest';
import { explainAccess } from './explainable-access.js';

// WI-OI-120 (Phase 4, R12 explainable access): say why access is allowed or denied.
describe('explainAccess', () => {
  it('explains an exact grant', () => {
    const e = explainAccess(
      ['cmms:work-orders:read', 'cmms:work-orders:write'],
      'cmms.work-orders.write',
    );
    expect(e.decision).toBe('ALLOWED');
    expect(e.reason).toBe('EXACT_GRANT');
    expect(e.matchedGrant).toBe('cmms:work-orders:write');
    expect(e.requiredCode).toBe('cmms:work-orders:write'); // canonicalised
  });

  it('explains a family wildcard', () => {
    const e = explainAccess(['cmms:*'], 'cmms:work-orders:write');
    expect(e.decision).toBe('ALLOWED');
    expect(e.reason).toBe('FAMILY_WILDCARD');
    expect(e.matchedGrant).toBe('cmms:*');
    expect(e.message).toContain('cmms:*');
  });

  it('explains the all-permissions grant', () => {
    const e = explainAccess(['*'], 'finance:journals:post');
    expect(e.decision).toBe('ALLOWED');
    expect(e.reason).toBe('WILDCARD_ALL');
  });

  it('explains a denial when nothing covers the requirement', () => {
    const e = explainAccess(['cmms:work-orders:read'], 'cmms:work-orders:write');
    expect(e.decision).toBe('DENIED');
    expect(e.reason).toBe('NOT_GRANTED');
    expect(e.matchedGrant).toBeUndefined();
    expect(e.message).toContain('cmms:work-orders:write');
  });

  it('rejects a malformed requirement', () => {
    const e = explainAccess(['*'], 'not a code');
    expect(e.decision).toBe('DENIED');
    expect(e.reason).toBe('MALFORMED_REQUIREMENT');
  });

  it('reports the first covering grant when several would match', () => {
    const e = explainAccess(['orders:quotes:approve', 'orders:*'], 'orders:quotes:approve');
    expect(e.matchedGrant).toBe('orders:quotes:approve'); // exact one comes first
    expect(e.reason).toBe('EXACT_GRANT');
  });
});
