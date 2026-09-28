import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FkResolverService } from '../fk-resolver.js';
import type { EntityColumnDef } from '../types.js';

// Mock DatabaseService
const mockDb = {
  queryWithTenant: vi.fn(),
};

describe('FkResolverService', () => {
  let service: FkResolverService;

  beforeEach(() => {
    mockDb.queryWithTenant.mockReset();
    service = new FkResolverService(mockDb as never);
  });

  it('builds FK map from DB rows', async () => {
    mockDb.queryWithTenant.mockResolvedValue({
      rows: [
        { id: 'uuid-1', match_value: 'Building A' },
        { id: 'uuid-2', match_value: 'Warehouse B' },
      ],
    });

    const maps = await service.buildFkMaps('tenant-1', 'assets');
    // Assets have location_name fk-resolve column
    expect(maps['location_name']).toBeDefined();
    expect(maps['location_name']!.get('building a')).toBe('uuid-1');
    expect(maps['location_name']!.get('warehouse b')).toBe('uuid-2');
  });

  describe('resolveValue', () => {
    const fkMap = new Map([['building a', 'uuid-1']]);
    const def: EntityColumnDef = {
      key: 'location_name',
      dbColumn: 'location_id',
      kind: 'fk-resolve',
      required: false,
      description: 'Location',
      fkResolution: { table: 'locations', matchColumn: 'name', resolvedDbColumn: 'location_id', nullable: true },
    };

    it('resolves existing value', () => {
      expect(service.resolveValue(fkMap, 'Building A', def)).toBe('uuid-1');
    });

    it('returns null for empty nullable FK', () => {
      expect(service.resolveValue(fkMap, '', def)).toBeNull();
      expect(service.resolveValue(fkMap, null, def)).toBeNull();
    });

    it('returns null for unknown nullable FK', () => {
      expect(service.resolveValue(fkMap, 'Nonexistent', def)).toBeNull();
    });

    it('throws for unknown required FK', () => {
      const requiredDef: EntityColumnDef = {
        ...def,
        fkResolution: { ...def.fkResolution!, nullable: false },
      };
      expect(() => service.resolveValue(fkMap, 'Ghost', requiredDef)).toThrow();
    });
  });
});
