import { MasterFactV1Schema } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { mapWarehouse, warehouseMasterFact } from './inventory.service.js';

// WI-OI-156 slice A (ADR-0039 §1): Inventory writes the standard master fact when a warehouse is created or changed, so
// other modules can keep a warehouse replica (id, code, name, status, version).
const row = {
  id: '3b1c2c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', tenant_id: 'tenant-a', code: 'WH-PUNE', name: 'Pune main store',
  description: null, warehouse_type: 'DISTRIBUTION', org_unit_id: null, place_id: null, address: null, active: true,
  version: 2, created_at: '2026-11-03T00:00:00.000Z', updated_at: '2026-11-03T00:00:00.000Z', created_by: 'admin',
  updated_by: 'admin',
};

describe('Inventory master facts', () => {
  it('describes a warehouse in the master fact shape', () => {
    expect(MasterFactV1Schema.parse(warehouseMasterFact(mapWarehouse(row), 'UPDATED'))).toEqual({
      entity: 'inventory.warehouses', change: 'UPDATED', id: row.id, code: 'WH-PUNE', name: 'Pune main store',
      status: 'ACTIVE', version: 2, attributes: { warehouseType: 'DISTRIBUTION', placeId: null },
    });
  });

  it('marks an inactive warehouse INACTIVE so consumers stop offering it', () => {
    expect(warehouseMasterFact(mapWarehouse({ ...row, active: false }), 'UPDATED').status).toBe('INACTIVE');
  });
});
