import { describe, expect, it } from 'vitest';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';

describe('Autonomous Recovery tenant binding and isolation boundary', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for recovery schema', () => {
    const tenantA = moduleTenantBindingId('recovery-workspace-alpha');
    const tenantB = moduleTenantBindingId('recovery-workspace-beta');
    const tenantARepeat = moduleTenantBindingId('recovery-workspace-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tenantA).not.toContain('recovery-workspace-alpha');
  });

  it('rejects cross-tenant identity injection or invalid tenant bounds', () => {
    expect(() => moduleTenantBindingId('')).toThrow('Canonical tenant identity is invalid.');
    expect(() => moduleTenantBindingId('a'.repeat(201))).toThrow('Canonical tenant identity is invalid.');
  });
});
