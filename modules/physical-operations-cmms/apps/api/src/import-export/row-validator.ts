import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ImportableEntityType, EntityColumnDef, ValidatedRow, ColumnWarning, FkResolutionResult, RowErrorDetail } from './types.js';
import { getImportColumnDefs } from './column-registry.js';
import { classifyHeaders, stripFormulaInjection } from './column-classifier.js';
import { FkResolverService } from './fk-resolver.js';
import type { ColumnClass } from './column-classifier.js';

// ─── Base Zod shapes ─────────────────────────────────────────────────────────

const uuidOrEmptyString = z.union([z.string().uuid(), z.literal('')]).optional();

const ASSET_SCHEMA = z.object({
  name: z.string().min(1).max(255),
  asset_tag: z.string().max(64).optional(),
  serial_number: z.string().max(128).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE', 'DECOMMISSIONED', 'DISPOSED']).optional(),
  criticality: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  purchase_date: z.coerce.date().optional().nullable(),
  purchase_cost: z.coerce.number().nonnegative().optional().nullable(),
  warranty_expiry_date: z.coerce.date().optional().nullable(),
  manufacturer: z.string().max(128).optional(),
  model: z.string().max(128).optional(),
}).passthrough();

const LOCATION_SCHEMA = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(32).optional(),
  timezone: z.string().max(64).optional(),
  country_code: z.string().length(2).optional(),
}).passthrough();

const PART_SCHEMA = z.object({
  name: z.string().min(1).max(255),
  quantity_on_hand: z.coerce.number().nonnegative().optional(),
  reorder_point: z.coerce.number().nonnegative().optional(),
  unit_cost: z.coerce.number().nonnegative().optional().nullable(),
}).passthrough();

const VENDOR_SCHEMA = z.object({
  name: z.string().min(1).max(255),
  contact_email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLACKLISTED']).optional(),
}).passthrough();

const CUSTOMER_SCHEMA = z.object({
  name: z.string().min(1).max(255),
  contact_email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).passthrough();

const WORKFORCE_SCHEMA = z.object({
  first_name: z.string().min(1).max(128),
  last_name: z.string().min(1).max(128),
  email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).optional(),
  hourly_rate: z.coerce.number().nonnegative().optional().nullable(),
}).passthrough();

const DEPARTMENT_SCHEMA = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(32).optional(),
}).passthrough();

const USER_SCHEMA = z.object({
  email: z.string().email({ message: 'email must be a valid email address' }),
  name: z.string().min(1).max(255),
  role: z.enum(['TENANT_ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'GUEST']).optional(),
  expires_in_hours: z.coerce.number().int().min(1).max(168).optional(),
}).passthrough();

const ENTITY_SCHEMAS: Record<ImportableEntityType, z.ZodTypeAny> = {
  assets: ASSET_SCHEMA,
  locations: LOCATION_SCHEMA,
  parts: PART_SCHEMA,
  vendors: VENDOR_SCHEMA,
  customers: CUSTOMER_SCHEMA,
  workforce_resources: WORKFORCE_SCHEMA,
  departments: DEPARTMENT_SCHEMA,
  users: USER_SCHEMA,
};

// ─── Service ─────────────────────────────────────────────────────────────────

export interface RowValidationResult {
  valid: ValidatedRow | null;
  error: RowErrorDetail | null;
  warnings: ColumnWarning[];
}

@Injectable()
export class RowValidatorService {
  constructor(private readonly fkResolver: FkResolverService) {}

  /**
   * Validates and transforms a single raw row (from SheetJS) into a ValidatedRow.
   *
   * Steps:
   *  1. Strip formula injection from string fields that have detectFormulas = true
   *  2. Resolve FK columns using pre-built maps
   *  3. Separate spec_*, custom_* values into their own buckets
   *  4. Run entity Zod schema against db-direct fields
   */
  validateRow(
    rowNumber: number,
    rawRow: Record<string, unknown>,
    entityType: ImportableEntityType,
    classifications: ColumnClass[],
    headers: string[],
    fkMaps: FkResolutionResult,
  ): RowValidationResult {
    const defs = getImportColumnDefs(entityType);
    const defByKey = new Map<string, EntityColumnDef>(defs.map((d) => [d.key, d]));

    const dbValues: Record<string, unknown> = {};
    const specValues: Record<string, unknown> = {};
    const customValues: Record<string, unknown> = {};
    const warnings: ColumnWarning[] = [];

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (!header) continue;
      const cls = classifications[i];
      if (!cls) continue;
      const rawValue = rawRow[header];

      switch (cls.kind) {
        case 'unrecognized':
          // Already warned at header classification step — skip data
          break;

        case 'spec-jsonb':
          specValues[cls.key.replace(/^spec_/, '')] = rawValue;
          break;

        case 'custom-jsonb':
          customValues[cls.key.replace(/^custom_/, '')] = rawValue;
          break;

        case 'known':
        case 'alias': {
          const registryKey = cls.kind === 'alias' ? cls.resolvedKey : cls.key;
          const def = defByKey.get(registryKey);
          if (!def || def.kind === 'computed' || def.exportOnly) break;

          // Formula injection stripping
          if (def.detectFormulas && typeof rawValue === 'string') {
            const { cleaned, wasFormula } = stripFormulaInjection(rawValue);
            if (wasFormula) {
              warnings.push({ column: header, reason: 'FORMULA_STRIPPED' });
              dbValues[registryKey] = cleaned;
              break;
            }
          }

          // FK resolution
          if (def.kind === 'fk-resolve' || def.kind === 'hierarchy') {
            const fkMap = fkMaps[registryKey];
            if (!fkMap) {
              dbValues[registryKey] = null;
              break;
            }
            try {
              const resolved = this.fkResolver.resolveValue(fkMap, rawValue, def);
              // Store under the resolved DB column name
              const dbCol = def.dbColumn ?? registryKey;
              dbValues[dbCol] = resolved;
              // Also keep the original name value for hierarchy sorting
              dbValues[registryKey] = rawValue;
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                valid: null,
                error: { code: 'FK_NOT_FOUND', message: msg, field: registryKey, value: rawValue },
                warnings,
              };
            }
            break;
          }

          // db-direct field
          dbValues[registryKey] = coerceValue(rawValue);
          break;
        }
      }
    }

    // Zod schema validation on db-direct fields
    const schema = ENTITY_SCHEMAS[entityType];
    const parsed = schema.safeParse(dbValues);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join('.') ?? 'unknown';
      const message = issue?.message ?? 'Validation failed';
      return {
        valid: null,
        error: { code: 'VALIDATION_FAILED', message, field, value: dbValues[field] },
        warnings,
      };
    }

    // Extract external_id if present (used for upsert keying)
    const externalId = (dbValues['external_id'] ?? dbValues['asset_tag'] ?? null) as string | null;

    return {
      valid: {
        rowNumber,
        externalId,
        dbValues: parsed.data as Record<string, unknown>,
        specValues,
        customValues,
        warnings,
      },
      error: null,
      warnings,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function coerceValue(value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return null;
  return value;
}
