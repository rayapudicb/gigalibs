import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { CmmsPrincipal } from './authorization.js';
import {
  type CmmsPlaceNode,
  type CmmsPlaceTree,
  expandPlaceRoots,
} from './place-projection.js';
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

const samplePlaceTree: CmmsPlaceTree = {
  versionId: 'place-v1',
  places: new Map<string, CmmsPlaceNode>([
    ['site-alpha', { id: 'site-alpha', parentId: null, nodeTypeCode: 'SITE', name: 'Alpha Industrial Complex', path: 'alpha' }],
    ['bldg-1', { id: 'bldg-1', parentId: 'site-alpha', nodeTypeCode: 'BUILDING', name: 'Main Processing Plant', path: 'alpha.b1' }],
    ['floor-1', { id: 'floor-1', parentId: 'bldg-1', nodeTypeCode: 'FLOOR', name: 'Ground Floor', path: 'alpha.b1.f1' }],
    ['room-101', { id: 'room-101', parentId: 'floor-1', nodeTypeCode: 'ROOM', name: 'Control Room 101', path: 'alpha.b1.f1.r101' }],
    ['room-102', { id: 'room-102', parentId: 'floor-1', nodeTypeCode: 'ROOM', name: 'Turbine Hall', path: 'alpha.b1.f1.r102' }],
    ['bldg-2', { id: 'bldg-2', parentId: 'site-alpha', nodeTypeCode: 'BUILDING', name: 'Warehouse Alpha', path: 'alpha.b2' }],
    ['zone-w1', { id: 'zone-w1', parentId: 'bldg-2', nodeTypeCode: 'ZONE', name: 'Staging Bay A', path: 'alpha.b2.z1' }],
    ['site-beta', { id: 'site-beta', parentId: null, nodeTypeCode: 'SITE', name: 'Beta Distribution Center', path: 'beta' }],
    ['bldg-b1', { id: 'bldg-b1', parentId: 'site-beta', nodeTypeCode: 'BUILDING', name: 'Dock Terminal', path: 'beta.b1' }],
  ]),
};

describe('WI-OI-120ad: T3 Canonical Place Identity & CMMS Place Projection Proof', () => {
  describe('expandPlaceRoots', () => {
    it('expands a root site to include all descendant buildings, floors, rooms, and zones', () => {
      const expanded = expandPlaceRoots(samplePlaceTree, ['site-alpha']);
      expect(expanded.sort()).toEqual([
        'bldg-1',
        'bldg-2',
        'floor-1',
        'room-101',
        'room-102',
        'site-alpha',
        'zone-w1',
      ].sort());
    });

    it('expands a specific building to include only its floors and rooms', () => {
      const expanded = expandPlaceRoots(samplePlaceTree, ['bldg-1']);
      expect(expanded.sort()).toEqual(['bldg-1', 'floor-1', 'room-101', 'room-102'].sort());
    });

    it('returns only the leaf node when starting at a room or zone', () => {
      const expanded = expandPlaceRoots(samplePlaceTree, ['room-101']);
      expect(expanded).toEqual(['room-101']);
    });

    it('handles multiple disjoint site roots cleanly', () => {
      const expanded = expandPlaceRoots(samplePlaceTree, ['bldg-2', 'site-beta']);
      expect(expanded.sort()).toEqual(['bldg-2', 'bldg-b1', 'site-beta', 'zone-w1'].sort());
    });

    it('returns empty array when place root does not exist in the hierarchy', () => {
      const expanded = expandPlaceRoots(samplePlaceTree, ['site-non-existent']);
      expect(expanded).toEqual([]);
    });
  });

  describe('scopePredicates with Place Projection', () => {
    it('emits no site_ref predicate when place scope is unbounded (ALL)', () => {
      const principal: CmmsPrincipal = { ...basePrincipal, placeScope: { mode: 'ALL' } };
      const values: unknown[] = [];
      const predicates = scopePredicates(principal, values, 'w.', undefined, samplePlaceTree);
      expect(predicates).toEqual([]);
      expect(values).toEqual([]);
    });

    it('expands place scope root and binds site_ref = ANY parameter with all descendants', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        placeScope: { mode: 'PLACES', placeIds: ['bldg-1'] },
      };
      const values: unknown[] = [];
      const predicates = scopePredicates(principal, values, 'w.', undefined, samplePlaceTree);

      expect(predicates).toEqual(['w.site_ref = ANY($1::uuid[])']);
      expect(values.length).toBe(1);
      const boundIds = values[0] as string[];
      expect(boundIds.sort()).toEqual(['bldg-1', 'floor-1', 'room-101', 'room-102'].sort());
    });

    it('returns FALSE when place scope contains no matching nodes in the hierarchy', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        placeScope: { mode: 'PLACES', placeIds: ['unknown-site'] },
      };
      const values: unknown[] = [];
      const predicates = scopePredicates(principal, values, 'w.', undefined, samplePlaceTree);
      expect(predicates).toEqual(['FALSE']);
      expect(values).toEqual([]);
    });

    it('falls back to exact place IDs when placeTree is not provided', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        placeScope: { mode: 'PLACES', placeIds: ['site-alpha'] },
      };
      const values: unknown[] = [];
      const predicates = scopePredicates(principal, values, 'w.');
      expect(predicates).toEqual(['w.site_ref = ANY($1::uuid[])']);
      expect(values).toEqual([['site-alpha']]);
    });
  });

  describe('assertWritableScope with Place Projection', () => {
    it('allows writes to any site or null site when place scope is unbounded (ALL)', () => {
      const principal: CmmsPrincipal = { ...basePrincipal, placeScope: { mode: 'ALL' } };
      expect(() =>
        assertWritableScope(principal, { departmentId: null, siteRef: null }, undefined, samplePlaceTree),
      ).not.toThrow();
      expect(() =>
        assertWritableScope(principal, { departmentId: null, siteRef: 'site-alpha' }, undefined, samplePlaceTree),
      ).not.toThrow();
    });

    it('allows writes to parent site and all its descendants when scoped to the site', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        placeScope: { mode: 'PLACES', placeIds: ['site-alpha'] },
      };

      // Writing to root site
      expect(() =>
        assertWritableScope(principal, { departmentId: null, siteRef: 'site-alpha' }, undefined, samplePlaceTree),
      ).not.toThrow();

      // Writing to child building
      expect(() =>
        assertWritableScope(principal, { departmentId: null, siteRef: 'bldg-1' }, undefined, samplePlaceTree),
      ).not.toThrow();

      // Writing to grandchild floor
      expect(() =>
        assertWritableScope(principal, { departmentId: null, siteRef: 'floor-1' }, undefined, samplePlaceTree),
      ).not.toThrow();

      // Writing to great-grandchild room
      expect(() =>
        assertWritableScope(principal, { departmentId: null, siteRef: 'room-101' }, undefined, samplePlaceTree),
      ).not.toThrow();
    });

    it('refuses writes to a disjoint site or its descendants with 403 CMMS_OUT_OF_SCOPE', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        placeScope: { mode: 'PLACES', placeIds: ['site-alpha'] },
      };

      // Disjoint site-beta
      expect(() =>
        assertWritableScope(principal, { departmentId: null, siteRef: 'site-beta' }, undefined, samplePlaceTree),
      ).toThrow(ForbiddenException);

      // Descendant of site-beta
      expect(() =>
        assertWritableScope(principal, { departmentId: null, siteRef: 'bldg-b1' }, undefined, samplePlaceTree),
      ).toThrow(ForbiddenException);
    });

    it('refuses writes with null siteRef when place scope is active (fail-closed)', () => {
      const principal: CmmsPrincipal = {
        ...basePrincipal,
        placeScope: { mode: 'PLACES', placeIds: ['site-alpha'] },
      };

      expect(() =>
        assertWritableScope(principal, { departmentId: null, siteRef: null }, undefined, samplePlaceTree),
      ).toThrow(ForbiddenException);
    });
  });
});
