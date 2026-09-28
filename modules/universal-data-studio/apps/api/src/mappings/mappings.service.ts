import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { calculateConvertedMinorUnits } from './fx-math.js';

export interface FieldMappingRule {
  source: string;
  target: string;
  transform: string;
}

// Standard fallback rates catalog in micros (e.g., 1 EUR = 1.085000 USD => 1_085_000 micros)
const DEFAULT_FX_RATES_MICROS: Record<string, bigint> = {
  'EUR_USD': 1_085_000n,
  'GBP_USD': 1_270_000n,
  'JPY_USD': 6_667n,        // 1 JPY = 0.006667 USD
  'CAD_USD': 735_000n,
  'AUD_USD': 660_000n,
  'CHF_USD': 1_120_000n,
  'INR_USD': 12_000n,       // 1 INR = 0.012 USD
  'SGD_USD': 750_000n,
  'USD_EUR': 921_659n,
  'USD_GBP': 787_401n,
  'USD_JPY': 150_000_000n,  // 1 USD = 150 JPY
  'USD_CAD': 1_360_544n,
  'USD_INR': 83_333_333n,
};

@Injectable()
export class MappingsService {
  private readonly logger = new Logger(MappingsService.name);

  constructor(private readonly db: DatabaseService) {}

  async getMappings(tenantId: string): Promise<any[]> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const sql = `
      SELECT 
        fm.id, fm.contract_id, fm.mapping_name, fm.source_system, fm.mapping_rules,
        fm.currency_normalization, fm.target_currency, fm.exchange_rate_micros, fm.rate_timestamp,
        fm.is_active, fm.created_at,
        c.contract_code, c.name AS contract_name, c.domain
      FROM gigalibs_data_studio.field_mappings fm
      JOIN gigalibs_data_studio.data_contracts c ON fm.contract_id = c.id
      WHERE c.tenant_id = $1
      ORDER BY fm.created_at DESC
    `;
    const res = await this.db.query(sql, [tenantId]);
    return res.rows;
  }

  async createMapping(
    tenantId: string,
    dto: {
      contract_id: string;
      mapping_name: string;
      source_system: string;
      mapping_rules: FieldMappingRule[];
      currency_normalization?: boolean;
      target_currency?: string;
      exchange_rate_micros?: number | string;
    },
  ): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!dto.contract_id || !dto.mapping_name || !dto.source_system || !dto.mapping_rules) {
      throw new BadRequestException('contract_id, mapping_name, source_system, and mapping_rules are required');
    }

    const contractRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.data_contracts WHERE (id = $1 OR contract_code = $1) AND tenant_id = $2`,
      [dto.contract_id, tenantId],
    );
    if (contractRes.rowCount === 0) {
      throw new NotFoundException(`Data contract '${dto.contract_id}' not found`);
    }

    const contract = contractRes.rows[0];
    const mappingId = `map-${randomUUID().slice(0, 8)}`;
    const rateMicros = dto.exchange_rate_micros ? BigInt(dto.exchange_rate_micros) : null;

    const insertSql = `
      INSERT INTO gigalibs_data_studio.field_mappings (
        id, contract_id, mapping_name, source_system, mapping_rules, currency_normalization,
        target_currency, exchange_rate_micros, rate_timestamp, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 IS NOT NULL THEN NOW() ELSE NULL END, true, NOW())
      RETURNING *
    `;

    const res = await this.db.query(insertSql, [
      mappingId,
      contract.id,
      dto.mapping_name,
      dto.source_system,
      JSON.stringify(dto.mapping_rules),
      dto.currency_normalization !== undefined ? dto.currency_normalization : true,
      (dto.target_currency || 'USD').toUpperCase(),
      rateMicros ? rateMicros.toString() : null,
    ]);

    await this.db.query(
      `INSERT INTO gigalibs_data_studio.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
       VALUES ($1, $2, 'FIELD_MAPPING', $3, 'MAPPING_CREATED', $4, NOW())`,
      [
        `aud-${randomUUID().slice(0, 8)}`,
        tenantId,
        mappingId,
        JSON.stringify({ mapping_name: dto.mapping_name, source: dto.source_system }),
      ],
    );

    return res.rows[0];
  }

  /**
   * DS-03: Execute declarative field transformations with mathematical BigInt currency normalization.
   */
  async transformPayload(
    tenantId: string,
    dto: {
      mapping_id: string;
      raw_data: any;
      rate_override_micros?: number | string;
    },
  ): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!dto.mapping_id || !dto.raw_data) {
      throw new BadRequestException('mapping_id and raw_data are required');
    }

    const mapRes = await this.db.query(
      `SELECT fm.*, c.contract_code 
       FROM gigalibs_data_studio.field_mappings fm
       JOIN gigalibs_data_studio.data_contracts c ON fm.contract_id = c.id
       WHERE (fm.id = $1 OR fm.mapping_name = $1) AND c.tenant_id = $2`,
      [dto.mapping_id, tenantId],
    );

    if (mapRes.rowCount === 0) {
      throw new NotFoundException(`Field mapping '${dto.mapping_id}' not found`);
    }

    const mapping = mapRes.rows[0];
    const rules: FieldMappingRule[] = Array.isArray(mapping.mapping_rules)
      ? mapping.mapping_rules
      : JSON.parse(mapping.mapping_rules || '[]');
    const raw = dto.raw_data;
    const transformed: Record<string, any> = {};

    for (const rule of rules) {
      const rawVal = raw[rule.source];
      if (rawVal === undefined || rawVal === null) {
        continue;
      }

      let transformedVal = rawVal;
      const t = rule.transform || 'DIRECT';

      if (t === 'DIRECT') {
        transformedVal = rawVal;
      } else if (t.startsWith('PREFIX:')) {
        const prefix = t.substring('PREFIX:'.length);
        transformedVal = `${prefix}${rawVal}`;
      } else if (t.startsWith('SUFFIX:')) {
        const suffix = t.substring('SUFFIX:'.length);
        transformedVal = `${rawVal}${suffix}`;
      } else if (t === 'UPPERCASE') {
        transformedVal = String(rawVal).toUpperCase();
      } else if (t === 'LOWERCASE') {
        transformedVal = String(rawVal).toLowerCase();
      } else if (t === 'TRIM') {
        transformedVal = String(rawVal).trim();
      } else if (t === 'DECIMAL_TO_MINOR') {
        transformedVal = Math.round(Number(rawVal) * 100);
      } else if (t === 'MINOR_TO_DECIMAL') {
        transformedVal = Number(rawVal) / 100;
      } else if (t === 'CAST_INTEGER') {
        transformedVal = parseInt(String(rawVal), 10);
      } else if (t === 'CAST_STRING') {
        transformedVal = String(rawVal);
      } else if (t === 'CAST_BOOLEAN') {
        transformedVal = Boolean(rawVal);
      } else if (t === 'DATE_ISO8601') {
        try {
          transformedVal = new Date(rawVal).toISOString();
        } catch {
          transformedVal = String(rawVal);
        }
      }

      transformed[rule.target] = transformedVal;
    }

    // DS-03: Currency Normalization with Mathematical Conversion & Retained Proof
    let currencyNormalized = false;
    let conversionProof: any = null;
    let conversionError: string | null = null;

    const rawCurrency = (transformed['currency'] || raw['currency'] || '').toUpperCase();
    const rawAmountMinor = transformed['amount_minor'] !== undefined
      ? transformed['amount_minor']
      : (transformed['amount'] !== undefined ? Math.round(Number(transformed['amount']) * 100) : null);

    const targetCurrency = (mapping.target_currency || 'USD').toUpperCase();

    if (mapping.currency_normalization && rawCurrency && rawAmountMinor !== null) {
      if (rawCurrency === targetCurrency) {
        currencyNormalized = true;
        conversionProof = {
          source_currency: rawCurrency,
          source_amount_minor: rawAmountMinor,
          target_currency: targetCurrency,
          target_amount_minor: rawAmountMinor,
          exchange_rate_micros: 1_000_000,
          rate_timestamp: new Date().toISOString(),
          identity_conversion: true,
        };
      } else {
        // Resolve exchange rate
        const pairKey = `${rawCurrency}_${targetCurrency}`;
        const configuredRate = dto.rate_override_micros
          ? BigInt(dto.rate_override_micros)
          : mapping.exchange_rate_micros
          ? BigInt(mapping.exchange_rate_micros)
          : DEFAULT_FX_RATES_MICROS[pairKey];

        if (configuredRate) {
          try {
            const convertedMinor = calculateConvertedMinorUnits(
              Number(rawAmountMinor),
              configuredRate,
              rawCurrency,
              targetCurrency,
            );

            transformed['amount_minor_original'] = rawAmountMinor;
            transformed['currency_original'] = rawCurrency;
            transformed['amount_minor'] = convertedMinor;
            transformed['currency'] = targetCurrency;

            currencyNormalized = true;
            conversionProof = {
              source_currency: rawCurrency,
              source_amount_minor: rawAmountMinor,
              target_currency: targetCurrency,
              target_amount_minor: convertedMinor,
              exchange_rate_micros: Number(configuredRate),
              rate_timestamp: mapping.rate_timestamp || new Date().toISOString(),
              identity_conversion: false,
            };
          } catch (err: any) {
            conversionError = `Currency conversion calculation failed: ${err.message}`;
          }
        } else {
          conversionError = `Exchange rate unavailable for currency pair '${pairKey}'. Normalization could not be performed.`;
        }
      }
    }

    return {
      mapping_id: mapping.id,
      mapping_name: mapping.mapping_name,
      source_system: mapping.source_system,
      target_contract: mapping.contract_code,
      rules_applied: rules.length,
      currency_normalized: currencyNormalized,
      target_currency: targetCurrency,
      conversion_proof: conversionProof,
      ...(conversionError ? { conversion_error: conversionError } : {}),
      transformed_output: transformed,
      transformed_at: new Date().toISOString(),
    };
  }
}
