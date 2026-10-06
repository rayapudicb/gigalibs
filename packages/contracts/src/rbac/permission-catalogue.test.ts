import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleDefaultRoles } from '../modules/roles.generated.js';
import { CreateCustomRoleSchema } from '../tenancy/index.js';
import { CONTROL_PLANE_PERMISSIONS, isCataloguedPermission, PERMISSION_CATALOGUE } from './control-plane-permissions.js';
import { holdsPermission } from './permission-match.js';

// WI-OI-120q (R1): the permission catalogue the role editor lists and the role schema enforces.
const root = resolve(__dirname, '../../../..');

function* sources(directory: string): Generator<string> {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (!['node_modules', 'dist', 'generated'].includes(name)) yield* sources(path);
    } else if (/\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name)) yield path;
  }
}

describe('PERMISSION_CATALOGUE', () => {
  it('covers every permission a control-plane route decorator requires', () => {
    const directories = [join(root, 'apps/playground-api/src'), ...readdirSync(join(root, 'packages')).map((name) => join(root, 'packages', name, 'src'))];
    const required = new Set<string>();
    for (const directory of directories) {
      try {
        statSync(directory);
      } catch {
        continue;
      }
      for (const file of sources(directory))
        for (const match of readFileSync(file, 'utf8').matchAll(/@(?:Require)?Permissions?\(([^)]*)\)/g))
          for (const literal of match[1]!.matchAll(/'([^']+)'/g)) required.add(literal[1]!);
    }
    expect(required.size).toBeGreaterThan(50);
    const missing = [...required].filter((code) => !isCataloguedPermission(code));
    expect(missing).toEqual([]);
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

  it('accepts module and control-plane permissions', () => {
    const result = CreateCustomRoleSchema.safeParse({
      name: 'Maintenance lead',
      permissions: ['users:read', 'cmms.work-orders.write', 'workforce.timesheets.approve', 'finance:journals:post'],
    });
    expect(result.success).toBe(true);
  });
});
