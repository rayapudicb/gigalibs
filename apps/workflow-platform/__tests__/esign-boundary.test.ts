import { describe, expect, it } from 'vitest';
import { moduleTenantBindingId } from '../lib/ar-tenant-binding';
import { canUseTenantModule, hasPermission } from '../lib/module-access';

describe('E-Signature tenant binding and access control', () => {
  it('maps canonical tenant IDs to deterministic isolated UUIDs for esign', () => {
    const tenantA = moduleTenantBindingId('tenant-esign-alpha');
    const tenantB = moduleTenantBindingId('tenant-esign-beta');
    const tenantARepeat = moduleTenantBindingId('tenant-esign-alpha');

    expect(tenantA).toBe(tenantARepeat);
    expect(tenantA).not.toBe(tenantB);
    expect(tenantA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(tenantA).not.toContain('tenant-esign-alpha');
  });

  it('verifies esignature module entitlement and granular permission checks', () => {
    const features = new Set(['esignature']);
    const permissions = ['esign:read', 'esign:create', 'esign:sign'];

    expect(canUseTenantModule('esignature', features, permissions)).toBe(true);
    expect(hasPermission(permissions, 'esign:read')).toBe(true);
    expect(hasPermission(permissions, 'esign:create')).toBe(true);
    expect(hasPermission(permissions, 'esign:sign')).toBe(true);
    expect(hasPermission(permissions, 'esign:*')).toBe(false);

    // With wildcard
    expect(hasPermission(['*'], 'esign:*')).toBe(true);
    expect(hasPermission(['esign:*'], 'esign:sign')).toBe(true);
  });
});
