import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModuleCommandContext, ModulePrincipal } from '@gigalibs/module-sdk';
import {
  RMA_CREDIT_MEMO_REQUESTED_V1,
  RMA_SCRAP_GL_REQUESTED_V1,
} from '@gigalibs/contracts';
import { DatabaseService } from '../database.service.js';
import { InventoryHandshakeClient } from '../inventory/inventory-handshake.client.js';
import { startThrowawayPostgres, type ThrowawayPostgres } from '../../scripts/throwaway-postgres.js';
import { RmaService } from './rma.service.js';

const enabled = process.env.UNIVERSAL_RETURNS_PG_PROOF === '1';
const tenantId = 'returns-proof-tenant';
const otherTenant = 'returns-proof-other';

const principal: ModulePrincipal = {
  tenantId,
  subject: 'proof-user',
  sessionId: 'proof-session',
  authVersion: 1,
  permissions: ['*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN',
  organization: { mode: 'ALL' },
  departmentScope: { mode: 'ALL' },
  placeScope: { mode: 'ALL' },
};

function ctx(requestKey?: string): ModuleCommandContext {
  const key = requestKey ?? randomUUID();
  return { principal, correlationId: key };
}

describe.skipIf(!enabled)('Returns RMA damaged scrap + credit memo on isolated PostgreSQL 16 (WI-OI-128 S6)', () => {
  let postgres: ThrowawayPostgres;
  let db: DatabaseService;
  let rma: RmaService;
  let customerPartyId: string;
  let productId: string;
  let uomId: string;
  let rmaId: string;
  let lineId: string;

  beforeAll(async () => {
    postgres = await startThrowawayPostgres(`gigalibs-returns-proof-${process.pid}`);
    db = new DatabaseService({
      databaseUrl: postgres.runtimeUrl,
      databasePoolSize: 5,
      expectedMigrationVersion: 5,
      platformContextAudience: 'proof',
      platformContextPublicKey: 'proof',
      corsOrigins: [],
      apiHost: '127.0.0.1',
      apiPort: 0,
    } as never);
    await db.onModuleInit();
    const inventory = { receiveReturnStock: async () => ({ receiptId: randomUUID(), receiptNumber: 'X', financeCostProfileId: randomUUID() }) } as InventoryHandshakeClient;
    rma = new RmaService(db, inventory);
    customerPartyId = randomUUID();
    productId = randomUUID();
    uomId = randomUUID();
  }, 120_000);

  afterAll(async () => {
    await db?.onModuleDestroy();
    postgres?.stop();
  });

  it('rejects return quantity above invoiced cap', async () => {
    const requestKey = randomUUID();
    await expect(
      rma.create(ctx(requestKey), {
        requestKey,
        rmaNumber: `RMA-BAD-${requestKey.slice(0, 8)}`,
        customerPartyId,
        reason: 'Over-return attempt',
        lines: [
          {
            productId,
            uomId,
            requestedQuantity: '3',
            invoicedQuantityCap: '2',
          },
        ],
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof BadRequestException)) return false;
      const body = error.getResponse();
      return typeof body === 'object' && body !== null && (body as { code?: string }).code === 'RMA_QUANTITY_EXCEEDS_INVOICED';
    });
  });

  it('runs submit → authorize → partial scrap → credit memo with separate relay leases', async () => {
    const createKey = randomUUID();
    const created = await rma.create(ctx(createKey), {
      requestKey: createKey,
      rmaNumber: `RMA-DMG-${createKey.slice(0, 8)}`,
      customerPartyId,
      reason: 'Damaged in transit — partial scrap',
      lines: [
        {
          productId,
          uomId,
          requestedQuantity: '2',
          invoicedQuantityCap: '2',
        },
      ],
    });
    expect(created.replayed).toBe(false);
    rmaId = created.rma.id;
    lineId = created.rma.lines[0]!.id;

    let current = created.rma;
    const submitKey = randomUUID();
    current = await rma.submit(ctx(submitKey), rmaId, {
      requestKey: submitKey,
      expectedVersion: current.version,
    });
    expect(current.status).toBe('SUBMITTED');

    const authorizeKey = randomUUID();
    current = await rma.authorize(ctx(authorizeKey), rmaId, {
      requestKey: authorizeKey,
      expectedVersion: current.version,
    });
    expect(current.status).toBe('AUTHORIZED');
    expect(Number.parseFloat(current.lines[0]!.authorizedQuantity)).toBe(2);

    const dispositionKey = randomUUID();
    await rma.recordDisposition(ctx(dispositionKey), rmaId, {
      requestKey: dispositionKey,
      rmaLineId: lineId,
      dispositionCode: 'SCRAP',
      quantity: '1',
      notes: 'Photo ref DOC-SCAN-001 — crushed corner',
      requestCreditMemo: false,
    });

    const afterScrap = await rma.get(ctx(), rmaId);
    expect(Number.parseFloat(afterScrap.lines[0]!.receivedQuantity)).toBe(1);

    await db.withTenantTransaction(tenantId, async (client) => {
      const scrap = await client.query<{ event_type: string; status: string }>(
        `SELECT event_type, status FROM gigalibs_universal_returns.outbox_events
          WHERE tenant_id = $1 AND event_type = $2`,
        [tenantId, RMA_SCRAP_GL_REQUESTED_V1],
      );
      expect(scrap.rowCount).toBe(1);
      expect(scrap.rows[0]?.status).toBe('PENDING');
    });

    const financeLeased = await db.relayCall<{ id: string; event_type: string }>(
      'relay_lease_returns_finance_events',
      [10, 30],
    );
    expect(financeLeased).toHaveLength(1);
    expect(financeLeased[0]?.event_type).toBe(RMA_SCRAP_GL_REQUESTED_V1);
    await db.relayCall('relay_settle_returns_event', [financeLeased[0]!.id, true, null, null, 10]);

    const creditKey = randomUUID();
    await rma.requestCreditMemo(ctx(creditKey), rmaId, {
      requestKey: creditKey,
      expectedVersion: afterScrap.version,
      currencyCode: 'USD',
      lines: [{ rmaLineId: lineId, unitPriceMinor: '1500', reason: 'Partial refund for scrapped unit' }],
    });

    const ordersLeased = await db.relayCall<{ id: string; event_type: string }>(
      'relay_lease_returns_orders_events',
      [10, 30],
    );
    expect(ordersLeased).toHaveLength(1);
    expect(ordersLeased[0]?.event_type).toBe(RMA_CREDIT_MEMO_REQUESTED_V1);

    const replay = await rma.recordDisposition(ctx(dispositionKey), rmaId, {
      requestKey: dispositionKey,
      rmaLineId: lineId,
      dispositionCode: 'SCRAP',
      quantity: '1',
      notes: 'Photo ref DOC-SCAN-001 — crushed corner',
      requestCreditMemo: false,
    });
    expect(Number.parseFloat(replay.lines[0]!.receivedQuantity)).toBe(1);
  });

  it('isolates tenants on RMA reads', async () => {
    await expect(
      db.withTenantTransaction(otherTenant, (client) =>
        client.query('SELECT 1 FROM gigalibs_universal_returns.rma WHERE tenant_id = $1 AND id = $2', [
          otherTenant,
          rmaId,
        ]),
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
  });
});
