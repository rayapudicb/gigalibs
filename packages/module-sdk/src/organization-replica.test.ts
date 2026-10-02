import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OrganizationReplica, organizationReplicaDdl } from './organization-replica.js';

const migration = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

// WI-OI-109e2: every module keeps the same replica tables; each migration holds the generated text for its schema.
describe('organization replica tables', () => {
  it.each([
    ['modules/gigaops/db/runtime-foundation/000017_workforce_organization_replica.up.sql', 'gigalibs_workforce'],
    ['modules/analytics-studio/db/migrations/000027_organization_replica.up.sql', 'gigalibs_analytics'],
  ])('%s matches the shared definition', (path, schema) => {
    expect(migration(path)).toContain(organizationReplicaDdl(schema));
  });

  it('refuses a schema name that could inject SQL', () => {
    expect(() => organizationReplicaDdl('x; DROP TABLE y')).toThrow(/Unsafe schema/);
  });

  it('expands only active descendants from the exact held version', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("status = 'READY' AS ready")) return { rows: [{ ready: true }] };
        return { rows: [{ unit_id: 'active-child' }] };
      },
    };
    await expect(new OrganizationReplica('example').expand(client, 'tenant-1', 'version-1', ['root'])).resolves.toEqual(['active-child']);
    expect(statements[1]).toContain('JOIN example.org_replica_units u');
    expect(statements[1]).toContain("u.status = 'ACTIVE'");
  });
});
