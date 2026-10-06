import { describe, expect, it } from 'vitest';
import { canonicalPermission, holdsPermission, permissionMatches, permissionParts } from './permission-match.js';

// WI-OI-120q (R1): the one permission rule, case by case.
describe('permissionMatches', () => {
  const allowed: Array<[string, string]> = [
    ['*', 'finance:journals:post'],
    ['*', 'cmms.work-orders.read'],
    ['*', '*'],
    ['finance:journals:post', 'finance:journals:post'],
    ['cmms.work-orders.read', 'cmms.work-orders.read'],
    // both spellings of the same parts are the same permission
    ['cmms:work-orders:read', 'cmms.work-orders.read'],
    ['cmms.work-orders.read', 'cmms:work-orders:read'],
    ['parties:identifiers.manage', 'parties:identifiers:manage'],
    // the family wildcard covers every code of its family, in either spelling
    ['cmms:*', 'cmms.work-orders.read'],
    ['cmms:*', 'cmms:read'],
    ['cmms.*', 'cmms.assets.write'],
    ['organization:*', 'organization.units.read'],
    ['analytics:*', 'analytics:connectors:write'],
    ['cmms:*', 'cmms:*'],
  ];
  it.each(allowed)('%s covers %s', (granted, required) => {
    expect(permissionMatches(granted, required)).toBe(true);
  });

  const refused: Array<[unknown, unknown]> = [
    ['cmms:*', 'cmmsx.read'],
    ['cmms:*', 'cmmsx:read'],
    ['cmms.work-orders:*', 'cmms.work-orders.read'],
    ['cmms.work-orders', 'cmms.work-orders.read'], // a shorter grant never covers a longer code
    ['finance:journals', 'finance:journals:post'],
    ['finance:journals:post', 'finance:journals:approve'],
    ['finance:journals:post', 'finance:journals'],
    ['all', 'finance:read'],
    ['*:read', 'finance:read'],
    ['*:*', 'finance:read'],
    ['fin', 'finance:read'],
    ['finance:rea', 'finance:read'],
    ['finance:read', '*'],
    ['cmms:*', '*'],
    ['', 'finance:read'],
    ['finance:read', ''],
    ['finance:read', undefined],
    [undefined, 'finance:read'],
    [null, 'finance:read'],
    ['*', ''],
    ['*', 'all'],
    ['*', 'Finance:read'],
    ['Finance:read', 'Finance:read'],
    ['finance::read', 'finance::read'],
    ['finance:read:', 'finance:read:'],
    ['a:b:c:d:e', 'a:b:c:d:e'],
    ['finance:*:read', 'finance:journals:read'],
    [' finance:read', 'finance:read'],
  ];
  it.each(refused)('%s does not cover %s', (granted, required) => {
    expect(permissionMatches(granted, required)).toBe(false);
  });
});

describe('holdsPermission', () => {
  it('is true when any grant covers the code', () => {
    expect(holdsPermission(['users:read', 'cmms:*'], 'cmms.assets.read')).toBe(true);
    expect(holdsPermission(['users:read'], 'cmms.assets.read')).toBe(false);
  });

  it('refuses empty or missing grant lists', () => {
    expect(holdsPermission([], 'users:read')).toBe(false);
    expect(holdsPermission(undefined, 'users:read')).toBe(false);
    expect(holdsPermission(null, 'users:read')).toBe(false);
  });
});

describe('permissionParts and canonicalPermission', () => {
  it('splits either spelling into the same parts', () => {
    expect(permissionParts('cmms.work-orders.read')).toEqual(['cmms', 'work-orders', 'read']);
    expect(canonicalPermission('cmms.work-orders.read')).toBe('cmms:work-orders:read');
    expect(canonicalPermission('cmms.*')).toBe('cmms:*');
    expect(canonicalPermission('*')).toBe('*');
  });

  it('refuses malformed codes', () => {
    for (const code of ['finance', 'finance:', ':read', 'a:b:c:d:e', 'finance:*:read', '*:read', 'Finance:read', 7]) {
      expect(permissionParts(code)).toBeNull();
    }
  });
});
