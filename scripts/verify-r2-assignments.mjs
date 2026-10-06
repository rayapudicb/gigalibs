// WI-OI-120w (R2 slice 1): the reconciliation report for the move to role assignments. Read-only. For every tenant
// member it compares the roles and permissions the session gave before (the single `customRoleId`) with what it gives
// now (live role assignments at the member's own scope). Any difference fails: the move must change no one's access.
//   DATABASE_URL=postgresql://... node scripts/verify-r2-assignments.mjs
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// `pg` from the workspace store, as the other proof scripts load it.
const root = resolve(import.meta.dirname, '..');
const pgDirectory = readdirSync(join(root, 'node_modules/.pnpm')).find((name) => /^pg@\d/.test(name));
const { default: pg } = await import(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg/lib/index.js'));

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required (read-only use).');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const { rows } = await client.query(`
    SELECT m."tenantId", m."userId", m."customRoleId",
           before_role.name AS before_name, before_role.permissions AS before_permissions,
           COALESCE((SELECT json_agg(json_build_object('name', r.name, 'permissions', r.permissions) ORDER BY a."createdAt")
                       FROM member_role_assignments a JOIN custom_roles r ON r.id = a."customRoleId"
                      WHERE a."tenantId" = m."tenantId" AND a."userId" = m."userId" AND a."revokedAt" IS NULL AND a.scope = 'MEMBER'),
                    '[]'::json) AS after_roles,
           (SELECT count(*) FROM member_role_assignments a
             WHERE a."tenantId" = m."tenantId" AND a."userId" = m."userId" AND a."revokedAt" IS NULL AND a.scope <> 'MEMBER') AS explicit
      FROM tenant_members m
      LEFT JOIN custom_roles before_role ON before_role.id = m."customRoleId"`);
  const differences = [];
  for (const row of rows) {
    const before = new Set(Array.isArray(row.before_permissions) ? row.before_permissions : []);
    const after = new Set(row.after_roles.flatMap((role) => (Array.isArray(role.permissions) ? role.permissions : [])));
    const beforeNames = row.before_name ? [row.before_name] : [];
    const afterNames = row.after_roles.map((role) => role.name);
    const same = before.size === after.size && [...before].every((code) => after.has(code)) && JSON.stringify(beforeNames) === JSON.stringify(afterNames);
    if (!same || Number(row.explicit) > 0)
      differences.push({ tenantId: row.tenantId, userId: row.userId, before: { roles: beforeNames, permissions: [...before] }, after: { roles: afterNames, permissions: [...after] }, explicit: Number(row.explicit) });
  }
  await client.query('COMMIT');
  console.log(`members: ${rows.length}; with a custom role: ${rows.filter((row) => row.customRoleId).length}; differences: ${differences.length}`);
  for (const difference of differences) console.log(JSON.stringify(difference));
  process.exitCode = differences.length === 0 ? 0 : 1;
} finally {
  await client.end();
}
