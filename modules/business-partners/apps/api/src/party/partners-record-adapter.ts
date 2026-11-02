import {
  type IdempotencyStore,
  type LookupResolver,
  type ModulePrincipal,
  type RecordAdapter,
  RecordDispatcher,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordPage,
  type RecordValues,
} from '@gigalibs/module-sdk';
import { SCHEMA } from '../config.js';
import { creditExposureRecordAdapter } from '../credit/credit-exposure-record-adapter.js';
import { creditHoldsRecordAdapter } from '../credit/credit-holds-record-adapter.js';
import { creditStatusRecordAdapter } from '../credit/credit-status-record-adapter.js';
import { partnerNettingRecordAdapter } from '../credit/partner-netting-record-adapter.js';
import type { DatabaseService } from '../database.service.js';

const READ = 'business-partners:read';
const unwritable: RecordFieldPolicy = { writable: false };
const FIELDS: Record<string, RecordFieldPolicy> = {
  'display-name': unwritable,
  'party-type': unwritable,
  code: unwritable,
  status: unwritable,
};

interface PartyRow {
  party_id: string;
  code: string;
  display_name: string;
  party_type: string;
  status: string;
}

const SELECT = 'party_id, code, display_name, party_type, status';

const toWindow = (row: PartyRow): RecordValues => ({
  id: row.party_id,
  'display-name': row.display_name,
  'party-type': row.party_type,
  code: row.code,
  status: row.status,
});

/**
 * Read-only record adapter for the Partners window. Serves the module's `party_references` replica
 * (kept in step with the kernel parties via the inbox), tenant-scoped, type-ahead over name and code.
 * Partners are created in the kernel, so this adapter does not create or update.
 */
export function partnersRecordAdapter(database: DatabaseService): RecordAdapter {
  return {
    entityKey: 'business-partners.partners',
    permissions: { read: READ },
    fields: FIELDS,
    searchFields: ['display-name', 'code'],
    // WI-OI-146: the Partners window sorts by name by default; the list refused it (400) because no sort was declared.
    sortFields: ['display-name', 'code'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      return database.withTenantTransaction(principal.tenantId, async (client) => {
        const params: unknown[] = [principal.tenantId];
        let where = 'tenant_id = $1';
        const term = query.search?.trim().toLowerCase();
        if (term) {
          params.push(`%${term}%`);
          where += ` AND (lower(display_name) LIKE $${params.length} OR lower(code) LIKE $${params.length})`;
        }
        const totals = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${SCHEMA}.party_references WHERE ${where}`,
          params,
        );
        const offset = Math.max(0, (query.page - 1) * query.pageSize);
        params.push(query.pageSize, offset);
        const rows = await client.query<PartyRow>(
          `SELECT ${SELECT} FROM ${SCHEMA}.party_references WHERE ${where}
            ORDER BY ${query.sortField === 'code' ? 'code' : 'display_name'} ${query.sortDirection === 'DESC' ? 'DESC' : 'ASC'}, party_id
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
        const rows = await client.query<PartyRow>(
          `SELECT ${SELECT} FROM ${SCHEMA}.party_references WHERE tenant_id = $1 AND party_id = $2`,
          [principal.tenantId, id],
        );
        const row = rows.rows[0];
        return row ? toWindow(row) : null;
      });
    },
  };
}

/**
 * The record dispatcher behind the Business Partner metadata windows: the Partners list over `party_references`
 * and the Credit exposure list over the customer accounts and credit ledger. Both are read-only.
 */
export function businessPartnersRecordDispatcher(
  database: DatabaseService,
  idempotency: IdempotencyStore,
): RecordDispatcher {
  return new RecordDispatcher(
    [
      partnersRecordAdapter(database),
      creditExposureRecordAdapter(database),
      creditStatusRecordAdapter(database),
      partnerNettingRecordAdapter(database),
      creditHoldsRecordAdapter(database),
    ],
    [partnersLookup(database)],
    idempotency,
  );
}

/**
 * WI-OI-149: the partner picker other modules' documents use for their customer or vendor (Orders, Procurement), in
 * place of a typed party id. Active partners by name or code; the name and code travel with the option.
 */
export function partnersLookup(database: DatabaseService): LookupResolver {
  return {
    key: 'business-partners-parties',
    permission: READ,
    async resolve(principal, request) {
      return database.withTenantTransaction(principal.tenantId, async (client) => {
        const params: unknown[] = [principal.tenantId];
        let where = "tenant_id = $1 AND status = 'ACTIVE'";
        if (request.ids?.length) {
          params.push(request.ids);
          where = `tenant_id = $1 AND party_id = ANY($${params.length}::uuid[])`;
        } else if (request.search?.trim()) {
          params.push(`%${request.search.trim().toLowerCase()}%`);
          where += ` AND (lower(display_name) LIKE $${params.length} OR lower(code) LIKE $${params.length})`;
        }
        params.push(request.limit);
        const rows = await client.query<{ party_id: string; code: string; display_name: string }>(
          `SELECT party_id, code, display_name FROM ${SCHEMA}.party_references WHERE ${where}
            ORDER BY display_name ASC LIMIT $${params.length}`,
          params,
        );
        return rows.rows.map((row) => ({
          value: row.party_id,
          label: `${row.display_name} (${row.code})`,
          attributes: { name: row.display_name, code: row.code },
        }));
      });
    },
  };
}
