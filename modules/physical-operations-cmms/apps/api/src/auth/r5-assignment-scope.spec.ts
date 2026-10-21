/** WI-OI-120bu (F1): unit-scoped role assignments scope CMMS reads per permission. */
import { type PlatformContextSubject, buildPlatformContext } from '@gigalibs/auth-core';
import { describe, expect, it } from 'vitest';
import { principalFromContext } from './authorization.js';
import { scopePredicates } from './scope.js';

const north = { kind: 'UNITS' as const, tree_version: 'version-7', unit_ids: ['north'] };

function cmmsPrincipal(assignments: PlatformContextSubject['assignments']) {
  const permissions = [...new Set((assignments ?? []).flatMap((a) => a.permissions))];
  const subject: PlatformContextSubject = {
    user: { id: 'tech-north' },
    tenant: { id: 'tenant-1', entitlements: [{ moduleKey: 'asset-maintenance', status: 'ENABLED', version: 'v1' }] },
    roles: ['MEMBER'],
    platformRoles: [],
    permissions,
    authVersion: 1,
    session: { id: 'session-1' },
    orgScope: { mode: 'SCOPED_DEPARTMENTS', departmentIds: [] },
    spatialScope: { mode: 'UNBOUNDED' },
    organizationScope: { mode: 'DENIED' },
    ...(assignments ? { assignments } : {}),
  };
  return principalFromContext(buildPlatformContext(subject, 'asset-maintenance', 'gigalibs-cmms-api'));
}

describe('CMMS assignment scope (WI-OI-120bu)', () => {
  it('lists work orders in a unit-scoped assignment without an access grant', () => {
    const principal = cmmsPrincipal([
      { permissions: ['cmms:read'], scope: { kind: 'MEMBER' } },
      { permissions: ['cmms.work-orders.read', 'cmms.work-orders.execute-own'], scope: north },
    ]);
    const values: unknown[] = ['tenant-1'];
    const predicates = scopePredicates(principal, values, 'w.', undefined, undefined, {
      permission: 'cmms.work-orders.read',
    });
    expect(predicates).toEqual(['(w.department_id IS NULL OR w.department_id = ANY($2::text[]))']);
    expect(values[1]).toEqual(['north']);
  });

  it('returns FALSE when the permission is not granted in any assignment', () => {
    const principal = cmmsPrincipal([{ permissions: ['cmms.parts.read'], scope: north }]);
    const values: unknown[] = ['tenant-1'];
    expect(
      scopePredicates(principal, values, 'w.', undefined, undefined, { permission: 'cmms.work-orders.read' }),
    ).toEqual(['FALSE']);
  });
});
