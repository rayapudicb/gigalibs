import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { recordEvidence } from '../persistence/evidence.js';
import {
  computeTaxCalculationSealHash,
  GENESIS_SEAL_HASH,
  verifyTaxLedgerChain,
  type TaxLedgerVerificationResult,
} from './tax-ledger-seal.js';
import { redactSensitiveData } from '../auth/data-redaction.js';

export interface TaxCalculationRequest {
  sourceModule: string; documentId: string; documentReference?: string;
  jurisdictionCode: string; productCategory: string; taxableAmountMinor: number;
  customerId?: string; transactionDate: string;
}

export interface TaxCalculationResult {
  id: string; tenantId: string; sourceModule: string; documentId: string;
  documentReference?: string; jurisdictionCode: string; productCategory: string;
  taxableAmountMinor: number; exemptAmountMinor: number; calculatedTaxMinor: number;
  appliedRateBasisPoints: number; exemptionCertificateId?: string;
  idempotencyKey: string; isExempt: boolean; createdAt: string;
  idempotencyReplayed: boolean;
  sealSequence?: number;
  sealHash?: string;
  previousSealHash?: string;
}

const LEDGER_COLUMNS = `id, tenant_id AS "tenantId", source_module AS "sourceModule",
  document_id AS "documentId", document_reference AS "documentReference",
  jurisdiction_code AS "jurisdictionCode", product_category AS "productCategory",
  taxable_amount_minor AS "taxableAmountMinor", exempt_amount_minor AS "exemptAmountMinor",
  calculated_tax_minor AS "calculatedTaxMinor",
  applied_rate_basis_points AS "appliedRateBasisPoints",
  exemption_certificate_id AS "exemptionCertificateId",
  idempotency_key AS "idempotencyKey", request_hash AS "requestHash",
  seal_sequence AS "sealSequence", seal_hash AS "sealHash", previous_seal_hash AS "previousSealHash",
  created_at AS "createdAt"`;

@Injectable()
export class CalculateService {
  constructor(private readonly db: DatabaseService) {}

  async calculateTax(
    tenantId: string,
    actorSubject: string,
    idempotencyKey: string,
    request: TaxCalculationRequest,
  ): Promise<TaxCalculationResult> {
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const existing = await client.query<any>(
        `SELECT ${LEDGER_COLUMNS} FROM gigalibs_tax.tax_calculation_ledger
         WHERE tenant_id = $1 AND idempotency_scope = 'tax.calculate.v1' AND idempotency_key = $2`,
        [tenantId, idempotencyKey],
      );
      if (existing.rowCount) {
        if (existing.rows[0].requestHash !== requestHash) {
          throw new ConflictException('Idempotency key was already used for a different request.');
        }
        return this.toResult(existing.rows[0], true);
      }

      const jurisdictionResult = await client.query<{
        id: string; standardRate: number;
      }>(
        `SELECT id, standard_rate_basis_points AS "standardRate"
         FROM gigalibs_tax.tax_jurisdictions
         WHERE tenant_id = $1 AND jurisdiction_code = $2 AND status = 'ACTIVE'`,
        [tenantId, request.jurisdictionCode],
      );
      const jurisdiction = jurisdictionResult.rows[0];
      if (!jurisdiction) {
        throw new NotFoundException('No active authoritative jurisdiction configuration exists.');
      }

      let isExempt = false;
      let exemptionCertificateId: string | undefined;
      if (request.customerId) {
        const exemption = await client.query<{ id: string }>(
          `SELECT id FROM gigalibs_tax.exemption_certificates
           WHERE tenant_id = $1 AND customer_id = $2 AND jurisdiction_code = $3
             AND status = 'ACTIVE' AND is_verified = TRUE
             AND $4::date BETWEEN valid_from AND valid_until
           ORDER BY valid_from DESC LIMIT 1`,
          [tenantId, request.customerId, request.jurisdictionCode, request.transactionDate],
        );
        if (exemption.rows[0]) {
          isExempt = true;
          exemptionCertificateId = exemption.rows[0].id;
        }
      }

      let appliedRateBasisPoints = jurisdiction.standardRate;
      const categoryRate = await client.query<{ rate: number; isExempt: boolean }>(
        `SELECT rate_basis_points AS rate, is_exempt AS "isExempt"
         FROM gigalibs_tax.tax_rates
         WHERE tenant_id = $1 AND jurisdiction_id = $2 AND product_category = $3
           AND effective_from <= $4::date
           AND (effective_until IS NULL OR effective_until >= $4::date)
         ORDER BY effective_from DESC LIMIT 1`,
        [tenantId, jurisdiction.id, request.productCategory, request.transactionDate],
      );
      if (categoryRate.rows[0]?.isExempt) isExempt = true;
      if (categoryRate.rows[0] && !categoryRate.rows[0].isExempt) {
        appliedRateBasisPoints = categoryRate.rows[0].rate;
      }
      if (isExempt) appliedRateBasisPoints = 0;

      const exemptAmountMinor = isExempt ? request.taxableAmountMinor : 0;
      const calculatedTaxMinor = isExempt
        ? 0
        : Math.round((request.taxableAmountMinor * appliedRateBasisPoints) / 10_000);
      const id = randomUUID();
      const nowIso = new Date().toISOString();

      const latestSealRes = await client.query<{ seal_sequence: string | number; seal_hash: string }>(
        `SELECT seal_sequence, seal_hash FROM gigalibs_tax.tax_calculation_ledger
         WHERE tenant_id = $1 AND seal_sequence IS NOT NULL
         ORDER BY seal_sequence DESC LIMIT 1 FOR UPDATE`,
        [tenantId],
      );

      const lastSeq = latestSealRes.rows[0]?.seal_sequence != null ? Number(latestSealRes.rows[0].seal_sequence) : 0;
      const sealSeq = lastSeq + 1;
      const prevSealHash = latestSealRes.rows[0]?.seal_hash ?? GENESIS_SEAL_HASH;

      const sealHash = computeTaxCalculationSealHash({
        tenantId,
        sequence: sealSeq,
        calculationId: id,
        sourceModule: request.sourceModule,
        documentId: request.documentId,
        jurisdictionCode: request.jurisdictionCode,
        taxableAmountMinor: request.taxableAmountMinor,
        calculatedTaxMinor,
        appliedRateBasisPoints,
        timestamp: nowIso,
        previousSealHash: prevSealHash,
      });

      const inserted = await client.query<any>(
        `INSERT INTO gigalibs_tax.tax_calculation_ledger (
           id, tenant_id, source_module, document_id, document_reference,
           jurisdiction_id, jurisdiction_code, product_category, taxable_amount_minor,
           exempt_amount_minor, calculated_tax_minor, applied_rate_basis_points,
           exemption_certificate_id, idempotency_key, idempotency_scope,
           request_hash, actor_subject,
           seal_sequence, seal_hash, previous_seal_hash, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                   'tax.calculate.v1',$15,$16,$17,$18,$19,$20)
         RETURNING ${LEDGER_COLUMNS}`,
        [id, tenantId, request.sourceModule, request.documentId,
          request.documentReference ?? null, jurisdiction.id, request.jurisdictionCode,
          request.productCategory, request.taxableAmountMinor, exemptAmountMinor,
          calculatedTaxMinor, appliedRateBasisPoints, exemptionCertificateId ?? null,
          idempotencyKey, requestHash, actorSubject,
          sealSeq, sealHash, prevSealHash, nowIso],
      );
      await client.query(
        `UPDATE gigalibs_tax.tax_jurisdictions
         SET current_period_revenue_minor = current_period_revenue_minor + $1,
             current_period_transactions = current_period_transactions + 1,
             updated_at = transaction_timestamp()
         WHERE tenant_id = $2 AND id = $3`,
        [request.taxableAmountMinor, tenantId, jurisdiction.id],
      );
      const { sanitized } = redactSensitiveData({
        sourceModule: request.sourceModule,
        documentId: request.documentId,
        transactionDate: request.transactionDate,
        calculatedTaxMinor,
        appliedRateBasisPoints,
        isExempt,
        customerId: request.customerId,
      });
      await recordEvidence(client, {
        tenantId, entityType: 'TAX_CALCULATION', entityId: id, action: 'CALCULATED', actorSubject,
        eventType: 'tax.calculation.completed.v1', payload: sanitized,
      });
      return this.toResult(inserted.rows[0], false);
    });
  }

  async getLedger(tenantId: string): Promise<TaxCalculationResult[]> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<any>(
        `SELECT ${LEDGER_COLUMNS} FROM gigalibs_tax.tax_calculation_ledger
         WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`, [tenantId],
      );
      return result.rows.map((row) => this.toResult(row, false));
    });
  }

  /**
   * Delta-5: Fail-closed cryptographic ledger verification of tax calculation ledger chain.
   */
  async verifyLedger(tenantId: string): Promise<TaxLedgerVerificationResult> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const res = await client.query<any>(
        `SELECT id, tenant_id as "tenantId", source_module as "sourceModule", document_id as "documentId",
                jurisdiction_code as "jurisdictionCode", taxable_amount_minor as "taxableAmountMinor",
                calculated_tax_minor as "calculatedTaxMinor", applied_rate_basis_points as "appliedRateBasisPoints",
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "calculationTimestamp",
                seal_sequence as "sealSequence", seal_hash as "sealHash", previous_seal_hash as "previousSealHash"
         FROM gigalibs_tax.tax_calculation_ledger
         WHERE tenant_id = $1
         ORDER BY seal_sequence ASC NULLS LAST, created_at ASC`,
        [tenantId],
      );

      const records = res.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenantId,
        sourceModule: row.sourceModule,
        documentId: row.documentId,
        jurisdictionCode: row.jurisdictionCode,
        taxableAmountMinor: row.taxableAmountMinor,
        calculatedTaxMinor: row.calculatedTaxMinor,
        appliedRateBasisPoints: row.appliedRateBasisPoints,
        calculationTimestamp: row.calculationTimestamp,
        sealSequence: row.sealSequence != null ? Number(row.sealSequence) : undefined,
        sealHash: row.sealHash ?? undefined,
        previousSealHash: row.previousSealHash ?? undefined,
      }));

      return verifyTaxLedgerChain(records);
    });
  }

  private toResult(row: any, replayed: boolean): TaxCalculationResult {
    return {
      ...row,
      taxableAmountMinor: Number(row.taxableAmountMinor),
      exemptAmountMinor: Number(row.exemptAmountMinor),
      calculatedTaxMinor: Number(row.calculatedTaxMinor),
      appliedRateBasisPoints: Number(row.appliedRateBasisPoints),
      isExempt: Number(row.exemptAmountMinor) > 0,
      idempotencyReplayed: replayed,
      requestHash: undefined,
      sealSequence: row.sealSequence != null ? Number(row.sealSequence) : undefined,
      sealHash: row.sealHash ?? undefined,
      previousSealHash: row.previousSealHash ?? undefined,
    };
  }
}
