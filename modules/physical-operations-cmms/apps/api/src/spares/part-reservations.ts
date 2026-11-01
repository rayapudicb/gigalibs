import type { PoolClient } from 'pg';
import type { CmmsCommandContext } from '../auth/authorization.js';

/**
 * WI-OI-136: issuing a part to a work order fulfils that work order's open reservations for the part, oldest first.
 * A reservation larger than what remains of the issue stays open, so available stock is never overstated.
 */
export async function fulfilReservations(
  client: PoolClient,
  context: CmmsCommandContext,
  partId: string,
  workOrderId: string,
  issuedQuantity: number,
): Promise<number> {
  const open = await client.query<{ id: string; quantity: string }>(
    `SELECT id, quantity FROM gigalibs_cmms.part_reservations
      WHERE tenant_id = $1 AND part_id = $2 AND work_order_id = $3 AND status = 'OPEN'
      ORDER BY reserved_at, id FOR UPDATE`,
    [context.principal.tenantId, partId, workOrderId],
  );
  let remaining = issuedQuantity;
  const fulfilled: string[] = [];
  for (const row of open.rows) {
    const quantity = Number(row.quantity);
    if (quantity > remaining + 1e-9) break;
    remaining -= quantity;
    fulfilled.push(row.id);
  }
  if (fulfilled.length === 0) return 0;
  await client.query(
    `UPDATE gigalibs_cmms.part_reservations
        SET status = 'ISSUED', closed_by = $3, closed_at = now(), correlation_id = $4
      WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [context.principal.tenantId, fulfilled, context.principal.subject, context.correlationId],
  );
  return fulfilled.length;
}
