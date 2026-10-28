import { PartnerCreditCheckResponseV1Schema, type PartnerCreditCheckRequestV1 } from '@gigalibs/contracts';
import {
  OrganizationReplica,
  organizationAccess,
  type ModuleCommandContext,
  type ModulePrincipal,
} from '@gigalibs/module-sdk';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import type { CreditComponent } from './exposure.js';
import { loadFeedMarks } from './feed-marks.js';
import { evaluateCreditDecision } from './reconciliation.js';

const orgReplica = new OrganizationReplica(SCHEMA);

@Injectable()
export class CreditCheckService {
  constructor(private readonly database: DatabaseService) {}

  async check(context: ModuleCommandContext, input: PartnerCreditCheckRequestV1) {
    const { tenantId } = context.principal;
    const requestHash = createHash('sha256').update(JSON.stringify({ action: 'CREDIT_CHECK', input })).digest('hex');
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${SCHEMA}:${tenantId}:credit-check:${input.requestKey}`]);
      const replay = await this.readOutcome(client, tenantId, input.requestKey, requestHash);
      if (replay) return replay;
      const response = await this.evaluate(client, context.principal, input);
      try {
        await client.query(
          `INSERT INTO ${SCHEMA}.partner_account_action_outcomes
             (tenant_id, request_key, operation, request_hash, result)
           VALUES ($1, $2, 'CREDIT_CHECK', $3, $4::jsonb)`,
          [tenantId, input.requestKey, requestHash, JSON.stringify(response)],
        );
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
          throw new ConflictException({ code: 'CREDIT_CHECK_IDEMPOTENCY_CONFLICT' });
        }
        throw error;
      }
      return response;
    });
  }

  private async readOutcome(
    client: PoolClient,
    tenantId: string,
    requestKey: string,
    requestHash: string,
  ) {
    const found = await client.query<{ request_hash: string; result: unknown }>(
      `SELECT request_hash, result FROM ${SCHEMA}.partner_account_action_outcomes
       WHERE tenant_id = $1 AND request_key = $2 AND operation = 'CREDIT_CHECK'`,
      [tenantId, requestKey],
    );
    const row = found.rows[0];
    if (!row) return null;
    if (row.request_hash !== requestHash) throw new ConflictException({ code: 'CREDIT_CHECK_IDEMPOTENCY_CONFLICT' });
    const parsed = PartnerCreditCheckResponseV1Schema.safeParse(row.result);
    if (!parsed.success) throw new ConflictException({ code: 'CREDIT_CHECK_OUTCOME_CORRUPT' });
    return parsed.data;
  }

  private async evaluate(client: PoolClient, principal: ModulePrincipal, input: PartnerCreditCheckRequestV1) {
    const access = await organizationAccess(orgReplica, client, principal.tenantId,
      principal.organization ?? { mode: 'DENIED' });
    if (access.denied || (access.readUnits !== null && !access.readUnits.includes(input.orgUnitId))) {
      throw new NotFoundException({ code: 'CREDIT_CHECK_NOT_FOUND' });
    }
    const account = await client.query<{ credit_limit_minor: string }>(
      `SELECT credit_limit_minor::text FROM ${SCHEMA}.partner_customer_acct
       WHERE tenant_id = $1 AND party_id = $2 AND org_unit_id = $3 AND currency_code = $4 AND status = 'ACTIVE'`,
      [principal.tenantId, input.partyId, input.orgUnitId, input.currencyCode],
    );
    if (!account.rows[0]) throw new NotFoundException({ code: 'CREDIT_CHECK_NOT_FOUND' });

    const ledger = await client.query<{ component: CreditComponent; delta_minor: string }>(
      `SELECT component, delta_minor::text FROM ${SCHEMA}.credit_status
       WHERE tenant_id = $1 AND party_id = $2 AND org_unit_id = $3 AND currency_code = $4`,
      [principal.tenantId, input.partyId, input.orgUnitId, input.currencyCode],
    );
    const hold = await client.query<{ id: string }>(
      `SELECT id FROM ${SCHEMA}.credit_holds
       WHERE tenant_id = $1 AND party_id = $2 AND org_unit_id = $3 AND currency_code = $4 AND status = 'ACTIVE'`,
      [principal.tenantId, input.partyId, input.orgUnitId, input.currencyCode],
    );
    const feedMarks = await loadFeedMarks(client, principal.tenantId, input.partyId,
      input.orgUnitId, input.currencyCode);
    const outcome = evaluateCreditDecision({
      feedMarks,
      activeHoldId: hold.rows[0]?.id ?? null,
      creditLimitMinor: BigInt(account.rows[0].credit_limit_minor),
      ledger: ledger.rows.map((row) => ({ component: row.component, deltaMinor: BigInt(row.delta_minor) })),
      additionalExposureMinor: input.additionalExposureMinor ? BigInt(input.additionalExposureMinor) : undefined,
    });
    return PartnerCreditCheckResponseV1Schema.parse({
      decision: outcome.decision,
      complete: outcome.complete,
      creditLimitMinor: account.rows[0].credit_limit_minor,
      exposureMinor: outcome.exposureMinor.toString(),
      availableMinor: outcome.availableMinor.toString(),
      activeHoldId: hold.rows[0]?.id ?? null,
    });
  }
}
