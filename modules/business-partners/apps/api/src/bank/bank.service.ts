import { createHash, randomUUID } from 'node:crypto';
import {
  OrganizationReplica,
  assertOrganizationWrite,
  assertOwningUnit,
  organizationAccess,
  organizationReadCondition,
  recordMutation,
  type ModuleCommandContext,
  type ModulePrincipal,
} from '@gigalibs/module-sdk';
import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import type { CreatePartnerBank, PartnerBankV1 } from './bank.contract.js';

const orgReplica = new OrganizationReplica(SCHEMA);

interface BankRow {
  id: string;
  party_id: string;
  org_unit_id: string;
  currency_code: string;
  vault_reference: string;
  display_last_four: string;
  status: PartnerBankV1['status'];
}

@Injectable()
export class PartnerBankService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal: ModulePrincipal, partyId: string): Promise<{ items: PartnerBankV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await organizationAccess(orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'DENIED' });
      const params: unknown[] = [principal.tenantId, partyId];
      const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
      const scoped = organizationReadCondition(access, 'org_unit_id', bind);
      const rows = await client.query<BankRow>(
        `SELECT id, party_id, org_unit_id, currency_code, vault_reference, display_last_four, status
           FROM ${SCHEMA}.partner_bank
          WHERE tenant_id = $1 AND party_id = $2 AND status = 'ACTIVE'
            ${scoped ? `AND ${scoped}` : ''}
          ORDER BY created_at DESC LIMIT 50`,
        params,
      );
      return { items: rows.rows.map(toBank) };
    });
  }

  async create(context: ModuleCommandContext, partyId: string, input: CreatePartnerBank): Promise<{ bank: PartnerBankV1; replayed: boolean }> {
    const { tenantId } = context.principal;
    const hash = createHash('sha256').update(JSON.stringify({ action: 'CREATE_BANK', partyId, input })).digest('hex');
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${SCHEMA}:${tenantId}:partner-bank:${input.requestKey}`]);
      await this.authorize(client, context.principal, input.orgUnitId);
      const replay = await this.outcome(client, tenantId, input.requestKey, hash);
      if (replay) return { bank: replay, replayed: true };
      const id = randomUUID();
      const inserted = await client.query<BankRow>(
        `INSERT INTO ${SCHEMA}.partner_bank
           (tenant_id, id, party_id, org_unit_id, vault_reference, display_last_four, currency_code, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
         RETURNING id, party_id, org_unit_id, currency_code, vault_reference, display_last_four, status`,
        [tenantId, id, partyId, input.orgUnitId, input.vaultReference, input.displayLastFour, input.currencyCode, context.principal.subject],
      );
      const bank = toBank(inserted.rows[0]!);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'PARTNER_BANK_CREATED',
        aggregateType: 'partner_bank',
        aggregateId: bank.id,
        aggregateVersion: 1,
        payload: { partyId, orgUnitId: input.orgUnitId, vaultReference: input.vaultReference, displayLastFour: input.displayLastFour },
      });
      await client.query(
        `INSERT INTO ${SCHEMA}.partner_account_action_outcomes
           (tenant_id, request_key, operation, request_hash, result)
         VALUES ($1, $2, 'CREATE_PARTNER_BANK', $3, $4::jsonb)`,
        [tenantId, input.requestKey, hash, JSON.stringify(bank)],
      );
      return { bank, replayed: false };
    });
  }

  private async authorize(client: PoolClient, principal: ModulePrincipal, orgUnitId: string): Promise<void> {
    const access = await organizationAccess(orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'DENIED' });
    if (!access.versionId) throw new ServiceUnavailableException({ code: 'BUSINESS_PARTNERS_ORGANIZATION_REQUIRED' });
    await assertOwningUnit(orgReplica, client, principal.tenantId, access, 'UNIT', orgUnitId);
    assertOrganizationWrite(access, orgUnitId);
  }

  private async outcome(client: PoolClient, tenantId: string, key: string, hash: string): Promise<PartnerBankV1 | null> {
    const found = await client.query<{ request_hash: string; result: PartnerBankV1 }>(
      `SELECT request_hash, result FROM ${SCHEMA}.partner_account_action_outcomes
       WHERE tenant_id = $1 AND request_key = $2 AND operation = 'CREATE_PARTNER_BANK'`,
      [tenantId, key],
    );
    const row = found.rows[0];
    if (!row) return null;
    if (row.request_hash !== hash) throw new ConflictException({ code: 'BUSINESS_PARTNERS_IDEMPOTENCY_CONFLICT' });
    return row.result;
  }
}

function toBank(row: BankRow): PartnerBankV1 {
  return {
    id: row.id,
    partyId: row.party_id,
    orgUnitId: row.org_unit_id,
    currencyCode: row.currency_code.trim(),
    vaultReference: row.vault_reference,
    displayLastFour: row.display_last_four,
    status: row.status,
  };
}
