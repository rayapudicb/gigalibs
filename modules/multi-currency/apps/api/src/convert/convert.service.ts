import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { PairsService } from '../pairs/pairs.service.js';
import { calculateConvertedMinorUnits } from './fx-math.js';
import {
  computeConversionSealHash,
  GENESIS_SEAL_HASH,
  verifyConversionLedgerChain,
  type CurrencyLedgerVerificationResult,
} from './conversion-ledger-seal.js';
import { redactSensitiveData } from '../auth/data-redaction.js';

export interface ConvertRequest {
  sourceModule: string;
  documentId?: string;
  documentReference?: string;
  fromCurrency: string;
  toCurrency: string;
  amountMinor: number;
  idempotencyKey?: string;
}

export interface ConvertResult {
  id: string;
  sourceModule: string;
  documentId: string;
  documentReference: string;
  fromCurrency: string;
  toCurrency: string;
  sourceAmountMinor: number;
  convertedAmountMinor: number;
  appliedRate: number;
  appliedRateMicros: number;
  rateSource: string;
  feeMinor: number;
  settlementDate: string;
  idempotencyKey: string;
  idempotencyReplayed: boolean;
  sealSequence?: number;
  sealHash?: string;
  previousSealHash?: string;
}

@Injectable()
export class ConvertService {
  private readonly logger = new Logger(ConvertService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly pairsService: PairsService,
  ) {}

  async convert(tenantId: string, req: ConvertRequest): Promise<ConvertResult> {
    if (!req.fromCurrency || !req.toCurrency) {
      throw new BadRequestException('fromCurrency and toCurrency are required.');
    }
    if (req.amountMinor == null || !Number.isSafeInteger(req.amountMinor) || req.amountMinor < 0) {
      throw new BadRequestException('amountMinor must be a non-negative integer.');
    }

    const idempotencyKey = req.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new BadRequestException(
        'A caller-owned idempotency key of 1 to 128 characters is required.',
      );
    }

    // 1. Idempotency Check
    const existing = await this.db.query(
      `SELECT id, source_module, document_id, document_reference, from_currency, to_currency,
              source_amount_minor, converted_amount_minor, applied_rate_micros, fee_minor,
              settlement_date, idempotency_key, calculation_timestamp
       FROM gigalibs_currency.conversion_ledger
       WHERE tenant_id = $1 AND idempotency_key = $2
       LIMIT 1;`,
      [tenantId, idempotencyKey],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        id: row.id,
        sourceModule: row.source_module,
        documentId: row.document_id,
        documentReference: row.document_reference || '',
        fromCurrency: row.from_currency,
        toCurrency: row.to_currency,
        sourceAmountMinor: Number(row.source_amount_minor),
        convertedAmountMinor: Number(row.converted_amount_minor),
        appliedRate: Number(row.applied_rate_micros) / 1_000_000,
        appliedRateMicros: Number(row.applied_rate_micros),
        rateSource: 'IDEMPOTENCY_CACHE',
        feeMinor: Number(row.fee_minor),
        settlementDate: row.settlement_date,
        idempotencyKey: row.idempotency_key,
        idempotencyReplayed: true,
      };
    }

    // 2. Fetch Rate
    const rateInfo = await this.pairsService.getPairRate(
      tenantId,
      req.fromCurrency,
      req.toCurrency,
    );

    if (!rateInfo) {
      throw new BadRequestException(
        `Exchange rate not found for currency pair ${req.fromCurrency}/${req.toCurrency}`,
      );
    }

    // 3. ISO 4217 Exponent-aware precision conversion
    const convertedAmountMinor = calculateConvertedMinorUnits(
      req.amountMinor,
      rateInfo.rateMicros,
      req.fromCurrency,
      req.toCurrency,
    );

    const ledgerId = `cl-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const docId = req.documentId || `doc-${Date.now()}`;
    const docRef = req.documentReference || '';
    const feeMinor = 0;

    let sealSeq = 1;
    let sealHash = '';
    let prevSealHash = GENESIS_SEAL_HASH;

    // 4. Persist to ACID Ledger & Audit Log with Cryptographic Sealing
    await this.db.transaction(async (client) => {
      const latestSealRes = await client.query<{ seal_sequence: string | number; seal_hash: string }>(
        `SELECT seal_sequence, seal_hash FROM gigalibs_currency.conversion_ledger
         WHERE tenant_id = $1 AND seal_sequence IS NOT NULL
         ORDER BY seal_sequence DESC LIMIT 1 FOR UPDATE`,
        [tenantId],
      );

      const lastSeq = latestSealRes.rows[0]?.seal_sequence != null ? Number(latestSealRes.rows[0].seal_sequence) : 0;
      sealSeq = lastSeq + 1;
      prevSealHash = latestSealRes.rows[0]?.seal_hash ?? GENESIS_SEAL_HASH;
      const nowIso = new Date().toISOString();

      sealHash = computeConversionSealHash({
        tenantId,
        sequence: sealSeq,
        conversionId: ledgerId,
        sourceModule: req.sourceModule || 'DIRECT',
        documentId: docId,
        fromCurrency: req.fromCurrency.toUpperCase(),
        toCurrency: req.toCurrency.toUpperCase(),
        sourceAmountMinor: req.amountMinor,
        convertedAmountMinor,
        appliedRateMicros: rateInfo.rateMicros,
        timestamp: nowIso,
        previousSealHash: prevSealHash,
      });

      await client.query(
        `INSERT INTO gigalibs_currency.conversion_ledger
         (id, tenant_id, source_module, document_id, document_reference, from_currency, to_currency,
          source_amount_minor, converted_amount_minor, applied_rate_micros, fee_minor, settlement_date, idempotency_key,
          seal_sequence, seal_hash, previous_seal_hash, calculation_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_DATE, $12, $13, $14, $15, $16);`,
        [
          ledgerId,
          tenantId,
          req.sourceModule || 'DIRECT',
          docId,
          docRef,
          req.fromCurrency.toUpperCase(),
          req.toCurrency.toUpperCase(),
          req.amountMinor,
          convertedAmountMinor,
          rateInfo.rateMicros,
          feeMinor,
          idempotencyKey,
          sealSeq,
          sealHash,
          prevSealHash,
          nowIso,
        ],
      );

      const { sanitized } = redactSensitiveData({
        from: req.fromCurrency,
        to: req.toCurrency,
        source: req.amountMinor,
        converted: convertedAmountMinor,
        rate: rateInfo.rate,
        rateMicros: rateInfo.rateMicros,
      });

      await client.query(
        `INSERT INTO gigalibs_currency.audit_events (id, tenant_id, entity_type, entity_id, action, payload)
         VALUES ($1, $2, 'CONVERSION_LEDGER', $3, 'CONVERT', $4);`,
        [
          `aud-${Date.now()}-${randomUUID().slice(0, 8)}`,
          tenantId,
          ledgerId,
          JSON.stringify(sanitized),
        ],
      );
    });

    return {
      id: ledgerId,
      sourceModule: req.sourceModule || 'DIRECT',
      documentId: docId,
      documentReference: docRef,
      fromCurrency: req.fromCurrency.toUpperCase(),
      toCurrency: req.toCurrency.toUpperCase(),
      sourceAmountMinor: req.amountMinor,
      convertedAmountMinor,
      appliedRate: rateInfo.rate,
      appliedRateMicros: rateInfo.rateMicros,
      rateSource: rateInfo.source,
      feeMinor,
      settlementDate: new Date().toISOString().split('T')[0],
      idempotencyKey,
      idempotencyReplayed: false,
      sealSequence: sealSeq,
      sealHash,
      previousSealHash: prevSealHash,
    };
  }

  async batchConvert(tenantId: string, items: ConvertRequest[]): Promise<ConvertResult[]> {
    const results: ConvertResult[] = [];
    for (const item of items) {
      results.push(await this.convert(tenantId, item));
    }
    return results;
  }

  async getLedger(tenantId: string, limit = 50): Promise<any[]> {
    const boundedLimit = Math.min(Math.max(1, limit), 100);
    const res = await this.db.query(
      `SELECT id, source_module, document_id, document_reference, from_currency, to_currency,
              source_amount_minor, converted_amount_minor, applied_rate_micros, fee_minor,
              settlement_date, idempotency_key, calculation_timestamp
       FROM gigalibs_currency.conversion_ledger
       WHERE tenant_id = $1
       ORDER BY calculation_timestamp DESC
       LIMIT $2;`,
      [tenantId, boundedLimit],
    );

    return res.rows.map((r) => ({
      id: r.id,
      sourceModule: r.source_module,
      documentId: r.document_id,
      documentReference: r.document_reference,
      fromCurrency: r.from_currency,
      toCurrency: r.to_currency,
      sourceAmountMinor: Number(r.source_amount_minor),
      convertedAmountMinor: Number(r.converted_amount_minor),
      appliedRate: Number(r.applied_rate_micros) / 1_000_000,
      feeMinor: Number(r.fee_minor),
      settlementDate: r.settlement_date,
      idempotencyKey: r.idempotency_key,
      calculationTimestamp: r.calculation_timestamp,
    }));
  }

  /**
   * Delta-5: Fail-closed cryptographic ledger verification of conversion ledger chain.
   */
  async verifyLedger(tenantId: string): Promise<CurrencyLedgerVerificationResult> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const res = await this.db.query(
      `SELECT id, tenant_id as "tenantId", source_module as "sourceModule", document_id as "documentId",
              from_currency as "fromCurrency", to_currency as "toCurrency",
              source_amount_minor as "sourceAmountMinor", converted_amount_minor as "convertedAmountMinor",
              applied_rate_micros as "appliedRateMicros",
              to_char(calculation_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "calculationTimestamp",
              seal_sequence as "sealSequence", seal_hash as "sealHash", previous_seal_hash as "previousSealHash"
       FROM gigalibs_currency.conversion_ledger
       WHERE tenant_id = $1
       ORDER BY seal_sequence ASC NULLS LAST, calculation_timestamp ASC`,
      [tenantId],
    );

    const records = res.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      sourceModule: row.sourceModule,
      documentId: row.documentId,
      fromCurrency: row.fromCurrency,
      toCurrency: row.toCurrency,
      sourceAmountMinor: row.sourceAmountMinor,
      convertedAmountMinor: row.convertedAmountMinor,
      appliedRateMicros: row.appliedRateMicros,
      calculationTimestamp: row.calculationTimestamp,
      sealSequence: row.sealSequence != null ? Number(row.sealSequence) : undefined,
      sealHash: row.sealHash ?? undefined,
      previousSealHash: row.previousSealHash ?? undefined,
    }));

    return verifyConversionLedgerChain(records);
  }
}
