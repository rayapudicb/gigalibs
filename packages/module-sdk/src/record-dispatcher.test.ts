import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  type IdempotencyEntry,
  type IdempotencyStore,
  type RecordAdapter,
  RecordDispatcher,
  type RecordRules,
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

  // WI-OI-120ae: a stored answer belongs to its caller.
  it("refuses another person's same Idempotency-Key and body with 409, never replaying the first answer", async () => {
    const { adapter, created } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency());
    const key = randomUUID();
    const colleague = { ...manager, subject: 'user-colleague' } as ModulePrincipal;
    await records.create(context(manager), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, key);
    expect(await status(records.create(context(colleague), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, key))).toBe(409);
    expect(created).toHaveBeenCalledTimes(1);
    // The first caller still gets their own answer back.
    expect(await status(records.create(context(manager), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, key))).toBe(200);
  });

  // Security review of d17db37 (Low 1): a permission that names nothing would let everyone through.
  it('refuses an adapter whose read list is empty or whose permission is blank', () => {
    const { adapter } = warehouses();
    const build = (changed: RecordAdapter) => () => new RecordDispatcher([changed], [], new MemoryIdempotency());
    const message = 'every declared permission must name a permission';
    expect(build({ ...adapter, permissions: { read: [] } })).toThrow(message);
    expect(build({ ...adapter, permissions: { read: 'inventory:read', create: ' ' } })).toThrow(message);
    expect(build({ ...adapter, actions: { close: { permission: '', run: async () => ({}) } } })).toThrow(message);
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

  it("lets a family wildcard cover that family's dotted codes, and nothing else (WI-OI-120q)", async () => {
    const { adapter } = warehouses();
    const dotted: RecordAdapter = { ...adapter, entityKey: 'cmms.work-orders', permissions: { read: 'cmms.work-orders.read' } };
    const records = new RecordDispatcher([dotted], [], new MemoryIdempotency());
    const list = (permissions: string[]) => status(records.list(principal('tenant-a', permissions), 'cmms.work-orders', {}));
    expect(await list(['cmms:*'])).toBe(200); // refused before R1: the family was read up to a colon the code lacks
    expect(await list(['cmms.work-orders.read'])).toBe(200);
    expect(await list(['cmms:work-orders:read'])).toBe(200); // the colon spelling of the same code
    expect(await list(['cmms.work-orders'])).toBe(403);
    expect(await list(['cmmsx:*'])).toBe(403);
    expect(await list(['cmms.work-orders.rea:*'])).toBe(403);
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

  it("hands the caller's Idempotency-Key to the adapter on creates and actions (WI-OI-120g)", async () => {
    const { adapter } = warehouses();
    const seen: (string | undefined)[] = [];
    const create = adapter.create!.bind(adapter);
    const close = adapter.actions!.close!.run.bind(adapter.actions!.close);
    const records = new RecordDispatcher(
      [
        {
          ...adapter,
          create: async (c, values) => (seen.push(c.idempotencyKey), create(c, values)),
          actions: { close: { permission: 'inventory:warehouses:manage', run: async (c, id, p) => (seen.push(c.idempotencyKey), close(c, id, p)) } },
        },
      ],
      [],
      new MemoryIdempotency(),
    );
    const createKey = randomUUID();
    const actionKey = randomUUID();
    const created = await records.create(context(manager), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, createKey);
    await records.action(context(manager), 'inventory.warehouses', String(created.id), 'close', {}, actionKey);
    expect(seen).toEqual([createKey, actionKey]);
  });

  it('answers 412 when an action meets a version conflict, and frees the key for a retry (WI-OI-120g)', async () => {
    const { adapter } = warehouses();
    let stale = true;
    const records = new RecordDispatcher(
      [{ ...adapter, actions: { close: { permission: 'inventory:warehouses:manage', run: async () => { if (stale) throw new RecordVersionConflict(); return { id: 'x', version: 2 }; } } } }],
      [],
      new MemoryIdempotency(),
    );
    const created = await records.create(context(manager), 'inventory.warehouses', { code: 'WH-1', name: 'Main' }, randomUUID());
    const key = randomUUID();
    expect(await status(records.action(context(manager), 'inventory.warehouses', String(created.id), 'close', { expectedVersion: 1 }, key))).toBe(412);
    stale = false;
    expect(await status(records.action(context(manager), 'inventory.warehouses', String(created.id), 'close', { expectedVersion: 1 }, key))).toBe(200);
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

// WI-OI-120r (S1): the windows' field rules, enforced by the dispatcher as the window enforces them.
describe('RecordDispatcher field rules', () => {
  const calls: Array<{ mode: string; current: RecordValues; changes: RecordValues }> = [];
  const rules: RecordRules = {
    defaults: (_entity, values, principal) => (values.name === undefined ? { name: 'Main store', code: `WH-${principal.subject}` } : { code: 'WH-DEFAULT' }),
    check: (_entity, input) => {
      calls.push(input);
      const after = { ...input.current, ...input.changes };
      const errors: Record<string, string> = {};
      if (!after.name) errors.name = 'Name is required.';
      if (input.mode === 'UPDATE' && 'code' in input.changes && input.current.status === 'CLOSED') errors.code = 'Code cannot be changed.';
      return { errors, warnings: {} };
    },
  };

  const rejection = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return null;
    } catch (error) {
      return error instanceof HttpException ? { status: error.getStatus(), body: error.getResponse() } : { status: 500, body: null };
    }
  };

  it('applies defaults the caller left out, then checks the record as it would be', async () => {
    const { adapter, created } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency(), rules);
    await records.create(context(manager), 'inventory.warehouses', { name: 'North' }, randomUUID());
    expect(created).toHaveBeenLastCalledWith({ code: 'WH-DEFAULT', name: 'North' });
    expect(calls.at(-1)).toMatchObject({ mode: 'CREATE', current: { code: 'WH-DEFAULT' }, changes: { name: 'North' } });
  });

  it('never defaults a field the domain sets or the caller may not write', async () => {
    const { adapter, created } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency(), {
      ...rules,
      defaults: () => ({ status: 'OPEN', cost_centre: 'CC-1', code: 'WH-9' }),
    });
    await records.create(context(manager), 'inventory.warehouses', { name: 'North' }, randomUUID());
    expect(created).toHaveBeenLastCalledWith({ code: 'WH-9', name: 'North' });
  });

  it('answers 422 RECORD_RULES with a message per field, and creates nothing', async () => {
    const { adapter, created } = warehouses();
    created.mockClear();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency(), { ...rules, defaults: () => ({}) });
    const refused = await rejection(records.create(context(manager), 'inventory.warehouses', { code: 'WH-1' }, randomUUID()));
    expect(refused).toEqual({ status: 422, body: { code: 'RECORD_RULES', message: 'Some fields need attention.', fields: { name: 'Name is required.' } } });
    expect(created).not.toHaveBeenCalled();
  });

  it('checks a change against the stored record, so a direct call cannot skip what the window locks', async () => {
    const { adapter } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency(), rules);
    const saved = await records.create(context(manager), 'inventory.warehouses', { name: 'North', code: 'WH-1' }, randomUUID());
    await records.action(context(manager), 'inventory.warehouses', String(saved.id), 'close', {}, randomUUID());
    const refused = await rejection(records.update(context(manager), 'inventory.warehouses', String(saved.id), { code: 'WH-2' }, '"2"'));
    expect(refused).toEqual({ status: 422, body: { code: 'RECORD_RULES', message: 'Some fields need attention.', fields: { code: 'Code cannot be changed.' } } });
    expect(calls.at(-1)).toMatchObject({ mode: 'UPDATE', current: { status: 'CLOSED', code: 'WH-1' }, changes: { code: 'WH-2' } });
    expect(await status(records.update(context(manager), 'inventory.warehouses', String(saved.id), { name: 'North 2' }, '"2"'))).toBe(200);
  });

  it('answers 404 for a change to a record of another tenant before checking any rule', async () => {
    const { adapter } = warehouses();
    const records = new RecordDispatcher([adapter], [], new MemoryIdempotency(), rules);
    const saved = await records.create(context(manager), 'inventory.warehouses', { name: 'North' }, randomUUID());
    const other = principal('tenant-b', ['inventory:read', 'inventory:warehouses:manage']);
    expect(await status(records.update(context(other), 'inventory.warehouses', String(saved.id), { name: 'X' }, '"1"'))).toBe(404);
  });
});
