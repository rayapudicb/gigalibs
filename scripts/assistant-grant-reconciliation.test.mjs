import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyEntitlement,
  classifyMember,
  readOnlyAssistantInventory,
} from './assistant-grant-reconciliation.mjs';

test('historical grants remain unattributed and cannot be automatically revoked', () => {
  const member = classifyMember({ id: 'member-a', userId: 'user-a', status: 'ACTIVE', permissions: ['*', 'assistant:read', 'cmms:read'] });
  assert.deepEqual(member.elevatedPermissions, ['*', 'assistant:read']);
  assert.equal(member.proposedAfter, null);
  assert.equal(member.disposition, 'origin-unproved-review-required');
  const entitlement = classifyEntitlement({
    id: 'entitlement-a', source: 'PLATFORM_OVERRIDE', reason: 'Automated local enablement', updatedById: 'local-development-bootstrap',
  });
  assert.equal(entitlement.disposition, 'script-marked-review-required');
  assert.equal(entitlement.proposedAfter, null);
});

test('inventory uses one read-only transaction and never reads message contents', async () => {
  const sql = [];
  const client = {
    async query(statement, values) {
      sql.push({ statement, values });
      if (statement.includes('current_database()')) return { rows: [{ name: 'isolated_proof', role: 'reader' }] };
      if (statement.includes('FROM tenants')) return { rows: [{ id: 'tenant-a', slug: 'a', features: ['gigalibs-assistant'] }] };
      if (statement.includes('FROM tenant_module_entitlements')) return { rows: [] };
      if (statement.includes('FROM tenant_members')) return { rows: [{ id: 'member-a', userId: 'user-a', status: 'ACTIVE', permissions: ['*'] }] };
      if (statement.includes('FROM chat_channels')) return { rows: [{ id: 'channel-a', message_count: 2 }] };
      return { rows: [] };
    },
  };
  const inventory = await readOnlyAssistantInventory(client, 'tenant-a', 'isolated_proof');
  assert.equal(inventory.members[0].proposedAfter, null);
  assert.equal(inventory.directChannels[0].messageCount, 2);
  assert.equal(sql[0].statement, 'BEGIN READ ONLY');
  assert.equal(sql.at(-1).statement, 'ROLLBACK');
  assert.ok(sql.every(({ statement }) => !/\b(INSERT|UPDATE|DELETE|TRUNCATE|COMMIT)\b/.test(statement)));
  assert.ok(sql.every(({ statement }) => !/\b(content|senderName)\b/i.test(statement)));
});

test('wrong database identity rolls back before reading tenant rows', async () => {
  const sql = [];
  const client = { async query(statement) {
    sql.push(statement);
    return { rows: statement.includes('current_database()') ? [{ name: 'unexpected', role: 'reader' }] : [] };
  } };
  await assert.rejects(readOnlyAssistantInventory(client, 'tenant-a', 'isolated_proof'), /identity mismatch/);
  assert.deepEqual(sql, ['BEGIN READ ONLY', 'SELECT current_database() AS name, current_user AS role', 'ROLLBACK']);
});
