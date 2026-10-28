import { createHash, randomUUID } from 'node:crypto';
import {
  ArCreditInvoiceBalanceV1Schema,
  OrdersCreditUninvoicedBalanceV1Schema,
  RelayEnvelopeV1Schema,
  type RelayEnvelopeV1,
} from '@gigalibs/contracts';
import { receiveOnce } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import type { CreditComponent } from './exposure.js';
import { markFeedReady } from './feed-marks.js';

const RECEIPTS = { schema: SCHEMA, consumer: 'business-partners.credit-inbox' } as const;
const MAX_MINOR = 9223372036854775807n;

interface Position {
  party_id: string;
  org_unit_id: string;
  currency_code: string;
  source_version: number;
  balance_minor: string;
  source_event_id: string | null;
}

interface BalanceFact {
  documentId: string;
  customerPartyId: string;
  orgUnitId: string;
  currencyCode: string;
  sourceVersion: number;
  balanceMinor: bigint;
}

/** Converts AR and Orders balance snapshots into immutable credit deltas. */
@Injectable()
export class CreditInboxService {
  constructor(private readonly database: DatabaseService) {}

  async receive(raw: unknown, rawBody: string) {
    const parsed = RelayEnvelopeV1Schema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException({ code: 'CREDIT_ENVELOPE_INVALID' });
    const envelope = parsed.data;
    const fact = this.parseFact(envelope);
    if (!fact) throw new BadRequestException({ code: 'CREDIT_FACT_INVALID' });
    if (fact.balanceMinor > MAX_MINOR) throw new BadRequestException({ code: 'CREDIT_AMOUNT_OUT_OF_RANGE' });

    const consumer = `${RECEIPTS.consumer}:${fact.sourceModule}`;
    return this.database.withTenantTransaction(envelope.tenantId, async (client) => {
      const outcome = await receiveOnce(client, {
        schema: RECEIPTS.schema,
        consumer,
        sourceModule: fact.sourceModule,
      }, envelope, rawBody, () => this.apply(client, envelope, fact));
      if (outcome.status === 'DUPLICATE') {
        const receipt = await client.query<{ payload_sha256: string }>(
          `SELECT payload_sha256 FROM ${SCHEMA}.inbox_receipts
           WHERE tenant_id = $1 AND consumer_name = $2 AND message_id = $3`,
          [envelope.tenantId, consumer, envelope.messageId],
        );
        const hash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
        if (receipt.rows[0]?.payload_sha256 !== hash) {
          throw new ConflictException({ code: 'CREDIT_MESSAGE_REPLAY_CONFLICT' });
        }
      }
      return outcome;
    });
  }

  private parseFact(envelope: RelayEnvelopeV1): (BalanceFact & {
    sourceModule: string;
    component: CreditComponent;
  }) | null {
    if (envelope.schemaVersion !== 1) return null;
    if (envelope.eventType === 'ar.credit.invoice-balance.v1' && envelope.aggregateType === 'invoice') {
      const fact = ArCreditInvoiceBalanceV1Schema.safeParse(envelope.payload);
      if (!fact.success || envelope.aggregateId !== fact.data.invoiceId ||
          envelope.aggregateVersion !== fact.data.sourceVersion) return null;
      return {
        sourceModule: 'accounts-receivable',
        component: 'OPEN_AR',
        documentId: fact.data.invoiceId,
        customerPartyId: fact.data.customerPartyId,
        orgUnitId: fact.data.orgUnitId,
        currencyCode: fact.data.currencyCode,
        sourceVersion: fact.data.sourceVersion,
        balanceMinor: BigInt(fact.data.openAmountMinor),
      };
    }
    if (envelope.eventType === 'orders.credit.uninvoiced-balance.v1' && envelope.aggregateType === 'sales_order') {
      const fact = OrdersCreditUninvoicedBalanceV1Schema.safeParse(envelope.payload);
      if (!fact.success || envelope.aggregateId !== fact.data.orderId ||
          envelope.aggregateVersion !== fact.data.sourceVersion) return null;
      return {
        sourceModule: 'universal-orders',
        component: 'UNINVOICED_ORDER',
        documentId: fact.data.orderId,
        customerPartyId: fact.data.customerPartyId,
        orgUnitId: fact.data.orgUnitId,
        currencyCode: fact.data.currencyCode,
        sourceVersion: fact.data.sourceVersion,
        balanceMinor: BigInt(fact.data.uninvoicedAmountMinor),
      };
    }
    return null;
  }

  private async apply(
    client: PoolClient,
    envelope: RelayEnvelopeV1,
    fact: BalanceFact & { sourceModule: string; component: CreditComponent },
  ): Promise<{ status: 'PROCESSED' }> {
    const party = await client.query(`SELECT 1 FROM ${SCHEMA}.party_references
      WHERE tenant_id = $1 AND party_id = $2`, [envelope.tenantId, fact.customerPartyId]);
    if (!party.rowCount) throw new ServiceUnavailableException({ code: 'CREDIT_PARTY_PROJECTION_PENDING' });

    await client.query(`INSERT INTO ${SCHEMA}.credit_source_positions
      (tenant_id, source_module, source_document_id, component, party_id, org_unit_id,
       currency_code, source_version, balance_minor)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0)
      ON CONFLICT (tenant_id, source_module, source_document_id, component) DO NOTHING`,
    [envelope.tenantId, fact.sourceModule, fact.documentId, fact.component,
      fact.customerPartyId, fact.orgUnitId, fact.currencyCode]);
    const current = await client.query<Position>(`SELECT party_id, org_unit_id, currency_code, source_version,
        balance_minor::text, source_event_id FROM ${SCHEMA}.credit_source_positions
      WHERE tenant_id = $1 AND source_module = $2 AND source_document_id = $3 AND component = $4 FOR UPDATE`,
    [envelope.tenantId, fact.sourceModule, fact.documentId, fact.component]);
    const row = current.rows[0];
    if (!row) throw new Error('Credit source position was not created.');
    if (row.party_id !== fact.customerPartyId || row.org_unit_id !== fact.orgUnitId ||
        row.currency_code !== fact.currencyCode) {
      throw new ConflictException({ code: 'CREDIT_SOURCE_OWNER_CHANGED' });
    }
    if (fact.sourceVersion < row.source_version) {
      throw new ConflictException({ code: 'CREDIT_SOURCE_VERSION_STALE' });
    }
    if (fact.sourceVersion === row.source_version) {
      if (fact.balanceMinor !== BigInt(row.balance_minor) || envelope.messageId !== row.source_event_id) {
        throw new ConflictException({ code: 'CREDIT_SOURCE_REPLAY_CONFLICT' });
      }
      return { status: 'PROCESSED' };
    }
    if (fact.sourceVersion !== row.source_version + 1) {
      throw new ServiceUnavailableException({ code: 'CREDIT_SOURCE_VERSION_PENDING' });
    }

    const delta = fact.balanceMinor - BigInt(row.balance_minor);
    if (delta !== 0n) {
      await client.query(`INSERT INTO ${SCHEMA}.credit_status
        (tenant_id, id, party_id, org_unit_id, currency_code, component, delta_minor,
         source_module, source_document_id, source_version, source_event_id, occurred_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz)`,
      [envelope.tenantId, randomUUID(), fact.customerPartyId, fact.orgUnitId, fact.currencyCode,
        fact.component, delta.toString(), fact.sourceModule, fact.documentId, fact.sourceVersion,
        envelope.messageId, envelope.occurredAt]);
    }
    await client.query(`UPDATE ${SCHEMA}.credit_source_positions
      SET source_version = $5, balance_minor = $6, source_event_id = $7, updated_at = now()
      WHERE tenant_id = $1 AND source_module = $2 AND source_document_id = $3 AND component = $4`,
    [envelope.tenantId, fact.sourceModule, fact.documentId, fact.component,
      fact.sourceVersion, fact.balanceMinor.toString(), envelope.messageId]);
    await markFeedReady(client, envelope.tenantId, fact.customerPartyId, fact.orgUnitId,
      fact.currencyCode, fact.component);
    return { status: 'PROCESSED' };
  }
}
