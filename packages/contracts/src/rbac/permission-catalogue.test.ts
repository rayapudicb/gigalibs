import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleDefaultRoles } from '../modules/roles.generated.js';
import { CreateCustomRoleSchema, UpdateCustomRoleSchema } from '../tenancy/index.js';
import {
  CONTROL_PLANE_PERMISSIONS,
  isCataloguedPermission,
  NOT_DELEGABLE_PERMISSIONS,
  PERMISSION_CATALOGUE,
  uncataloguedAdditions,
} from './control-plane-permissions.js';
import { holdsPermission } from './permission-match.js';

// WI-OI-120q (R1): the permission catalogue the role editor lists and the role schema enforces.
const root = resolve(__dirname, '../../../..');

describe('PERMISSION_CATALOGUE', () => {
  it('covers every permission the platform and its modules check', async () => {
    // @ts-expect-error -- a plain ES module shared with scripts/module-manifests.mjs
    const scan = await import('../../../../scripts/lib/permission-scan.mjs');
    const directories: string[] = [...scan.platformSourceDirectories(root)];
    // The modules the generator reads: a folder with a manifest, except communications-textfly (vitest.config.ts).
    for (const name of readdirSync(join(root, 'modules')))
      if (name !== 'communications-textfly' && existsSync(join(root, 'modules', name, 'module.yaml')))
        directories.push(...scan.moduleSourceDirectories(root, name));
    const checked: Map<string, Set<string>> = scan.scanPermissionCodes(directories);
    expect(checked.size).toBeGreaterThan(200);
    const notDelegable = new Set(Object.keys(NOT_DELEGABLE_PERMISSIONS));
    const missing = [...checked.keys()].filter((code) => !isCataloguedPermission(code) && !notDelegable.has(code.replace(/\./g, ':')));
    expect(missing).toEqual([]);
    for (const code of ['analytics:export', 'esign:sign', 'connections:sync', 'finance:journals:approve', 'workforce.bookings.override', 'configuration:unmask-sensitive', 'inventory:items:manage'])
      expect(isCataloguedPermission(code)).toBe(true);
  });

  it('covers every permission a module role grants', () => {
    const missing = moduleDefaultRoles.flatMap((role) => role.permissions).filter((code) => !isCataloguedPermission(code));
    expect(missing).toEqual([]);
  });

  it('lists each permission once, whatever its spelling, and never a platform permission', () => {
    const canonical = PERMISSION_CATALOGUE.map((entry) => entry.code.replace(/\./g, ':'));
    expect(new Set(canonical).size).toBe(canonical.length);
    expect(PERMISSION_CATALOGUE.some((entry) => entry.family === 'platform')).toBe(false);
    expect(CONTROL_PLANE_PERMISSIONS.every((code) => isCataloguedPermission(code))).toBe(true);
  });

  it('accepts catalogued codes in either spelling and catalogued family wildcards only', () => {
    expect(isCataloguedPermission('users:read')).toBe(true);
    expect(isCataloguedPermission('cmms.work-orders.read')).toBe(true);
    expect(isCataloguedPermission('cmms:work-orders:read')).toBe(true);
    expect(isCataloguedPermission('parties:identifiers.manage')).toBe(true);
    expect(isCataloguedPermission('cmms:*')).toBe(true);
    expect(isCataloguedPermission('runs:cancel')).toBe(false); // offered by the old editor, checked nowhere
    expect(isCataloguedPermission('contracts:update')).toBe(false);
    expect(isCataloguedPermission('made-up:*')).toBe(false);
    expect(isCataloguedPermission('*')).toBe(false);
    expect(isCataloguedPermission('all')).toBe(false);
  });

  it('a family wildcard in the catalogue covers that family only', () => {
    expect(holdsPermission(['cmms:*'], 'cmms.work-orders.read')).toBe(true);
    expect(holdsPermission(['cmms:*'], 'workforce.time.punch')).toBe(false);
  });
});

describe('custom role permissions', () => {
  it('refuses a permission no screen or service checks', () => {
    const result = CreateCustomRoleSchema.safeParse({ name: 'Night shift', permissions: ['users:read', 'runs:cancel'] });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('No screen or service checks this permission');
  });

  it('lets an existing role keep what it holds, and refuses only additions nothing checks', () => {
    const update = UpdateCustomRoleSchema.safeParse({ expectedUpdatedAt: '2026-10-06T00:00:00.000Z', reason: 'rename', permissions: ['users:read', 'runs:cancel'] });
    expect(update.success).toBe(true);
    expect(uncataloguedAdditions(['users:read', 'runs:cancel'], ['users:read', 'runs:cancel'])).toEqual([]);
    expect(uncataloguedAdditions(['users:read'], ['users:read', 'runs:cancel'])).toEqual(['runs:cancel']);
    expect(uncataloguedAdditions(['runs.cancel'], ['runs:cancel'])).toEqual([]); // the same code in the other spelling
    expect(uncataloguedAdditions([], ['cmms.work-orders.read', 'cmms:*'])).toEqual([]);
  });

  it('never offers or accepts a permission that is not delegable, even on a role that held it', () => {
    expect(PERMISSION_CATALOGUE.some((entry) => entry.code.replace(/\./g, ':') === 'workforce:resources:link')).toBe(false);
    expect(isCataloguedPermission('workforce.resources.link')).toBe(false);
    expect(CreateCustomRoleSchema.safeParse({ name: 'Supervisor', permissions: ['workforce.resources.link'] }).success).toBe(false);
    expect(uncataloguedAdditions(['workforce.resources.link'], ['workforce.resources.link'])).toEqual(['workforce.resources.link']);
    expect(uncataloguedAdditions([], ['workforce:*'])).toEqual([]); // the whole area, as administrators hold it
  });

  it('offers every code in a spelling a role can store', () => {
    for (const entry of PERMISSION_CATALOGUE)
      expect(CreateCustomRoleSchema.safeParse({ name: 'Probe', permissions: [entry.code] }).success, entry.code).toBe(true);
  });

  it('accepts module and control-plane permissions', () => {
    const result = CreateCustomRoleSchema.safeParse({
      name: 'Maintenance lead',
      permissions: ['users:read', 'cmms.work-orders.write', 'workforce.timesheets.approve', 'finance:journals:post'],
    });
    expect(result.success).toBe(true);
  });
});
