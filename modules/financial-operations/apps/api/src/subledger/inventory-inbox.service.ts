import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  inventoryPostingCutoffV1,
  inventoryReceiptCompletedPostingPolicyV1,
  inventoryReceiptPostingDate,
  inventoryTransferDispatchedPostingPolicyV1,
  inventoryTransferReceivedPostingPolicyV1,
  manufacturingProductionCompletedPostingPolicyV1,
} from '@gigalibs/posting-rules';
import { ExactDecimal, RelayEnvelopeV1Schema, type RelayEnvelopeV1, type FinanceInventoryReceiptCostLineV1 } from '@gigalibs/contracts';
import { type InboxReceiptOptions, receiveOnce } from '@gigalibs/module-sdk';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { CostingService } from '../costing/costing.service.js';
import { resolvePrimaryBookPostingContext } from '../posting/finance-posting-context.js';
import { recordInventoryReceiptLinePosting } from '../posting/subledger-posting-register.js';
import {
  appendInventoryReceiptPostingOutcome,
  ensureInventoryFiscalPeriodSnapshotPublished,
} from './finance-inventory-outbox.js';

const CONSUMER = 'finance.inventory-subledger';
const RECEIPTS: InboxReceiptOptions = {
  schema: SCHEMA,
  consumer: CONSUMER,
  sourceModule: 'inventory',
  storeRawBody: true,
};

const receiptQuantityPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

const ReceiptCompletedPayloadSchema = z
  .object({
    receiptId: z.string().uuid(),
    receiptNumber: z.string(),
    warehouseId: z.string().uuid(),
    orgUnitId: z.string().min(1).max(64).optional(),
    financeCostProfileId: z.string().uuid().optional(),
    valuationMethod: z.enum(['STANDARD', 'FIFO', 'AVERAGE']).optional(),
    receivedAt: z.string(),
    lines: z.array(
      z.object({
        receiptLineId: z.string().uuid(),
        productId: z.string().uuid(),
        receivedQuantity: z
          .string()
          .regex(receiptQuantityPattern, 'receivedQuantity must be a positive decimal with at most six fractional digits'),
        uomId: z.string().uuid(),
        purchaseOrderId: z.string().uuid().nullable().optional(),
        purchaseOrderLineId: z.string().uuid().nullable().optional(),
      }),
    ),
  })
  .strict();

const PostingCutoffPayloadSchema = z
  .object({
    accountingBookId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    periodEnd: z.string(),
    undeliveredReceiptCount: z.number().int().min(0),
  })
  .strict();

const transferQuantityPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

const ManufacturingProductionPayloadSchema = z
  .object({
    productionOrderId: z.string().uuid(),
    orderNumber: z.string().optional(),
    warehouseId: z.string().uuid(),
    finishedProductId: z.string().uuid(),
    inventoryReceiptId: z.string().uuid(),
    quantity: z.string().regex(transferQuantityPattern),
    orgUnitId: z.string().min(1).max(64),
    financeCostProfileId: z.string().uuid(),
    componentLines: z.array(
      z.object({
        productId: z.string().uuid(),
        uomId: z.string().uuid(),
        quantity: z.string().regex(transferQuantityPattern),
      }),
    ),
  })
  .strict();

const TransferPayloadSchema = z
  .object({
    transferId: z.string().uuid(),
    transferNumber: z.string(),
    sourceWarehouseId: z.string().uuid(),
    targetWarehouseId: z.string().uuid(),
    orgUnitId: z.string().min(1).max(64).nullable(),
    financeCostProfileId: z.string().uuid().nullable(),
    valuationMethod: z.enum(['STANDARD', 'MOVING_AVERAGE', 'FIFO', 'AVERAGE']).nullable(),
    lines: z.array(
      z.object({
        productId: z.string().uuid(),
        uomId: z.string().uuid(),
        quantity: z.string().regex(transferQuantityPattern),
      }),
    ),
  })
  .strict();

export type FinanceInventoryInboxOutcome = { readonly status: 'PROCESSED' | 'DUPLICATE' | 'REJECTED'; readonly code?: string };

export type RetryRejectedPostingOutcome =
  | FinanceInventoryInboxOutcome
  | { readonly status: 'NOOP'; readonly message: string };

/** WI-OI-120fq/120fr (F2): Finance consumer for Inventory relay events with E2 posting policy. */
@Injectable()
export class InventorySubledgerInboxService {
  private readonly logger = new Logger(InventorySubledgerInboxService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly costing: CostingService,
  ) {}

  async receive(rawEnvelope: unknown, rawBody: string, source: 'inventory' | 'manufacturing' = 'inventory'): Promise<FinanceInventoryInboxOutcome> {
    const parsed = RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'FINANCE_INBOX_ENVELOPE_INVALID', message: parsed.error.issues[0]?.message });
    }
    const envelope = parsed.data;
    if (source === 'manufacturing' && envelope.eventType !== manufacturingProductionCompletedPostingPolicyV1.eventType) {
      throw new BadRequestException({ code: 'FINANCE_MANUFACTURING_EVENT_FORBIDDEN' });
    }
    if (source === 'inventory' && envelope.eventType === manufacturingProductionCompletedPostingPolicyV1.eventType) {
      throw new BadRequestException({ code: 'FINANCE_MANUFACTURING_ROUTE_REQUIRED' });
    }
    const receipts = source === 'manufacturing'
      ? { ...RECEIPTS, sourceModule: 'universal-manufacturing' }
      : RECEIPTS;
    if (envelope.eventType === inventoryReceiptCompletedPostingPolicyV1.eventType) {
      return this.database.withTenantTransaction(envelope.tenantId, (client) =>
        receiveOnce(client, RECEIPTS, envelope, rawBody, async () => {
          const outcome = await this.applyReceiptCompleted(client, envelope);
          await this.persistInboxPostingDate(client, envelope.tenantId, envelope.messageId, outcome.postingDate);
          return outcome.result;
        }),
      );
    }
    if (envelope.eventType === inventoryPostingCutoffV1.eventType) {
      return this.database.withTenantTransaction(envelope.tenantId, (client) =>
        receiveOnce(client, RECEIPTS, envelope, rawBody, () => this.applyPostingCutoff(client, envelope)),
      );
    }
    if (envelope.eventType === inventoryTransferDispatchedPostingPolicyV1.eventType) {
      return this.database.withTenantTransaction(envelope.tenantId, (client) =>
        receiveOnce(client, RECEIPTS, envelope, rawBody, () => this.applyTransferPosting(client, envelope, 'dispatch')),
      );
    }
    if (envelope.eventType === inventoryTransferReceivedPostingPolicyV1.eventType) {
      return this.database.withTenantTransaction(envelope.tenantId, (client) =>
        receiveOnce(client, RECEIPTS, envelope, rawBody, () => this.applyTransferPosting(client, envelope, 'receive')),
      );
    }
    if (envelope.eventType === manufacturingProductionCompletedPostingPolicyV1.eventType) {
      return this.database.withTenantTransaction(envelope.tenantId, (client) =>
        receiveOnce(client, receipts, envelope, rawBody, () => this.applyManufacturingProductionCompleted(client, envelope)),
      );
    }
    throw new BadRequestException({ code: 'FINANCE_INBOX_EVENT_UNKNOWN', message: `No consumer for ${envelope.eventType}.` });
  }

  /** WI-OI-120bq (H2): re-apply a stored FAILED receipt posting after the cause is fixed. */
  async retryRejectedPosting(
    tenantId: string,
    actorId: string,
    messageId: string,
    reason: string,
  ): Promise<RetryRejectedPostingOutcome> {
    if (!reason.trim()) {
      throw new BadRequestException({ code: 'FINANCE_SUBLEDGER_RETRY_REASON_REQUIRED', message: 'A reason is required.' });
    }
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const receipt = await client.query<{
        id: string;
        status: string;
        raw_body: string | null;
      }>(
        `SELECT id, status, raw_body FROM ${SCHEMA}.inbox_receipts
          WHERE tenant_id = $1 AND consumer_name = $2 AND message_id = $3`,
        [tenantId, CONSUMER, messageId],
      );
      const row = receipt.rows[0];
      if (!row) {
        throw new NotFoundException({ code: 'FINANCE_SUBLEDGER_MESSAGE_NOT_FOUND', message: `Inbox message ${messageId} was not found.` });
      }
      if (row.status === 'PROCESSED') {
        await this.recordRetryAudit(client, tenantId, messageId, actorId, reason, 'NOOP');
        return { status: 'NOOP', message: 'Posting was already processed.' };
      }
      if (row.status !== 'FAILED') {
        throw new BadRequestException({
          code: 'FINANCE_SUBLEDGER_RETRY_NOT_FAILED',
          message: 'Only failed inbox receipts can be retried.',
        });
      }
      if (!row.raw_body) {
        throw new BadRequestException({
          code: 'FINANCE_SUBLEDGER_RETRY_NO_PAYLOAD',
          message: 'The stored relay body is missing; this receipt cannot be retried.',
        });
      }
      const envelope = RelayEnvelopeV1Schema.parse(JSON.parse(row.raw_body));
      if (envelope.eventType !== inventoryReceiptCompletedPostingPolicyV1.eventType) {
        throw new BadRequestException({
          code: 'FINANCE_SUBLEDGER_RETRY_UNSUPPORTED',
          message: 'Only inventory receipt postings can be retried through this endpoint.',
        });
      }
      await client.query(
        `UPDATE ${SCHEMA}.inbox_receipts
            SET status = 'PROCESSING', attempt_count = attempt_count + 1, last_error_code = NULL
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, row.id],
      );
      const outcome = await this.applyReceiptCompleted(client, envelope);
      await this.persistInboxPostingDate(client, tenantId, messageId, outcome.postingDate);
      await client.query(
        `UPDATE ${SCHEMA}.inbox_receipts
            SET status = $3, processed_at = now(), last_error_code = $4
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, row.id, outcome.result.status === 'PROCESSED' ? 'PROCESSED' : 'FAILED', outcome.result.code ?? null],
      );
      await this.recordRetryAudit(
        client,
        tenantId,
        messageId,
        actorId,
        reason,
        outcome.result.status === 'PROCESSED' ? 'PROCESSED' : 'FAILED',
      );
      return outcome.result;
    });
  }

  private async recordRetryAudit(
    client: PoolClient,
    tenantId: string,
    messageId: string,
    actorId: string,
    reason: string,
    outcome: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO ${SCHEMA}.subledger_posting_retries (id, tenant_id, message_id, actor_id, reason, outcome)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), tenantId, messageId, actorId, reason, outcome],
    );
  }

  private async persistInboxPostingDate(
    client: PoolClient,
    tenantId: string,
    messageId: string,
    postingDate: string | null,
  ): Promise<void> {
    if (!postingDate) return;
    await client.query(
      `UPDATE ${SCHEMA}.inbox_receipts SET posting_date = $4::date
        WHERE tenant_id = $1 AND consumer_name = $2 AND message_id = $3`,
      [tenantId, CONSUMER, messageId, postingDate],
    );
  }

  private async applyReceiptCompleted(
    client: PoolClient,
    envelope: RelayEnvelopeV1,
  ): Promise<{ readonly result: FinanceInventoryInboxOutcome; readonly postingDate: string | null }> {
    await ensureInventoryFiscalPeriodSnapshotPublished(client, envelope.tenantId);

    const payload = ReceiptCompletedPayloadSchema.safeParse(envelope.payload);
    if (!payload.success) {
      await appendInventoryReceiptPostingOutcome(
        client,
        envelope.tenantId,
        envelope.aggregateId,
        'POSTING_REJECTED',
        'FINANCE_INBOX_PAYLOAD_INVALID',
      );
      return { result: { status: 'REJECTED', code: 'FINANCE_INBOX_PAYLOAD_INVALID' }, postingDate: null };
    }

    let postingDate: string;
    try {
      postingDate = inventoryReceiptPostingDate(payload.data.receivedAt);
    } catch {
      await appendInventoryReceiptPostingOutcome(
        client,
        envelope.tenantId,
        payload.data.receiptId,
        'POSTING_REJECTED',
        'FINANCE_INBOX_PAYLOAD_INVALID',
      );
      return { result: { status: 'REJECTED', code: 'FINANCE_INBOX_PAYLOAD_INVALID' }, postingDate: null };
    }

    const postingContext = await resolvePrimaryBookPostingContext(client, SCHEMA, envelope.tenantId, postingDate);
    if (typeof postingContext === 'string') {
      this.logger.warn(`Receipt ${payload.data.receiptId}: posting context ${postingContext}.`);
      await appendInventoryReceiptPostingOutcome(
        client,
        envelope.tenantId,
        payload.data.receiptId,
        'POSTING_REJECTED',
        postingContext,
      );
      return { result: { status: 'REJECTED', code: postingContext }, postingDate };
    }

    if (!payload.data.orgUnitId || !payload.data.financeCostProfileId || !payload.data.valuationMethod) {
      await appendInventoryReceiptPostingOutcome(client, envelope.tenantId, payload.data.receiptId,
        'POSTING_REJECTED', 'FINANCE_ORG_COST_PROFILE_MISSING');
      return { result: { status: 'REJECTED', code: 'FINANCE_ORG_COST_PROFILE_MISSING' }, postingDate };
    }
    const profile = await client.query<{ id: string; costing_method: FinanceInventoryReceiptCostLineV1['valuationMethod'] }>(
      `SELECT id, costing_method FROM ${SCHEMA}.cost_profiles
        WHERE tenant_id = $1 AND id = $2 AND is_active = true LIMIT 1`,
      [envelope.tenantId, payload.data.financeCostProfileId],
    );
    const costProfile = profile.rows[0];
    if (!costProfile) {
      this.logger.warn(`Receipt ${payload.data.receiptId}: Finance cost profile ${payload.data.financeCostProfileId} is unavailable on tenant ${envelope.tenantId}.`);
      await appendInventoryReceiptPostingOutcome(
        client,
        envelope.tenantId,
        payload.data.receiptId,
        'POSTING_REJECTED',
        'FINANCE_COST_PROFILE_MISSING',
      );
      return { result: { status: 'REJECTED', code: 'FINANCE_COST_PROFILE_MISSING' }, postingDate };
    }
    if (costProfile.costing_method !== payload.data.valuationMethod) {
      await appendInventoryReceiptPostingOutcome(client, envelope.tenantId, payload.data.receiptId,
        'POSTING_REJECTED', 'FINANCE_COST_METHOD_MISMATCH');
      return { result: { status: 'REJECTED', code: 'FINANCE_COST_METHOD_MISMATCH' }, postingDate };
    }

    const pricedLines: Array<{ line: (typeof payload.data.lines)[number]; unitCostScaled: string }> = [];
    for (const line of payload.data.lines) {
      const qty = line.receivedQuantity;
      if (ExactDecimal.isZero(qty)) continue;
      const unitCostScaled = await this.costing.resolveProductStandardUnitCostScaled(
        client,
        envelope.tenantId,
        costProfile.id,
        line.productId,
        postingDate,
      );
      if (!unitCostScaled) {
        await appendInventoryReceiptPostingOutcome(
          client,
          envelope.tenantId,
          payload.data.receiptId,
          'POSTING_REJECTED',
          'FINANCE_STANDARD_COST_MISSING',
        );
        return { result: { status: 'REJECTED', code: 'FINANCE_STANDARD_COST_MISSING' }, postingDate };
      }
      pricedLines.push({ line, unitCostScaled });
    }

    const costLines: FinanceInventoryReceiptCostLineV1[] = [];
    for (const { line, unitCostScaled } of pricedLines) {
      const qty = line.receivedQuantity;
      const sourceDocumentId = inventoryReceiptCompletedPostingPolicyV1.sourceLineDocumentId(
        payload.data.receiptId,
        line.receiptLineId,
      );
      const costLayer = await this.costing.ingestReceiptLayer(
        envelope.tenantId,
        'relay:inventory',
        {
          costProfileId: costProfile.id,
          productId: line.productId,
          warehouseId: payload.data.warehouseId,
          receiptRef: payload.data.receiptNumber,
          receiptDate: payload.data.receivedAt,
          quantity: qty,
          unitCostScaled,
          postGlJournal: true,
          bookId: postingContext.bookId,
          periodId: postingContext.periodId,
          journalEntryType: inventoryReceiptCompletedPostingPolicyV1.entryType,
          sourceDocumentType: inventoryReceiptCompletedPostingPolicyV1.sourceDocumentType,
          sourceDocumentId,
        },
        client,
      );
      costLines.push({
        receiptLineId: line.receiptLineId,
        financeCostLayerId: costLayer.id,
        productId: line.productId,
        quantity: qty,
        valuationMethod: costProfile.costing_method,
        unitCostScaled,
        totalCostMinor: costLayer.totalInitialCostMinor,
      });
      await recordInventoryReceiptLinePosting(client, SCHEMA, {
        tenantId: envelope.tenantId,
        messageId: envelope.messageId,
        sourceDocumentId,
        journalEntryType: inventoryReceiptCompletedPostingPolicyV1.entryType,
      });
    }

    await appendInventoryReceiptPostingOutcome(client, envelope.tenantId, payload.data.receiptId, 'POSTED', null, costLines);
    return { result: { status: 'PROCESSED' }, postingDate };
  }

  /** WI-OI-125 S2: Dr/Cr inventory vs in-transit clearing (landed-cost clearing account) at standard cost. */
  private async applyTransferPosting(
    client: PoolClient,
    envelope: RelayEnvelopeV1,
    phase: 'dispatch' | 'receive',
  ): Promise<FinanceInventoryInboxOutcome> {
    await ensureInventoryFiscalPeriodSnapshotPublished(client, envelope.tenantId);
    const payload = TransferPayloadSchema.safeParse(envelope.payload);
    if (!payload.success) {
      return { status: 'REJECTED', code: 'FINANCE_INBOX_PAYLOAD_INVALID' };
    }
    if (!payload.data.orgUnitId || !payload.data.financeCostProfileId || !payload.data.valuationMethod) {
      return { status: 'REJECTED', code: 'FINANCE_ORG_COST_PROFILE_MISSING' };
    }
    const postingDate = inventoryReceiptPostingDate(envelope.occurredAt);
    const postingContext = await resolvePrimaryBookPostingContext(client, SCHEMA, envelope.tenantId, postingDate);
    if (typeof postingContext === 'string') {
      return { status: 'REJECTED', code: postingContext };
    }
    const profile = await client.query<{
      id: string;
      costing_method: string;
      inventory_gl_account_id: string;
      landed_cost_clearing_gl_account_id: string;
    }>(
      `SELECT id, costing_method, inventory_gl_account_id, landed_cost_clearing_gl_account_id
         FROM ${SCHEMA}.cost_profiles
        WHERE tenant_id = $1 AND id = $2 AND is_active = true LIMIT 1`,
      [envelope.tenantId, payload.data.financeCostProfileId],
    );
    const costProfile = profile.rows[0];
    if (!costProfile) {
      return { status: 'REJECTED', code: 'FINANCE_COST_PROFILE_MISSING' };
    }
    const normalizedMethod =
      payload.data.valuationMethod === 'MOVING_AVERAGE' ? 'AVERAGE' : payload.data.valuationMethod;
    if (costProfile.costing_method !== normalizedMethod) {
      return { status: 'REJECTED', code: 'FINANCE_COST_METHOD_MISMATCH' };
    }
    const bookRes = await client.query<{ currency_code: string }>(
      `SELECT currency_code FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND id = $2`,
      [envelope.tenantId, postingContext.bookId],
    );
    const bookCurrency = bookRes.rows[0]?.currency_code;
    if (!bookCurrency) {
      return { status: 'REJECTED', code: 'FINANCE_BOOK_NOT_FOUND' };
    }
    const policy =
      phase === 'dispatch'
        ? inventoryTransferDispatchedPostingPolicyV1
        : inventoryTransferReceivedPostingPolicyV1;
    const inTransitAccountId = costProfile.landed_cost_clearing_gl_account_id;
    for (const line of payload.data.lines) {
      if (ExactDecimal.isZero(line.quantity)) continue;
      const unitCostScaled = await this.costing.resolveProductStandardUnitCostScaled(
        client,
        envelope.tenantId,
        costProfile.id,
        line.productId,
        postingDate,
      );
      if (!unitCostScaled) {
        return { status: 'REJECTED', code: 'FINANCE_STANDARD_COST_MISSING' };
      }
      const qtyScaled = ExactDecimal.toScaledBigInt(line.quantity);
      const totalCostMinor = (qtyScaled * BigInt(unitCostScaled)) / 10_000_000_000n;
      if (totalCostMinor <= 0n) continue;
      const inventoryLine =
        phase === 'dispatch'
          ? {
              accountId: costProfile.inventory_gl_account_id,
              debitAmountMinor: '0',
              creditAmountMinor: totalCostMinor.toString(),
            }
          : {
              accountId: costProfile.inventory_gl_account_id,
              debitAmountMinor: totalCostMinor.toString(),
              creditAmountMinor: '0',
            };
      const inTransitLine =
        phase === 'dispatch'
          ? {
              accountId: inTransitAccountId,
              debitAmountMinor: totalCostMinor.toString(),
              creditAmountMinor: '0',
            }
          : {
              accountId: inTransitAccountId,
              debitAmountMinor: '0',
              creditAmountMinor: totalCostMinor.toString(),
            };
      const sourceDocumentId = policy.sourceLineDocumentId(payload.data.transferId, line.productId);
      await this.costing.postInventoryTransferJournal(client, envelope.tenantId, 'relay:inventory', {
        accountingBookId: postingContext.bookId,
        fiscalPeriodId: postingContext.periodId,
        postingDate,
        entryType: policy.entryType,
        description: `${phase === 'dispatch' ? 'Dispatch' : 'Receive'} transfer ${payload.data.transferNumber}`,
        sourceDocumentType: policy.sourceDocumentType,
        sourceDocumentId,
        lines: [
          {
            ...inventoryLine,
            currencyCode: bookCurrency,
            exchangeRate: '1.000000',
            memo: `Transfer ${payload.data.transferNumber} inventory`,
          },
          {
            ...inTransitLine,
            currencyCode: bookCurrency,
            exchangeRate: '1.000000',
            memo: `Transfer ${payload.data.transferNumber} in-transit clearing`,
          },
        ],
      });
      await recordInventoryReceiptLinePosting(client, SCHEMA, {
        tenantId: envelope.tenantId,
        messageId: envelope.messageId,
        sourceDocumentId,
        journalEntryType: policy.entryType,
        sourceDocumentType: policy.sourceDocumentType,
        eventType: policy.eventType,
      });
    }
    return { status: 'PROCESSED' };
  }

  /** WI-OI-126 S7: Dr WIP clearing / Cr inventory for component standard cost at production completion. */
  private async applyManufacturingProductionCompleted(
    client: PoolClient,
    envelope: RelayEnvelopeV1,
  ): Promise<FinanceInventoryInboxOutcome> {
    await ensureInventoryFiscalPeriodSnapshotPublished(client, envelope.tenantId);
    const payload = ManufacturingProductionPayloadSchema.safeParse(envelope.payload);
    if (!payload.success) {
      return { status: 'REJECTED', code: 'FINANCE_INBOX_PAYLOAD_INVALID' };
    }
    const postingDate = inventoryReceiptPostingDate(envelope.occurredAt);
    const postingContext = await resolvePrimaryBookPostingContext(client, SCHEMA, envelope.tenantId, postingDate);
    if (typeof postingContext === 'string') {
      return { status: 'REJECTED', code: postingContext };
    }
    const receiptPosted = await client.query<{ posted: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM ${SCHEMA}.subledger_posting_register
          WHERE tenant_id = $1 AND consumer_name = $2
            AND source_document_type = 'INVENTORY_RECEIPT'
            AND source_document_id LIKE $3
            AND journal_id IS NOT NULL
       ) AS posted`,
      [envelope.tenantId, CONSUMER, `${payload.data.inventoryReceiptId}:%`],
    );
    if (!receiptPosted.rows[0]?.posted) {
      throw new ServiceUnavailableException({ code: 'FINANCE_MANUFACTURING_RECEIPT_POSTING_PENDING' });
    }
    const profile = await client.query<{
      id: string;
      costing_method: string;
      inventory_gl_account_id: string;
      grni_gl_account_id: string;
      manufacturing_wip_gl_account_id: string | null;
      manufacturing_variance_gl_account_id: string | null;
    }>(
      `SELECT id, costing_method, inventory_gl_account_id, grni_gl_account_id,
              manufacturing_wip_gl_account_id, manufacturing_variance_gl_account_id
         FROM ${SCHEMA}.cost_profiles
        WHERE tenant_id = $1 AND id = $2 AND is_active = true LIMIT 1`,
      [envelope.tenantId, payload.data.financeCostProfileId],
    );
    const costProfile = profile.rows[0];
    if (!costProfile) {
      return { status: 'REJECTED', code: 'FINANCE_COST_PROFILE_MISSING' };
    }
    if (costProfile.costing_method !== 'STANDARD') {
      return { status: 'REJECTED', code: 'FINANCE_MANUFACTURING_STANDARD_COST_REQUIRED' };
    }
    if (!costProfile.manufacturing_wip_gl_account_id || !costProfile.manufacturing_variance_gl_account_id) {
      return { status: 'REJECTED', code: 'FINANCE_MANUFACTURING_ACCOUNTS_MISSING' };
    }
    const bookRes = await client.query<{ currency_code: string }>(
      `SELECT currency_code FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND id = $2`,
      [envelope.tenantId, postingContext.bookId],
    );
    const bookCurrency = bookRes.rows[0]?.currency_code;
    if (!bookCurrency) {
      return { status: 'REJECTED', code: 'FINANCE_BOOK_NOT_FOUND' };
    }
    const policy = manufacturingProductionCompletedPostingPolicyV1;
    const pricedComponents: Array<{ productId: string; totalCostMinor: bigint }> = [];
    let materialCostMinor = 0n;
    for (const line of payload.data.componentLines) {
      if (ExactDecimal.isZero(line.quantity)) continue;
      const unitCostScaled = await this.costing.resolveProductStandardUnitCostScaled(
        client,
        envelope.tenantId,
        costProfile.id,
        line.productId,
        postingDate,
      );
      if (!unitCostScaled) {
        return { status: 'REJECTED', code: 'FINANCE_STANDARD_COST_MISSING' };
      }
      const qtyScaled = ExactDecimal.toScaledBigInt(line.quantity);
      const totalCostMinor = (qtyScaled * BigInt(unitCostScaled)) / 10_000_000_000n;
      if (totalCostMinor <= 0n) continue;
      pricedComponents.push({ productId: line.productId, totalCostMinor });
      materialCostMinor += totalCostMinor;
    }
    const finishedUnitCost = await this.costing.resolveProductStandardUnitCostScaled(
      client, envelope.tenantId, costProfile.id, payload.data.finishedProductId, postingDate,
    );
    if (!finishedUnitCost) return { status: 'REJECTED', code: 'FINANCE_FINISHED_STANDARD_COST_MISSING' };
    const finishedCostMinor = (ExactDecimal.toScaledBigInt(payload.data.quantity) * BigInt(finishedUnitCost)) / 10_000_000_000n;
    for (const line of pricedComponents) {
      const sourceDocumentId = policy.sourceLineDocumentId(payload.data.productionOrderId, line.productId);
      await this.costing.postInventoryTransferJournal(client, envelope.tenantId, 'relay:manufacturing', {
        accountingBookId: postingContext.bookId,
        fiscalPeriodId: postingContext.periodId,
        postingDate,
        entryType: policy.entryType,
        description: `Production complete ${payload.data.orderNumber ?? payload.data.productionOrderId} WIP material`,
        sourceDocumentType: policy.sourceDocumentType,
        sourceDocumentId,
        lines: [
          {
            accountId: costProfile.manufacturing_wip_gl_account_id,
            debitAmountMinor: line.totalCostMinor.toString(),
            creditAmountMinor: '0',
            currencyCode: bookCurrency,
            exchangeRate: '1.000000',
            memo: 'Manufacturing material to WIP',
          },
          {
            accountId: costProfile.inventory_gl_account_id,
            debitAmountMinor: '0',
            creditAmountMinor: line.totalCostMinor.toString(),
            currencyCode: bookCurrency,
            exchangeRate: '1.000000',
            memo: 'Manufacturing material consumption',
          },
        ],
      });
      await recordInventoryReceiptLinePosting(client, SCHEMA, {
        tenantId: envelope.tenantId,
        messageId: envelope.messageId,
        sourceDocumentId,
        journalEntryType: policy.entryType,
        sourceDocumentType: policy.sourceDocumentType,
        eventType: policy.eventType,
      });
    }
    const varianceMinor = materialCostMinor - finishedCostMinor;
    const finishedLines = [
      { accountId: costProfile.grni_gl_account_id,
        debitAmountMinor: finishedCostMinor.toString(), creditAmountMinor: '0',
        currencyCode: bookCurrency, exchangeRate: '1.000000', memo: 'Clear finished receipt accrual' },
      { accountId: costProfile.manufacturing_wip_gl_account_id,
        debitAmountMinor: '0', creditAmountMinor: finishedCostMinor.toString(),
        currencyCode: bookCurrency, exchangeRate: '1.000000', memo: 'Finished goods released from WIP' },
    ];
    if (varianceMinor > 0n) {
      finishedLines.push(
        { accountId: costProfile.manufacturing_variance_gl_account_id,
          debitAmountMinor: varianceMinor.toString(), creditAmountMinor: '0',
          currencyCode: bookCurrency, exchangeRate: '1.000000', memo: 'Unfavorable production variance' },
        { accountId: costProfile.manufacturing_wip_gl_account_id,
          debitAmountMinor: '0', creditAmountMinor: varianceMinor.toString(),
          currencyCode: bookCurrency, exchangeRate: '1.000000', memo: 'Clear production WIP variance' },
      );
    } else if (varianceMinor < 0n) {
      finishedLines.push(
        { accountId: costProfile.manufacturing_wip_gl_account_id,
          debitAmountMinor: (-varianceMinor).toString(), creditAmountMinor: '0',
          currencyCode: bookCurrency, exchangeRate: '1.000000', memo: 'Clear favorable production WIP variance' },
        { accountId: costProfile.manufacturing_variance_gl_account_id,
          debitAmountMinor: '0', creditAmountMinor: (-varianceMinor).toString(),
          currencyCode: bookCurrency, exchangeRate: '1.000000', memo: 'Favorable production variance' },
      );
    }
    const finishedSourceId = `${payload.data.productionOrderId}:finished`;
    await this.costing.postInventoryTransferJournal(client, envelope.tenantId, 'relay:manufacturing', {
      accountingBookId: postingContext.bookId,
      fiscalPeriodId: postingContext.periodId,
      postingDate,
      entryType: policy.entryType,
      description: `Production complete ${payload.data.orderNumber ?? payload.data.productionOrderId} finished goods and variance`,
      sourceDocumentType: policy.sourceDocumentType,
      sourceDocumentId: finishedSourceId,
      lines: finishedLines,
    });
    await recordInventoryReceiptLinePosting(client, SCHEMA, {
      tenantId: envelope.tenantId, messageId: envelope.messageId,
      sourceDocumentId: finishedSourceId, journalEntryType: policy.entryType,
      sourceDocumentType: policy.sourceDocumentType, eventType: policy.eventType,
    });
    return { status: 'PROCESSED' };
  }

  private async applyPostingCutoff(client: PoolClient, envelope: RelayEnvelopeV1): Promise<FinanceInventoryInboxOutcome> {
    const payload = PostingCutoffPayloadSchema.safeParse(envelope.payload);
    if (!payload.success) {
      return { status: 'REJECTED', code: 'FINANCE_INBOX_PAYLOAD_INVALID' };
    }
    if (payload.data.undeliveredReceiptCount !== 0) {
      return { status: 'REJECTED', code: 'FINANCE_INVENTORY_CUTOFF_NOT_CLEAR' };
    }
    await client.query(
      `INSERT INTO ${SCHEMA}.inventory_posting_cutoff_confirmations (
         tenant_id, accounting_book_id, fiscal_period_id, period_end, undelivered_receipt_count, source_message_id
       ) VALUES ($1, $2, $3, $4::date, 0, $5)
       ON CONFLICT (tenant_id, fiscal_period_id)
       DO UPDATE SET
         accounting_book_id = EXCLUDED.accounting_book_id,
         period_end = EXCLUDED.period_end,
         undelivered_receipt_count = 0,
         source_message_id = EXCLUDED.source_message_id,
         confirmed_at = now()`,
      [
        envelope.tenantId,
        payload.data.accountingBookId,
        payload.data.fiscalPeriodId,
        payload.data.periodEnd,
        envelope.messageId,
      ],
    );
    return { status: 'PROCESSED' };
  }
}
