import { describe, expect, it } from 'vitest';
import { PlatformContextSpatialScopeSchema } from '../auth/platform-context.js';
import { UpdateTenantMemberSchema, UpdateTenantOrganizationSettingsSchema } from '../tenancy/index.js';
import { MAX_SPATIAL_SCOPE_PLACES, SpatialScopePlaceIdsSchema } from './index.js';

const place = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const memberChange = { expectedUpdatedAt: '2026-09-26T00:00:00.000Z', reason: 'Scope realignment' };

// WI-OI-063b: spatial scope is stored and signed as place ids so a move keeps the assignment.
describe('spatial scope contracts', () => {
  it('accepts up to the limit of distinct place ids, including none', () => {
    expect(SpatialScopePlaceIdsSchema.safeParse([]).success).toBe(true);
    const full = Array.from({ length: MAX_SPATIAL_SCOPE_PLACES }, (_, index) => place(index));
    expect(SpatialScopePlaceIdsSchema.safeParse(full).success).toBe(true);
    expect(SpatialScopePlaceIdsSchema.safeParse([...full, place(99)]).success).toBe(false);
  });

  it.each([[['APAC.BLR_01']], [["x') OR true --"]], [[place(1), place(1)]]])(
    'rejects paths, injection-shaped values and duplicates: %j',
    (ids) => {
      expect(SpatialScopePlaceIdsSchema.safeParse(ids).success).toBe(false);
    },
  );

  it('signs either an unbounded scope or a list of places', () => {
    expect(PlatformContextSpatialScopeSchema.safeParse({ mode: 'UNBOUNDED' }).success).toBe(true);
    expect(PlatformContextSpatialScopeSchema.safeParse({ mode: 'SCOPED_PLACES', place_ids: [place(1)] }).success).toBe(true);
    expect(PlatformContextSpatialScopeSchema.safeParse({ mode: 'SCOPED_PLACES' }).success).toBe(false);
    expect(PlatformContextSpatialScopeSchema.safeParse({ mode: 'SCOPED_PATHS', paths: ['APAC'] }).success).toBe(false);
  });

  it('lets a member update change only the spatial scope', () => {
    expect(UpdateTenantMemberSchema.safeParse({ ...memberChange, spatialScopePlaceIds: [place(1)] }).success).toBe(true);
    expect(UpdateTenantMemberSchema.safeParse({ ...memberChange, spatialScopePlaceIds: [] }).success).toBe(true);
    expect(UpdateTenantMemberSchema.safeParse(memberChange).success).toBe(false);
  });

  it('requires at least one organization setting change', () => {
    expect(UpdateTenantOrganizationSettingsSchema.safeParse({ spatialScopingEnabled: true }).success).toBe(true);
    expect(UpdateTenantOrganizationSettingsSchema.safeParse({ hierarchyEnabled: false }).success).toBe(true);
    expect(UpdateTenantOrganizationSettingsSchema.safeParse({}).success).toBe(false);
  });
});
