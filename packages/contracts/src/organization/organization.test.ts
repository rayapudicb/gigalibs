import { describe, expect, it } from 'vitest';
import {
  ActivateOrgHierarchyV1Schema,
  CreateOrgTreeV1Schema,
  CreateOrgUnitTypeV1Schema,
  CreateOrgUnitV1Schema,
  MAX_ORG_GRANTS_PER_MEMBER,
  OrganizationScopeV2Schema,
  OrgTypeCodeSchema,
  OrgUnitCodeSchema,
  UpdateOrgDraftEdgesV1Schema,
} from './index.js';

// WI-OI-109b (ADR-0018): the configurable hierarchy's request and runtime-scope contracts.
describe('organization hierarchy contracts', () => {
  it('lets a tenant name its own levels, as long as each can be placed somewhere', () => {
    const region = { code: 'REGION', labels: { one: 'Region', other: 'Regions' }, holdsRecords: false, allowedParentTypeCodes: ['COMPANY'] };
    expect(CreateOrgUnitTypeV1Schema.parse(region)).toMatchObject({ capabilities: [], allowAsRoot: false });
    expect(CreateOrgUnitTypeV1Schema.safeParse({ ...region, allowedParentTypeCodes: [] }).success).toBe(false);
    expect(CreateOrgUnitTypeV1Schema.safeParse({ ...region, capabilities: ['REPORTING', 'REPORTING'] }).success).toBe(false);
    expect(CreateOrgUnitTypeV1Schema.safeParse({ ...region, capabilities: ['CONSOLIDATION'] }).success).toBe(false);
    expect(CreateOrgUnitTypeV1Schema.safeParse({ ...region, parentTypeId: 'x' }).success).toBe(false);
  });

  it.each([['region'], ['1REGION'], ["X' OR 1=1"], ['A'.repeat(41)]])('refuses the type code %j', (code) => {
    expect(OrgTypeCodeSchema.safeParse(code).success).toBe(false);
  });

  it.each([['-store'], ['store 101'], ['a'.repeat(65)]])('refuses the unit code %j', (code) => {
    expect(OrgUnitCodeSchema.safeParse(code).success).toBe(false);
  });

  it('keeps legal identity minimal and dates in order', () => {
    const unit = {
      typeCode: 'COMPANY',
      code: 'ACME-IN',
      name: 'Acme Industries India Pvt Ltd',
      effectiveFrom: '2026-10-01',
      legal: { legalName: 'Acme Industries India Private Limited', country: 'IN', functionalCurrency: 'INR' },
    };
    expect(CreateOrgUnitV1Schema.parse(unit).legal).toMatchObject({ registrationIds: [], taxIds: [] });
    expect(CreateOrgUnitV1Schema.safeParse({ ...unit, effectiveTo: '2026-10-01' }).success).toBe(false);
    expect(CreateOrgUnitV1Schema.safeParse({ ...unit, legal: { ...unit.legal, consolidationParent: 'x' } }).success).toBe(false);
    expect(CreateOrgUnitV1Schema.safeParse({ ...unit, parentUnitId: 'x' }).success).toBe(false);
  });

  it('makes the primary tree the only authority tree', () => {
    expect(CreateOrgTreeV1Schema.safeParse({ code: 'primary', name: 'Organization', kind: 'PRIMARY', purpose: 'AUTHORITY' }).success).toBe(true);
    expect(CreateOrgTreeV1Schema.safeParse({ code: 'cost', name: 'Cost centres', kind: 'ALTERNATE', purpose: 'COST' }).success).toBe(true);
    expect(CreateOrgTreeV1Schema.safeParse({ code: 'cost', name: 'Cost centres', kind: 'ALTERNATE', purpose: 'AUTHORITY' }).success).toBe(false);
    expect(CreateOrgTreeV1Schema.safeParse({ code: 'primary', name: 'Organization', kind: 'PRIMARY', purpose: 'REPORTING' }).success).toBe(false);
  });

  it('places each unit once and never under itself, and never places and removes a unit together', () => {
    const upsert = [{ unitId: 'company', parentUnitId: null }, { unitId: 'north', parentUnitId: 'company' }];
    expect(UpdateOrgDraftEdgesV1Schema.parse({ expectedVersion: 1, upsert })).toMatchObject({ remove: [] });
    expect(UpdateOrgDraftEdgesV1Schema.safeParse({ expectedVersion: 1, upsert: [...upsert, { unitId: 'north', parentUnitId: null }] }).success).toBe(false);
    expect(UpdateOrgDraftEdgesV1Schema.safeParse({ expectedVersion: 1, upsert: [{ unitId: 'north', parentUnitId: 'north' }] }).success).toBe(false);
    expect(UpdateOrgDraftEdgesV1Schema.safeParse({ expectedVersion: 1, upsert, remove: ['north'] }).success).toBe(false);
    expect(UpdateOrgDraftEdgesV1Schema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(UpdateOrgDraftEdgesV1Schema.safeParse({ expectedVersion: 1, remove: Array.from({ length: 1_001 }, (_, i) => `u${i}`) }).success).toBe(false);
  });

  it('activates with a reason and an idempotency key', () => {
    expect(ActivateOrgHierarchyV1Schema.safeParse({ versionId: 'v1', reason: 'Go live', idempotencyKey: 'activate-v1-0001' }).success).toBe(true);
    expect(ActivateOrgHierarchyV1Schema.safeParse({ versionId: 'v1', reason: 'Go live', idempotencyKey: 'short' }).success).toBe(false);
    expect(ActivateOrgHierarchyV1Schema.safeParse({ versionId: 'v1', idempotencyKey: 'activate-v1-0001' }).success).toBe(false);
  });

  it('signs roots and the tree version, never the expanded tree', () => {
    const units = { mode: 'UNITS', tree_version: 'ver-7', read_roots: ['north', 'south'], write_roots: ['north'] };
    expect(OrganizationScopeV2Schema.parse(units)).toEqual(units);
    expect(OrganizationScopeV2Schema.parse({ mode: 'TENANT' })).toEqual({ mode: 'TENANT' });
    expect(OrganizationScopeV2Schema.parse({ mode: 'DENIED' })).toEqual({ mode: 'DENIED' });
    expect(OrganizationScopeV2Schema.safeParse({ ...units, write_roots: ['east'] }).success).toBe(false);
    expect(OrganizationScopeV2Schema.safeParse({ ...units, read_roots: ['north', 'north'] }).success).toBe(false);
    expect(OrganizationScopeV2Schema.safeParse({ ...units, unit_ids: ['north', 'store-1'] }).success).toBe(false);
    expect(OrganizationScopeV2Schema.safeParse({ mode: 'UNITS', read_roots: [], write_roots: [] }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_ORG_GRANTS_PER_MEMBER + 1 }, (_, index) => `unit-${index}`);
    expect(OrganizationScopeV2Schema.safeParse({ ...units, read_roots: tooMany, write_roots: [] }).success).toBe(false);
  });
});
