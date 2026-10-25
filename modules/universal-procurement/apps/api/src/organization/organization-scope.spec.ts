/** WI-OI-120p slice 9 (R14): the organization-scope decisions Procurement applies to its records. */
import type { OrganizationAccess } from '@gigalibs/module-sdk';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertWritableUnit, canReadUnit, orgReadCondition } from './organization-scope.js';

const tenantWide: OrganizationAccess = {
  readUnits: null,
  writeUnits: null,
  versionId: 'v1',
  denied: false,
};
const scopedToNorth: OrganizationAccess = {
  readUnits: ['north', 'north-a'],
  writeUnits: ['north'],
  versionId: 'v1',
  denied: false,
};
const denied: OrganizationAccess = { readUnits: [], writeUnits: [], versionId: null, denied: true };

describe('canReadUnit', () => {
  it('lets anyone through when no organization tree is in force', () => {
    expect(canReadUnit(null, 'south')).toBe(true);
  });

  it('lets tenant-wide authority read every unit, and shared (null-unit) records are readable by all', () => {
    expect(canReadUnit(tenantWide, 'south')).toBe(true);
    expect(canReadUnit(scopedToNorth, null)).toBe(true);
  });

  it('limits a scoped member to their own units and refuses a denied scope', () => {
    expect(canReadUnit(scopedToNorth, 'north')).toBe(true);
    expect(canReadUnit(scopedToNorth, 'north-a')).toBe(true);
    expect(canReadUnit(scopedToNorth, 'south')).toBe(false);
    expect(canReadUnit(denied, 'north')).toBe(false);
  });
});

describe('assertWritableUnit', () => {
  it('allows the change when no tree is in force or the member has tenant-wide write authority', () => {
    expect(() => assertWritableUnit(null, 'south')).not.toThrow();
    expect(() => assertWritableUnit(tenantWide, 'south')).not.toThrow();
  });

  it('allows a change within the member write units', () => {
    expect(() => assertWritableUnit(scopedToNorth, 'north')).not.toThrow();
  });

  it('refuses changing a unit the member cannot write (read-only or foreign), as Forbidden', () => {
    // 'north-a' is readable but not writable for this member.
    expect(() => assertWritableUnit(scopedToNorth, 'north-a')).toThrow(ForbiddenException);
    try {
      assertWritableUnit(scopedToNorth, 'south');
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'ORGANIZATION_OUT_OF_SCOPE',
      });
    }
  });

  it('refuses changing a tenant-shared record without tenant-wide authority', () => {
    try {
      assertWritableUnit(scopedToNorth, null);
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'ORGANIZATION_SHARED_NEEDS_TENANT',
      });
    }
  });
});

describe('orgReadCondition', () => {
  it('filters nothing for no-tree or tenant-wide access', () => {
    expect(orgReadCondition(null, 'org_unit_id', () => '$1')).toBe('TRUE');
    expect(orgReadCondition(tenantWide, 'org_unit_id', () => '$1')).toBe('TRUE');
  });

  it('refuses everything for a denied scope', () => {
    expect(orgReadCondition(denied, 'org_unit_id', () => '$1')).toBe('FALSE');
  });

  it('keeps the member units and shared records for a scoped member, binding the unit list once', () => {
    const bound: unknown[] = [];
    const sql = orgReadCondition(scopedToNorth, 'org_unit_id', (value) => `$${bound.push(value)}`);
    expect(sql).toBe('(org_unit_id IS NULL OR org_unit_id = ANY($1::text[]))');
    expect(bound).toEqual([['north', 'north-a']]);
  });
});
