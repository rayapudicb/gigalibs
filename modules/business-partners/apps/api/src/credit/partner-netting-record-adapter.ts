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
import { calculatePartnerNetting } from './netting.js';

const READ = 'business-partners:read';
const unwritable: RecordFieldPolicy = { writable: false };
const FIELDS: Record<string, RecordFieldPolicy> = {
  'partner-name': unwritable,
  currency: unwritable,
  'open-ar-minor': unwritable,
  'open-ap-minor': unwritable,
  'nettable-minor': unwritable,
  position: unwritable,
  'net-amount-minor': unwritable,
  'org-unit-id': unwritable,
};

const orgReplica = new OrganizationReplica(SCHEMA);

interface NettingRow {
  party_id: string;
  org_unit_id: string;
  currency_code: string;
  display_name: string;
  open_ar: string;
  open_ap: string;
}

const rowId = (row: Pick<NettingRow, 'party_id' | 'org_unit_id' | 'currency_code'>): string =>
  `${row.party_id}|${row.org_unit_id}|${row.currency_code}`;

/** Financials tab: AR/AP netting positions per partner, unit and currency. */
export function partnerNettingRecordAdapter(database: DatabaseService): RecordAdapter {
  const scope = async (principal: ModulePrincipal, client: PoolClient) => {
    const access = await organizationAccess(orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'DENIED' });
    if (access.denied) return 'DENIED' as const;
    return access.readUnits;
  };

  const toWindow = (row: NettingRow): RecordValues => {
    const netting = calculatePartnerNetting(BigInt(row.open_ar), BigInt(row.open_ap));
    return {
      id: rowId(row),
      'partner-name': row.display_name,
      currency: row.currency_code.trim(),
      'open-ar-minor': Number(netting.openArMinor),
      'open-ap-minor': Number(netting.openApMinor),
      'nettable-minor': Number(netting.nettableMinor),
      position: netting.position,
      'net-amount-minor': Number(netting.netAmountMinor),
      'org-unit-id': row.org_unit_id,
    };
  };

  const ROLLED = (whereExtra: string) => `
    SELECT pr.party_id, pr.display_name, sums.org_unit_id, sums.currency_code,
           sums.open_ar, sums.open_ap
      FROM (
        SELECT party_id, org_unit_id, currency_code,
               coalesce(sum(delta_minor) FILTER (WHERE component = 'OPEN_AR'), 0)::text AS open_ar,
               coalesce(sum(delta_minor) FILTER (WHERE component = 'OPEN_AP'), 0)::text AS open_ap
          FROM ${SCHEMA}.credit_status
         WHERE tenant_id = $1
         GROUP BY party_id, org_unit_id, currency_code
      ) sums
      JOIN ${SCHEMA}.party_references pr
        ON pr.tenant_id = $1 AND pr.party_id = sums.party_id
     WHERE (sums.open_ar::bigint <> 0 OR sums.open_ap::bigint <> 0)${whereExtra}`;

  return {
    entityKey: 'business-partners.partner-netting',
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
          whereExtra += ` AND sums.org_unit_id = ANY($${params.length}::text[])`;
        }
        const term = query.search?.trim().toLowerCase();
        if (term) {
          params.push(`%${term}%`);
          whereExtra += ` AND lower(pr.display_name) LIKE $${params.length}`;
        }
        const totals = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM (${ROLLED(whereExtra)}) rolled`,
          params,
        );
        const offset = Math.max(0, (query.page - 1) * query.pageSize);
        params.push(query.pageSize, offset);
        const rows = await client.query<NettingRow>(
          `SELECT * FROM (${ROLLED(whereExtra)}) rolled ORDER BY display_name ASC, party_id LIMIT $${params.length - 1} OFFSET $${params.length}`,
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
        const rows = await client.query<NettingRow>(
          `SELECT * FROM (${ROLLED(' AND sums.party_id = $2 AND sums.org_unit_id = $3 AND sums.currency_code = $4')}) rolled LIMIT 1`,
          [principal.tenantId, partyId, orgUnitId, currencyCode],
        );
        const row = rows.rows[0];
        return row ? toWindow(row) : null;
      });
    },
  };
}
