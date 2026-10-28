import {
  type ModulePrincipal,
  OrganizationReplica,
  organizationAccess,
} from '@gigalibs/module-sdk';
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { type NettingPosition, calculatePartnerNetting } from './netting.js';

const orgReplica = new OrganizationReplica(SCHEMA);

export interface PartnerNettingV1 {
  readonly partyId: string;
  readonly orgUnitId: string;
  readonly currencyCode: string;
  readonly openArMinor: string;
  readonly openApMinor: string;
  readonly nettableMinor: string;
  readonly netReceivableMinor: string;
  readonly netPayableMinor: string;
  readonly position: NettingPosition;
  readonly netAmountMinor: string;
}

/**
 * Read model for the AR/AP netting panel. Sums the partner's OPEN_AR and OPEN_AP balances from the
 * immutable credit ledger and offsets them (see {@link calculatePartnerNetting}). OPEN_AP is 0 until
 * the vendor-bill inbox consumer populates it; the net position is still correct (a pure receivable).
 */
@Injectable()
export class NettingService {
  constructor(private readonly database: DatabaseService) {}

  async get(
    principal: ModulePrincipal,
    partyId: string,
    orgUnitId: string,
    currencyCode: string,
  ): Promise<PartnerNettingV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await organizationAccess(
        orgReplica,
        client,
        principal.tenantId,
        principal.organization ?? { mode: 'DENIED' },
      );
      if (access.denied || (access.readUnits !== null && !access.readUnits.includes(orgUnitId))) {
        throw new NotFoundException({ code: 'PARTNER_NETTING_NOT_FOUND' });
      }
      const sums = await client.query<{ component: string; total_minor: string }>(
        `SELECT component, COALESCE(SUM(delta_minor), 0)::text AS total_minor
           FROM ${SCHEMA}.credit_status
          WHERE tenant_id = $1 AND party_id = $2 AND org_unit_id = $3 AND currency_code = $4
            AND component IN ('OPEN_AR', 'OPEN_AP')
          GROUP BY component`,
        [principal.tenantId, partyId, orgUnitId, currencyCode],
      );
      let openArMinor = 0n;
      let openApMinor = 0n;
      for (const row of sums.rows) {
        if (row.component === 'OPEN_AR') openArMinor = BigInt(row.total_minor);
        else if (row.component === 'OPEN_AP') openApMinor = BigInt(row.total_minor);
      }
      let netting;
      try {
        netting = calculatePartnerNetting(openArMinor, openApMinor);
      } catch {
        throw new ServiceUnavailableException({ code: 'PARTNER_NETTING_RECONCILIATION_REQUIRED' });
      }
      return {
        partyId,
        orgUnitId,
        currencyCode,
        openArMinor: netting.openArMinor.toString(),
        openApMinor: netting.openApMinor.toString(),
        nettableMinor: netting.nettableMinor.toString(),
        netReceivableMinor: netting.netReceivableMinor.toString(),
        netPayableMinor: netting.netPayableMinor.toString(),
        position: netting.position,
        netAmountMinor: netting.netAmountMinor.toString(),
      };
    });
  }
}
