import { describe, expect, it } from 'vitest';
import { arTenantBindingId } from '../lib/ar-tenant-binding';

describe('AR tenant binding', () => {
  it('maps one opaque canonical tenant to one stable UUID without exposing the source ID', () => {
    const first = arTenantBindingId('canonical-tenant-01');
    expect(first).toBe(arTenantBindingId('canonical-tenant-01'));
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first).not.toContain('canonical-tenant-01');
  });

  it('does not merge distinct canonical tenants', () => {
    expect(arTenantBindingId('canonical-tenant-01')).not.toBe(
      arTenantBindingId('canonical-tenant-02'),
    );
  });

  it('rejects missing and unbounded tenant identifiers', () => {
    expect(() => arTenantBindingId('')).toThrow('Canonical tenant identity is invalid.');
    expect(() => arTenantBindingId('x'.repeat(201))).toThrow(
      'Canonical tenant identity is invalid.',
    );
  });
});
