import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';

export interface ValidationResult {
  valid: boolean;
  contract_code: string;
  contract_name: string;
  version: string;
  assertions_evaluated: number;
  errors: string[];
  warnings: string[];
  evaluated_at: string;
}

function resolveNestedValue(obj: any, path: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  if (path in obj) return obj[path];

  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined || typeof curr !== 'object') {
      return undefined;
    }
    curr = curr[part];
  }
  return curr;
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * DS-02: Bounded validation enforcing Draft-07 semantics, finite number checks, and quality assertions.
   */
  async validatePayload(
    tenantId: string,
    contractCode: string,
    payload: any,
    targetVersion?: string,
    sourceIp?: string,
  ): Promise<ValidationResult> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Payload must be a valid JSON object');
    }

    const contractRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.data_contracts WHERE tenant_id = $1 AND (contract_code = $2 OR id = $2)`,
      [tenantId, contractCode],
    );

    if (contractRes.rowCount === 0) {
      throw new NotFoundException(`Data contract with code or ID '${contractCode}' not found for tenant '${tenantId}'`);
    }

    const contract = contractRes.rows[0];
    const versionToUse = targetVersion || contract.active_version;

    const versionRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.contract_versions WHERE contract_id = $1 AND version = $2`,
      [contract.id, versionToUse],
    );

    if (versionRes.rowCount === 0) {
      throw new NotFoundException(`Contract version '${versionToUse}' not found for '${contractCode}'`);
    }

    const schema = versionRes.rows[0].json_schema;
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. JSON Schema Structural & Required Properties Validation
    if (schema.required && Array.isArray(schema.required)) {
      for (const requiredField of schema.required) {
        const val = resolveNestedValue(payload, requiredField);
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
          errors.push(`Missing mandatory property '${requiredField}' defined in contract`);
        }
      }
    }

    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propName, propDef] of Object.entries<any>(schema.properties)) {
        const val = resolveNestedValue(payload, propName);
        if (val !== undefined && val !== null) {
          // Strict type checks with NaN rejection
          if (propDef.type === 'string' && typeof val !== 'string') {
            errors.push(`Property '${propName}' must be a string (received ${typeof val})`);
          } else if (propDef.type === 'integer') {
            if (!Number.isInteger(val)) {
              errors.push(`Property '${propName}' must be an integer minor unit (received ${val})`);
            }
          } else if (propDef.type === 'number') {
            if (typeof val !== 'number' || !Number.isFinite(val)) {
              errors.push(`Property '${propName}' must be a finite number (received ${val})`);
            }
          } else if (propDef.type === 'boolean' && typeof val !== 'boolean') {
            errors.push(`Property '${propName}' must be a boolean (received ${typeof val})`);
          } else if (propDef.type === 'array' && !Array.isArray(val)) {
            errors.push(`Property '${propName}' must be an array (received ${typeof val})`);
          } else if (propDef.type === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
            errors.push(`Property '${propName}' must be an object (received ${typeof val})`);
          }

          // Regex pattern check
          if (propDef.pattern && typeof val === 'string') {
            try {
              const regex = new RegExp(propDef.pattern);
              if (!regex.test(val)) {
                errors.push(`Property '${propName}' ('${val}') does not match pattern ${propDef.pattern}`);
              }
            } catch {
              errors.push(`Invalid pattern specification '${propDef.pattern}' for property '${propName}'`);
            }
          }

          // Enum check
          if (propDef.enum && Array.isArray(propDef.enum)) {
            if (!propDef.enum.includes(val)) {
              errors.push(`Property '${propName}' ('${val}') is not in allowed enum [${propDef.enum.join(', ')}]`);
            }
          }
        }
      }
    }

    // 2. Data Quality Assertions Validation (DS-02)
    const assertionsRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.quality_assertions WHERE contract_id = $1`,
      [contract.id],
    );

    const assertions = assertionsRes.rows;
    for (const assertion of assertions) {
      const val = resolveNestedValue(payload, assertion.field_path);
      const params = assertion.parameters || {};
      let passed = true;
      let failureReason = '';

      switch (assertion.assertion_type) {
        case 'NOT_NULL':
          if (val === undefined || val === null || (typeof val === 'string' && val.trim().length < (params.minLength || 1))) {
            passed = false;
            failureReason = `Field '${assertion.field_path}' must not be null or blank`;
          }
          break;

        case 'REGEX_PATTERN':
          if (val !== undefined && val !== null) {
            try {
              const re = new RegExp(params.regex);
              if (!re.test(String(val))) {
                passed = false;
                failureReason = `Field '${assertion.field_path}' ('${val}') failed regex check (${params.regex})`;
              }
            } catch {
              passed = false;
              failureReason = `Invalid regex pattern in assertion configuration`;
            }
          }
          break;

        case 'VALID_ISO_CURRENCY':
          if (val !== undefined && val !== null) {
            const allowed = params.allowedCurrencies || ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'SGD'];
            if (!allowed.includes(String(val).toUpperCase())) {
              passed = false;
              failureReason = `Field '${assertion.field_path}' ('${val}') is not an authorized ISO-4217 currency. Allowed: ${allowed.join(', ')}`;
            }
          }
          break;

        case 'RANGE_BOUNDS':
          if (val !== undefined && val !== null) {
            const num = Number(val);
            // Critical NaN evasion fix: ensure num is finite
            if (!Number.isFinite(num)) {
              passed = false;
              failureReason = `Field '${assertion.field_path}' value '${val}' is not a valid finite number`;
            } else {
              if (params.min !== undefined && num < params.min) {
                passed = false;
                failureReason = `Field '${assertion.field_path}' value ${num} is below minimum allowed ${params.min}`;
              }
              if (params.max !== undefined && num > params.max) {
                passed = false;
                failureReason = `Field '${assertion.field_path}' value ${num} exceeds maximum allowed ${params.max}`;
              }
            }
          }
          break;

        case 'ENUM_SET':
          if (val !== undefined && val !== null) {
            const allowed = params.allowedValues || [];
            if (!allowed.includes(val)) {
              passed = false;
              failureReason = `Field '${assertion.field_path}' value '${val}' is not in allowed set [${allowed.join(', ')}]`;
            }
          }
          break;

        case 'LENGTH_RANGE':
          if (val !== undefined && val !== null) {
            const len = typeof val === 'string' ? val.length : Array.isArray(val) ? val.length : 0;
            if (params.min !== undefined && len < params.min) {
              passed = false;
              failureReason = `Field '${assertion.field_path}' length ${len} is below minimum ${params.min}`;
            }
            if (params.max !== undefined && len > params.max) {
              passed = false;
              failureReason = `Field '${assertion.field_path}' length ${len} exceeds maximum ${params.max}`;
            }
          }
          break;

        default:
          // Reject unsupported assertion configurations explicitly
          passed = false;
          failureReason = `Unsupported assertion type '${assertion.assertion_type}'`;
          break;
      }

      if (!passed) {
        if (assertion.severity === 'ERROR') {
          errors.push(`Assertion [${assertion.rule_name}] failed: ${failureReason}`);
        } else {
          warnings.push(`Assertion [${assertion.rule_name}] warning: ${failureReason}`);
        }
      }
    }

    // 3. Log Drift into audit ledger if errors occurred
    if (errors.length > 0) {
      await this.db.query(
        `INSERT INTO gigalibs_data_studio.schema_drift_logs (id, tenant_id, contract_id, drift_type, details, source_ip, occurred_at)
         VALUES ($1, $2, $3, 'CONTRACT_VIOLATION', $4, $5, NOW())`,
        [
          `drift-${randomUUID().slice(0, 8)}`,
          tenantId,
          contract.id,
          JSON.stringify({
            errors,
            warnings,
            version: versionToUse,
            sample_payload: payload,
          }),
          sourceIp || 'unknown',
        ],
      );
    }

    return {
      valid: errors.length === 0,
      contract_code: contract.contract_code,
      contract_name: contract.name,
      version: versionToUse,
      assertions_evaluated: assertions.length,
      errors,
      warnings,
      evaluated_at: new Date().toISOString(),
    };
  }
}
