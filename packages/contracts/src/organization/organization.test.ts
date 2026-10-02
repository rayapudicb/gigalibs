import { describe, expect, it } from 'vitest';
import { PlatformContextV1Schema } from '../auth/platform-context.js';
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
import { ORGANIZATION_CLIENT_MANIFEST_V1, ORGANIZATION_ROUTES } from './api.js';

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

  it('refuses a signed context whose organization claim widens writes beyond reads', () => {
    const claims = {
      iss: 'gigalibs-control-plane', aud: 'workforce-api', sub: 'user-1', tenant_id: 'tenant-1', session_id: 'session-1', auth_version: 1,
      roles: ['MEMBER'], granted_scopes: [], persona_type: 'WORKFORCE_MEMBER', org_scope: { mode: 'SCOPED_DEPARTMENTS', department_ids: [] },
      entitlement: { module_key: 'gigaops', status: 'ENABLED', version: 'v1' }, iat: 1, exp: 2, jti: 'jti-1',
    };
    expect(PlatformContextV1Schema.safeParse({ ...claims, organization: { mode: 'UNITS', tree_version: 'v7', read_roots: ['north'], write_roots: ['north'] } }).success).toBe(true);
    expect(PlatformContextV1Schema.safeParse({ ...claims, organization: { mode: 'UNITS', tree_version: 'v7', read_roots: ['north'], write_roots: ['south'] } }).success).toBe(false);
    expect(PlatformContextV1Schema.safeParse(claims).success).toBe(true);
  });

  it('publishes server-authoritative phone and tablet capabilities without client-side authority', () => {
    expect(ORGANIZATION_CLIENT_MANIFEST_V1).toMatchObject({
      schemaVersion: 1,
      scopeClaim: 'PlatformContextV1.organization',
      ownership: { primaryField: 'organizationUnitId', legacyAlias: 'departmentId', tenantSharedMarker: 'tenantShared' },
      authority: {
        serverAuthoritative: true,
        primaryTreeOnlyGrantsAccess: true,
        placeLinksGrantAccess: false,
        offlineMutationsAllowed: false,
        clientsMayNarrowScopeOnly: true,
      },
    });
    const knownOperations = new Set(ORGANIZATION_ROUTES.map((route) => route.operationId));
    const advertisedOperations = ORGANIZATION_CLIENT_MANIFEST_V1.capabilities.map((capability) => capability.operationId);
    expect(new Set(advertisedOperations)).toEqual(knownOperations);
    expect(new Set(advertisedOperations).size).toBe(advertisedOperations.length);
    for (const surface of ORGANIZATION_CLIENT_MANIFEST_V1.surfaces) {
      expect(surface.operationIds.every((operationId) => knownOperations.has(operationId))).toBe(true);
    }
    for (const form of ORGANIZATION_CLIENT_MANIFEST_V1.forms) {
      expect(knownOperations.has(form.createOperationId)).toBe(true);
      if (form.updateOperationId) expect(knownOperations.has(form.updateOperationId)).toBe(true);
    }
  });
});
