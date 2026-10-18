import { Logger, Injectable, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';

const ALLOWED = new Set(['AWAITING_POSTING', 'POSTED', 'POSTING_REJECTED']);

/** Optional cross-schema write so Inventory receipts show Finance posting outcomes (module-host only). */
@Injectable()
export class InventoryReceiptPostingStatusSync implements OnModuleDestroy {
  private readonly logger = new Logger(InventoryReceiptPostingStatusSync.name);
  private readonly pool: pg.Pool | null;

  constructor() {
    const url = process.env.FINANCE_INVENTORY_POSTING_DATABASE_URL?.trim();
    this.pool = url ? new pg.Pool({ connectionString: url, max: 2, application_name: 'finance-inventory-posting-sync' }) : null;
    if (!this.pool) {
      this.logger.log('FINANCE_INVENTORY_POSTING_DATABASE_URL is unset; Inventory receipt posting status is not synced.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async setStatus(
    tenantId: string,
    receiptId: string,
    status: 'AWAITING_POSTING' | 'POSTED' | 'POSTING_REJECTED',
    rejectionCode: string | null = null,
  ): Promise<void> {
    if (!this.pool || !ALLOWED.has(status)) return;
    try {
      await this.pool.query(`SELECT gigalibs_inventory.set_receipt_finance_posting_status($1, $2::uuid, $3, $4)`, [
        tenantId,
        receiptId,
        status,
        rejectionCode,
      ]);
    } catch (error) {
      this.logger.warn(`Could not sync Inventory posting status for receipt ${receiptId}.`, error);
    }
  }
}
