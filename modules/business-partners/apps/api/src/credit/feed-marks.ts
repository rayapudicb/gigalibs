import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import type { CreditComponent } from './exposure.js';
import type { CreditFeedMarks } from './reconciliation.js';

export async function markFeedReady(
  client: PoolClient,
  tenantId: string,
  partyId: string,
  orgUnitId: string,
  currencyCode: string,
  component: CreditComponent,
): Promise<void> {
  await client.query(
    `INSERT INTO ${SCHEMA}.credit_feed_marks
       (tenant_id, party_id, org_unit_id, currency_code, component)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, party_id, org_unit_id, currency_code, component) DO NOTHING`,
    [tenantId, partyId, orgUnitId, currencyCode, component],
  );
}

export async function loadFeedMarks(
  client: PoolClient,
  tenantId: string,
  partyId: string,
  orgUnitId: string,
  currencyCode: string,
): Promise<CreditFeedMarks> {
  const rows = await client.query<{ component: CreditComponent }>(
    `SELECT component FROM ${SCHEMA}.credit_feed_marks
     WHERE tenant_id = $1 AND party_id = $2 AND org_unit_id = $3 AND currency_code = $4`,
    [tenantId, partyId, orgUnitId, currencyCode],
  );
  const ready = new Set(rows.rows.map((row) => row.component));
  return {
    openArReady: ready.has('OPEN_AR'),
    uninvoicedOrdersReady: ready.has('UNINVOICED_ORDER'),
    prepaymentReady: ready.has('PREPAYMENT'),
  };
}

export async function seedPrepaymentFeedReady(
  client: PoolClient,
  tenantId: string,
  partyId: string,
  orgUnitId: string,
  currencyCode: string,
): Promise<void> {
  await markFeedReady(client, tenantId, partyId, orgUnitId, currencyCode, 'PREPAYMENT');
}
