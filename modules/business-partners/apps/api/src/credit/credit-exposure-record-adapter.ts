import {
  OrganizationReplica,
  organizationAccess,
  type ModulePrincipal,
  type RecordAdapter,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordPage,
  type RecordValues,
} from '@gigalibs/module-sdk';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import type { DatabaseService } from '../database.service.js';
import { calculateCreditExposure } from './exposure.js';

const READ = 'business-partners:read';
const unwritable: RecordFieldPolicy = { writable: false };
const FIELDS: Record<string, RecordFieldPolicy> = {
  'partner-name': unwritable,
  currency: unwritable,
  'utilization-pct': unwritable,
  status: unwritable,
  'credit-limit-minor': unwritable,
  'exposure-minor': unwritable,
  'available-minor': unwritable,
  'org-unit-id': unwritable,
};

const orgReplica = new OrganizationReplica(SCHEMA);

type RiskStatus = 'OK' | 'NEAR_LIMIT' | 'OVER_LIMIT' | 'ON_HOLD' | 'RECONCILE';

interface RolledRow {
  party_id: string;
  org_unit_id: string;
  currency_code: string;
  display_name: string;
  credit_limit_minor: string;
  open_ar: string;
  uninvoiced: string;
  prepayment: string;
  active_hold_id: string | null;
}

/** Composite key for one credit position: a customer account is unique per party, owning unit and currency. */
const rowId = (row: Pick<RolledRow, 'party_id' | 'org_unit_id' | 'currency_code'>): string =>
  `${row.party_id}|${row.org_unit_id}|${row.currency_code}`;

const toWindow = (row: RolledRow): RecordValues => {
  const limitMinor = BigInt(row.credit_limit_minor);
  let exposureMinor = 0n;
  let availableMinor = 0n;
  let overLimit = false;
  let reconcile = false;
  try {
    const exposure = calculateCreditExposure(
      [
        { component: 'OPEN_AR', deltaMinor: BigInt(row.open_ar) },
        { component: 'UNINVOICED_ORDER', deltaMinor: BigInt(row.uninvoiced) },
        { component: 'PREPAYMENT', deltaMinor: BigInt(row.prepayment) },
      ],
      limitMinor,
    );
    exposureMinor = exposure.exposureMinor;
    availableMinor = exposure.availableMinor;
    overLimit = exposure.overLimit;
  } catch {
    // Negative component balance: a lost or out-of-order source fact. Flag it rather than show a false number.
    reconcile = true;
  }
  const utilization = limitMinor > 0n ? Number((exposureMinor * 100n) / limitMinor) : exposureMinor > 0n ? 100 : 0;
  const status: RiskStatus = reconcile
    ? 'RECONCILE'
    : row.active_hold_id
      ? 'ON_HOLD'
      : overLimit
        ? 'OVER_LIMIT'
        : utilization >= 80
          ? 'NEAR_LIMIT'
          : 'OK';
  return {
    id: rowId(row),
    'partner-name': row.display_name,
    currency: row.currency_code,
    'utilization-pct': reconcile ? 0 : utilization,
    status,
    'credit-limit-minor': Number(limitMinor),
    'exposure-minor': reconcile ? 0 : Number(exposureMinor),
    'available-minor': reconcile ? 0 : Number(availableMinor),
    'org-unit-id': row.org_unit_id,
  };
};

const ROLLED = (whereExtra: string) => `
  SELECT a.party_id, a.org_unit_id, a.currency_code, a.credit_limit_minor::text AS credit_limit_minor,
         pr.display_name,
         coalesce(sum(cs.delta_minor) FILTER (WHERE cs.component = 'OPEN_AR'), 0)::text AS open_ar,
         coalesce(sum(cs.delta_minor) FILTER (WHERE cs.component = 'UNINVOICED_ORDER'), 0)::text AS uninvoiced,
         coalesce(sum(cs.delta_minor) FILTER (WHERE cs.component = 'PREPAYMENT'), 0)::text AS prepayment,
         h.id AS active_hold_id
    FROM ${SCHEMA}.partner_customer_acct a
    JOIN ${SCHEMA}.party_references pr
      ON pr.tenant_id = a.tenant_id AND pr.party_id = a.party_id
    LEFT JOIN ${SCHEMA}.credit_status cs
      ON cs.tenant_id = a.tenant_id AND cs.party_id = a.party_id
     AND cs.org_unit_id = a.org_unit_id AND cs.currency_code = a.currency_code
    LEFT JOIN LATERAL (
          SELECT id FROM ${SCHEMA}.credit_holds
           WHERE tenant_id = a.tenant_id AND party_id = a.party_id
             AND org_unit_id = a.org_unit_id AND currency_code = a.currency_code
             AND status = 'ACTIVE'
           LIMIT 1
        ) h ON true
   WHERE a.tenant_id = $1 AND a.status = 'ACTIVE'${whereExtra}
   GROUP BY a.party_id, a.org_unit_id, a.currency_code, a.credit_limit_minor, pr.display_name, h.id`;

/**
 * Read-only record adapter for the Credit exposure window: every active customer account with its credit limit,
 * exposure (open AR + uninvoiced orders − prepayments), available credit and risk status, highest utilisation first.
 * Org-scoped to the units the principal may read, reusing the live credit engine so a broken ledger reads RECONCILE.
 */
export function creditExposureRecordAdapter(database: DatabaseService): RecordAdapter {
  const scope = async (principal: ModulePrincipal, client: PoolClient): Promise<readonly string[] | null | 'DENIED'> => {
    const access = await organizationAccess(orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'DENIED' });
    if (access.denied) return 'DENIED';
    return access.readUnits;
  };

  return {
    entityKey: 'business-partners.credit-exposure',
    permissions: { read: READ },
    fields: FIELDS,
    searchFields: ['partner-name'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      return database.withTenantTransaction(principal.tenantId, async (client) => {
        const readUnits = await scope(principal, client);
        const empty: RecordPage = { items: [], total: 0, page: query.page, pageSize: query.pageSize };
        if (readUnits === 'DENIED' || (readUnits !== null && readUnits.length === 0)) return empty;

        const params: unknown[] = [principal.tenantId];
        let whereExtra = '';
        if (readUnits !== null) {
          params.push(readUnits);
          whereExtra += ` AND a.org_unit_id = ANY($${params.length}::text[])`;
        }
        const term = query.search?.trim().toLowerCase();
        if (term) {
          params.push(`%${term}%`);
          whereExtra += ` AND lower(pr.display_name) LIKE $${params.length}`;
        }

        const totals = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count
             FROM ${SCHEMA}.partner_customer_acct a
             JOIN ${SCHEMA}.party_references pr
               ON pr.tenant_id = a.tenant_id AND pr.party_id = a.party_id
            WHERE a.tenant_id = $1 AND a.status = 'ACTIVE'${whereExtra}`,
          params,
        );
        const offset = Math.max(0, (query.page - 1) * query.pageSize);
        params.push(query.pageSize, offset);
        const rows = await client.query<RolledRow>(
          `WITH rolled AS (${ROLLED(whereExtra)})
             SELECT * FROM rolled
            ORDER BY (CASE WHEN credit_limit_minor::numeric > 0
                           THEN (open_ar::numeric + uninvoiced::numeric - prepayment::numeric) / credit_limit_minor::numeric
                           ELSE (open_ar::numeric + uninvoiced::numeric - prepayment::numeric) END) DESC,
                     display_name ASC, party_id
            LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params,
        );
        return {
          items: rows.rows.map(toWindow),
          total: Number(totals.rows[0]?.count ?? 0),
          page: query.page,
          pageSize: query.pageSize,
        };
      });
    },
    async get(principal: ModulePrincipal, id: string): Promise<RecordValues | null> {
      const [partyId, orgUnitId, currencyCode] = id.split('|');
      if (!partyId || !orgUnitId || !currencyCode) return null;
      return database.withTenantTransaction(principal.tenantId, async (client) => {
        const readUnits = await scope(principal, client);
        if (readUnits === 'DENIED' || (readUnits !== null && !readUnits.includes(orgUnitId))) return null;
        const rows = await client.query<RolledRow>(
          `WITH rolled AS (${ROLLED(' AND a.party_id = $2 AND a.org_unit_id = $3 AND a.currency_code = $4')})
             SELECT * FROM rolled LIMIT 1`,
          [principal.tenantId, partyId, orgUnitId, currencyCode],
        );
        const row = rows.rows[0];
        return row ? toWindow(row) : null;
      });
    },
  };
}
