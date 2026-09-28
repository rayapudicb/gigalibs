import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { GIGAOPS_DB_POOL } from '../packs/packs.service.js';

export interface CreateTimeEntryDto {
  positionId: string;
  workerId: string;
  workUnitId: string;
  workDate: string; // YYYY-MM-DD
  clockedMinutes?: number;
  lunchMinutes?: number;
  useGuaranteedHours?: boolean;
  guaranteedMinutes?: number;
  isNoShow?: boolean;
  notes?: string;
}

@Injectable()
export class TimeEntriesService {
  constructor(@Inject(GIGAOPS_DB_POOL) private readonly db: Pool) {}

  async list(
    tenantId: string,
    params: {
      workUnitId?: string;
      workerId?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    const offset = (page - 1) * limit;

    let query = `
      SELECT te.*, 
             w.first_name, w.last_name, w.email, w.worker_id_ext,
             p.title as position_title, wu.name as work_unit_name
      FROM gigalibs_gigaops.time_entries te
      JOIN gigalibs_gigaops.workers w ON te.worker_id = w.id
      JOIN gigalibs_gigaops.positions p ON te.position_id = p.id
      JOIN gigalibs_gigaops.work_units wu ON te.work_unit_id = wu.id
      WHERE te.tenant_id = $1
    `;
    const values: any[] = [tenantId];
    let idx = 2;

    if (params.workUnitId) {
      query += ` AND te.work_unit_id = $${idx++}`;
      values.push(params.workUnitId);
    }
    if (params.workerId) {
      query += ` AND te.worker_id = $${idx++}`;
      values.push(params.workerId);
    }
    if (params.status) {
      query += ` AND te.status = $${idx++}`;
      values.push(params.status);
    }
    if (params.dateFrom) {
      query += ` AND te.work_date >= $${idx++}`;
      values.push(params.dateFrom);
    }
    if (params.dateTo) {
      query += ` AND te.work_date <= $${idx++}`;
      values.push(params.dateTo);
    }

    query += ` ORDER BY te.work_date DESC, te.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    values.push(limit, offset);

    const res = await this.db.query(query, values);
    return res.rows;
  }

  async getById(tenantId: string, id: string) {
    const res = await this.db.query(
      `SELECT te.*, 
              w.first_name, w.last_name, w.email, w.worker_id_ext,
              p.title as position_title, wu.name as work_unit_name
       FROM gigalibs_gigaops.time_entries te
       JOIN gigalibs_gigaops.workers w ON te.worker_id = w.id
       JOIN gigalibs_gigaops.positions p ON te.position_id = p.id
       JOIN gigalibs_gigaops.work_units wu ON te.work_unit_id = wu.id
       WHERE te.tenant_id = $1 AND te.id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Time entry '${id}' not found.`);
    }

    // Include clock punches
    const punches = await this.db.query(
      `SELECT * FROM gigalibs_gigaops.clock_punches 
       WHERE tenant_id = $1 AND time_entry_id = $2 
       ORDER BY punch_index ASC`,
      [tenantId, id],
    );

    return { ...res.rows[0], clockPunches: punches.rows };
  }

  async create(tenantId: string, dto: CreateTimeEntryDto) {
    // 1. Verify that agreement requirement is satisfied
    // Check if role requires agreement
    const roleRes = await this.db.query(
      `SELECT r.requires_agreement, r.id as role_id 
       FROM gigalibs_gigaops.positions p
       JOIN gigalibs_gigaops.roles r ON p.role_id = r.id
       WHERE p.tenant_id = $1 AND p.id = $2`,
      [tenantId, dto.positionId],
    );

    if (roleRes.rows.length > 0 && roleRes.rows[0].requires_agreement) {
      const roleId = roleRes.rows[0].role_id;
      const agreementRes = await this.db.query(
        `SELECT id, status FROM gigalibs_gigaops.agreements
         WHERE tenant_id = $1 AND worker_id = $2 AND role_id = $3 AND status = 'SIGNED'`,
        [tenantId, dto.workerId, roleId],
      );

      if (agreementRes.rows.length === 0) {
        throw new ForbiddenException(
          'Cannot submit time: Signed agreement is required before time submission.',
        );
      }
    }

    // 2. Check 10-day submission window
    const workDate = new Date(dto.workDate);
    const now = new Date();
    const diffMs = now.getTime() - workDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const isPriorPayroll = diffDays > 10;

    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.time_entries (
        tenant_id, position_id, worker_id, work_unit_id, work_date,
        clocked_minutes, lunch_minutes, use_guaranteed_hrs, guaranteed_minutes,
        status, is_prior_payroll, is_no_show, notes, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'SUBMITTED', $10, $11, $12, now())
      ON CONFLICT (position_id, worker_id, work_date) DO UPDATE SET
        clocked_minutes = EXCLUDED.clocked_minutes,
        lunch_minutes = EXCLUDED.lunch_minutes,
        notes = EXCLUDED.notes,
        status = 'SUBMITTED',
        submitted_at = now()
      RETURNING *`,
      [
        tenantId,
        dto.positionId,
        dto.workerId,
        dto.workUnitId,
        dto.workDate,
        dto.clockedMinutes ?? 0,
        dto.lunchMinutes ?? 0,
        dto.useGuaranteedHours ?? false,
        dto.guaranteedMinutes ?? 0,
        isPriorPayroll,
        dto.isNoShow ?? false,
        dto.notes ?? null,
      ],
    );
    return res.rows[0];
  }

  async clockIn(tenantId: string, id: string, punchIndex: number) {
    if (punchIndex < 1 || punchIndex > 3) {
      throw new BadRequestException('Invalid punch index. Maximum 3 punches allowed per day.');
    }

    await this.getById(tenantId, id);

    // Check if punchIndex already exists
    const punchCheck = await this.db.query(
      `SELECT id FROM gigalibs_gigaops.clock_punches 
       WHERE tenant_id = $1 AND time_entry_id = $2 AND punch_index = $3`,
      [tenantId, id, punchIndex],
    );

    if (punchCheck.rows.length > 0) {
      throw new BadRequestException(`Punch index ${punchIndex} already has a clock-in record.`);
    }

    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.clock_punches (
        tenant_id, time_entry_id, punch_index, check_in_at
      ) VALUES ($1, $2, $3, now())
      RETURNING *`,
      [tenantId, id, punchIndex],
    );

    return res.rows[0];
  }

  async clockOut(tenantId: string, id: string) {
    await this.getById(tenantId, id);

    // Find the latest open punch
    const openPunch = await this.db.query(
      `SELECT id, punch_index, check_in_at FROM gigalibs_gigaops.clock_punches
       WHERE tenant_id = $1 AND time_entry_id = $2 AND check_out_at IS NULL
       ORDER BY punch_index DESC LIMIT 1`,
      [tenantId, id],
    );

    if (openPunch.rows.length === 0) {
      throw new BadRequestException('No active open punch found to clock out.');
    }

    const punchId = openPunch.rows[0].id;
    await this.db.query(
      `UPDATE gigalibs_gigaops.clock_punches
       SET check_out_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, punchId],
    );

    // Recompute total clocked minutes on time_entry
    const totals = await this.db.query(
      `SELECT COALESCE(SUM(duration_minutes), 0) as total_min
       FROM gigalibs_gigaops.clock_punches
       WHERE tenant_id = $1 AND time_entry_id = $2 AND check_out_at IS NOT NULL`,
      [tenantId, id],
    );

    const clockedMinutes = Math.round(Number(totals.rows[0]?.total_min ?? 0));
    const updated = await this.db.query(
      `UPDATE gigalibs_gigaops.time_entries
       SET clocked_minutes = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, clockedMinutes],
    );

    return updated.rows[0];
  }

  async approve(tenantId: string, id: string, approverId: string) {
    const entry = await this.getById(tenantId, id);
    if (entry.status === 'APPROVED') {
      return entry;
    }

    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.time_entries
       SET status = 'APPROVED',
           approved_at = now(),
           approved_by = $3,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, approverId],
    );
    return res.rows[0];
  }

  async reject(tenantId: string, id: string, rejecterId: string, reason?: string) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Rejection reason is required to reject a time entry.');
    }

    await this.getById(tenantId, id);

    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.time_entries
       SET status = 'REJECTED',
           rejected_at = now(),
           rejected_by = $3,
           rejection_reason = $4,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, rejecterId, reason.trim()],
    );
    return res.rows[0];
  }
}
