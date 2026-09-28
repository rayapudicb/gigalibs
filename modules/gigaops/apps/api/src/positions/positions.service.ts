import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { GIGAOPS_DB_POOL } from '../packs/packs.service.js';

export interface CreatePositionDto {
  title: string;
  workerId?: string;
  rateAmount: number;
  rateType?: 'HOURLY' | 'FLAT_DAILY' | 'FLAT_WEEKLY' | 'FLAT_EVENT';
  payTypeCode: string;
  workerClassificationCode?: string;
  isHolidayPay?: boolean;
  excludePayroll?: boolean;
  isVendorPay?: boolean;
  guaranteedHours?: number;
}

@Injectable()
export class PositionsService {
  constructor(@Inject(GIGAOPS_DB_POOL) private readonly db: Pool) {}

  async listForRole(tenantId: string, roleId: string) {
    const res = await this.db.query(
      `SELECT p.*, w.first_name, w.last_name, w.email, w.worker_id_ext
       FROM gigalibs_gigaops.positions p
       LEFT JOIN gigalibs_gigaops.workers w ON p.worker_id = w.id
       WHERE p.tenant_id = $1 AND p.role_id = $2
       ORDER BY p.title ASC`,
      [tenantId, roleId],
    );
    return res.rows;
  }

  async getById(tenantId: string, id: string) {
    const res = await this.db.query(
      `SELECT p.*, w.first_name, w.last_name, w.email, w.worker_id_ext
       FROM gigalibs_gigaops.positions p
       LEFT JOIN gigalibs_gigaops.workers w ON p.worker_id = w.id
       WHERE p.tenant_id = $1 AND p.id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Position '${id}' not found.`);
    }
    return res.rows[0];
  }

  async create(tenantId: string, roleId: string, dto: CreatePositionDto) {
    const initialStatus = dto.workerId ? 'FILLED' : 'OPEN';
    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.positions (
        tenant_id, role_id, worker_id, title, rate_amount, rate_type,
        pay_type_code, worker_classification_code, is_holiday_pay,
        exclude_payroll, is_vendor_pay, guaranteed_hours, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        tenantId,
        roleId,
        dto.workerId ?? null,
        dto.title,
        dto.rateAmount,
        dto.rateType ?? 'HOURLY',
        dto.payTypeCode,
        dto.workerClassificationCode ?? null,
        dto.isHolidayPay ?? false,
        dto.excludePayroll ?? false,
        dto.isVendorPay ?? false,
        dto.guaranteedHours ?? 0,
        initialStatus,
      ],
    );
    return res.rows[0];
  }

  async update(tenantId: string, id: string, dto: Partial<CreatePositionDto>) {
    await this.getById(tenantId, id);
    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.positions
       SET title = COALESCE($3, title),
           rate_amount = COALESCE($4, rate_amount),
           rate_type = COALESCE($5, rate_type),
           guaranteed_hours = COALESCE($6, guaranteed_hours),
           is_holiday_pay = COALESCE($7, is_holiday_pay),
           exclude_payroll = COALESCE($8, exclude_payroll),
           is_vendor_pay = COALESCE($9, is_vendor_pay),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        id,
        dto.title ?? null,
        dto.rateAmount ?? null,
        dto.rateType ?? null,
        dto.guaranteedHours ?? null,
        dto.isHolidayPay ?? null,
        dto.excludePayroll ?? null,
        dto.isVendorPay ?? null,
      ],
    );
    return res.rows[0];
  }

  async assign(tenantId: string, id: string, workerId: string) {
    await this.getById(tenantId, id);
    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.positions
       SET worker_id = $3, status = 'FILLED', updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, workerId],
    );
    return res.rows[0];
  }

  async unassign(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.positions
       SET worker_id = NULL, status = 'OPEN', updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id],
    );
    return res.rows[0];
  }
}
