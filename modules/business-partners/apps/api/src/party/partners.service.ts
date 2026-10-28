import type { ModulePrincipal } from '@gigalibs/module-sdk';
import { Injectable } from '@nestjs/common';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';

export interface PartnerListItemV1 {
  readonly partyId: string;
  readonly code: string;
  readonly displayName: string;
  readonly partyType: string;
  readonly status: string;
}

export interface PartnerListV1 {
  readonly items: readonly PartnerListItemV1[];
}

/**
 * Read model for the Partners list screen. Reads the module's `party_references` replica (kept in
 * step with the kernel parties via the inbox), tenant-scoped, with a type-ahead search over name
 * and code. Partner master data is created in the kernel; this list serves the search-then-open flow.
 */
@Injectable()
export class PartnersService {
  constructor(private readonly database: DatabaseService) {}

  async list(
    principal: ModulePrincipal,
    search: string | undefined,
    limit: number,
  ): Promise<PartnerListV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const params: unknown[] = [principal.tenantId];
      let where = 'tenant_id = $1';
      const term = search?.trim().toLowerCase();
      if (term) {
        params.push(`%${term}%`);
        where += ` AND (lower(display_name) LIKE $${params.length} OR lower(code) LIKE $${params.length})`;
      }
      params.push(limit);
      const rows = await client.query<{
        party_id: string;
        code: string;
        display_name: string;
        party_type: string;
        status: string;
      }>(
        `SELECT party_id, code, display_name, party_type, status
           FROM ${SCHEMA}.party_references
          WHERE ${where}
          ORDER BY display_name ASC, party_id
          LIMIT $${params.length}`,
        params,
      );
      return {
        items: rows.rows.map((row) => ({
          partyId: row.party_id,
          code: row.code,
          displayName: row.display_name,
          partyType: row.party_type,
          status: row.status,
        })),
      };
    });
  }
}
