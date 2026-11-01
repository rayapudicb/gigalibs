import { describe, expect, it } from 'vitest';
import { parseTenantModuleEntitlementsSnapshotV2 } from './entitlement-snapshot-v2.js';

describe('TenantModuleEntitlementsSnapshotV2', () => {
  it('requires enabledModuleKeys to match ENABLED rows', () => {
    expect(() =>
      parseTenantModuleEntitlementsSnapshotV2({
        tenantId: 'tenant-1',
        snapshotVersion: 1,
        enabledModuleKeys: ['gigaops'],
        modules: [{ catalogModuleKey: 'gigaops', status: 'DISABLED' }],
      }),
    ).toThrow();
  });

  it('accepts a consistent snapshot', () => {
    expect(
      parseTenantModuleEntitlementsSnapshotV2({
        tenantId: 'tenant-1',
        snapshotVersion: 2,
        enabledModuleKeys: ['asset-maintenance'],
        modules: [
          { catalogModuleKey: 'asset-maintenance', status: 'ENABLED' },
          { catalogModuleKey: 'gigaops', status: 'DISABLED' },
        ],
      }).snapshotVersion,
    ).toBe(2);
  });
});
