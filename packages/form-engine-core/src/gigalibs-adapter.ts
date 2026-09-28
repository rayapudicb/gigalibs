/**
 * @gigalibs/form-engine-core / gigalibs-adapter
 *
 * One-way adapter: converts a `ConfigurationDefinition` (from @gigalibs/contracts)
 * into a `FormSchema` (native @gigalibs/form-engine-core schema).
 *
 * Rules:
 *  - ConfigurationDefinition is the source of truth; FormSchema is a view.
 *  - The adapter is pure (no network, no side-effects).
 *  - Conditions with blocked operators (webhook, HTTP) are silently dropped.
 *  - DIVIDER_HEADING fields are synthesised from ConfigurationSection titles.
 */

import type { ConfigurationDefinition, ConfigurationField, ConfigurationCondition } from '@gigalibs/contracts';
import type { FormSchema, FormFieldDefinition, FormFieldCondition, FormFieldType } from './index.js';

// ─── Field type mapping ───────────────────────────────────────────────────────

const FIELD_TYPE_MAP: Record<string, FormFieldType> = {
  TEXT:         'TEXT',
  TEXTAREA:     'TEXTAREA',
  NUMBER:       'NUMBER',
  INTEGER:      'NUMBER',
  BOOLEAN:      'CHECKBOX',
  DATE:         'DATE',
  DATETIME:     'DATE',
  EMAIL:        'EMAIL',
  PHONE:        'PHONE',
  URL:          'TEXT',       // no URL type in FormEngine; renders as text
  CURRENCY:     'CURRENCY',
  SELECT:       'SELECT',
  MULTI_SELECT: 'MULTI_SELECT',
};

function mapFieldType(configType: string): FormFieldType {
  return FIELD_TYPE_MAP[configType] ?? 'TEXT';
}

// ─── Condition mapping ────────────────────────────────────────────────────────

/**
 * Maps a flat ConfigurationCondition PREDICATE to a FormFieldCondition.
 * GROUP conditions are intentionally not supported here (FormEngine uses
 * a flat list of ANDed conditions); nested groups are flattened to their
 * first predicate.
 */
function mapCondition(
  cond: ConfigurationCondition,
  action: 'SHOW' | 'REQUIRE',
): FormFieldCondition | null {
  if (cond.kind !== 'PREDICATE') return null;

  const operatorMap: Partial<Record<string, FormFieldCondition['operator']>> = {
    EQUALS:                  'EQUALS',
    NOT_EQUALS:              'NOT_EQUALS',
    GREATER_THAN:            'GREATER_THAN',
    GREATER_THAN_OR_EQUAL:   'GREATER_THAN',
    LESS_THAN:               'LESS_THAN',
    LESS_THAN_OR_EQUAL:      'LESS_THAN',
    CONTAINS:                'CONTAINS',
    // IS_EMPTY / IS_NOT_EMPTY / IN are not in FormEngine — drop them
  };

  const operator = operatorMap[cond.operator];
  if (!operator) return null;

  return {
    dependsOnFieldId: cond.fieldKey,
    operator,
    value: cond.value ?? null,
    action,
  };
}

function mapField(field: ConfigurationField): FormFieldDefinition {
  const conditions: FormFieldCondition[] = [];

  if (field.visibleWhen) {
    const cond = mapCondition(field.visibleWhen, 'SHOW');
    if (cond) conditions.push(cond);
  }
  if (field.requiredWhen) {
    const cond = mapCondition(field.requiredWhen, 'REQUIRE');
    if (cond) conditions.push(cond);
  }

  return {
    id:          field.key,
    name:        field.key,
    label:       field.label,
    type:        mapFieldType(field.type),
    ...(field.helpText === undefined ? {} : { helpText: field.helpText }),
    ...(field.options === undefined
      ? {}
      : { options: field.options.map((o) => ({ label: o.label, value: o.value })) }),
    validation: {
      required:         field.required,
      ...(field.minimum === undefined ? {} : { min: field.minimum }),
      ...(field.maximum === undefined ? {} : { max: field.maximum }),
      ...(field.minLength === undefined ? {} : { minLength: field.minLength }),
      ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    },
    ...(field.defaultValue === undefined ? {} : { defaultValue: field.defaultValue }),
    conditions,
  };
}

// ─── Public adapter function ──────────────────────────────────────────────────

/**
 * Converts a GigaLibs ConfigurationDefinition into a FormEngine FormSchema.
 *
 * @param definition - Source configuration definition
 * @param tenantId   - Active tenant identifier (required by FormSchema)
 * @returns A FormSchema ready for rendering by DynamicFormStudio or MedusaFormRenderer
 *
 * @example
 * const schema = toFormSchema(definition, session.tenantId);
 * return <MedusaFormRenderer schema={schema} onSubmit={handleSubmit} />;
 */
export function toFormSchema(
  definition: ConfigurationDefinition,
  tenantId: string,
): FormSchema {
  const fieldMap = new Map(definition.fields.map((f) => [f.key, f]));
  const outputFields: FormFieldDefinition[] = [];

  if (definition.sections && definition.sections.length > 0) {
    for (const section of definition.sections) {
      // Insert a divider heading for each section
      outputFields.push({
        id:    `__section_${section.key}`,
        name:  `__section_${section.key}`,
        label: section.title,
        type:  'DIVIDER_HEADING',
        ...(section.description === undefined ? {} : { helpText: section.description }),
      });

      for (const fieldKey of section.fieldKeys) {
        const field = fieldMap.get(fieldKey);
        if (field) {
          outputFields.push(mapField(field));
          fieldMap.delete(fieldKey); // mark as consumed
        }
      }
    }
  }

  // Append any fields not referenced by any section
  for (const field of fieldMap.values()) {
    outputFields.push(mapField(field));
  }

  return {
    id:          `${definition.moduleKey}__${definition.entityKey}__${definition.surfaceKey}`,
    tenantId,
    title:       definition.title,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    version:     1,
    fields:      outputFields,
    submitButtonText: definition.mode === 'CREATE' ? 'Create' : 'Save changes',
    successMessage:   'Saved.',
    createdAt:   new Date().toISOString(),
  };
}
