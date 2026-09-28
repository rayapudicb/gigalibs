import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { GIGAOPS_DB_POOL } from '../packs/packs.service.js';

export interface CreatePerDiemDto {
  timeEntryId: string;
  workerId: string;
  workUnitId: string;
  workDate: string;
  amount: number;
  currency?: string;
}

@Injectable()
export class PerDiemService {
  constructor(@Inject(GIGAOPS_DB_POOL) private readonly db: Pool) {}

  async list(
    tenantId: string,
    params: { workerId?: string; workUnitId?: string; status?: string },
  ) {
    let query = `
      SELECT pd.*, w.first_name, w.last_name, wu.name as work_unit_name
      FROM gigalibs_gigaops.per_diem_entries pd
      JOIN gigalibs_gigaops.workers w ON pd.worker_id = w.id
      JOIN gigalibs_gigaops.work_units wu ON pd.work_unit_id = wu.id
      WHERE pd.tenant_id = $1
    `;
    const values: any[] = [tenantId];
    let idx = 2;

    if (params.workerId) {
      query += ` AND pd.worker_id = $${idx++}`;
      values.push(params.workerId);
    }
    if (params.workUnitId) {
      query += ` AND pd.work_unit_id = $${idx++}`;
      values.push(params.workUnitId);
    }
    if (params.status) {
      query += ` AND pd.status = $${idx++}`;
      values.push(params.status);
    }

    query += ` ORDER BY pd.work_date DESC`;
    const res = await this.db.query(query, values);
    return res.rows;
  }

  async getById(tenantId: string, id: string) {
    const res = await this.db.query(
      `SELECT * FROM gigalibs_gigaops.per_diem_entries 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Per diem entry '${id}' not found.`);
    }
    return res.rows[0];
  }

  async create(tenantId: string, dto: CreatePerDiemDto) {
    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.per_diem_entries (
        tenant_id, time_entry_id, worker_id, work_unit_id,
        work_date, amount, currency, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'NEW')
      RETURNING *`,
      [
        tenantId,
        dto.timeEntryId,
        dto.workerId,
        dto.workUnitId,
        dto.workDate,
        dto.amount,
        dto.currency ?? 'USD',
      ],
    );
    return res.rows[0];
  }

  async approve(tenantId: string, id: string, reviewerId: string) {
    await this.getById(tenantId, id);
    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.per_diem_entries
       SET status = 'APPROVE', reviewed_at = now(), reviewed_by = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, reviewerId],
    );
    return res.rows[0];
  }

  async reject(tenantId: string, id: string, reviewerId: string, notes?: string) {
    await this.getById(tenantId, id);
    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.per_diem_entries
       SET status = 'REJECT', reviewed_at = now(), reviewed_by = $3, review_notes = $4, updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, reviewerId, notes ?? null],
    );
    return res.rows[0];
  }
}
