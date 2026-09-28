import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { RecoveryPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class ScannerService {
  constructor(private readonly db: DatabaseService) {}

  async getScans(tenantId: string) {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, tenant_id, scan_name, records_scanned, leaks_found,
              potential_recovery_usd, status, duration_ms, scanned_by, created_at
       FROM gigalibs_recovery.historical_scan_sessions
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows;
  }

  async triggerScan(
    _tenantId: string,
    _scanName: string | undefined,
    _principal: RecoveryPrincipal,
  ): Promise<never> {
    throw new ServiceUnavailableException(
      'Recovery scanning requires a configured authoritative source contract. No scan record was created.',
    );
  }
}
