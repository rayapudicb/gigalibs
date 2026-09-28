import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { recordEvidence } from '../persistence/evidence.js';

export interface TaxJurisdiction {
  id: string;
  tenantId: string;
  countryCode: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  taxType: string;
  standardRateBasisPoints: number;
  reducedRateBasisPoints: number;
  hasPhysicalNexus: boolean;
  hasEconomicNexus: boolean;
  economicThresholdRevenueMinor: number;
  economicThresholdTransactions: number;
  currentPeriodRevenueMinor: number;
  currentPeriodTransactions: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateJurisdictionInput = Omit<TaxJurisdiction,
  'id' | 'tenantId' | 'currentPeriodRevenueMinor' | 'currentPeriodTransactions' |
  'status' | 'createdAt' | 'updatedAt'>;

const SELECT_COLUMNS = `id, tenant_id AS "tenantId", country_code AS "countryCode",
  jurisdiction_code AS "jurisdictionCode", jurisdiction_name AS "jurisdictionName",
  tax_type AS "taxType", standard_rate_basis_points AS "standardRateBasisPoints",
  reduced_rate_basis_points AS "reducedRateBasisPoints",
  has_physical_nexus AS "hasPhysicalNexus", has_economic_nexus AS "hasEconomicNexus",
  economic_threshold_revenue_minor AS "economicThresholdRevenueMinor",
  economic_threshold_transactions AS "economicThresholdTransactions",
  current_period_revenue_minor AS "currentPeriodRevenueMinor",
  current_period_transactions AS "currentPeriodTransactions",
  status, created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class JurisdictionsService {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string): Promise<TaxJurisdiction[]> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<TaxJurisdiction>(
        `SELECT ${SELECT_COLUMNS} FROM gigalibs_tax.tax_jurisdictions
         WHERE tenant_id = $1 ORDER BY country_code, jurisdiction_code`,
        [tenantId],
      );
      return result.rows;
    });
  }

  async create(tenantId: string, actorSubject: string, input: CreateJurisdictionInput) {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const duplicate = await client.query(
        `SELECT 1 FROM gigalibs_tax.tax_jurisdictions
         WHERE tenant_id = $1 AND country_code = $2 AND jurisdiction_code = $3`,
        [tenantId, input.countryCode, input.jurisdictionCode],
      );
      if (duplicate.rowCount) throw new ConflictException('This jurisdiction is already configured.');
      const id = randomUUID();
      const result = await client.query<TaxJurisdiction>(
        `INSERT INTO gigalibs_tax.tax_jurisdictions (
           id, tenant_id, country_code, jurisdiction_code, jurisdiction_name, tax_type,
           standard_rate_basis_points, reduced_rate_basis_points, has_physical_nexus,
           has_economic_nexus, economic_threshold_revenue_minor,
           economic_threshold_transactions, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ACTIVE')
         RETURNING ${SELECT_COLUMNS}`,
        [id, tenantId, input.countryCode, input.jurisdictionCode, input.jurisdictionName,
          input.taxType, input.standardRateBasisPoints, input.reducedRateBasisPoints,
          input.hasPhysicalNexus, input.hasEconomicNexus,
          input.economicThresholdRevenueMinor, input.economicThresholdTransactions],
      );
      await recordEvidence(client, {
        tenantId, entityType: 'TAX_JURISDICTION', entityId: id, action: 'CREATED', actorSubject,
        eventType: 'tax.jurisdiction.created.v1', payload: { ...input },
      });
      return result.rows[0];
    });
  }
}
