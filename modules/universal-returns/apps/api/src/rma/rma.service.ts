import { createHash, randomUUID } from 'node:crypto';
import {
  RmaV1Schema,
  assertReturnQuantityWithinInvoiced,
  type CreateRmaInputV1,
  type RmaDocumentActionInputV1,
  type RmaV1,
  type RecordRmaDispositionInputV1,
  type RequestRmaCreditMemoInputV1,
  RMA_CREDIT_MEMO_REQUESTED_V1,
} from '@gigalibs/contracts';
import {
  DocumentIdempotencyConflictError,
  DocumentTransitionRefusedError,
  DocumentVersionConflictError,
  executeTransactionalDocumentAction,
  type DocumentTransitionGraph,
} from '@gigalibs/document-lifecycle';
import { type ModuleCommandContext, recordMutation } from '@gigalibs/module-sdk';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';

interface RmaRow {
  id: string;
  tenant_id: string;
  rma_number: string;
  status: string;
  customer_party_id: string;
  sales_order_id: string | null;
  customer_invoice_id: string | null;
  orders_return_id: string | null;
  reason: string;
  version: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface RmaLineRow {
  id: string;
  line_number: number;
  product_id: string;
  uom_id: string;
  requested_quantity: string;
  authorized_quantity: string;
  received_quantity: string;
  invoiced_quantity_cap: string;
  sales_order_line_id: string | null;
  customer_invoice_line_id: string | null;
}

function requestHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function toRma(row: RmaRow, lines: RmaLineRow[]): RmaV1 {
  return RmaV1Schema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    rmaNumber: row.rma_number,
    status: row.status,
    customerPartyId: row.customer_party_id,
    salesOrderId: row.sales_order_id,
    customerInvoiceId: row.customer_invoice_id,
    ordersReturnId: row.orders_return_id,
    reason: row.reason,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    lines: lines.map((line) => ({
      id: line.id,
      lineNumber: line.line_number,
      productId: line.product_id,
      uomId: line.uom_id,
      requestedQuantity: line.requested_quantity,
      authorizedQuantity: line.authorized_quantity,
      receivedQuantity: line.received_quantity,
      invoicedQuantityCap: line.invoiced_quantity_cap,
      salesOrderLineId: line.sales_order_line_id,
      customerInvoiceLineId: line.customer_invoice_line_id,
    })),
  });
}

async function loadRma(client: PoolClient, tenantId: string, rmaId: string): Promise<RmaV1> {
  const header = await client.query<RmaRow>(
    `SELECT * FROM ${SCHEMA}.rma WHERE tenant_id = $1 AND id = $2`,
    [tenantId, rmaId],
  );
  if (!header.rows[0]) throw new NotFoundException({ code: 'RMA_NOT_FOUND' });
  const lines = await client.query<RmaLineRow>(
    `SELECT id, line_number, product_id, uom_id, requested_quantity::text, authorized_quantity::text,
            received_quantity::text, invoiced_quantity_cap::text, sales_order_line_id, customer_invoice_line_id
       FROM ${SCHEMA}.rma_lines WHERE tenant_id = $1 AND rma_id = $2 ORDER BY line_number`,
    [tenantId, rmaId],
  );
  return toRma(header.rows[0], lines.rows);
}

async function readOutcome(
  client: PoolClient,
  tenantId: string,
  documentId: string,
  action: string,
  key: string,
  hash: string,
): Promise<RmaV1 | null> {
  const result = await client.query<{ request_hash: string; result: RmaV1 }>(
    `SELECT request_hash, result FROM ${SCHEMA}.document_action_outcomes
     WHERE tenant_id = $1 AND document_id = $2 AND action = $3 AND idempotency_key = $4`,
    [tenantId, documentId, action, key],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.request_hash !== hash) throw new DocumentIdempotencyConflictError();
  return RmaV1Schema.parse(row.result);
}

async function writeOutcome(
  client: PoolClient,
  tenantId: string,
  documentId: string,
  action: string,
  key: string,
  hash: string,
  rma: RmaV1,
): Promise<void> {
  await client.query(
    `INSERT INTO ${SCHEMA}.document_action_outcomes
       (tenant_id, document_id, action, idempotency_key, request_hash, result)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [tenantId, documentId, action, key, hash, JSON.stringify(rma)],
  );
}

async function ensureDefaultRmaType(client: PoolClient, tenantId: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM ${SCHEMA}.rma_types WHERE tenant_id = $1 AND code = 'STANDARD' LIMIT 1`,
    [tenantId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO ${SCHEMA}.rma_types (tenant_id, code, name) VALUES ($1, 'STANDARD', 'Standard RMA') RETURNING id`,
    [tenantId],
  );
  return inserted.rows[0]!.id;
}

@Injectable()
export class RmaService {
  constructor(private readonly database: DatabaseService) {}

  async list(context: ModuleCommandContext, limit = 50): Promise<{ items: RmaV1[] }> {
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const headers = await client.query<RmaRow>(
        `SELECT * FROM ${SCHEMA}.rma WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT $2`,
        [tenantId, limit],
      );
      const items: RmaV1[] = [];
      for (const row of headers.rows) {
        items.push(await loadRma(client, tenantId, row.id));
      }
      return { items };
    });
  }

  async get(context: ModuleCommandContext, rmaId: string): Promise<RmaV1> {
    return this.database.withTenantTransaction(context.principal.tenantId, (client) =>
      loadRma(client, context.principal.tenantId, rmaId),
    );
  }

  async create(context: ModuleCommandContext, input: CreateRmaInputV1): Promise<{ rma: RmaV1; replayed: boolean }> {
    const tenantId = context.principal.tenantId;
    const hash = requestHash({ action: 'CREATE_RMA', input });
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${SCHEMA}:${tenantId}:rma-create:${input.requestKey}`,
      ]);
      const prior = await readOutcome(client, tenantId, input.requestKey, 'CREATE', input.requestKey, hash);
      if (prior) return { rma: prior, replayed: true };

      for (const line of input.lines) {
        try {
          assertReturnQuantityWithinInvoiced(line.requestedQuantity, line.invoicedQuantityCap);
        } catch {
          throw new BadRequestException({ code: 'RMA_QUANTITY_EXCEEDS_INVOICED' });
        }
      }

      const rmaTypeId = await ensureDefaultRmaType(client, tenantId);
      const rmaId = randomUUID();
      await client.query(
        `INSERT INTO ${SCHEMA}.rma (
           id, tenant_id, rma_number, rma_type_id, customer_party_id, sales_order_id,
           customer_invoice_id, orders_return_id, reason, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          rmaId,
          tenantId,
          input.rmaNumber,
          rmaTypeId,
          input.customerPartyId,
          input.salesOrderId ?? null,
          input.customerInvoiceId ?? null,
          input.ordersReturnId ?? null,
          input.reason,
          context.principal.subject,
        ],
      );
      let lineNumber = 0;
      for (const line of input.lines) {
        lineNumber += 1;
        await client.query(
          `INSERT INTO ${SCHEMA}.rma_lines (
             tenant_id, rma_id, line_number, product_id, uom_id, requested_quantity,
             authorized_quantity, invoiced_quantity_cap, sales_order_line_id, customer_invoice_line_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9)`,
          [
            tenantId,
            rmaId,
            lineNumber,
            line.productId,
            line.uomId,
            line.requestedQuantity,
            line.invoicedQuantityCap,
            line.salesOrderLineId ?? null,
            line.customerInvoiceLineId ?? null,
          ],
        );
      }
      const rma = await loadRma(client, tenantId, rmaId);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'RMA_CREATED',
        aggregateType: 'rma',
        aggregateId: rma.id,
        aggregateVersion: rma.version,
        payload: { rmaNumber: rma.rmaNumber, status: rma.status },
      });
      await writeOutcome(client, tenantId, input.requestKey, 'CREATE', input.requestKey, hash, rma);
      return { rma, replayed: false };
    });
  }

  async submit(context: ModuleCommandContext, rmaId: string, input: RmaDocumentActionInputV1): Promise<RmaV1> {
    return this.transition(context, rmaId, input, 'submit', 'SUBMIT', { from: ['DRAFT'], to: 'SUBMITTED' });
  }

  async authorize(context: ModuleCommandContext, rmaId: string, input: RmaDocumentActionInputV1): Promise<RmaV1> {
    return this.transition(context, rmaId, input, 'authorize', 'AUTHORIZE', {
      from: ['SUBMITTED'],
      to: 'AUTHORIZED',
      onEnter: async (client, tenantId, id) => {
        await client.query(
          `UPDATE ${SCHEMA}.rma_lines
              SET authorized_quantity = requested_quantity, updated_at = now()
            WHERE tenant_id = $1 AND rma_id = $2`,
          [tenantId, id],
        );
        await client.query(
          `UPDATE ${SCHEMA}.rma SET authorized_by = $3, authorized_at = now() WHERE tenant_id = $1 AND id = $2`,
          [tenantId, id, context.principal.subject],
        );
      },
    });
  }

  private async transition(
    context: ModuleCommandContext,
    rmaId: string,
    input: RmaDocumentActionInputV1,
    actionKey: string,
    auditAction: string,
    spec: {
      from: readonly string[];
      to: string;
      onEnter?: (client: PoolClient, tenantId: string, id: string) => Promise<void>;
    },
  ): Promise<RmaV1> {
    const tenantId = context.principal.tenantId;
    const hash = requestHash({ action: actionKey, rmaId, input });
    try {
      return await executeTransactionalDocumentAction<PoolClient, RmaRow, RmaV1>(
        {
          tenantId,
          actorId: context.principal.subject,
          documentId: rmaId,
          action: actionKey,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.requestKey,
          requestHash: hash,
        },
        {
          withTransaction: (operation) => this.database.withTenantTransaction(tenantId, operation),
          lockDocument: async (client) => {
            const locked = await client.query<RmaRow>(
              `SELECT * FROM ${SCHEMA}.rma WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
              [tenantId, rmaId],
            );
            if (!locked.rows[0]) throw new NotFoundException({ code: 'RMA_NOT_FOUND' });
            const row = locked.rows[0];
            return { ...row, status: row.status, version: Number(row.version) };
          },
          authorize: async () => undefined,
          findOutcome: async (client, actionInput) => {
            const previous = await readOutcome(
              client,
              tenantId,
              rmaId,
              actionInput.action,
              actionInput.idempotencyKey,
              hash,
            );
            return previous ? { requestHash: hash, result: previous } : null;
          },
          graph: (client): DocumentTransitionGraph<RmaRow> => ({
            [actionKey]: {
              from: [...spec.from],
              to: spec.to,
              effect: async () => {
                if (spec.onEnter) await spec.onEnter(client, tenantId, rmaId);
                const updated = await client.query<RmaRow>(
                  `UPDATE ${SCHEMA}.rma
                      SET status = $3, version = version + 1, updated_at = now()
                    WHERE tenant_id = $1 AND id = $2
                    RETURNING *`,
                  [tenantId, rmaId, spec.to],
                );
                const lines = await client.query<RmaLineRow>(
                  `SELECT id, line_number, product_id, uom_id, requested_quantity::text, authorized_quantity::text,
                          received_quantity::text, invoiced_quantity_cap::text, sales_order_line_id, customer_invoice_line_id
                     FROM ${SCHEMA}.rma_lines WHERE tenant_id = $1 AND rma_id = $2 ORDER BY line_number`,
                  [tenantId, rmaId],
                );
                return toRma(updated.rows[0]!, lines.rows);
              },
            },
          }),
          appendAudit: async (client, _ctx, rma) => {
            await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
              action: auditAction,
              aggregateType: 'rma',
              aggregateId: rma.id,
              aggregateVersion: rma.version,
              payload: { status: rma.status },
            });
          },
          appendOutbox: async () => undefined,
          storeOutcome: (client, actionInput, rma) =>
            writeOutcome(client, tenantId, rmaId, actionInput.action, actionInput.idempotencyKey, hash, rma),
        },
      );
    } catch (error) {
      if (
        error instanceof DocumentIdempotencyConflictError ||
        error instanceof DocumentTransitionRefusedError ||
        error instanceof DocumentVersionConflictError
      ) {
        throw new ConflictException({ code: error.name });
      }
      throw error;
    }
  }

  async recordDisposition(
    context: ModuleCommandContext,
    rmaId: string,
    input: RecordRmaDispositionInputV1,
  ): Promise<RmaV1> {
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const header = await client.query<RmaRow>(
        `SELECT * FROM ${SCHEMA}.rma WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, rmaId],
      );
      if (!header.rows[0]) throw new NotFoundException({ code: 'RMA_NOT_FOUND' });
      if (!['AUTHORIZED', 'INSPECTING', 'RECEIVING'].includes(header.rows[0].status)) {
        throw new ConflictException({ code: 'RMA_DISPOSITION_NOT_ALLOWED' });
      }
      const line = await client.query<RmaLineRow>(
        `SELECT id, line_number, product_id, uom_id, requested_quantity::text, authorized_quantity::text,
                received_quantity::text, invoiced_quantity_cap::text, sales_order_line_id, customer_invoice_line_id
           FROM ${SCHEMA}.rma_lines
          WHERE tenant_id = $1 AND rma_id = $2 AND id = $3 FOR UPDATE`,
        [tenantId, rmaId, input.rmaLineId],
      );
      if (!line.rows[0]) throw new NotFoundException({ code: 'RMA_LINE_NOT_FOUND' });

      await client.query(
        `INSERT INTO ${SCHEMA}.dispositions (
           tenant_id, rma_line_id, disposition_code, quantity, inspected_by, notes, credit_memo_requested
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenantId,
          input.rmaLineId,
          input.dispositionCode,
          input.quantity,
          context.principal.subject,
          input.notes ?? null,
          input.requestCreditMemo,
        ],
      );
      await client.query(
        `UPDATE ${SCHEMA}.rma_lines
            SET received_quantity = received_quantity + $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.rmaLineId, input.quantity],
      );
      await client.query(
        `UPDATE ${SCHEMA}.rma SET version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, rmaId],
      );
      const rma = await loadRma(client, tenantId, rmaId);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'RMA_DISPOSITION_RECORDED',
        aggregateType: 'rma',
        aggregateId: rma.id,
        aggregateVersion: rma.version,
        payload: {
          rmaLineId: input.rmaLineId,
          dispositionCode: input.dispositionCode,
          quantity: input.quantity,
        },
      });
      return rma;
    });
  }

  async requestCreditMemo(
    context: ModuleCommandContext,
    rmaId: string,
    input: RequestRmaCreditMemoInputV1,
  ): Promise<RmaV1> {
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const rma = await loadRma(client, tenantId, rmaId);
      if (rma.version !== input.expectedVersion) {
        throw new ConflictException({ code: 'DocumentVersionConflictError' });
      }
      const nextVersion = rma.version + 1;
      const outboxPayload = {
        rmaId: rma.id,
        customerPartyId: rma.customerPartyId,
        salesOrderId: rma.salesOrderId,
        customerInvoiceId: rma.customerInvoiceId,
        currencyCode: input.currencyCode,
        lines: input.lines,
        aggregateId: rma.id,
        aggregateVersion: nextVersion,
      };
      await client.query(
        `INSERT INTO ${SCHEMA}.audit_events
           (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          randomUUID(),
          tenantId,
          context.principal.subject,
          'RMA_CREDIT_MEMO_REQUESTED',
          'rma',
          rma.id,
          context.correlationId,
          JSON.stringify(outboxPayload),
        ],
      );
      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events
           (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
            correlation_id, schema_version, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9::jsonb)`,
        [
          randomUUID(),
          tenantId,
          TOPIC,
          RMA_CREDIT_MEMO_REQUESTED_V1,
          'rma',
          rma.id,
          nextVersion,
          context.correlationId,
          JSON.stringify(outboxPayload),
        ],
      );
      await client.query(
        `UPDATE ${SCHEMA}.rma SET version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, rmaId],
      );
      return loadRma(client, tenantId, rmaId);
    });
  }
}
