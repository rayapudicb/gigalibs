import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';

const PARTY_REFERENCE_SQL = 'SELECT gigalibs_orders.require_active_party($1, $2::uuid)';

/** Ensures the customer party exists in kernel `/parties` for this tenant (SECURITY DEFINER SQL function). */
export async function requireActiveCustomerParty(
  client: PoolClient,
  tenantId: string,
  partyId: string,
): Promise<void> {
  try {
    await client.query(PARTY_REFERENCE_SQL, [tenantId, partyId]);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === '23503') {
      throw new BadRequestException({
        code: 'UNIVERSAL_ORDERS_CUSTOMER_PARTY_NOT_FOUND',
        message: `Customer party "${partyId}" was not found or is not active in this workspace.`,
      });
    }
    throw error;
  }
}
