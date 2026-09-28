import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { GIGAOPS_DB_POOL } from '../packs/packs.service.js';

@Injectable()
export class MetaService {
  constructor(@Inject(GIGAOPS_DB_POOL) private readonly db: Pool) {}

  async getWorkerClassifications() {
    const res = await this.db.query(
      `SELECT code, label, is_active 
       FROM gigalibs_gigaops.worker_classifications 
       WHERE is_active = true 
       ORDER BY code ASC`,
    );
    return res.rows;
  }

  async getPayTypes() {
    const res = await this.db.query(
      `SELECT code, label, daily_regular_cap, daily_ot_cap, weekly_regular_cap, 
              ot_multiplier, dt_multiplier, seventh_day_rule, is_flat_rate 
       FROM gigalibs_gigaops.pay_type_catalogue 
       ORDER BY code ASC`,
    );
    return res.rows;
  }

  async getSkillTags(tenantId: string, industrySlug?: string) {
    let query = `
      SELECT id, tenant_id, slug, label, industry_slug 
      FROM gigalibs_gigaops.skill_tags 
      WHERE (tenant_id = $1 OR tenant_id IS NULL)
    `;
    const params: any[] = [tenantId];

    if (industrySlug) {
      query += ` AND (industry_slug = $2 OR industry_slug IS NULL)`;
      params.push(industrySlug);
    }
    query += ` ORDER BY label ASC`;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  async createTenantSkillTag(
    tenantId: string,
    slug: string,
    label: string,
    industrySlug?: string,
  ) {
    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.skill_tags (tenant_id, slug, label, industry_slug)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, slug) DO UPDATE SET label = EXCLUDED.label
       RETURNING id, tenant_id, slug, label, industry_slug`,
      [tenantId, slug, label, industrySlug ?? null],
    );
    return res.rows[0];
  }
}
