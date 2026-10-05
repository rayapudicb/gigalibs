import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  type IdempotencyEntry,
  type IdempotencyStore,
  type RecordAdapter,
  RecordDispatcher,
  type RecordValues,
  RecordVersionConflict,
} from './record-dispatcher.js';
import type { ModulePrincipal } from './signed-context.js';

// WI-OI-120f (F0.3): the record dispatcher behind every metadata window.
function principal(tenantId: string, permissions: string[]): ModulePrincipal {
  return {
    tenantId,
    subject: `user-${tenantId}`,
    sessionId: randomUUID(),
    authVersion: 1,
    permissions,
    roles: [],
    persona: 'OPERATIONS_SUPERVISOR',
    departmentScope: { mode: 'ALL' },
    placeScope: { mode: 'UNBOUNDED' },
  } as unknown as ModulePrincipal;
}

class MemoryIdempotency implements IdempotencyStore {
  readonly entries = new Map<string, IdempotencyEntry>();
  async claim(tenantId: string, key: string, _operation: string, requestHash: string) {
    const existing = this.entries.get(`${tenantId}/${key}`);
    if (existing) return existing;
    this.entries.set(`${tenantId}/${key}`, { requestHash, state: 'IN_PROGRESS', response: null });
    return null;
  }
  async complete(tenantId: string, key: string, response: RecordValues) {
    const entry = this.entries.get(`${tenantId}/${key}`)!;
    this.entries.set(`${tenantId}/${key}`, { ...entry, state: 'COMPLETED', response });
  }
  async release(tenantId: string, key: string) {
    this.entries.delete(`${tenantId}/${key}`);
  }
}

/** Warehouses kept per tenant, as a module service would. */
function warehouses() {
  const rows = new Map<string, Map<string, Record<string, unknown>>>();
  const tenantRows = (tenantId: string) => rows.get(tenantId) ?? rows.set(tenantId, new Map()).get(tenantId)!;
  const created = vi.fn();
  const adapter: RecordAdapter = {
    entityKey: 'inventory.warehouses',
    permissions: { read: 'inventory:read', create: 'inventory:warehouses:manage', update: 'inventory:warehouses:manage' },
    fields: {
      code: { writable: true },
      name: { writable: true },
      status: { writable: false },
      cost_centre: { writable: true, readPermission: 'finance:read', writePermission: 'finance:post' },
    },
    searchFields: ['code', 'name'],
    filterFields: ['status'],
    sortFields: ['code'],
    async list(p, query) {
      const all = [...tenantRows(p.tenantId).values()].filter((row) => !query.search || String(row.name).includes(query.search));
      return { items: all.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: all.length, page: query.page, pageSize: query.pageSize };
    },
    async get(p, id) {
      return tenantRows(p.tenantId).get(id) ?? null;
    },
    async create(context, values) {
      created(values);
      const row = { id: randomUUID(), version: 1, status: 'ACTIVE', internal_secret: 'never shown', ...values };
      tenantRows(context.principal.tenantId).set(row.id, row);
      return row;
    },
    async update(context, id, values, expectedVersion) {
      const row = tenantRows(context.principal.tenantId).get(id);
      if (!row) throw new Error('not found');
      if (row.version !== expectedVersion) throw new RecordVersionConflict();
      Object.assign(row, values, { version: expectedVersion + 1 });
      return row;
    },
    actions: {
      close: {
        permission: 'inventory:warehouses:manage',
        async run(context, id) {
          const row = tenantRows(context.principal.tenantId).get(id)!;
          row.status = 'CLOSED';
          row.version = Number(row.version) + 1;
          return row;
        },
      },
    },
  };
  return { adapter, created };
}

const manager = principal('tenant-a', ['inventory:read', 'inventory:warehouses:manage']);
const context = (p: ModulePrincipal) => ({ principal: p, correlationId: randomUUID() });
const status = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 200;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : 500;
  }
};

describe('RecordDispatcher', () => {
  it('creates once per Idempotency-Key and replays the first answer', async () => {
    const { adapter, created } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency());
    const key = randomUUID();
    const first = await records.create(context(manager), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, key);
    const again = await records.create(context(manager), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, key);
    expect(again).toEqual(first);
    expect(created).toHaveBeenCalledTimes(1);
    expect(await status(records.create(context(manager), 'inventory.warehouses', { code: 'WH-2', name: 'Other' }, key))).toBe(409);
    expect(await status(records.create(context(manager), 'inventory.warehouses', { code: 'WH-3' }, undefined))).toBe(400);
  });

  it('never returns undeclared fields, and hides fields the reader may not see', async () => {
    const { adapter } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency());
    const created = await records.create(context(manager), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, randomUUID());
    expect(created).not.toHaveProperty('internal_secret');
    const finance = principal('tenant-a', ['inventory:read', 'inventory:warehouses:manage', 'finance:read', 'finance:post']);
    await records.update(context(finance), 'inventory.warehouses', String(created.id), { cost_centre: 'CC-9' }, '"1"');
    expect(await records.get(finance, 'inventory.warehouses', String(created.id))).toMatchObject({ cost_centre: 'CC-9' });
    expect(await records.get(manager, 'inventory.warehouses', String(created.id))).not.toHaveProperty('cost_centre');
  });

  it('refuses unknown, system-set and unpermitted fields on write', async () => {
    const { adapter } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency());
    expect(await status(records.create(context(manager), 'inventory.warehouses', { code: 'X', tenant_id: 'tenant-b' }, randomUUID()))).toBe(400);
    expect(await status(records.create(context(manager), 'inventory.warehouses', { code: 'X', status: 'CLOSED' }, randomUUID()))).toBe(400);
    expect(await status(records.create(context(manager), 'inventory.warehouses', { code: 'X', cost_centre: 'CC-1' }, randomUUID()))).toBe(403);
  });

  it("keeps each tenant's records apart: another tenant's id answers 404", async () => {
    const { adapter } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency());
    const mine = await records.create(context(manager), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, randomUUID());
    const other = principal('tenant-b', ['inventory:read', 'inventory:warehouses:manage']);
    expect(await status(records.get(other, 'inventory.warehouses', String(mine.id)))).toBe(404);
    expect((await records.list(other, 'inventory.warehouses', {})).items).toEqual([]);
  });

  it('needs the entity permission for each operation', async () => {
    const { adapter } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency());
    const reader = principal('tenant-a', ['inventory:read']);
    expect(await status(records.list(reader, 'inventory.warehouses', {}))).toBe(200);
    expect(await status(records.create(context(reader), 'inventory.warehouses', { code: 'WH-1' }, randomUUID()))).toBe(403);
    expect(await status(records.list(principal('tenant-a', []), 'inventory.warehouses', {}))).toBe(403);
    expect(await status(records.list(principal('tenant-a', ['inventory:*']), 'inventory.warehouses', {}))).toBe(200);
  });

  it('needs If-Match on update and answers 412 for a stale version', async () => {
    const { adapter } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency());
    const created = await records.create(context(manager), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, randomUUID());
    const id = String(created.id);
    expect(await status(records.update(context(manager), 'inventory.warehouses', id, { name: 'Renamed' }, undefined))).toBe(428);
    expect(await records.update(context(manager), 'inventory.warehouses', id, { name: 'Renamed' }, 'W/"1"')).toMatchObject({ name: 'Renamed', version: 2 });
    expect(await status(records.update(context(manager), 'inventory.warehouses', id, { name: 'Again' }, '"1"'))).toBe(412);
  });

  it('accepts only declared search, filter and sort fields and bounds the page size', async () => {
    const { adapter } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency());
    expect(await status(records.list(manager, 'inventory.warehouses', { search: 'Main', sort: 'code', 'filter.status': 'ACTIVE' }))).toBe(200);
    expect(await status(records.list(manager, 'inventory.warehouses', { sort: 'internal_secret' }))).toBe(400);
    expect(await status(records.list(manager, 'inventory.warehouses', { 'filter.name': 'x' }))).toBe(400);
    expect(await status(records.list(manager, 'inventory.warehouses', { pageSize: '500' }))).toBe(400);
    expect(await status(records.list(manager, 'inventory.warehouses', { parentId: randomUUID() }))).toBe(400);
  });

  it('runs a registered action once per key and refuses unknown actions and entities', async () => {
    const { adapter } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency());
    const created = await records.create(context(manager), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, randomUUID());
    const key = randomUUID();
    const closed = await records.action(context(manager), 'inventory.warehouses', String(created.id), 'close', {}, key);
    expect(closed).toMatchObject({ status: 'CLOSED', version: 2 });
    expect(await records.action(context(manager), 'inventory.warehouses', String(created.id), 'close', {}, key)).toEqual(closed);
    expect(await status(records.action(context(manager), 'inventory.warehouses', String(created.id), 'delete', {}, randomUUID()))).toBe(404);
    expect(await status(records.list(manager, 'inventory.anything', {}))).toBe(404);
  });

  it('releases the key when a create fails, so a retry can succeed', async () => {
    const { adapter } = warehouses();
    const store = new MemoryIdempotency();
    const failing: RecordAdapter = { ...adapter, create: vi.fn().mockRejectedValueOnce(new Error('database unavailable')).mockImplementation(adapter.create!) };
    const records = new RecordDispatcher([failing], [], store);
    const key = randomUUID();
    expect(await status(records.create(context(manager), 'inventory.warehouses', { code: 'WH-1' }, key))).toBe(500);
    expect(store.entries.size).toBe(0);
    expect(await records.create(context(manager), 'inventory.warehouses', { code: 'WH-1' }, key)).toMatchObject({ code: 'WH-1' });
  });

  it('checks the resolver permission and the lookup query', async () => {
    const resolve = vi.fn().mockResolvedValue([{ value: randomUUID(), label: 'Main' }]);
    const records = new RecordDispatcher([], [{ key: 'warehouses', permission: 'inventory:read', resolve }], new MemoryIdempotency());
    expect(await records.lookup(manager, 'warehouses', { search: 'Ma' })).toHaveLength(1);
    expect(resolve).toHaveBeenCalledWith(manager, { search: 'Ma', limit: 50 });
    expect(await status(records.lookup(principal('tenant-a', []), 'warehouses', {}))).toBe(403);
    expect(await status(records.lookup(manager, 'warehouses', { ids: 'not-a-uuid' }))).toBe(400);
    expect(await status(records.lookup(manager, 'unknown', {}))).toBe(404);
  });

  it('refuses a misconfigured adapter at start-up', () => {
    const { adapter } = warehouses();
    expect(() => new RecordDispatcher([{ ...adapter, sortFields: ['undeclared'] }], [], new MemoryIdempotency())).toThrow(/not declared/);
    expect(() => new RecordDispatcher([adapter, adapter], [], new MemoryIdempotency())).toThrow(/Duplicate/);
  });
});
