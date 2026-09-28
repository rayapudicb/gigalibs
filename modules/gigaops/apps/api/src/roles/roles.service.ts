import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { GIGAOPS_DB_POOL } from '../packs/packs.service.js';

export interface CreateRoleDto {
  name: string;
  description?: string;
  requiredSkillTags?: string[];
  headcountNeeded?: number;
  requiresAgreement?: boolean;
  payTypeCode: string;
  agreementTemplateKey?: string;
}

@Injectable()
export class RolesService {
  constructor(@Inject(GIGAOPS_DB_POOL) private readonly db: Pool) {}

  async listForWorkUnit(tenantId: string, workUnitId: string) {
    const res = await this.db.query(
      `SELECT * FROM gigalibs_gigaops.roles 
       WHERE tenant_id = $1 AND work_unit_id = $2 
       ORDER BY name ASC`,
      [tenantId, workUnitId],
    );
    return res.rows;
  }

  async getById(tenantId: string, id: string) {
    const res = await this.db.query(
      `SELECT * FROM gigalibs_gigaops.roles 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Role '${id}' not found.`);
    }
    return res.rows[0];
  }

  async create(tenantId: string, workUnitId: string, dto: CreateRoleDto) {
    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.roles (
        tenant_id, work_unit_id, name, description, required_skill_tags,
        headcount_needed, requires_agreement, pay_type_code, agreement_template_key, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')
      RETURNING *`,
      [
        tenantId,
        workUnitId,
        dto.name,
        dto.description ?? null,
        dto.requiredSkillTags ?? [],
        dto.headcountNeeded ?? 1,
        dto.requiresAgreement ?? true,
        dto.payTypeCode,
        dto.agreementTemplateKey ?? null,
      ],
    );
    return res.rows[0];
  }

  async update(tenantId: string, id: string, dto: Partial<CreateRoleDto>) {
    await this.getById(tenantId, id);
    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.roles
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           headcount_needed = COALESCE($5, headcount_needed),
           pay_type_code = COALESCE($6, pay_type_code),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        id,
        dto.name ?? null,
        dto.description ?? null,
        dto.headcountNeeded ?? null,
        dto.payTypeCode ?? null,
      ],
    );
    return res.rows[0];
  }
}
