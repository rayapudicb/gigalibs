import { describe, expect, it } from 'vitest';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';

describe('Spend tenant binding and isolation', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs', () => {
    const tenantA = moduleTenantBindingId('tenant-workspace-alpha');
    const tenantB = moduleTenantBindingId('tenant-workspace-beta');
    const tenantARepeat = moduleTenantBindingId('tenant-workspace-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tenantA).not.toContain('tenant-workspace-alpha');
  });

  it('rejects invalid or empty tenant identifiers', () => {
    expect(() => moduleTenantBindingId('')).toThrow('Canonical tenant identity is invalid.');
    expect(() => moduleTenantBindingId('a'.repeat(201))).toThrow('Canonical tenant identity is invalid.');
  });
});
