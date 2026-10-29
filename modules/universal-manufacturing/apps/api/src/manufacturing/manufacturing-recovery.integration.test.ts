import { generateKeyPairSync, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import { DatabaseService } from '../database.service.js';
import { InventoryHandshakeClient } from '../inventory/inventory-handshake.client.js';
import { InventoryAtpClient } from '../inventory/inventory-atp.client.js';
import { InventoryReserveReleaseClient } from '../inventory/inventory-reserve-release.client.js';
import { startThrowawayPostgres, type ThrowawayPostgres } from '../../scripts/throwaway-postgres.js';
import { ManufacturingService } from './manufacturing.service.js';

const enabled = process.env.MANUFACTURING_PG_PROOF === '1';
const schema = 'gigalibs_universal_manufacturing';

describe.skipIf(!enabled)('Manufacturing recovery and organization scope on isolated PostgreSQL 16', () => {
  let postgres: ThrowawayPostgres;
  let admin: pg.Client;
  let db: DatabaseService;
  let manufacturing: ManufacturingService;
  let oldRelayUrl: string | undefined;
  let oldRelayKey: string | undefined;
  let reserveFails = true;
  let issueFails = true;
  let receiptFails = true;
  let reserveCalls = 0;
  let issueCalls = 0;
  let receiptCalls = 0;
  const tenantId = 'manufacturing-proof-tenant';
  const versionId = 'manufacturing-proof-v1';
  const principal: ModulePrincipal = {
    tenantId, subject: 'proof-user', sessionId: 'proof-session', authVersion: 1,
    permissions: ['*'], roles: ['TENANT_ADMIN'], persona: 'TENANT_ADMIN',
    organization: { mode: 'UNITS', tree_version: versionId, read_roots: ['division'], write_roots: ['division'] },
    departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' },
  };
  const sibling: ModulePrincipal = {
    ...principal,
    organization: { mode: 'UNITS', tree_version: versionId, read_roots: ['south'], write_roots: ['south'] },
  };
  const componentId = randomUUID();
  const finishedId = randomUUID();
  const uomId = randomUUID();
  const warehouseId = randomUUID();
  const financeCostProfileId = randomUUID();
  let bomId = '';
  let orderId = '';

  beforeAll(async () => {
    postgres = await startThrowawayPostgres(`gigalibs-manufacturing-proof-${process.pid}`);
    admin = new pg.Client({ connectionString: postgres.adminUrl });
    await admin.connect();
    await admin.query(
      `INSERT INTO ${schema}.org_replica_versions
        (tenant_id, version_id, tree_id, tree_kind, version_number, checksum, status, unit_count, ready_at)
       VALUES ($1,$2,'tree-proof','PRIMARY',1,$3,'READY',3,now())`,
      [tenantId, versionId, `sha256:${'0'.repeat(64)}`],
    );
    for (const [unit, parent, holds] of [
      ['division', null, false], ['north', 'division', true], ['south', null, true],
    ] as const) {
      await admin.query(
        `INSERT INTO ${schema}.org_replica_units
          (tenant_id, version_id, unit_id, parent_unit_id, code, name, sort_order, status, holds_records, type_code)
         VALUES ($1,$2,$3,$4,$3,$3,0,'ACTIVE',$5,$6)`,
        [tenantId, versionId, unit, parent, holds, holds ? 'OPERATING_UNIT' : 'DIVISION'],
      );
    }
    for (const [ancestor, descendant, depth] of [
      ['division', 'division', 0], ['division', 'north', 1], ['north', 'north', 0], ['south', 'south', 0],
    ] as const) {
      await admin.query(
        `INSERT INTO ${schema}.org_replica_closure
          (tenant_id, version_id, ancestor_unit_id, descendant_unit_id, depth)
         VALUES ($1,$2,$3,$4,$5)`, [tenantId, versionId, ancestor, descendant, depth],
      );
    }
    db = new DatabaseService({
      databaseUrl: postgres.runtimeUrl, databasePoolSize: 5, expectedMigrationVersion: 5,
      platformContextAudience: 'proof', platformContextPublicKey: 'proof', corsOrigins: [],
      apiHost: '127.0.0.1', apiPort: 0,
    } as never);
    await db.onModuleInit();
    const privateKey = generateKeyPairSync('ed25519').privateKey
      .export({ format: 'der', type: 'pkcs8' }).toString('base64');
    oldRelayUrl = process.env.MANUFACTURING_INVENTORY_RELAY_URL;
    oldRelayKey = process.env.MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64;
    process.env.MANUFACTURING_INVENTORY_RELAY_URL = 'http://127.0.0.1:4790';
    process.env.MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64 = privateKey;
    const reserve = {
      execute: async (_actor: ModulePrincipal, request: { demandLineId: string; commandKey: string }) => {
        reserveCalls += 1;
        if (reserveFails) { reserveFails = false; throw new Error('inventory unavailable'); }
        return { outcome: 'RESERVED', commandKey: request.commandKey, reservationId: request.demandLineId };
      },
    } as InventoryReserveReleaseClient;
    const handshake = {
      issueLine: async (_actor: ModulePrincipal, request: { productionLineId: string; quantity: string }) => {
        issueCalls += 1;
        if (issueFails) { issueFails = false; throw new Error('issue unavailable'); }
        return { issueId: request.productionLineId, issuedQuantity: request.quantity, status: 'ISSUED' };
      },
      receiveFinishedGoods: async () => {
        receiptCalls += 1;
        if (receiptFails) { receiptFails = false; throw new Error('receipt unavailable'); }
        return { receiptId: finishedId, receiptNumber: 'REC-PROOF', financeCostProfileId };
      },
    } as InventoryHandshakeClient;
    const atp = { check: async () => ({ decision: 'SHORT', availableQuantity: '0.000000' }) } as InventoryAtpClient;
    manufacturing = new ManufacturingService(db, reserve, handshake, atp);
  }, 120_000);

  afterAll(async () => {
    if (oldRelayUrl === undefined) delete process.env.MANUFACTURING_INVENTORY_RELAY_URL;
    else process.env.MANUFACTURING_INVENTORY_RELAY_URL = oldRelayUrl;
    if (oldRelayKey === undefined) delete process.env.MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64;
    else process.env.MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64 = oldRelayKey;
    await db?.onModuleDestroy();
    await admin?.end();
    postgres?.stop();
  });

  it('migrates v5 with forced RLS and retains the unrelated sentinel', async () => {
    const migration = await admin.query(`SELECT max(version)::int AS version FROM ${schema}.schema_migrations`);
    expect(migration.rows[0]?.version).toBe(5);
    const tables = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname <> 'schema_migrations'`, [schema],
    );
    expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    expect((await admin.query('SELECT value FROM public.unrelated_upgrade_sentinel WHERE id = 1')).rows[0]?.value)
      .toBe('preserve-me');
  });

  it('expands division scope, refuses sibling and grouping ownership, and hides another tenant', async () => {
    const bom = await manufacturing.createBom(principal, {
      bomCode: 'BOM-PROOF', finishedProductId: finishedId, orgUnitId: 'north',
      lines: [{ componentProductId: componentId, uomId, quantityPer: '2' }],
    });
    bomId = bom.id;
    expect((await manufacturing.listBoms(principal)).map((row) => row.id)).toContain(bomId);
    expect((await manufacturing.whereUsed(principal, componentId))[0]).toMatchObject({ bomId, depth: 1 });
    expect((await manufacturing.bomShortages(principal, bomId, warehouseId, '3')).lines[0])
      .toMatchObject({ needed: '6.000000', decision: 'SHORT' });
    expect(await manufacturing.listBoms(sibling)).toEqual([]);
    await expect(manufacturing.getBomTree(sibling, bomId)).rejects.toThrow();
    await expect(manufacturing.createBom(principal, {
      bomCode: 'BOM-GROUP', finishedProductId: randomUUID(), orgUnitId: 'division',
      lines: [{ componentProductId: componentId, uomId, quantityPer: '1' }],
    })).rejects.toThrow();
    await expect(manufacturing.listBoms({ ...principal, tenantId: 'other-tenant' }))
      .rejects.toMatchObject({ response: { code: 'ORGANIZATION_VERSION_PENDING' } });
    const workCenter = await manufacturing.createWorkCenter(principal,
      { code: 'WC-NORTH', name: 'North assembly', orgUnitId: 'north' });
    const routing = await manufacturing.createRouting(principal, { bomId, orgUnitId: 'north',
      steps: [{ workCenterId: workCenter.id, setupMinutes: '5', runMinutesPerUnit: '1' }] });
    expect((await manufacturing.listRoutings(principal))[0]).toMatchObject({ id: routing.id, step_count: 1 });
    expect(await manufacturing.listRoutings(sibling)).toEqual([]);
  });

  it('persists pending actions and replays each stage without duplicate local completion', async () => {
    const order = await manufacturing.createProductionOrder(principal, {
      bomId, warehouseId, finishedUomId: uomId, quantity: '3', orgUnitId: 'north',
    });
    orderId = order.id;
    await expect(manufacturing.releaseProductionOrder(principal, orderId)).rejects.toThrow('inventory unavailable');
    expect((await manufacturing.listProductionOrders(principal))[0]).toMatchObject({ status: 'RESERVING' });
    expect(await manufacturing.releaseProductionOrder(principal, orderId)).toMatchObject({ status: 'RELEASED' });
    expect(reserveCalls).toBe(2);
    await expect(manufacturing.issueProductionOrder(principal, orderId)).rejects.toThrow('issue unavailable');
    expect((await manufacturing.listProductionOrders(principal))[0]).toMatchObject({ status: 'ISSUING' });
    expect(await manufacturing.issueProductionOrder(principal, orderId)).toMatchObject({ status: 'ISSUED' });
    expect(issueCalls).toBe(2);
    await expect(manufacturing.completeProductionOrder(principal, orderId)).rejects.toThrow('receipt unavailable');
    expect((await manufacturing.listProductionOrders(principal))[0]).toMatchObject({ status: 'RECEIVING' });
    expect(await manufacturing.completeProductionOrder(principal, orderId)).toMatchObject({ status: 'COMPLETED' });
    expect(receiptCalls).toBe(2);
    expect(await manufacturing.completeProductionOrder(principal, orderId)).toMatchObject({ status: 'COMPLETED' });
    const outbox = await db.withTenantTransaction(tenantId, (client) => client.query(
      `SELECT event_type FROM ${schema}.outbox_events WHERE tenant_id = $1 AND aggregate_id = $2`, [tenantId, orderId],
    ));
    expect(outbox.rows).toHaveLength(1);
  });
});
