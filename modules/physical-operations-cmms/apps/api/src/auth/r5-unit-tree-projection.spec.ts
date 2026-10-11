import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { CmmsPrincipal } from './authorization.js';
import {
  type CmmsOrganizationTree,
  type CmmsUnitNode,
  expandUnitRoots,
  verifyOrganizationVersion,
} from './organization-projection.js';
import { assertWritableScope, scopePredicates } from './scope.js';

const basePrincipal = {
  tenantId: 'tenant-a',
  subject: 'worker-1',
  sessionId: 'sess-1',
  authVersion: 1,
  permissions: ['cmms:read', 'cmms.work-orders.write', 'cmms.assets.write'],
  roles: ['cmms-technician'],
  persona: 'WORKFORCE_MEMBER',
  departmentScope: { mode: 'ALL' as const },
  placeScope: { mode: 'ALL' as const },
};

const sampleTree: CmmsOrganizationTree = {
  versionId: 'tree-v1',
  units: new Map<string, CmmsUnitNode>([
    ['corp', { id: 'corp', parentId: null, name: 'Corporate' }],
    ['plant-north', { id: 'plant-north', parentId: 'corp', name: 'North Plant' }],
    ['line-1', { id: 'line-1', parentId: 'plant-north', name: 'Assembly Line 1' }],
    ['line-2', { id: 'line-2', parentId: 'plant-north', name: 'Packaging Line 2' }],
    ['plant-south', { id: 'plant-south', parentId: 'corp', name: 'South Plant' }],
    ['line-3', { id: 'line-3', parentId: 'plant-south', name: 'Line 3' }],
  ]),
};

describe('WI-OI-120ac: CMMS Organization Unit-Tree Projection & Access Boundaries', () => {
  describe('expandUnitRoots', () => {
    it('expands an ancestor unit to include all descendants in the hierarchy', () => {
      const expanded = expandUnitRoots(sampleTree, ['plant-north']);
      expect(expanded.sort()).toEqual(['line-1', 'line-2', 'plant-north'].sort());
    });

    it('expands root corporate unit to include the entire organization tree', () => {
      const expanded = expandUnitRoots(sampleTree, ['corp']);
      expect(expanded.sort()).toEqual(['corp', 'line-1', 'line-2', 'line-3', 'plant-north', 'plant-south'].sort());
    });

    it('returns only the leaf node when starting at a leaf unit', () => {
      const expanded = expandUnitRoots(sampleTree, ['line-1']);
      expect(expanded).toEqual(['line-1']);
    });

    it('handles multiple disjoint roots correctly', () => {
      const expanded = expandUnitRoots(sampleTree, ['line-1', 'line-3']);
      expect(expanded.sort()).toEqual(['line-1', 'line-3'].sort());
    });

    it('ignores unknown or non-existent unit roots', () => {
      const expanded = expandUnitRoots(sampleTree, ['non-existent-dept']);
      expect(expanded).toEqual([]);
    });
  });

  describe('verifyOrganizationVersion', () => {
    it('passes when unit scope tree_version matches the module active version', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        organization: {
          mode: 'UNITS',
          tree_version: 'tree-v1',
          read_roots: ['plant-north'],
          write_roots: ['line-1'],
        },
      };
      expect(() => verifyOrganizationVersion(principal, 'tree-v1')).not.toThrow();
    });

    it('throws ServiceUnavailableException 503 when unit scope tree version is mismatched or pending', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        organization: {
          mode: 'UNITS',
          tree_version: 'tree-v2',
          read_roots: ['plant-north'],
          write_roots: ['line-1'],
        },
      };
      expect(() => verifyOrganizationVersion(principal, 'tree-v1')).toThrow(ServiceUnavailableException);
      expect(() => verifyOrganizationVersion(principal, null)).toThrow(ServiceUnavailableException);
    });

    it('throws ForbiddenException 403 when organization scope is explicitly DENIED', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        organization: { mode: 'DENIED' },
      };
      expect(() => verifyOrganizationVersion(principal, 'tree-v1')).toThrow(ForbiddenException);
    });

    it('verifies tree version when tenant-wide authority specifies an expected version', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        organization: { mode: 'TENANT', tree_version: 'tree-v1' },
      };
      expect(() => verifyOrganizationVersion(principal, 'tree-v1')).not.toThrow();
      expect(() => verifyOrganizationVersion(principal, 'tree-v0')).toThrow(ServiceUnavailableException);
    });
  });

  describe('scopePredicates with organization units', () => {
    it('returns FALSE for DENIED organization scope, preventing any data exposure', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        organization: { mode: 'DENIED' },
      };
      const values: unknown[] = ['tenant-a'];
      expect(scopePredicates(principal, values, 'a.')).toEqual(['FALSE']);
      expect(values).toEqual(['tenant-a']);
    });

    it('expands read roots and generates department predicate including descendants', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        organization: {
          mode: 'UNITS',
          tree_version: 'tree-v1',
          read_roots: ['plant-north'],
          write_roots: ['line-1'],
        },
      };
      const values: unknown[] = ['tenant-a'];
      const predicates = scopePredicates(principal, values, 'wo.', sampleTree);
      expect(predicates).toEqual(['(wo.department_id IS NULL OR wo.department_id = ANY($2::text[]))']);
      expect(values[1]).toEqual(expect.arrayContaining(['plant-north', 'line-1', 'line-2']));
    });

    it('fails closed (FALSE) when expanded read units set is empty', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        organization: {
          mode: 'UNITS',
          tree_version: 'tree-v1',
          read_roots: [],
          write_roots: [],
        },
      };
      const values: unknown[] = ['tenant-a'];
      expect(scopePredicates(principal, values, 'wo.', sampleTree)).toEqual(['FALSE']);
    });
  });

  describe('assertWritableScope with organization units', () => {
    const principal: CmmsPrincipal = {
      ...basePrincipal,
      organization: {
        mode: 'UNITS',
        tree_version: 'tree-v1',
        read_roots: ['plant-north'],
        write_roots: ['plant-north'],
      },
    };

    it('allows writes to an authorized unit root or its descendants', () => {
      expect(() =>
        assertWritableScope(principal, { departmentId: 'plant-north', siteRef: null }, sampleTree),
      ).not.toThrow();
      expect(() =>
        assertWritableScope(principal, { departmentId: 'line-1', siteRef: null }, sampleTree),
      ).not.toThrow();
      expect(() =>
        assertWritableScope(principal, { departmentId: 'line-2', siteRef: null }, sampleTree),
      ).not.toThrow();
    });

    it('refuses writes to out-of-scope sibling departments (403 CMMS_OUT_OF_SCOPE)', () => {
      expect(() =>
        assertWritableScope(principal, { departmentId: 'plant-south', siteRef: null }, sampleTree),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertWritableScope(principal, { departmentId: 'line-3', siteRef: null }, sampleTree),
      ).toThrow(ForbiddenException);
    });

    it('refuses tenant-shared writes (departmentId null) for unit-scoped callers', () => {
      expect(() =>
        assertWritableScope(principal, { departmentId: null, siteRef: null }, sampleTree),
      ).toThrow(ForbiddenException);
    });

    it('refuses any mutation if organization scope is DENIED', () => {
      const deniedPrincipal: CmmsPrincipal = {
        ...basePrincipal,
        organization: { mode: 'DENIED' },
      };
      expect(() =>
        assertWritableScope(deniedPrincipal, { departmentId: 'line-1', siteRef: null }, sampleTree),
      ).toThrow(ForbiddenException);
    });
  });
});
