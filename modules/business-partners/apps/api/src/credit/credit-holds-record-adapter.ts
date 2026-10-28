import {
  OrganizationReplica,
  organizationAccess,
  organizationReadCondition,
  type ModulePrincipal,
  type RecordAdapter,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordPage,
  type RecordValues,
} from '@gigalibs/module-sdk';
import { SCHEMA } from '../config.js';
import type { DatabaseService } from '../database.service.js';

const READ = 'business-partners:read';
const unwritable: RecordFieldPolicy = { writable: false };
const FIELDS: Record<string, RecordFieldPolicy> = {
  'partner-name': unwritable,
  'party-id': unwritable,
  'org-unit-id': unwritable,
  currency: unwritable,
  origin: unwritable,
  reason: unwritable,
  status: unwritable,
  'created-at': unwritable,
  'created-by': unwritable,
};

const orgReplica = new OrganizationReplica(SCHEMA);

interface HoldQueueRow {
  id: string;
  party_id: string;
  display_name: string;
  org_unit_id: string;
  currency_code: string;
  status: string;
  origin: string;
  reason: string;
  created_by: string;
  created_at: Date;
}

const toWindow = (row: HoldQueueRow): RecordValues => ({
  id: row.id,
  'partner-name': row.display_name,
  'party-id': row.party_id,
  'org-unit-id': row.org_unit_id,
  currency: row.currency_code.trim(),
  origin: row.origin,
  reason: row.reason,
  status: row.status,
  'created-at': new Date(row.created_at).toISOString(),
  'created-by': row.created_by,
});

/** Tenant-wide active credit holds for the Credit-Hold queue window (org-scoped read). */
export function creditHoldsRecordAdapter(database: DatabaseService): RecordAdapter {
  return {
    entityKey: 'business-partners.credit-holds',
    permissions: { read: READ },
    fields: FIELDS,
    searchFields: ['partner-name', 'reason'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      return database.withTenantTransaction(principal.tenantId, async (client) => {
        const access = await organizationAccess(
          orgReplica,
          client,
          principal.tenantId,
          principal.organization ?? { mode: 'DENIED' },
        );
        const empty: RecordPage = { items: [], total: 0, page: query.page, pageSize: query.pageSize };
        if (access.denied) return empty;

        const params: unknown[] = [principal.tenantId];
        const bind = (value: unknown) => {
          params.push(value);
          return `$${params.length}`;
        };
        const scoped = organizationReadCondition(access, 'h.org_unit_id', bind);
        let where = `h.tenant_id = $1 AND h.status = 'ACTIVE'`;
        if (scoped) where += ` AND ${scoped}`;
        const term = query.search?.trim().toLowerCase();
        if (term) {
          params.push(`%${term}%`);
          where += ` AND (lower(pr.display_name) LIKE $${params.length} OR lower(h.reason) LIKE $${params.length})`;
        }

        const totals = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count
             FROM ${SCHEMA}.credit_holds h
             JOIN ${SCHEMA}.party_references pr
               ON pr.tenant_id = h.tenant_id AND pr.party_id = h.party_id
            WHERE ${where}`,
          params,
        );
        const offset = Math.max(0, (query.page - 1) * query.pageSize);
        params.push(query.pageSize, offset);
        const rows = await client.query<HoldQueueRow>(
          `SELECT h.id, h.party_id, pr.display_name, h.org_unit_id, h.currency_code,
                  h.status, h.origin, h.reason, h.created_by, h.created_at
             FROM ${SCHEMA}.credit_holds h
             JOIN ${SCHEMA}.party_references pr
               ON pr.tenant_id = h.tenant_id AND pr.party_id = h.party_id
            WHERE ${where}
            ORDER BY h.created_at DESC, h.id
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
      return database.withTenantTransaction(principal.tenantId, async (client) => {
        const access = await organizationAccess(
          orgReplica,
          client,
          principal.tenantId,
          principal.organization ?? { mode: 'DENIED' },
        );
        if (access.denied) return null;
        const params: unknown[] = [principal.tenantId, id];
        const bind = (value: unknown) => {
          params.push(value);
          return `$${params.length}`;
        };
        const scoped = organizationReadCondition(access, 'h.org_unit_id', bind);
        const rows = await client.query<HoldQueueRow>(
          `SELECT h.id, h.party_id, pr.display_name, h.org_unit_id, h.currency_code,
                  h.status, h.origin, h.reason, h.created_by, h.created_at
             FROM ${SCHEMA}.credit_holds h
             JOIN ${SCHEMA}.party_references pr
               ON pr.tenant_id = h.tenant_id AND pr.party_id = h.party_id
            WHERE h.tenant_id = $1 AND h.id = $2 AND h.status = 'ACTIVE'
              ${scoped ? `AND ${scoped}` : ''}
            LIMIT 1`,
          params,
        );
        const row = rows.rows[0];
        return row ? toWindow(row) : null;
      });
    },
  };
}
