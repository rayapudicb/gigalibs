export type FormFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'EMAIL'
  | 'PHONE'
  | 'CURRENCY'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'CHECKBOX'
  | 'RADIO'
  | 'DATE'
  | 'TIME'
  | string;

// ─── Field-level row stored in JSONB ─────────────────────────────────────────

export interface FormFieldRow {
  /** Stable snake_case key — used as the DB column name for core fields */
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
  conditions?: Array<{
    dependsOnFieldId: string;
    operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS';
    value: unknown;
    action: 'SHOW' | 'HIDE' | 'REQUIRE';
  }>;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    customErrorMessage?: string;
  };
  formula?: string;
  /** Position in the rendered form — lower numbers render first */
  position: number;
  /**
   * Core fields are owned by the platform layer.
   * Tenants may NOT remove them or change their type.
   * Labels, placeholder, helpText, and defaultValue remain overridable.
   */
  core?: boolean;
}

// ─── Top-level definition stored in JSONB ────────────────────────────────────

export interface FormDefinitionBody {
  title: string;
  description?: string;
  category?: string;
  submitButtonText?: string;
  successMessage?: string;
  fields: FormFieldRow[];
}

// ─── Database row ─────────────────────────────────────────────────────────────

export interface FormDefinitionRecord {
  id: string;
  formKey: string;
  tenantId: string | null;
  definition: FormDefinitionBody;
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

export interface MergeOptions {
  /** Keys that cannot be removed or retyped, even by the platform itself */
  lockedKeys?: ReadonlySet<string>;
}

/** Build a merged FormFieldRow safely (no spread, compatible with exactOptionalPropertyTypes). */
function mergeField(base: FormFieldRow, override: FormFieldRow, isLocked: boolean): FormFieldRow {
  const merged: FormFieldRow = {
    id: base.id,
    name: base.name,
    type: base.type,   // never changed — platform type is canonical
    position: isLocked ? base.position : (override.position ?? base.position),
    label: override.label ?? base.label,
  };
  if (base.core !== undefined) merged.core = base.core;
  // Optional cosmetic fields: tenant may override
  if (override.placeholder !== undefined) merged.placeholder = override.placeholder;
  else if (base.placeholder !== undefined) merged.placeholder = base.placeholder;

  if (override.helpText !== undefined) merged.helpText = override.helpText;
  else if (base.helpText !== undefined) merged.helpText = base.helpText;

  if (override.defaultValue !== undefined) merged.defaultValue = override.defaultValue;
  else if (base.defaultValue !== undefined) merged.defaultValue = base.defaultValue;

  if (isLocked) {
    // Locked: inherit everything else from base
    if (base.required !== undefined) merged.required = base.required;
    if (base.options !== undefined) merged.options = base.options;
    if (base.validation !== undefined) merged.validation = base.validation;
    if (base.conditions !== undefined) merged.conditions = base.conditions;
    if (base.formula !== undefined) merged.formula = base.formula;
  } else {
    // Unlocked: tenant may fully override behaviour
    if (override.required !== undefined) merged.required = override.required;
    else if (base.required !== undefined) merged.required = base.required;

    if (override.options !== undefined) merged.options = override.options;
    else if (base.options !== undefined) merged.options = base.options;

    if (override.validation !== undefined) merged.validation = override.validation;
    else if (base.validation !== undefined) merged.validation = base.validation;

    if (override.conditions !== undefined) merged.conditions = override.conditions;
    else if (base.conditions !== undefined) merged.conditions = base.conditions;

    if (override.formula !== undefined) merged.formula = override.formula;
    else if (base.formula !== undefined) merged.formula = base.formula;
  }
  return merged;
}

/**
 * Produces the effective form definition a tenant's users see at runtime.
 *
 * Rules:
 *  1. All core (platform) fields are kept — tenant cannot drop them.
 *  2. Tenant may override labels / placeholder / helpText / defaultValue on any field.
 *  3. Tenant may NOT change the `type` of a core field.
 *  4. Tenant may append their own custom fields (not present in platform base).
 *  5. Fields are sorted by position, with tenant additions placed after core fields.
 */
export function mergeDefinitions(
  platformBase: FormDefinitionBody,
  tenantLayer: FormDefinitionBody | null,
  options: MergeOptions = {},
): FormDefinitionBody {
  if (!tenantLayer) return platformBase;

  const baseFieldMap = new Map<string, FormFieldRow>(
    platformBase.fields.map((f) => [f.id, f]),
  );
  const tenantFieldMap = new Map<string, FormFieldRow>(
    tenantLayer.fields.map((f) => [f.id, f]),
  );
  const lockedKeys = options.lockedKeys ?? new Set<string>();

  const mergedFields: FormFieldRow[] = [];

  // 1. Walk platform fields, apply tenant overrides where permitted
  for (const base of platformBase.fields) {
    const override = tenantFieldMap.get(base.id);
    if (!override) {
      mergedFields.push(base);
      continue;
    }
    const isLocked = base.core === true || lockedKeys.has(base.id);
    mergedFields.push(mergeField(base, override, isLocked));
  }

  // 2. Append tenant-only custom fields (those not in platform base)
  const maxPos = platformBase.fields.reduce((m, f) => Math.max(m, f.position), 0);
  let extraPos = maxPos + 10;

  for (const [id, tenantField] of tenantFieldMap.entries()) {
    if (!baseFieldMap.has(id)) {
      const customField: FormFieldRow = { ...tenantField, position: extraPos, core: false };
      mergedFields.push(customField);
      extraPos += 10;
    }
  }

  // 3. Sort by position
  mergedFields.sort((a, b) => a.position - b.position);

  const merged: FormDefinitionBody = {
    title: tenantLayer.title ?? platformBase.title,
    fields: mergedFields,
  };
  const description = tenantLayer.description ?? platformBase.description;
  if (description !== undefined) merged.description = description;
  const category = platformBase.category;
  if (category !== undefined) merged.category = category;
  const submitButtonText = tenantLayer.submitButtonText ?? platformBase.submitButtonText;
  if (submitButtonText !== undefined) merged.submitButtonText = submitButtonText;
  const successMessage = tenantLayer.successMessage ?? platformBase.successMessage;
  if (successMessage !== undefined) merged.successMessage = successMessage;

  return merged;
}
