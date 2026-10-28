import { createHash, randomUUID } from 'node:crypto';
import { ArCreditInvoiceBalanceV1Schema, RelayEnvelopeV1Schema, type RelayEnvelopeV1 } from '@gigalibs/contracts';
import { receiveOnce } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';

const RECEIPTS = { schema: SCHEMA, consumer: 'business-partners.ar-credit', sourceModule: 'accounts-receivable' } as const;
const MAX_MINOR = 9223372036854775807n;

interface Position {
  party_id: string;
  org_unit_id: string;
  currency_code: string;
  source_version: number;
  balance_minor: string;
  source_event_id: string | null;
}

/** Converts AR-owned invoice balance snapshots into one immutable delta per source version. */
@Injectable()
export class CreditInboxService {
  constructor(private readonly database: DatabaseService) {}

  async receive(raw: unknown, rawBody: string) {
    const parsed = RelayEnvelopeV1Schema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException({ code: 'CREDIT_ENVELOPE_INVALID' });
    const envelope = parsed.data;
    const fact = ArCreditInvoiceBalanceV1Schema.safeParse(envelope.payload);
    if (envelope.eventType !== 'ar.credit.invoice-balance.v1' || envelope.aggregateType !== 'invoice' ||
        envelope.schemaVersion !== 1 || !fact.success || envelope.aggregateId !== fact.data.invoiceId ||
        envelope.aggregateVersion !== fact.data.sourceVersion) {
      throw new BadRequestException({ code: 'CREDIT_FACT_INVALID' });
    }
    const balance = BigInt(fact.data.openAmountMinor);
    if (balance > MAX_MINOR) throw new BadRequestException({ code: 'CREDIT_AMOUNT_OUT_OF_RANGE' });
    return this.database.withTenantTransaction(envelope.tenantId, async (client) => {
      const outcome = await receiveOnce(client, RECEIPTS, envelope, rawBody,
        () => this.apply(client, envelope, fact.data, balance));
      if (outcome.status === 'DUPLICATE') {
        const receipt = await client.query<{ payload_sha256: string }>(
          `SELECT payload_sha256 FROM ${SCHEMA}.inbox_receipts
           WHERE tenant_id = $1 AND consumer_name = $2 AND message_id = $3`,
          [envelope.tenantId, RECEIPTS.consumer, envelope.messageId],
        );
        const hash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
        if (receipt.rows[0]?.payload_sha256 !== hash) {
          throw new ConflictException({ code: 'CREDIT_MESSAGE_REPLAY_CONFLICT' });
        }
      }
      return outcome;
    });
  }

  private async apply(
    client: PoolClient,
    envelope: RelayEnvelopeV1,
    fact: { invoiceId: string; customerPartyId: string; orgUnitId: string; currencyCode: string; sourceVersion: number },
    balance: bigint,
  ): Promise<{ status: 'PROCESSED' }> {
    const party = await client.query(`SELECT 1 FROM ${SCHEMA}.party_references
      WHERE tenant_id = $1 AND party_id = $2`, [envelope.tenantId, fact.customerPartyId]);
    if (!party.rowCount) throw new ServiceUnavailableException({ code: 'CREDIT_PARTY_PROJECTION_PENDING' });

    await client.query(`INSERT INTO ${SCHEMA}.credit_source_positions
      (tenant_id, source_module, source_document_id, component, party_id, org_unit_id,
       currency_code, source_version, balance_minor)
      VALUES ($1, 'accounts-receivable', $2, 'OPEN_AR', $3, $4, $5, 0, 0)
      ON CONFLICT (tenant_id, source_module, source_document_id, component) DO NOTHING`,
      [envelope.tenantId, fact.invoiceId, fact.customerPartyId, fact.orgUnitId, fact.currencyCode]);
    const current = await client.query<Position>(`SELECT party_id, org_unit_id, currency_code, source_version,
        balance_minor::text, source_event_id FROM ${SCHEMA}.credit_source_positions
      WHERE tenant_id = $1 AND source_module = 'accounts-receivable'
        AND source_document_id = $2 AND component = 'OPEN_AR' FOR UPDATE`,
    [envelope.tenantId, fact.invoiceId]);
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
      if (balance !== BigInt(row.balance_minor) || envelope.messageId !== row.source_event_id) {
        throw new ConflictException({ code: 'CREDIT_SOURCE_REPLAY_CONFLICT' });
      }
      return { status: 'PROCESSED' };
    }
    if (fact.sourceVersion !== row.source_version + 1) {
      throw new ServiceUnavailableException({ code: 'CREDIT_SOURCE_VERSION_PENDING' });
    }

    const delta = balance - BigInt(row.balance_minor);
    if (delta !== 0n) {
      await client.query(`INSERT INTO ${SCHEMA}.credit_status
        (tenant_id, id, party_id, org_unit_id, currency_code, component, delta_minor,
         source_module, source_document_id, source_version, source_event_id, occurred_at)
        VALUES ($1, $2, $3, $4, $5, 'OPEN_AR', $6, 'accounts-receivable', $7, $8, $9, $10::timestamptz)`,
      [envelope.tenantId, randomUUID(), fact.customerPartyId, fact.orgUnitId, fact.currencyCode,
        delta.toString(), fact.invoiceId, fact.sourceVersion, envelope.messageId, envelope.occurredAt]);
    }
    await client.query(`UPDATE ${SCHEMA}.credit_source_positions
      SET source_version = $3, balance_minor = $4, source_event_id = $5, updated_at = now()
      WHERE tenant_id = $1 AND source_module = 'accounts-receivable'
        AND source_document_id = $2 AND component = 'OPEN_AR'`,
    [envelope.tenantId, fact.invoiceId, fact.sourceVersion, balance.toString(), envelope.messageId]);
    return { status: 'PROCESSED' };
  }
}
