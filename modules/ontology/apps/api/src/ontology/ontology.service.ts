import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class OntologyService {
  private readonly logger = new Logger(OntologyService.name);

  constructor(private readonly db: DatabaseService) {}

  // ── Parties ──────────────────────────────────────────────────────────────────

  async getParties(tenantId: string): Promise<any[]> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, tenant_id, code, name, category, tax_id, country, risk_tier,
              credit_score, active_agreements_count, total_transaction_volume_usd,
              created_at, updated_at
       FROM gigalibs_ontology.parties
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map(this.mapParty);
  }

  async createParty(tenantId: string, body: any): Promise<any> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_ontology.parties
         (tenant_id, code, name, category, tax_id, country, risk_tier, credit_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        body.code,
        body.name,
        body.category,
        body.tax_id ?? null,
        body.country ?? 'US',
        body.risk_tier ?? 'LOW',
        body.credit_score ?? null,
      ],
    );
    return this.mapParty(result.rows[0]);
  }

  async getParty360(tenantId: string, partyCode: string): Promise<any | null> {
    const partyRes = await this.db.queryWithTenant(
      tenantId,
      `SELECT * FROM gigalibs_ontology.parties WHERE tenant_id = $1 AND code = $2`,
      [tenantId, partyCode],
    );
    if (!partyRes.rows[0]) return null;
    const party = this.mapParty(partyRes.rows[0]);

    const [agRes, txRes, asRes] = await Promise.all([
      this.db.queryWithTenant(
        tenantId,
        `SELECT * FROM gigalibs_ontology.agreements WHERE tenant_id = $1 AND party_code = $2 ORDER BY created_at DESC`,
        [tenantId, partyCode],
      ),
      this.db.queryWithTenant(
        tenantId,
        `SELECT * FROM gigalibs_ontology.transactions WHERE tenant_id = $1 AND party_code = $2 ORDER BY created_at DESC`,
        [tenantId, partyCode],
      ),
      this.db.queryWithTenant(
        tenantId,
        `SELECT * FROM gigalibs_ontology.assets WHERE tenant_id = $1 AND party_code = $2 ORDER BY created_at DESC`,
        [tenantId, partyCode],
      ),
    ]);

    const agreements = agRes.rows.map(this.mapAgreement);
    const transactions = txRes.rows.map(this.mapTransaction);
    const assets = asRes.rows.map(this.mapAsset);

    const totalCommittedContractUsd = agreements.reduce((s, a) => s + Number(a.totalValueUsd), 0);
    const totalBilledUsd = transactions.reduce((s, t) => s + Number(t.amountUsd), 0);
    const flaggedTxs = transactions.filter((t) => t.status === 'DISCREPANCY_FLAGGED');
    const disputedAmountUsd = flaggedTxs.reduce((s, t) => s + Number(t.discrepancyAmountUsd || 0), 0);
    const matchDefectRatePercent =
      transactions.length > 0
        ? Number(((flaggedTxs.length / transactions.length) * 100).toFixed(1))
        : 0;
    const complianceScore =
      party.riskTier === 'LOW' ? 98 : party.riskTier === 'MEDIUM' ? 84 : 62;

    return {
      party,
      agreements,
      transactions,
      assets,
      stats: {
        totalCommittedContractUsd,
        totalBilledUsd,
        disputedAmountUsd,
        matchDefectRatePercent,
        activeAssetCount: assets.length,
        complianceScore,
      },
    };
  }

  // ── Agreements ────────────────────────────────────────────────────────────────

  async getAgreements(tenantId: string): Promise<any[]> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT * FROM gigalibs_ontology.agreements WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map(this.mapAgreement);
  }

  async createAgreement(tenantId: string, body: any): Promise<any> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_ontology.agreements
         (tenant_id, code, title, party_code, type, status, effective_date, expiration_date,
          total_value_usd, payment_terms, governing_law, sla_commitment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        tenantId,
        body.code,
        body.title,
        body.party_code,
        body.type,
        body.status ?? 'ACTIVE',
        body.effective_date,
        body.expiration_date,
        body.total_value_usd ?? 0,
        body.payment_terms ?? 'NET30',
        body.governing_law ?? 'US-Federal',
        body.sla_commitment ?? null,
      ],
    );
    return this.mapAgreement(result.rows[0]);
  }

  // ── Transactions ──────────────────────────────────────────────────────────────

  async getTransactions(tenantId: string): Promise<any[]> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT * FROM gigalibs_ontology.transactions WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map(this.mapTransaction);
  }

  async createTransaction(tenantId: string, body: any): Promise<any> {
    const checksum = createHash('sha256')
      .update(`${tenantId}:${body.code}:${body.amount_usd ?? 0}`)
      .digest('hex');
    const result = await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_ontology.transactions
         (tenant_id, code, party_code, agreement_code, type, amount_usd, status,
          transaction_date, discrepancy_amount_usd, fips_sha256_checksum)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        tenantId,
        body.code,
        body.party_code,
        body.agreement_code,
        body.type,
        body.amount_usd ?? 0,
        body.status ?? 'PENDING_MATCH',
        body.transaction_date ?? new Date().toISOString().slice(0, 10),
        body.discrepancy_amount_usd ?? null,
        checksum,
      ],
    );
    return this.mapTransaction(result.rows[0]);
  }

  // ── Assets ────────────────────────────────────────────────────────────────────

  async getAssets(tenantId: string): Promise<any[]> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT * FROM gigalibs_ontology.assets WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map(this.mapAsset);
  }

  async createAsset(tenantId: string, body: any): Promise<any> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_ontology.assets
         (tenant_id, code, name, category, party_code, agreement_code,
          operational_status, location, telemetry_metric)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        tenantId,
        body.code,
        body.name,
        body.category,
        body.party_code,
        body.agreement_code,
        body.operational_status ?? 'OPTIMAL',
        body.location,
        body.telemetry_metric ?? null,
      ],
    );
    return this.mapAsset(result.rows[0]);
  }

  // ── Graph Summary ─────────────────────────────────────────────────────────────

  async getGraph(tenantId: string): Promise<any> {
    const [pRes, aRes, tRes, asRes] = await Promise.all([
      this.db.queryWithTenant(
        tenantId,
        `SELECT category, COUNT(*) AS count FROM gigalibs_ontology.parties WHERE tenant_id = $1 GROUP BY category`,
        [tenantId],
      ),
      this.db.queryWithTenant(
        tenantId,
        `SELECT type, COUNT(*) AS count FROM gigalibs_ontology.agreements WHERE tenant_id = $1 GROUP BY type`,
        [tenantId],
      ),
      this.db.queryWithTenant(
        tenantId,
        `SELECT type, status, COUNT(*) AS count FROM gigalibs_ontology.transactions WHERE tenant_id = $1 GROUP BY type, status`,
        [tenantId],
      ),
      this.db.queryWithTenant(
        tenantId,
        `SELECT category, operational_status, COUNT(*) AS count FROM gigalibs_ontology.assets WHERE tenant_id = $1 GROUP BY category, operational_status`,
        [tenantId],
      ),
    ]);

    return {
      parties: { byCategory: pRes.rows },
      agreements: { byType: aRes.rows },
      transactions: { byTypeAndStatus: tRes.rows },
      assets: { byCategoryAndStatus: asRes.rows },
    };
  }

  // ── Mappers ───────────────────────────────────────────────────────────────────

  private mapParty(r: any) {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      category: r.category,
      taxId: r.tax_id,
      country: r.country,
      riskTier: r.risk_tier,
      creditScore: r.credit_score,
      activeAgreementsCount: r.active_agreements_count,
      totalTransactionVolumeUsd: r.total_transaction_volume_usd,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapAgreement(r: any) {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      title: r.title,
      partyCode: r.party_code,
      type: r.type,
      status: r.status,
      effectiveDate: r.effective_date,
      expirationDate: r.expiration_date,
      totalValueUsd: r.total_value_usd,
      paymentTerms: r.payment_terms,
      governingLaw: r.governing_law,
      slaCommitment: r.sla_commitment,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapTransaction(r: any) {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      partyCode: r.party_code,
      agreementCode: r.agreement_code,
      type: r.type,
      amountUsd: r.amount_usd,
      status: r.status,
      transactionDate: r.transaction_date,
      discrepancyAmountUsd: r.discrepancy_amount_usd,
      fipsSha256Checksum: r.fips_sha256_checksum,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapAsset(r: any) {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      category: r.category,
      partyCode: r.party_code,
      agreementCode: r.agreement_code,
      operationalStatus: r.operational_status,
      location: r.location,
      telemetryMetric: r.telemetry_metric,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
