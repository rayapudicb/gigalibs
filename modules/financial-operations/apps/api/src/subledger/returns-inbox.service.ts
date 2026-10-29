import {
  ExactDecimal,
  RMA_SCRAP_GL_REQUESTED_V1,
  RmaScrapGlRequestedPayloadV1Schema,
  RelayEnvelopeV1Schema,
  type RelayEnvelopeV1,
} from '@gigalibs/contracts';
import { receiveOnce, type InboxReceiptOptions } from '@gigalibs/module-sdk';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { CostingService } from '../costing/costing.service.js';
import { inventoryReceiptPostingDate } from '@gigalibs/posting-rules';
import { resolvePrimaryBookPostingContext } from '../posting/finance-posting-context.js';

const CONSUMER = 'finance.returns.rma_scrap';
const RECEIPTS: InboxReceiptOptions = {
  schema: SCHEMA,
  consumer: CONSUMER,
  sourceModule: 'universal-returns',
  storeRawBody: true,
};

@Injectable()
export class ReturnsInboxService {
  constructor(
    private readonly database: DatabaseService,
    private readonly costing: CostingService,
  ) {}

  async receive(rawEnvelope: unknown, rawBody: string): Promise<{ status: string }> {
    const envelope = RelayEnvelopeV1Schema.parse(rawEnvelope);
    if (envelope.eventType !== RMA_SCRAP_GL_REQUESTED_V1 || envelope.aggregateType !== 'rma_disposition') {
      throw new BadRequestException({ code: 'FINANCE_RETURNS_EVENT_UNSUPPORTED' });
    }
    return this.database.withTenantTransaction(envelope.tenantId, (client) =>
      receiveOnce(client, RECEIPTS, envelope, rawBody, () => this.applyRmaScrapGl(client, envelope)),
    );
  }

  private async applyRmaScrapGl(
    client: PoolClient,
    envelope: RelayEnvelopeV1,
  ): Promise<{ status: string; code?: string }> {
    const payload = RmaScrapGlRequestedPayloadV1Schema.parse(envelope.payload);
    if (envelope.aggregateId !== payload.dispositionId) {
      return { status: 'REJECTED', code: 'FINANCE_RETURNS_AGGREGATE_MISMATCH' };
    }
    const postingDate = inventoryReceiptPostingDate(new Date().toISOString());
    const postingContext = await resolvePrimaryBookPostingContext(client, SCHEMA, envelope.tenantId, postingDate);
    if (typeof postingContext === 'string') {
      return { status: 'REJECTED', code: postingContext };
    }
    const profileRes = await client.query<{
      id: string;
      scrap_gl_account_id: string;
      inventory_gl_account_id: string;
    }>(
      `SELECT id, scrap_gl_account_id, inventory_gl_account_id
         FROM ${SCHEMA}.cost_profiles
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY is_default DESC, created_at ASC
        LIMIT 1`,
      [envelope.tenantId],
    );
    const profile = profileRes.rows[0];
    if (!profile?.scrap_gl_account_id || !profile.inventory_gl_account_id) {
      return { status: 'REJECTED', code: 'FINANCE_RETURNS_COST_PROFILE_MISSING' };
    }
    const unitCostScaled = await this.costing.resolveProductStandardUnitCostScaled(
      client,
      envelope.tenantId,
      profile.id,
      payload.productId,
      postingDate,
    );
    if (!unitCostScaled) {
      return { status: 'REJECTED', code: 'FINANCE_RETURNS_STANDARD_COST_MISSING' };
    }
    const totalMinor =
      (ExactDecimal.toScaledBigInt(payload.quantity) * BigInt(unitCostScaled)) / 10_000_000_000n;
    if (totalMinor <= 0n) {
      return { status: 'REJECTED', code: 'FINANCE_RETURNS_SCRAP_AMOUNT_ZERO' };
    }
    const bookRes = await client.query<{ currency_code: string }>(
      `SELECT currency_code FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND id = $2`,
      [envelope.tenantId, postingContext.bookId],
    );
    const currencyCode = bookRes.rows[0]?.currency_code ?? 'USD';
    await this.costing.postInventoryTransferJournal(client, envelope.tenantId, 'relay:returns', {
      accountingBookId: postingContext.bookId,
      fiscalPeriodId: postingContext.periodId,
      postingDate: postingContext.postingDate,
      entryType: 'SUBLEDGER_INVENTORY',
      description: `RMA scrap disposition ${payload.dispositionId}`,
      sourceDocumentType: 'RMA_DISPOSITION',
      sourceDocumentId: payload.dispositionId,
      lines: [
        {
          accountId: profile.scrap_gl_account_id,
          debitAmountMinor: totalMinor.toString(),
          creditAmountMinor: '0',
          currencyCode,
          exchangeRate: '1.000000',
          memo: 'RMA scrap expense',
        },
        {
          accountId: profile.inventory_gl_account_id,
          debitAmountMinor: '0',
          creditAmountMinor: totalMinor.toString(),
          currencyCode,
          exchangeRate: '1.000000',
          memo: 'RMA scrap inventory relief',
        },
      ],
    });
    return { status: 'PROCESSED', code: payload.dispositionId };
  }
}
