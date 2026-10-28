import { createHash } from 'node:crypto';
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
import type { CreateCustomerAccount, CreateVendorAccount, PartnerAccountV1 } from './accounts.contract.js';
import { FinanceAccountReferenceClient } from './finance-account-reference.client.js';
import { seedPrepaymentFeedReady } from '../credit/feed-marks.js';

type AccountKind = 'CUSTOMER' | 'VENDOR';
type CreateInput = CreateCustomerAccount | CreateVendorAccount;
const orgReplica = new OrganizationReplica(SCHEMA);

interface AccountRow {
  party_id: string;
  org_unit_id: string;
  currency_code: string;
  account_id: string;
  account_version: number;
  accounting_book_id: string;
  terms_version: string;
  credit_limit_minor: string | null;
  status: PartnerAccountV1['status'];
  version: number;
}

const accountTable = (kind: AccountKind) => kind === 'CUSTOMER' ? 'partner_customer_acct' : 'partner_vendor_acct';
const accountColumn = (kind: AccountKind) => kind === 'CUSTOMER' ? 'receivable' : 'payable';

/** Financial overlays keyed to the kernel Party; no party identity or Finance account is copied here. */
@Injectable()
export class PartnerAccountsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly finance: FinanceAccountReferenceClient,
  ) {}

  async createCustomer(context: ModuleCommandContext, partyId: string, input: CreateCustomerAccount): Promise<{ account: PartnerAccountV1; replayed: boolean }> {
    return this.create('CUSTOMER', context, partyId, input);
  }

  async createVendor(context: ModuleCommandContext, partyId: string, input: CreateVendorAccount): Promise<{ account: PartnerAccountV1; replayed: boolean }> {
    return this.create('VENDOR', context, partyId, input);
  }

  async list(principal: ModulePrincipal, partyId: string): Promise<{ items: PartnerAccountV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await organizationAccess(orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'DENIED' });
      const values: unknown[] = [principal.tenantId, partyId];
      const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
      const scoped = organizationReadCondition(access, 'a.org_unit_id', bind);
      const predicate = scoped ? `AND ${scoped}` : '';
      const customer = await client.query<AccountRow>(
        `SELECT a.party_id, a.org_unit_id, a.currency_code, a.receivable_account_ref AS account_id,
                a.receivable_account_version AS account_version, a.accounting_book_id,
                a.terms_version, a.credit_limit_minor::text, a.status, a.version
           FROM ${SCHEMA}.partner_customer_acct a WHERE a.tenant_id = $1 AND a.party_id = $2 ${predicate}
          ORDER BY a.org_unit_id, a.currency_code LIMIT 100`, values,
      );
      const vendor = await client.query<AccountRow>(
        `SELECT a.party_id, a.org_unit_id, a.currency_code, a.payable_account_ref AS account_id,
                a.payable_account_version AS account_version, a.accounting_book_id,
                a.terms_version, NULL::text AS credit_limit_minor, a.status, a.version
           FROM ${SCHEMA}.partner_vendor_acct a WHERE a.tenant_id = $1 AND a.party_id = $2 ${predicate}
          ORDER BY a.org_unit_id, a.currency_code LIMIT 100`, values,
      );
      return { items: [...customer.rows.map((row) => toAccount('CUSTOMER', row)), ...vendor.rows.map((row) => toAccount('VENDOR', row))] };
    });
  }

  private async create(kind: AccountKind, context: ModuleCommandContext, partyId: string, input: CreateInput): Promise<{ account: PartnerAccountV1; replayed: boolean }> {
    const { tenantId } = context.principal;
    const operation = `CREATE_${kind}_ACCOUNT`;
    const requestHash = createHash('sha256').update(JSON.stringify({ operation, partyId, input })).digest('hex');
    const replay = await this.database.withTenantTransaction(tenantId, async (client) => {
      await this.authorize(client, context.principal, input.orgUnitId);
      return this.outcome(client, tenantId, input.requestKey, requestHash);
    });
    if (replay) return { account: replay, replayed: true };

    // The signed Finance read happens before the local transaction; posting checks Finance again later.
    const checked = await this.finance.check(tenantId, input.accountId, kind === 'CUSTOMER' ? 'ASSET' : 'LIABILITY');
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await this.authorize(client, context.principal, input.orgUnitId);
      const repeated = await this.outcome(client, tenantId, input.requestKey, requestHash);
      if (repeated) return { account: repeated, replayed: true };
      await this.assertPartyRole(client, tenantId, partyId, kind);
      const table = accountTable(kind);
      const column = accountColumn(kind);
      const values = kind === 'CUSTOMER'
        ? [tenantId, partyId, input.orgUnitId, input.currencyCode, input.accountId, checked.version,
            checked.accountingBookId, (input as CreateCustomerAccount).creditLimitMinor, input.termsVersion, context.principal.subject]
        : [tenantId, partyId, input.orgUnitId, input.currencyCode, input.accountId, checked.version,
            checked.accountingBookId, input.termsVersion, context.principal.subject];
      const columns = kind === 'CUSTOMER'
        ? `tenant_id, party_id, org_unit_id, currency_code, ${column}_account_ref, ${column}_account_version,
           accounting_book_id, credit_limit_minor, terms_version, status, updated_by`
        : `tenant_id, party_id, org_unit_id, currency_code, ${column}_account_ref, ${column}_account_version,
           accounting_book_id, terms_version, status, updated_by`;
      const placeholders = kind === 'CUSTOMER'
        ? '$1,$2,$3,$4,$5,$6,$7,$8,$9,\'ACTIVE\',$10'
        : '$1,$2,$3,$4,$5,$6,$7,$8,\'ACTIVE\',$9';
      const inserted = await client.query<AccountRow>(
        `INSERT INTO ${SCHEMA}.${table} (${columns}) VALUES (${placeholders})
         ON CONFLICT (tenant_id, party_id, org_unit_id, currency_code) DO NOTHING
         RETURNING party_id, org_unit_id, currency_code, ${column}_account_ref AS account_id,
                   ${column}_account_version AS account_version, accounting_book_id, terms_version,
                   ${kind === 'CUSTOMER' ? 'credit_limit_minor::text' : 'NULL::text'} AS credit_limit_minor,
                   status, version`, values,
      );
      const row = inserted.rows[0];
      if (!row) {
        const concurrent = await this.outcome(client, tenantId, input.requestKey, requestHash);
        if (concurrent) return { account: concurrent, replayed: true };
        throw new ConflictException({ code: 'BUSINESS_PARTNERS_ACCOUNT_EXISTS' });
      }
      const account = toAccount(kind, row);
      if (kind === 'CUSTOMER') {
        await seedPrepaymentFeedReady(client, tenantId, partyId, input.orgUnitId, input.currencyCode);
      }
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: `PARTNER_${kind}_ACCOUNT_CREATED`,
        aggregateType: `${kind.toLowerCase()}_account`,
        aggregateId: `${partyId}:${input.orgUnitId}:${input.currencyCode}`,
        aggregateVersion: 1,
        payload: { partyId, orgUnitId: input.orgUnitId, currencyCode: input.currencyCode,
          accountId: checked.accountId, accountingBookId: checked.accountingBookId, accountVersion: checked.version },
      });
      try {
        await client.query(
          `INSERT INTO ${SCHEMA}.partner_account_action_outcomes
           (tenant_id, request_key, operation, request_hash, result)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [tenantId, input.requestKey, operation, requestHash, JSON.stringify(account)],
        );
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
          throw new ConflictException({ code: 'BUSINESS_PARTNERS_IDEMPOTENCY_CONFLICT' });
        }
        throw error;
      }
      return { account, replayed: false };
    });
  }

  private async authorize(client: PoolClient, principal: ModulePrincipal, orgUnitId: string): Promise<void> {
    const access = await organizationAccess(orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'DENIED' });
    if (!access.versionId) throw new ServiceUnavailableException({ code: 'BUSINESS_PARTNERS_ORGANIZATION_REQUIRED' });
    await assertOwningUnit(orgReplica, client, principal.tenantId, access, 'UNIT', orgUnitId);
    assertOrganizationWrite(access, orgUnitId);
  }

  private async assertPartyRole(client: PoolClient, tenantId: string, partyId: string, kind: AccountKind): Promise<void> {
    const roleType = kind === 'CUSTOMER' ? 'CUSTOMER' : 'SUPPLIER';
    const exists = await client.query(
      `SELECT 1 FROM ${SCHEMA}.party_references p
       JOIN ${SCHEMA}.party_role_references r ON r.tenant_id = p.tenant_id AND r.party_id = p.party_id
       WHERE p.tenant_id = $1 AND p.party_id = $2 AND p.status = 'ACTIVE'
         AND r.role_type = $3 AND r.status = 'ACTIVE'
         AND (r.effective_from IS NULL OR r.effective_from <= now())
         AND (r.effective_to IS NULL OR r.effective_to > now())
       FOR SHARE OF p, r`,
      [tenantId, partyId, roleType],
    );
    if (!exists.rowCount) throw new ConflictException({ code: 'BUSINESS_PARTNERS_ROLE_NOT_ACTIVE' });
  }

  private async outcome(client: PoolClient, tenantId: string, key: string, hash: string): Promise<PartnerAccountV1 | null> {
    const found = await client.query<{ request_hash: string; result: PartnerAccountV1 }>(
      `SELECT request_hash, result FROM ${SCHEMA}.partner_account_action_outcomes
        WHERE tenant_id = $1 AND request_key = $2`, [tenantId, key],
    );
    const row = found.rows[0];
    if (!row) return null;
    if (row.request_hash !== hash) throw new ConflictException({ code: 'BUSINESS_PARTNERS_IDEMPOTENCY_CONFLICT' });
    return row.result;
  }
}

function toAccount(kind: AccountKind, row: AccountRow): PartnerAccountV1 {
  return {
    kind, partyId: row.party_id, orgUnitId: row.org_unit_id,
    currencyCode: row.currency_code.trim(), accountId: row.account_id,
    accountVersion: Number(row.account_version), accountingBookId: row.accounting_book_id,
    termsVersion: row.terms_version, ...(kind === 'CUSTOMER' ? { creditLimitMinor: String(row.credit_limit_minor) } : {}),
    status: row.status, version: Number(row.version),
  };
}
