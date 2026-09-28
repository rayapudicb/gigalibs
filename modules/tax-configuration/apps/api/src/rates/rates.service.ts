import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { recordEvidence } from '../persistence/evidence.js';

export interface TaxRate {
  id: string; tenantId: string; jurisdictionId: string; jurisdictionCode: string;
  jurisdictionName: string; productCategory: string; rateBasisPoints: number;
  isExempt: boolean; effectiveFrom: string; effectiveUntil?: string; createdAt: string;
}

export interface CreateRateInput {
  jurisdictionId: string; productCategory: string; rateBasisPoints: number;
  isExempt: boolean; effectiveFrom: string; effectiveUntil?: string | null;
}

@Injectable()
export class RatesService {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string): Promise<TaxRate[]> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<TaxRate>(
        `SELECT r.id, r.tenant_id AS "tenantId", r.jurisdiction_id AS "jurisdictionId",
          j.jurisdiction_code AS "jurisdictionCode", j.jurisdiction_name AS "jurisdictionName",
          r.product_category AS "productCategory", r.rate_basis_points AS "rateBasisPoints",
          r.is_exempt AS "isExempt", r.effective_from AS "effectiveFrom",
          r.effective_until AS "effectiveUntil", r.created_at AS "createdAt"
         FROM gigalibs_tax.tax_rates r
         JOIN gigalibs_tax.tax_jurisdictions j
           ON j.tenant_id = r.tenant_id AND j.id = r.jurisdiction_id
         WHERE r.tenant_id = $1
         ORDER BY j.jurisdiction_code, r.product_category, r.effective_from DESC`,
        [tenantId],
      );
      return result.rows;
    });
  }

  async create(tenantId: string, actorSubject: string, input: CreateRateInput) {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const jurisdiction = await client.query(
        `SELECT 1 FROM gigalibs_tax.tax_jurisdictions
         WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'`,
        [tenantId, input.jurisdictionId],
      );
      if (!jurisdiction.rowCount) throw new NotFoundException('Active jurisdiction was not found.');
      const overlap = await client.query(
        `SELECT 1 FROM gigalibs_tax.tax_rates
         WHERE tenant_id = $1 AND jurisdiction_id = $2 AND product_category = $3
           AND daterange(effective_from, COALESCE(effective_until + 1, 'infinity'::date), '[)')
             && daterange($4::date, COALESCE($5::date + 1, 'infinity'::date), '[)')`,
        [tenantId, input.jurisdictionId, input.productCategory,
          input.effectiveFrom, input.effectiveUntil ?? null],
      );
      if (overlap.rowCount) {
        throw new ConflictException('An overlapping effective rate already exists for this category.');
      }
      const id = randomUUID();
      const result = await client.query<TaxRate>(
        `INSERT INTO gigalibs_tax.tax_rates
           (id, tenant_id, jurisdiction_id, product_category, rate_basis_points,
            is_exempt, effective_from, effective_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, tenant_id AS "tenantId", jurisdiction_id AS "jurisdictionId",
           product_category AS "productCategory", rate_basis_points AS "rateBasisPoints",
           is_exempt AS "isExempt", effective_from AS "effectiveFrom",
           effective_until AS "effectiveUntil", created_at AS "createdAt"`,
        [id, tenantId, input.jurisdictionId, input.productCategory, input.rateBasisPoints,
          input.isExempt, input.effectiveFrom, input.effectiveUntil ?? null],
      );
      await recordEvidence(client, {
        tenantId, entityType: 'TAX_RATE', entityId: id, action: 'CREATED', actorSubject,
        eventType: 'tax.rate.created.v1', payload: { ...input },
      });
      return result.rows[0];
    });
  }
}
