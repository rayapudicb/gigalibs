import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { GIGAOPS_DB_POOL } from '../packs/packs.service.js';

export interface CreateWorkerDto {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  classificationCode: string;
  stateCode?: string;
  isUnion?: boolean;
  unionLocal?: string;
  payrollRef?: string;
}

export const MAX_WORKER_SKILL_TAGS = 20;

@Injectable()
export class WorkersService {
  constructor(@Inject(GIGAOPS_DB_POOL) private readonly db: Pool) {}

  async list(
    tenantId: string,
    params: {
      classification?: string;
      skillTag?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const offset = (page - 1) * limit;

    let query = `
      SELECT DISTINCT w.*
      FROM gigalibs_gigaops.workers w
      LEFT JOIN gigalibs_gigaops.worker_skill_tags wst ON w.id = wst.worker_id
      WHERE w.tenant_id = $1 AND w.is_active = true
    `;
    const values: any[] = [tenantId];
    let idx = 2;

    if (params.classification) {
      query += ` AND w.classification_code = $${idx++}`;
      values.push(params.classification);
    }
    if (params.skillTag) {
      query += ` AND wst.tag_slug = $${idx++}`;
      values.push(params.skillTag);
    }

    query += ` ORDER BY w.last_name ASC, w.first_name ASC LIMIT $${idx++} OFFSET $${idx++}`;
    values.push(limit, offset);

    const res = await this.db.query(query, values);
    return res.rows;
  }

  async search(tenantId: string, q: string) {
    const term = `%${q.trim()}%`;
    const res = await this.db.query(
      `SELECT * FROM gigalibs_gigaops.workers
       WHERE tenant_id = $1 
         AND (
           email ILIKE $2 OR 
           worker_id_ext ILIKE $2 OR 
           first_name ILIKE $2 OR 
           last_name ILIKE $2
         )
       ORDER BY last_name ASC LIMIT 25`,
      [tenantId, term],
    );
    return res.rows;
  }

  async getById(tenantId: string, id: string) {
    const res = await this.db.query(
      `SELECT * FROM gigalibs_gigaops.workers 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Worker '${id}' not found.`);
    }
    return res.rows[0];
  }

  async create(tenantId: string, dto: CreateWorkerDto) {
    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.workers (
        tenant_id, first_name, last_name, email, phone,
        classification_code, state_code, is_union, union_local,
        is_active, payroll_ref
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
      RETURNING *`,
      [
        tenantId,
        dto.firstName,
        dto.lastName,
        dto.email.toLowerCase().trim(),
        dto.phone ?? null,
        dto.classificationCode,
        dto.stateCode ?? null,
        dto.isUnion ?? false,
        dto.unionLocal ?? null,
        dto.payrollRef ?? null,
      ],
    );
    return res.rows[0];
  }

  async update(tenantId: string, id: string, dto: Partial<CreateWorkerDto>) {
    await this.getById(tenantId, id);
    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.workers
       SET first_name = COALESCE($3, first_name),
           last_name = COALESCE($4, last_name),
           phone = COALESCE($5, phone),
           classification_code = COALESCE($6, classification_code),
           state_code = COALESCE($7, state_code),
           is_union = COALESCE($8, is_union),
           union_local = COALESCE($9, union_local),
           payroll_ref = COALESCE($10, payroll_ref),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        id,
        dto.firstName ?? null,
        dto.lastName ?? null,
        dto.phone ?? null,
        dto.classificationCode ?? null,
        dto.stateCode ?? null,
        dto.isUnion ?? null,
        dto.unionLocal ?? null,
        dto.payrollRef ?? null,
      ],
    );
    return res.rows[0];
  }

  async getSkills(tenantId: string, workerId: string) {
    await this.getById(tenantId, workerId);
    const res = await this.db.query(
      `SELECT wst.tag_slug, st.label, wst.created_at
       FROM gigalibs_gigaops.worker_skill_tags wst
       LEFT JOIN gigalibs_gigaops.skill_tags st 
         ON wst.tag_slug = st.slug AND (st.tenant_id = $1 OR st.tenant_id IS NULL)
       WHERE wst.tenant_id = $1 AND wst.worker_id = $2
       ORDER BY wst.created_at ASC`,
      [tenantId, workerId],
    );
    return res.rows;
  }

  async addSkill(tenantId: string, workerId: string, tagSlug: string) {
    await this.getById(tenantId, workerId);

    // Count existing skills
    const countRes = await this.db.query(
      `SELECT COUNT(*) FROM gigalibs_gigaops.worker_skill_tags 
       WHERE tenant_id = $1 AND worker_id = $2`,
      [tenantId, workerId],
    );
    const currentCount = Number.parseInt(countRes.rows[0]?.count ?? '0', 10);
    if (currentCount >= MAX_WORKER_SKILL_TAGS) {
      throw new BadRequestException(
        `Worker cannot have more than ${MAX_WORKER_SKILL_TAGS} skill tags.`,
      );
    }

    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.worker_skill_tags (tenant_id, worker_id, tag_slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (worker_id, tag_slug) DO NOTHING
       RETURNING *`,
      [tenantId, workerId, tagSlug.trim().toLowerCase()],
    );
    return res.rows[0] ?? { worker_id: workerId, tag_slug: tagSlug };
  }

  async removeSkill(tenantId: string, workerId: string, tagSlug: string) {
    await this.getById(tenantId, workerId);
    await this.db.query(
      `DELETE FROM gigalibs_gigaops.worker_skill_tags 
       WHERE tenant_id = $1 AND worker_id = $2 AND tag_slug = $3`,
      [tenantId, workerId, tagSlug],
    );
    return { success: true };
  }

  async getTimesheet(tenantId: string, workerId: string, workUnitId?: string) {
    await this.getById(tenantId, workerId);
    let query = `
      SELECT te.*, p.title as position_title, wu.name as work_unit_name
      FROM gigalibs_gigaops.time_entries te
      JOIN gigalibs_gigaops.positions p ON te.position_id = p.id
      JOIN gigalibs_gigaops.work_units wu ON te.work_unit_id = wu.id
      WHERE te.tenant_id = $1 AND te.worker_id = $2
    `;
    const params: any[] = [tenantId, workerId];
    if (workUnitId) {
      query += ` AND te.work_unit_id = $3`;
      params.push(workUnitId);
    }
    query += ` ORDER BY te.work_date DESC`;

    const res = await this.db.query(query, params);
    return res.rows;
  }
}
