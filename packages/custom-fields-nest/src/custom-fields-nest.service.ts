import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
export type CustomFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'json';

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  entityType: string;
  name: string;
  label: string;
  fieldType: CustomFieldType;
  required: boolean;
  defaultValue?: unknown;
  options?: string[];
  validationRule?: { min?: number; max?: number; regex?: string };
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export const CUSTOM_FIELDS_POOL = 'CUSTOM_FIELDS_POOL';
export const CUSTOM_FIELDS_SCHEMA = 'CUSTOM_FIELDS_SCHEMA';

// ─── DB row ───────────────────────────────────────────────────────────────────

interface CfdRow {
  id: string;
  tenant_id: string;
  entity_type: string;
  name: string;
  label: string;
  field_type: CustomFieldType;
  required: boolean;
  default_value: unknown;
  options: string[] | null;
  validation_rule: { min?: number; max?: number; regex?: string } | null;
  position: number;
  created_at: Date;
  updated_at: Date;
}

function toDefinition(row: CfdRow): CustomFieldDefinition {
  const def: CustomFieldDefinition = {
    id: row.id,
    tenantId: row.tenant_id,
    entityType: row.entity_type,
    name: row.name,
    label: row.label,
    type: row.field_type,
    required: row.required,
  };
  if (row.default_value !== null && row.default_value !== undefined) def.defaultValue = row.default_value;
  if (row.options !== null && row.options !== undefined) def.options = row.options;
  if (row.validation_rule !== null && row.validation_rule !== undefined) def.validationRule = row.validation_rule;
  return def;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CustomFieldsNestService {
  constructor(
    @Inject(CUSTOM_FIELDS_POOL) private readonly pool: Pool,
    @Inject(CUSTOM_FIELDS_SCHEMA) private readonly schema: string,
  ) {}

  /** Returns all custom field definitions for a tenant + entity type */
  async getFieldsForEntity(
    tenantId: string,
    entityType: string,
  ): Promise<CustomFieldDefinition[]> {
    const result = await this.pool.query<CfdRow>(
      `SELECT * FROM ${this.schema}.custom_field_definitions
       WHERE tenant_id = $1 AND entity_type = $2
       ORDER BY position ASC, created_at ASC`,
      [tenantId, entityType],
    );
    return result.rows.map(toDefinition);
  }

  /** Returns a single custom field definition by id */
  async getField(tenantId: string, id: string): Promise<CustomFieldDefinition | null> {
    const result = await this.pool.query<CfdRow>(
      `SELECT * FROM ${this.schema}.custom_field_definitions
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    const row = result.rows[0];
    return row ? toDefinition(row) : null;
  }

  /** Creates a new custom field definition */
  async createField(
    tenantId: string,
    entityType: string,
    input: Omit<CustomFieldDefinition, 'id' | 'tenantId' | 'entityType'>,
  ): Promise<CustomFieldDefinition> {
    const result = await this.pool.query<CfdRow>(
      `INSERT INTO ${this.schema}.custom_field_definitions
         (tenant_id, entity_type, name, label, field_type, required,
          default_value, options, validation_rule, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        tenantId,
        entityType,
        input.name,
        input.label,
        input.type,
        input.required,
        input.defaultValue !== undefined ? JSON.stringify(input.defaultValue) : null,
        input.options ? JSON.stringify(input.options) : null,
        input.validationRule ? JSON.stringify(input.validationRule) : null,
        0,
      ],
    );
    return toDefinition(result.rows[0]!);
  }

  /** Updates an existing custom field definition (label, options, required, position) */
  async updateField(
    tenantId: string,
    id: string,
    patch: Partial<Pick<CustomFieldDefinition, 'label' | 'required' | 'defaultValue' | 'options' | 'validationRule'>>,
  ): Promise<CustomFieldDefinition | null> {
    const existing = await this.getField(tenantId, id);
    if (!existing) return null;

    const result = await this.pool.query<CfdRow>(
      `UPDATE ${this.schema}.custom_field_definitions
       SET label           = $3,
           required        = $4,
           default_value   = $5,
           options         = $6,
           validation_rule = $7,
           updated_at      = transaction_timestamp()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        id,
        patch.label ?? existing.label,
        patch.required ?? existing.required,
        patch.defaultValue !== undefined
          ? JSON.stringify(patch.defaultValue)
          : existing.defaultValue !== undefined
          ? JSON.stringify(existing.defaultValue)
          : null,
        patch.options ? JSON.stringify(patch.options) : existing.options ? JSON.stringify(existing.options) : null,
        patch.validationRule
          ? JSON.stringify(patch.validationRule)
          : existing.validationRule
          ? JSON.stringify(existing.validationRule)
          : null,
      ],
    );
    const row = result.rows[0];
    return row ? toDefinition(row) : null;
  }

  /** Deletes a custom field definition */
  async deleteField(tenantId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ${this.schema}.custom_field_definitions
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Reorders fields for a given entity type.
   * Accepts ordered list of field ids; assigns positions 10, 20, 30, ...
   */
  async reorderFields(tenantId: string, entityType: string, orderedIds: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(
          `UPDATE ${this.schema}.custom_field_definitions
           SET position = $3, updated_at = transaction_timestamp()
           WHERE tenant_id = $1 AND id = $2 AND entity_type = $4`,
          [tenantId, orderedIds[i], (i + 1) * 10, entityType],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

function validateFieldValue(def: CustomFieldDefinition, value: unknown): { isValid: boolean; error?: string } {
  if (def.required && (value === undefined || value === null || value === '')) {
    return { isValid: false, error: `${def.label} is required` };
  }
  if (value === undefined || value === null) {
    return { isValid: true };
  }
  switch (def.fieldType) {
    case 'text':
      if (typeof value !== 'string') return { isValid: false, error: `${def.label} must be a text string` };
      break;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) return { isValid: false, error: `${def.label} must be a valid number` };
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return { isValid: false, error: `${def.label} must be true or false` };
      break;
    case 'select':
      if (def.options && !def.options.includes(String(value))) {
        return { isValid: false, error: `${def.label} must be one of: ${def.options.join(', ')}` };
      }
      break;
    case 'multiselect':
      if (!Array.isArray(value)) return { isValid: false, error: `${def.label} must be an array of values` };
      if (def.options && !value.every((v) => def.options?.includes(String(v)))) {
        return { isValid: false, error: `Invalid option selected for ${def.label}` };
      }
      break;
  }
  return { isValid: true };
}

  /**
   * Validates custom field values against their definitions.
   * Returns a map of { fieldName → error message } for invalid values.
   */
  async validateCustomFields(
    tenantId: string,
    entityType: string,
    values: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const definitions = await this.getFieldsForEntity(tenantId, entityType);
    const errors: Record<string, string> = {};

    for (const def of definitions) {
      const value = values[def.name];
      if (def.required && (value === undefined || value === null || value === '')) {
        errors[def.name] = `${def.label} is required`;
        continue;
      }
      if (value !== undefined && value !== null) {
        const result = validateFieldValue(def, value);
        if (!result.isValid && result.error) errors[def.name] = result.error;
      }
    }

    return errors;
  }
}
