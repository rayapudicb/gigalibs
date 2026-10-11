/**
 * WI-OI-121g. Read-only Assistant impact inventory. This intentionally has no apply mode, DML, or URL fallback.
 * Existing '*' and assistant:* grants have no per-permission provenance; no safe automatic revocation exists.
 */
import pg from '../packages/db/node_modules/pg/lib/index.js';

export const ASSISTANT_KEY = 'gigalibs-assistant';
export const SUSPECT_GRANTS = new Set(['*', 'assistant:*', 'assistant:read', 'assistant:action']);

export function classifyEntitlement(row) {
  const scriptMarked = row?.source === 'PLATFORM_OVERRIDE' &&
    row?.reason === 'Automated local enablement' &&
    row?.updatedById === 'local-development-bootstrap';
  return {
    before: row ?? null,
    proposedAfter: null,
    disposition: scriptMarked ? 'script-marked-review-required' : 'origin-unproved-review-required',
    reason: 'No entitlement change is safe without an owner-approved exact-target decision.',
  };
}

export function classifyMember(row) {
  const permissions = Array.isArray(row.permissions) ? row.permissions : [];
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    elevatedPermissions: permissions.filter((permission) => SUSPECT_GRANTS.has(permission)),
    before: permissions,
    proposedAfter: null,
    disposition: 'origin-unproved-review-required',
    reason: 'Member permissions have no per-grant provenance; never infer they were all added by one script.',
  };
}

export async function readOnlyAssistantInventory(client, tenantId, expectedDatabaseName) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(tenantId)) throw new Error('Invalid tenant ID.');
  if (!expectedDatabaseName || !/^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/.test(expectedDatabaseName))
    throw new Error('An exact expected database name is required.');
  await client.query('BEGIN READ ONLY');
  try {
    const identity = (await client.query('SELECT current_database() AS name, current_user AS role')).rows[0];
    if (identity?.name !== expectedDatabaseName) throw new Error('Database identity mismatch; inventory refused.');
    const tenant = (await client.query('SELECT id, slug, features FROM tenants WHERE id = $1', [tenantId])).rows[0];
    if (!tenant) throw new Error('Tenant not found.');
    const entitlement = (await client.query(
      'SELECT id, status, source, reason, "updatedById", "createdAt", "updatedAt" FROM tenant_module_entitlements WHERE "tenantId" = $1 AND "moduleKey" = $2',
      [tenantId, ASSISTANT_KEY],
    )).rows[0];
    const members = (await client.query(
      'SELECT id, "userId", status, permissions FROM tenant_members WHERE "tenantId" = $1 ORDER BY id LIMIT 501',
      [tenantId],
    )).rows;
    if (members.length > 500) throw new Error('Member inventory exceeds the 500-record review limit.');
    const channels = (await client.query(
      `SELECT c.id, COUNT(m.id)::integer AS message_count
         FROM chat_channels c LEFT JOIN chat_messages m ON m."channelId" = c.id
        WHERE c."tenantId" = $1 AND c."isDirect" = true
        GROUP BY c.id ORDER BY c.id LIMIT 501`,
      [tenantId],
    )).rows;
    if (channels.length > 500) throw new Error('Direct-channel inventory exceeds the 500-record review limit.');
    return {
      database: identity.name,
      databaseRole: identity.role,
      tenant: { id: tenant.id, slug: tenant.slug },
      feature: {
        present: tenant.features?.includes(ASSISTANT_KEY) === true,
        before: tenant.features ?? [],
        proposedAfter: null,
        disposition: 'origin-unproved-review-required',
      },
      entitlement: classifyEntitlement(entitlement),
      members: members.map(classifyMember),
      directChannels: channels.map((row) => ({
        id: row.id,
        messageCount: row.message_count,
        disposition: 'ownership-unproved-do-not-read-copy-or-delete',
      })),
      warning: 'Direct channels are candidates, not identified Assistant threads. No message content was read. No changes are proposed or applied.',
    };
  } finally {
    await client.query('ROLLBACK');
  }
}

async function main() {
  const tenantId = process.argv.find((arg) => arg.startsWith('--tenant-id='))?.slice('--tenant-id='.length);
  const databaseName = process.argv.find((arg) => arg.startsWith('--database-name='))?.slice('--database-name='.length);
  const url = process.env.ASSISTANT_RECONCILE_DATABASE_URL;
  if (!url || !tenantId || !databaseName || process.argv.some((arg) => arg === '--apply'))
    throw new Error('Read-only use requires ASSISTANT_RECONCILE_DATABASE_URL, --tenant-id, and --database-name. There is no apply mode.');
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
  await client.connect();
  try {
    const result = await readOnlyAssistantInventory(client, tenantId, databaseName);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(`Assistant read-only inventory refused: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  });
}
