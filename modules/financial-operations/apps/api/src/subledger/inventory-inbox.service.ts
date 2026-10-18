import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  inventoryReceiptCompletedPostingPolicyV1,
  inventoryReceiptPostingDate,
} from '@gigalibs/posting-rules';
import { RelayEnvelopeV1Schema, type RelayEnvelopeV1 } from '@gigalibs/contracts';
import { type InboxReceiptOptions, receiveOnce } from '@gigalibs/module-sdk';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { CostingService } from '../costing/costing.service.js';
import { resolvePrimaryBookPostingContext } from '../posting/finance-posting-context.js';
import { recordInventoryReceiptLinePosting } from '../posting/subledger-posting-register.js';

const CONSUMER = 'finance.inventory-subledger';
const RECEIPTS: InboxReceiptOptions = { schema: SCHEMA, consumer: CONSUMER, sourceModule: 'inventory' };

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
        receivedQuantity: z.string(),
        uomId: z.string().uuid(),
        purchaseOrderId: z.string().uuid().nullable().optional(),
        purchaseOrderLineId: z.string().uuid().nullable().optional(),
      }),
    ),
  })
  .strict();

export type FinanceInventoryInboxOutcome = { readonly status: 'PROCESSED' | 'DUPLICATE' | 'REJECTED'; readonly code?: string };

/** WI-OI-120fq/120fr (F2): Finance consumer for inventory.receipt.completed.v1 with E2 posting policy. */
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
    if (envelope.eventType !== inventoryReceiptCompletedPostingPolicyV1.eventType) {
      throw new BadRequestException({ code: 'FINANCE_INBOX_EVENT_UNKNOWN', message: `No consumer for ${envelope.eventType}.` });
    }
    return this.database.withTenantTransaction(envelope.tenantId, (client) =>
      receiveOnce(client, RECEIPTS, envelope, rawBody, () => this.apply(client, envelope)),
    );
  }

  private async apply(client: PoolClient, envelope: RelayEnvelopeV1): Promise<FinanceInventoryInboxOutcome> {
    const payload = ReceiptCompletedPayloadSchema.safeParse(envelope.payload);
    if (!payload.success) return { status: 'REJECTED', code: 'FINANCE_INBOX_PAYLOAD_INVALID' };

    let postingDate: string;
    try {
      postingDate = inventoryReceiptPostingDate(payload.data.receivedAt);
    } catch {
      return { status: 'REJECTED', code: 'FINANCE_INBOX_PAYLOAD_INVALID' };
    }

    const postingContext = await resolvePrimaryBookPostingContext(client, SCHEMA, envelope.tenantId, postingDate);
    if (typeof postingContext === 'string') {
      this.logger.warn(`Receipt ${payload.data.receiptId}: posting context ${postingContext}.`);
      return { status: 'REJECTED', code: postingContext };
    }

    const profile = await client.query<{ id: string; standard_unit_cost_scaled: string | null }>(
      `SELECT id, standard_unit_cost_scaled FROM ${SCHEMA}.cost_profiles
        WHERE tenant_id = $1 AND is_default = true AND is_active = true LIMIT 1`,
      [envelope.tenantId],
    );
    const costProfile = profile.rows[0];
    if (!costProfile?.standard_unit_cost_scaled) {
      this.logger.warn(`Receipt ${payload.data.receiptId}: no default cost profile with standard cost on tenant ${envelope.tenantId}.`);
      return { status: 'REJECTED', code: 'FINANCE_COST_PROFILE_MISSING' };
    }

    for (const line of payload.data.lines) {
      const qty = line.receivedQuantity;
      if (!qty || qty === '0') continue;
      const sourceDocumentId = inventoryReceiptCompletedPostingPolicyV1.sourceLineDocumentId(
        payload.data.receiptId,
        line.receiptLineId,
      );
      await this.costing.ingestReceiptLayer(envelope.tenantId, 'relay:inventory', {
        costProfileId: costProfile.id,
        productId: line.productId,
        warehouseId: payload.data.warehouseId,
        receiptRef: payload.data.receiptNumber,
        receiptDate: payload.data.receivedAt,
        quantity: qty,
        unitCostScaled: String(costProfile.standard_unit_cost_scaled),
        postGlJournal: true,
        bookId: postingContext.bookId,
        periodId: postingContext.periodId,
        journalEntryType: inventoryReceiptCompletedPostingPolicyV1.entryType,
        sourceDocumentType: inventoryReceiptCompletedPostingPolicyV1.sourceDocumentType,
        sourceDocumentId,
      });
      await recordInventoryReceiptLinePosting(client, SCHEMA, {
        tenantId: envelope.tenantId,
        messageId: envelope.messageId,
        sourceDocumentId,
        journalEntryType: inventoryReceiptCompletedPostingPolicyV1.entryType,
      });
    }

    return { status: 'PROCESSED' };
  }
}
