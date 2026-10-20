import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  inventoryPostingCutoffV1,
  inventoryReceiptCompletedPostingPolicyV1,
  inventoryReceiptPostingDate,
} from '@gigalibs/posting-rules';
import { RelayEnvelopeV1Schema, type RelayEnvelopeV1 } from '@gigalibs/contracts';
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

  async receive(rawEnvelope: unknown, rawBody: string): Promise<FinanceInventoryInboxOutcome> {
    const parsed = RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'FINANCE_INBOX_ENVELOPE_INVALID', message: parsed.error.issues[0]?.message });
    }
    const envelope = parsed.data;
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

    const profile = await client.query<{ id: string }>(
      `SELECT id FROM ${SCHEMA}.cost_profiles
        WHERE tenant_id = $1 AND is_default = true AND is_active = true LIMIT 1`,
      [envelope.tenantId],
    );
    const costProfile = profile.rows[0];
    if (!costProfile) {
      this.logger.warn(`Receipt ${payload.data.receiptId}: no default cost profile on tenant ${envelope.tenantId}.`);
      await appendInventoryReceiptPostingOutcome(
        client,
        envelope.tenantId,
        payload.data.receiptId,
        'POSTING_REJECTED',
        'FINANCE_COST_PROFILE_MISSING',
      );
      return { result: { status: 'REJECTED', code: 'FINANCE_COST_PROFILE_MISSING' }, postingDate };
    }

    for (const line of payload.data.lines) {
      const qty = line.receivedQuantity;
      if (!qty || qty === '0') continue;
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
      const sourceDocumentId = inventoryReceiptCompletedPostingPolicyV1.sourceLineDocumentId(
        payload.data.receiptId,
        line.receiptLineId,
      );
      await this.costing.ingestReceiptLayer(
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
      await recordInventoryReceiptLinePosting(client, SCHEMA, {
        tenantId: envelope.tenantId,
        messageId: envelope.messageId,
        sourceDocumentId,
        journalEntryType: inventoryReceiptCompletedPostingPolicyV1.entryType,
      });
    }

    await appendInventoryReceiptPostingOutcome(client, envelope.tenantId, payload.data.receiptId, 'POSTED', null);
    return { result: { status: 'PROCESSED' }, postingDate };
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
