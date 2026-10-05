import { type LookupResolver, type ModulePrincipal, ModuleIdempotencyStore, RecordDispatcher } from '@gigalibs/module-sdk';
import type { DatabaseService } from '../database.service.js';

// WI-OI-120f (F0.5, ADR-0033 D1): the Catalogue's lookups for other modules' metadata windows, such as the product and
// unit pickers on Inventory's items and receipt lines. A module never reads another module's tables: the picker calls
// this module through its own signed gateway, and the Catalogue answers for the caller's tenant only.

function options(
  database: DatabaseService,
  table: 'products' | 'uom_definitions',
  activeCondition: string,
  principal: ModulePrincipal,
  request: { readonly search?: string; readonly ids?: readonly string[]; readonly limit: number },
) {
  return database.withTenantTransaction(principal.tenantId, async (client) => {
    const values: unknown[] = [principal.tenantId];
    const where = ['tenant_id = $1', activeCondition];
    if (request.ids?.length) {
      values.push(request.ids);
      where.push(`id = ANY($${values.length}::uuid[])`);
    } else if (request.search) {
      values.push(`%${request.search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
      where.push(`(code ILIKE $${values.length} OR name ILIKE $${values.length})`);
    }
    values.push(request.limit);
    const result = await client.query(
      `SELECT id, code || ' — ' || name AS label FROM gigalibs_product_catalogue.${table}
        WHERE ${where.join(' AND ')} ORDER BY code ASC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) => ({ value: String(row.id), label: String(row.label) }));
  });
}

export function catalogueLookupResolvers(database: DatabaseService): LookupResolver[] {
  return [
    {
      key: 'catalogue-products',
      permission: 'products:read',
      resolve: (principal, request) => options(database, 'products', 'archived_at IS NULL', principal, request),
    },
    {
      key: 'catalogue-uoms',
      permission: 'uoms:read',
      resolve: (principal, request) => options(database, 'uom_definitions', 'active = true', principal, request),
    },
  ];
}

/** The Catalogue's record dispatcher: lookups now; its own window adapters arrive with U7. */
export function catalogueRecordDispatcher(database: DatabaseService): RecordDispatcher {
  return new RecordDispatcher([], catalogueLookupResolvers(database), new ModuleIdempotencyStore(database));
}
