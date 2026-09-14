import { describe, expect, it } from 'vitest';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';

describe('Currency tenant binding and isolation boundary', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for currency schema', () => {
    const tenantA = moduleTenantBindingId('currency-workspace-east');
    const tenantB = moduleTenantBindingId('currency-workspace-west');
    const tenantARepeat = moduleTenantBindingId('currency-workspace-east');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tenantA).not.toContain('currency-workspace-east');
  });

  it('rejects cross-tenant identity injection or invalid tenant bounds', () => {
    expect(() => moduleTenantBindingId('')).toThrow('Canonical tenant identity is invalid.');
    expect(() => moduleTenantBindingId('a'.repeat(201))).toThrow('Canonical tenant identity is invalid.');
  });
});
