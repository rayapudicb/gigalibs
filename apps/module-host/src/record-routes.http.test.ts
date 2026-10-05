import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { type CanActivate, type ExecutionContext, type INestApplication, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createRecordController,
  type IdempotencyEntry,
  type IdempotencyStore,
  RECORD_DISPATCHER,
  RecordDispatcher,
  type RecordValues,
  RecordVersionConflict,
} from '@gigalibs/module-sdk';

// WI-OI-120f (F0.3): the module SDK's record routes over real HTTP, as the module host serves them. A stand-in guard plays the module's signed-context guard: it
// sets the principal from a test header and enforces the route's read permission floor, as SignedContextGuardBase does.
@Injectable()
class TestContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['x-test-principal'];
    if (typeof header !== 'string') return false;
    const { tenantId, permissions } = JSON.parse(header) as { tenantId: string; permissions: string[] };
    if (!permissions.includes('inventory:read') && !permissions.includes('inventory:*')) return false;
    request.modulePrincipal = {
      tenantId,
      subject: `user-${tenantId}`,
      sessionId: randomUUID(),
      authVersion: 1,
      permissions,
      roles: [],
      persona: 'OPERATIONS_SUPERVISOR',
      departmentScope: { mode: 'ALL' },
      placeScope: { mode: 'UNBOUNDED' },
    };
    return true;
  }
}

class MemoryIdempotency implements IdempotencyStore {
  private readonly entries = new Map<string, IdempotencyEntry>();
  async claim(tenantId: string, key: string, _operation: string, requestHash: string) {
    const existing = this.entries.get(`${tenantId}/${key}`);
    if (existing) return existing;
    this.entries.set(`${tenantId}/${key}`, { requestHash, state: 'IN_PROGRESS', response: null });
    return null;
  }
  async complete(tenantId: string, key: string, response: RecordValues) {
    this.entries.set(`${tenantId}/${key}`, { ...this.entries.get(`${tenantId}/${key}`)!, state: 'COMPLETED', response });
  }
  async release(tenantId: string, key: string) {
    this.entries.delete(`${tenantId}/${key}`);
  }
}

describe('record routes over HTTP', () => {
  let app: INestApplication;
  let base = '';
  const rows = new Map<string, Record<string, unknown>>();
  const dispatcher = new RecordDispatcher(
    [
      {
        entityKey: 'inventory.warehouses',
        permissions: { read: 'inventory:read', create: 'inventory:warehouses:manage', update: 'inventory:warehouses:manage' },
        fields: { code: { writable: true }, name: { writable: true } },
        async list(principal, query) {
          const items = [...rows.values()].filter((row) => row.tenantId === principal.tenantId);
          return { items, total: items.length, page: query.page, pageSize: query.pageSize };
        },
        async get(principal, id) {
          const row = rows.get(id);
          return row && row.tenantId === principal.tenantId ? row : null;
        },
        async create(context, values) {
          const row = { id: randomUUID(), version: 1, tenantId: context.principal.tenantId, ...values };
          rows.set(row.id, row);
          return row;
        },
        async update(_context, id, values, expectedVersion) {
          const row = rows.get(id)!;
          if (row.version !== expectedVersion) throw new RecordVersionConflict();
          Object.assign(row, values, { version: expectedVersion + 1 });
          return row;
        },
      },
    ],
    [],
    new MemoryIdempotency(),
  );
  const as = (tenantId: string, permissions: string[]) => ({ 'x-test-principal': JSON.stringify({ tenantId, permissions }) });
  const manager = as('tenant-a', ['inventory:read', 'inventory:warehouses:manage']);
  const call = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    fetch(`${base}/v1/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });

  beforeAll(async () => {
    const RecordController = createRecordController({ guard: TestContextGuard, readPermission: 'inventory:read' });
    @Module({ controllers: [RecordController], providers: [TestContextGuard, { provide: RECORD_DISPATCHER, useValue: dispatcher }] })
    class TestModule {}
    app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates with an Idempotency-Key, answers 201 with an ETag, and replays a repeat', async () => {
    const key = randomUUID();
    const body = JSON.stringify({ code: 'WH-1', name: 'Main' });
    const first = await call('records/inventory.warehouses', { method: 'POST', headers: { ...manager, 'Idempotency-Key': key }, body });
    expect(first.status).toBe(201);
    expect(first.headers.get('etag')).toBe('"1"');
    const created = (await first.json()) as { id: string };
    const again = await call('records/inventory.warehouses', { method: 'POST', headers: { ...manager, 'Idempotency-Key': key }, body });
    expect(((await again.json()) as { id: string }).id).toBe(created.id);
    const missingKey = await call('records/inventory.warehouses', { method: 'POST', headers: manager, body });
    expect(missingKey.status).toBe(400);
  });

  it('reads with an ETag, updates with If-Match, and answers 412 and 428 for stale or missing versions', async () => {
    const created = (await (
      await call('records/inventory.warehouses', { method: 'POST', headers: { ...manager, 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ code: 'WH-2' }) })
    ).json()) as { id: string };
    const read = await call(`records/inventory.warehouses/${created.id}`, { headers: manager });
    expect(read.headers.get('etag')).toBe('"1"');
    const updated = await call(`records/inventory.warehouses/${created.id}`, { method: 'PATCH', headers: { ...manager, 'If-Match': '"1"' }, body: JSON.stringify({ name: 'Renamed' }) });
    expect(updated.status).toBe(200);
    expect(updated.headers.get('etag')).toBe('"2"');
    expect((await call(`records/inventory.warehouses/${created.id}`, { method: 'PATCH', headers: { ...manager, 'If-Match': '"1"' }, body: '{}' })).status).toBe(412);
    expect((await call(`records/inventory.warehouses/${created.id}`, { method: 'PATCH', headers: manager, body: '{}' })).status).toBe(428);
  });

  it('applies the guard floor and the entity permission, and hides other tenants', async () => {
    expect((await call('records/inventory.warehouses', { headers: as('tenant-a', []) })).status).toBe(403);
    const reader = as('tenant-a', ['inventory:read']);
    expect((await call('records/inventory.warehouses', { headers: reader })).status).toBe(200);
    expect(
      (await call('records/inventory.warehouses', { method: 'POST', headers: { ...reader, 'Idempotency-Key': randomUUID() }, body: '{"code":"X"}' })).status,
    ).toBe(403);
    const other = await call('records/inventory.warehouses', { headers: as('tenant-b', ['inventory:read']) });
    expect(((await other.json()) as { items: unknown[] }).items).toEqual([]);
  });
});
