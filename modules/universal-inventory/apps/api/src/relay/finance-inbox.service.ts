import { BadRequestException, Injectable } from '@nestjs/common';
import { RelayEnvelopeV1Schema, type RelayEnvelopeV1 } from '@gigalibs/contracts';
import { type InboxReceiptOptions, receiveOnce } from '@gigalibs/module-sdk';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';

/** Duplicated from @gigalibs/posting-rules to avoid a cross-module import (WI-OI-120bp / ADR-0013). */
const FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1 = 'finance.inventory-receipt.posting-outcome.v1';
const FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1 = 'finance.fiscal-period.state-changed.v1';

const CONSUMER = 'inventory.finance-relay';
const RECEIPTS: InboxReceiptOptions = { schema: SCHEMA, consumer: CONSUMER, sourceModule: 'finance' };

const PostingOutcomeSchema = z
  .object({
    receiptId: z.string().uuid(),
    status: z.enum(['POSTED', 'POSTING_REJECTED']),
    rejectionCode: z.string().optional(),
  })
  .strict();

const FiscalPeriodStateSchema = z
  .object({
    fiscalPeriodId: z.string().uuid(),
    accountingBookId: z.string().uuid(),
    periodName: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    status: z.string(),
    isPrimaryBook: z.boolean(),
  })
  .strict();

export type FinanceInventoryInboxOutcome = { readonly status: 'PROCESSED' | 'DUPLICATE' | 'REJECTED'; readonly code?: string };

@Injectable()
export class FinanceInventoryInboxService {
  constructor(private readonly database: DatabaseService) {}

  async receive(rawEnvelope: unknown, rawBody: string): Promise<FinanceInventoryInboxOutcome> {
    const parsed = RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'INVENTORY_INBOX_ENVELOPE_INVALID', message: parsed.error.issues[0]?.message });
    }
    const envelope = parsed.data;
    return this.database.withTenantTransaction(envelope.tenantId, (client) =>
      receiveOnce(client, RECEIPTS, envelope, rawBody, () => this.apply(client, envelope)),
    );
  }

  private async apply(client: PoolClient, envelope: RelayEnvelopeV1): Promise<FinanceInventoryInboxOutcome> {
    switch (envelope.eventType) {
      case FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1:
        return this.applyPostingOutcome(client, envelope);
      case FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1:
        return this.applyFiscalPeriodState(client, envelope);
      default:
        throw new BadRequestException({ code: 'INVENTORY_INBOX_EVENT_UNKNOWN', message: `No consumer for ${envelope.eventType}.` });
    }
  }

  private async applyPostingOutcome(client: PoolClient, envelope: RelayEnvelopeV1): Promise<FinanceInventoryInboxOutcome> {
    const payload = PostingOutcomeSchema.safeParse(envelope.payload);
    if (!payload.success) return { status: 'REJECTED', code: 'INVENTORY_INBOX_PAYLOAD_INVALID' };

    const current = await client.query<{ finance_posting_status: string | null }>(
      `SELECT finance_posting_status FROM ${SCHEMA}.receipts WHERE tenant_id = $1 AND id = $2`,
      [envelope.tenantId, payload.data.receiptId],
    );
    const existing = current.rows[0]?.finance_posting_status;
    if (existing === 'POSTED' && payload.data.status === 'POSTING_REJECTED') {
      return { status: 'PROCESSED' };
    }

    const rejection =
      payload.data.status === 'POSTING_REJECTED' ? (payload.data.rejectionCode ?? 'FINANCE_POSTING_REJECTED').slice(0, 128) : null;

    const status = payload.data.status;
    await client.query(
      `UPDATE ${SCHEMA}.receipts
          SET finance_posting_status = $3,
              finance_posting_rejection_code = $4,
              updated_at = clock_timestamp()
        WHERE tenant_id = $1 AND id = $2`,
      [envelope.tenantId, payload.data.receiptId, status, status === 'POSTING_REJECTED' ? rejection : null],
    );
    return { status: 'PROCESSED' };
  }

  private async applyFiscalPeriodState(client: PoolClient, envelope: RelayEnvelopeV1): Promise<FinanceInventoryInboxOutcome> {
    const payload = FiscalPeriodStateSchema.safeParse(envelope.payload);
    if (!payload.success) return { status: 'REJECTED', code: 'INVENTORY_INBOX_PAYLOAD_INVALID' };

    if (payload.data.isPrimaryBook) {
      await client.query(
        `INSERT INTO ${SCHEMA}.finance_period_replica_meta (tenant_id, primary_book_id, initial_sync_completed_at)
         VALUES ($1, $2, now())
         ON CONFLICT (tenant_id) DO UPDATE
           SET primary_book_id = EXCLUDED.primary_book_id,
               initial_sync_completed_at = COALESCE(${SCHEMA}.finance_period_replica_meta.initial_sync_completed_at, now())`,
        [envelope.tenantId, payload.data.accountingBookId],
      );
    } else {
      await client.query(
        `INSERT INTO ${SCHEMA}.finance_period_replica_meta (tenant_id, initial_sync_completed_at)
         VALUES ($1, now())
         ON CONFLICT (tenant_id) DO UPDATE
           SET initial_sync_completed_at = COALESCE(${SCHEMA}.finance_period_replica_meta.initial_sync_completed_at, now())`,
        [envelope.tenantId],
      );
    }

    await client.query(
      `INSERT INTO ${SCHEMA}.finance_fiscal_period_replica (
         tenant_id, fiscal_period_id, accounting_book_id, period_name, start_date, end_date, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, clock_timestamp())
       ON CONFLICT (tenant_id, fiscal_period_id) DO UPDATE
         SET accounting_book_id = EXCLUDED.accounting_book_id,
             period_name = EXCLUDED.period_name,
             start_date = EXCLUDED.start_date,
             end_date = EXCLUDED.end_date,
             status = EXCLUDED.status,
             updated_at = clock_timestamp()`,
      [
        envelope.tenantId,
        payload.data.fiscalPeriodId,
        payload.data.accountingBookId,
        payload.data.periodName,
        payload.data.startDate,
        payload.data.endDate,
        payload.data.status,
      ],
    );
    return { status: 'PROCESSED' };
  }
}
