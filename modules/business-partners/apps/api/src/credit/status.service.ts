import { OrganizationReplica, organizationAccess, type ModulePrincipal } from '@gigalibs/module-sdk';
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { calculateCreditExposure, type CreditComponent } from './exposure.js';
import { loadFeedMarks } from './feed-marks.js';
import { evaluateCreditDecision, type CreditDecision } from './reconciliation.js';

const orgReplica = new OrganizationReplica(SCHEMA);

export interface CreditStatusV1 {
  readonly partyId: string;
  readonly orgUnitId: string;
  readonly currencyCode: string;
  readonly creditLimitMinor: string;
  readonly openArMinor: string;
  readonly uninvoicedOrdersMinor: string;
  readonly prepaymentsMinor: string;
  readonly exposureMinor: string;
  readonly availableMinor: string;
  readonly activeHoldId: string | null;
  readonly decision: CreditDecision;
  readonly complete: boolean;
}

/** Read model for the live credit panel and partner header gauge. */
@Injectable()
export class CreditStatusService {
  constructor(private readonly database: DatabaseService) {}

  async get(principal: ModulePrincipal, partyId: string, orgUnitId: string, currencyCode: string): Promise<CreditStatusV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await organizationAccess(orgReplica, client, principal.tenantId,
        principal.organization ?? { mode: 'DENIED' });
      if (access.denied || (access.readUnits !== null && !access.readUnits.includes(orgUnitId))) {
        throw new NotFoundException({ code: 'CREDIT_STATUS_NOT_FOUND' });
      }
      const account = await client.query<{ credit_limit_minor: string }>(
        `SELECT credit_limit_minor::text FROM ${SCHEMA}.partner_customer_acct
         WHERE tenant_id = $1 AND party_id = $2 AND org_unit_id = $3 AND currency_code = $4
           AND status = 'ACTIVE'`,
        [principal.tenantId, partyId, orgUnitId, currencyCode],
      );
      if (!account.rows[0]) throw new NotFoundException({ code: 'CREDIT_STATUS_NOT_FOUND' });
      const ledger = await client.query<{ component: CreditComponent; delta_minor: string }>(
        `SELECT component, delta_minor::text FROM ${SCHEMA}.credit_status
         WHERE tenant_id = $1 AND party_id = $2 AND org_unit_id = $3 AND currency_code = $4`,
        [principal.tenantId, partyId, orgUnitId, currencyCode],
      );
      let exposure;
      try {
        exposure = calculateCreditExposure(ledger.rows.map((row) => ({
          component: row.component, deltaMinor: BigInt(row.delta_minor),
        })), BigInt(account.rows[0].credit_limit_minor));
      } catch {
        throw new ServiceUnavailableException({ code: 'CREDIT_LEDGER_RECONCILIATION_REQUIRED' });
      }
      const hold = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.credit_holds WHERE tenant_id = $1 AND party_id = $2
           AND org_unit_id = $3 AND currency_code = $4 AND status = 'ACTIVE'`,
        [principal.tenantId, partyId, orgUnitId, currencyCode],
      );
      const feedMarks = await loadFeedMarks(client, principal.tenantId, partyId, orgUnitId, currencyCode);
      const outcome = evaluateCreditDecision({
        feedMarks,
        activeHoldId: hold.rows[0]?.id ?? null,
        creditLimitMinor: BigInt(account.rows[0].credit_limit_minor),
        ledger: ledger.rows.map((row) => ({ component: row.component, deltaMinor: BigInt(row.delta_minor) })),
      });
      return {
        partyId, orgUnitId, currencyCode, creditLimitMinor: account.rows[0].credit_limit_minor,
        openArMinor: exposure.openArMinor.toString(),
        uninvoicedOrdersMinor: exposure.uninvoicedOrdersMinor.toString(),
        prepaymentsMinor: exposure.prepaymentsMinor.toString(),
        exposureMinor: exposure.exposureMinor.toString(), availableMinor: exposure.availableMinor.toString(),
        activeHoldId: hold.rows[0]?.id ?? null,
        decision: outcome.decision, complete: outcome.complete,
      };
    });
  }
}
