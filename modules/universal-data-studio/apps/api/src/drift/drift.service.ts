import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class DriftService {
  constructor(private readonly db: DatabaseService) {}

  async getDriftLogs(tenantId: string, limit: number = 50): Promise<any[]> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const sql = `
      SELECT 
        l.id, l.tenant_id, l.contract_id, l.drift_type, l.details, l.source_ip, l.occurred_at,
        c.contract_code, c.name AS contract_name, c.domain
      FROM gigalibs_data_studio.schema_drift_logs l
      LEFT JOIN gigalibs_data_studio.data_contracts c ON l.contract_id = c.id
      WHERE l.tenant_id = $1
      ORDER BY l.occurred_at DESC
      LIMIT $2
    `;
    const res = await this.db.query(sql, [tenantId, Math.min(Math.max(1, limit), 200)]);
    return res.rows;
  }

  /**
   * DS-04: Resolve quarantined drift event with audit logging.
   */
  async resolveDrift(tenantId: string, driftId: string, notes: string): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const check = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.schema_drift_logs WHERE id = $1 AND tenant_id = $2`,
      [driftId, tenantId],
    );

    if (check.rowCount === 0) {
      throw new NotFoundException(`Drift record '${driftId}' not found for tenant '${tenantId}'`);
    }

    const log = check.rows[0];
    const updatedDetails = {
      ...(typeof log.details === 'object' ? log.details : JSON.parse(log.details || '{}')),
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_notes: notes || 'Resolved by operator',
    };

    await this.db.query(
      `UPDATE gigalibs_data_studio.schema_drift_logs
       SET details = $1
       WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(updatedDetails), driftId, tenantId],
    );

    return {
      success: true,
      drift_id: driftId,
      status: 'RESOLVED',
      resolved_at: updatedDetails.resolved_at,
    };
  }
}
