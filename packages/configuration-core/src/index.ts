import { createHash } from 'node:crypto';
import {
  type ConfigurationCondition,
  type ConfigurationDefinition,
  ConfigurationDefinitionSchema,
  type ConfigurationField,
} from '@gigalibs/contracts';
import { evaluateConfigurationCondition, isConfigurationValueEmpty } from './condition.js';

export { evaluateConfigurationCondition, isConfigurationValueEmpty } from './condition.js';
export {
  classifyConfigurationImpact,
  compareConfigurationDefinitions,
} from './compatibility.js';

export const CONFIGURATION_COMPILER_VERSION = '1.0.0';

export type ConfigurationFinding = {
  code: string;
  path: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
};

export type CompiledConfigurationManifest = ConfigurationDefinition & {
  compilerVersion: string;
  checksum: string;
};

const componentTypes: Readonly<
  Record<ConfigurationField['component'], readonly ConfigurationField['type'][]>
> = {
  'text-input': ['TEXT', 'EMAIL', 'PHONE', 'URL'],
  textarea: ['TEXTAREA'],
  'number-input': ['NUMBER', 'INTEGER', 'CURRENCY'],
  checkbox: ['BOOLEAN'],
  'date-input': ['DATE'],
  'datetime-input': ['DATETIME'],
  select: ['SELECT'],
  'multi-select': ['MULTI_SELECT'],
};

/** Platform-level fields that NO module may expose as configurable. */
export const PLATFORM_LOCKED_FIELD_KEYS = new Set([
  'id',
  'tenant-id',
  'created-at',
  'updated-at',
  'version',
  'status',
]);

/**
 * Per-module reserved field keys, registered at module initialisation time.
 * Call `registerReservedKeys(moduleKey, keys)` once per module — typically
 * in the module's server entry-point — before `compileConfiguration` runs.
 */
const moduleReservedKeys = new Map<string, Set<string>>();

/**
 * Register field keys that a specific module owns and therefore cannot be
 * opened to configuration.  Safe to call multiple times; subsequent calls
 * replace the prior set for that moduleKey.
 *
 * @example
 * // In accounts-receivable module init:
 * registerReservedKeys('accounts-receivable', [
 *   'currency', 'total-minor', 'tax-minor', 'total',
 * ]);
 */
export function registerReservedKeys(moduleKey: string, keys: readonly string[]): void {
  moduleReservedKeys.set(moduleKey, new Set(keys));
}

const secretFieldKeyPattern =
  /(?:^|-)(?:password|secret|token|api-key|private-key|credential)(?:-|$)/;

export function compileConfiguration(
  input: unknown,
  options: { reservedFieldKeys?: readonly string[] } = {},
): {
  valid: boolean;
  findings: ConfigurationFinding[];
  manifest?: CompiledConfigurationManifest;
} {
  const parsed = ConfigurationDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      findings: parsed.error.issues.map((issue) => ({
        code: 'SCHEMA_INVALID',
        path: issue.path.join('.'),
        message: issue.message,
        severity: 'ERROR',
      })),
    };
  }

  const definition = parsed.data;
  const findings: ConfigurationFinding[] = [];
  const fieldKeys = new Set<string>();
  const reservedFieldKeys = new Set([
    ...PLATFORM_LOCKED_FIELD_KEYS,
    ...(moduleReservedKeys.get(definition.moduleKey) ?? new Set<string>()),
    ...(options.reservedFieldKeys ?? []),
  ]);

  for (const [index, field] of definition.fields.entries()) {
    const path = `fields.${index}`;
    if (fieldKeys.has(field.key)) {
      findings.push({
        code: 'DUPLICATE_FIELD_KEY',
        path: `${path}.key`,
        message: `Field ${field.key} is duplicated.`,
        severity: 'ERROR',
      });
    }
    fieldKeys.add(field.key);
    if (reservedFieldKeys.has(field.key)) {
      findings.push({
        code: 'LOCKED_FIELD_KEY',
        path: `${path}.key`,
        message: `${field.key} is owned by the module and cannot be configured.`,
        severity: 'ERROR',
      });
    }
    if (secretFieldKeyPattern.test(field.key)) {
      findings.push({
        code: 'SECRET_FIELD_PROHIBITED',
        path: `${path}.key`,
        message: 'Secret values must use the credential vault and cannot be configuration fields.',
        severity: 'ERROR',
      });
    }
    if (!componentTypes[field.component].includes(field.type)) {
      findings.push({
        code: 'COMPONENT_TYPE_MISMATCH',
        path: `${path}.component`,
        message: `${field.component} cannot render ${field.type}.`,
        severity: 'ERROR',
      });
    }
    if (
      field.minimum !== undefined &&
      field.maximum !== undefined &&
      field.minimum > field.maximum
    ) {
      findings.push({
        code: 'INVALID_RANGE',
        path,
        message: 'Minimum cannot exceed maximum.',
        severity: 'ERROR',
      });
    }
    if (
      field.minLength !== undefined &&
      field.maxLength !== undefined &&
      field.minLength > field.maxLength
    ) {
      findings.push({
        code: 'INVALID_LENGTH_RANGE',
        path,
        message: 'Minimum length cannot exceed maximum length.',
        severity: 'ERROR',
      });
    }
    if (
      (field.type === 'SELECT' || field.type === 'MULTI_SELECT') &&
      (!field.options || field.options.length === 0)
    ) {
      findings.push({
        code: 'OPTIONS_REQUIRED',
        path: `${path}.options`,
        message: `${field.type} requires at least one option.`,
        severity: 'ERROR',
      });
    }
    if (field.readOnly && field.writePermission) {
      findings.push({
        code: 'READ_ONLY_WRITE_PERMISSION',
        path: `${path}.writePermission`,
        message: 'A read-only field cannot declare a write permission.',
        severity: 'ERROR',
      });
    }
    if (
      (field.classification === 'CONFIDENTIAL' || field.classification === 'RESTRICTED') &&
      !field.readPermission
    ) {
      findings.push({
        code: 'SENSITIVE_READ_PERMISSION_REQUIRED',
        path: `${path}.readPermission`,
        message: `${field.classification} fields require an explicit read permission.`,
        severity: 'ERROR',
      });
    }
    if (
      (field.classification === 'CONFIDENTIAL' || field.classification === 'RESTRICTED') &&
      !field.readOnly &&
      !field.writePermission
    ) {
      findings.push({
        code: 'SENSITIVE_WRITE_PERMISSION_REQUIRED',
        path: `${path}.writePermission`,
        message: `Mutable ${field.classification} fields require an explicit write permission.`,
        severity: 'ERROR',
      });
    }
    if (
      (field.classification === 'CONFIDENTIAL' || field.classification === 'RESTRICTED') &&
      field.defaultValue !== undefined
    ) {
      findings.push({
        code: 'SENSITIVE_DEFAULT_PROHIBITED',
        path: `${path}.defaultValue`,
        message: 'Sensitive values cannot be stored as metadata defaults.',
        severity: 'ERROR',
      });
    }
  }

  const fieldsByKey = new Map(definition.fields.map((field) => [field.key, field]));
  const dependencyGraph = new Map<string, Set<string>>();
  for (const [index, field] of definition.fields.entries()) {
    for (const [conditionKey, condition] of [
      ['visibleWhen', field.visibleWhen],
      ['requiredWhen', field.requiredWhen],
    ] as const) {
      if (!condition) continue;
      const references = validateCondition(
        condition,
        field,
        fieldsByKey,
        `fields.${index}.${conditionKey}`,
        findings,
      );
      dependencyGraph.set(
        field.key,
        new Set([...(dependencyGraph.get(field.key) ?? []), ...references]),
      );
    }
  }
  for (const cycle of findConditionCycles(dependencyGraph)) {
    findings.push({
      code: 'CONDITION_CYCLE',
      path: 'fields',
      message: `Conditional fields form a cycle: ${cycle.join(' -> ')}.`,
      severity: 'ERROR',
    });
  }

  const sectionKeys = new Set<string>();
  const placedFields = new Set<string>();
  for (const [index, section] of definition.sections.entries()) {
    if (sectionKeys.has(section.key))
      findings.push({
        code: 'DUPLICATE_SECTION_KEY',
        path: `sections.${index}.key`,
        message: `Section ${section.key} is duplicated.`,
        severity: 'ERROR',
      });
    sectionKeys.add(section.key);
    for (const fieldKey of section.fieldKeys) {
      if (!fieldKeys.has(fieldKey))
        findings.push({
          code: 'UNKNOWN_FIELD_REFERENCE',
          path: `sections.${index}.fieldKeys`,
          message: `Section references unknown field ${fieldKey}.`,
          severity: 'ERROR',
        });
      if (placedFields.has(fieldKey))
        findings.push({
          code: 'DUPLICATE_FIELD_PLACEMENT',
          path: `sections.${index}.fieldKeys`,
          message: `Field ${fieldKey} appears in more than one section.`,
          severity: 'ERROR',
        });
      placedFields.add(fieldKey);
    }
  }
  for (const fieldKey of fieldKeys) {
    if (!placedFields.has(fieldKey))
      findings.push({
        code: 'UNPLACED_FIELD',
        path: 'sections',
        message: `Field ${fieldKey} is not placed in a section.`,
        severity: 'ERROR',
      });
  }

  if (findings.some((finding) => finding.severity === 'ERROR')) return { valid: false, findings };
  const canonical = canonicalJson(definition);
  const checksum = `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
  return {
    valid: true,
    findings,
    manifest: { ...definition, compilerVersion: CONFIGURATION_COMPILER_VERSION, checksum },
  };
}

export function validateConfigurationValues(
  manifest: CompiledConfigurationManifest,
  values: unknown,
  options: { allowReadOnly?: boolean } = {},
): Record<string, string> {
  if (!values || typeof values !== 'object' || Array.isArray(values))
    return { $root: 'Values must be an object.' };
  const record = values as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const fields = new Map(manifest.fields.map((field) => [field.key, field]));
  for (const key of Object.keys(record)) if (!fields.has(key)) errors[key] = 'Unknown field.';
  for (const field of manifest.fields) {
    const value = record[field.key];
    if (field.visibleWhen && !evaluateConfigurationCondition(field.visibleWhen, record)) continue;
    const required =
      field.required ||
      Boolean(field.requiredWhen && evaluateConfigurationCondition(field.requiredWhen, record));
    if (field.readOnly && value !== undefined && !options.allowReadOnly) {
      errors[field.key] = 'Field is read-only.';
      continue;
    }
    if (required && isConfigurationValueEmpty(value)) {
      errors[field.key] = 'Field is required.';
      continue;
    }
    if (value === undefined || value === null || value === '') continue;
    const error = validateField(field, value);
    if (error) errors[field.key] = error;
  }
  return errors;
}

function validateCondition(
  condition: ConfigurationCondition,
  target: ConfigurationField,
  fields: Map<string, ConfigurationField>,
  path: string,
  findings: ConfigurationFinding[],
): Set<string> {
  const references = new Set<string>();
  let nodes = 0;
  const visit = (node: ConfigurationCondition, nodePath: string, depth: number) => {
    nodes += 1;
    if (depth > 5)
      findings.push({
        code: 'CONDITION_DEPTH_EXCEEDED',
        path: nodePath,
        message: 'Conditions may contain at most five nested levels.',
        severity: 'ERROR',
      });
    if (nodes > 50) return;
    if (node.kind === 'GROUP') {
      node.conditions.forEach((item, index) =>
        visit(item, `${nodePath}.conditions.${index}`, depth + 1),
      );
      return;
    }
    references.add(node.fieldKey);
    const source = fields.get(node.fieldKey);
    if (!source)
      findings.push({
        code: 'UNKNOWN_CONDITION_FIELD',
        path: `${nodePath}.fieldKey`,
        message: `Condition references unknown field ${node.fieldKey}.`,
        severity: 'ERROR',
      });
    if (node.fieldKey === target.key)
      findings.push({
        code: 'SELF_REFERENTIAL_CONDITION',
        path: `${nodePath}.fieldKey`,
        message: 'A field cannot depend on itself.',
        severity: 'ERROR',
      });
    const emptyOperator = node.operator === 'IS_EMPTY' || node.operator === 'IS_NOT_EMPTY';
    if (emptyOperator && node.value !== undefined)
      findings.push({
        code: 'CONDITION_VALUE_PROHIBITED',
        path: `${nodePath}.value`,
        message: `${node.operator} does not accept a comparison value.`,
        severity: 'ERROR',
      });
    if (!emptyOperator && node.value === undefined)
      findings.push({
        code: 'CONDITION_VALUE_REQUIRED',
        path: `${nodePath}.value`,
        message: `${node.operator} requires a comparison value.`,
        severity: 'ERROR',
      });
    if (
      ['GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL'].includes(
        node.operator,
      )
    ) {
      if (
        !source ||
        !['NUMBER', 'INTEGER', 'CURRENCY'].includes(source.type) ||
        typeof node.value !== 'number'
      )
        findings.push({
          code: 'CONDITION_TYPE_MISMATCH',
          path: nodePath,
          message: `${node.operator} requires a numeric source field and numeric value.`,
          severity: 'ERROR',
        });
    }
    if (node.operator === 'IN' && !Array.isArray(node.value))
      findings.push({
        code: 'CONDITION_TYPE_MISMATCH',
        path: `${nodePath}.value`,
        message: 'IN requires a list of comparison values.',
        severity: 'ERROR',
      });
    if (
      node.operator === 'CONTAINS' &&
      source &&
      source.type !== 'TEXT' &&
      source.type !== 'TEXTAREA' &&
      source.type !== 'MULTI_SELECT'
    )
      findings.push({
        code: 'CONDITION_TYPE_MISMATCH',
        path: nodePath,
        message: 'CONTAINS requires text or multi-select source fields.',
        severity: 'ERROR',
      });
  };
  visit(condition, path, 1);
  if (nodes > 50)
    findings.push({
      code: 'CONDITION_NODE_LIMIT_EXCEEDED',
      path,
      message: 'A condition may contain at most 50 nodes.',
      severity: 'ERROR',
    });
  return references;
}

function findConditionCycles(graph: Map<string, Set<string>>): string[][] {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const visit = (key: string) => {
    if (state.get(key) === 2) return;
    if (state.get(key) === 1) {
      const start = stack.indexOf(key);
      const cycle = [...stack.slice(start), key];
      const signature = [...new Set(cycle)].sort().join('|');
      if (!seen.has(signature)) {
        seen.add(signature);
        cycles.push(cycle);
      }
      return;
    }
    state.set(key, 1);
    stack.push(key);
    for (const dependency of graph.get(key) ?? []) if (graph.has(dependency)) visit(dependency);
    stack.pop();
    state.set(key, 2);
  };
  for (const key of graph.keys()) visit(key);
  return cycles;
}

function validateField(field: ConfigurationField, value: unknown): string | undefined {
  if (['NUMBER', 'CURRENCY', 'INTEGER'].includes(field.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Must be a finite number.';
    if (field.type === 'INTEGER' && !Number.isInteger(value)) return 'Must be an integer.';
    if (field.minimum !== undefined && value < field.minimum)
      return `Must be at least ${field.minimum}.`;
    if (field.maximum !== undefined && value > field.maximum)
      return `Must be at most ${field.maximum}.`;
  } else if (field.type === 'BOOLEAN') {
    if (typeof value !== 'boolean') return 'Must be true or false.';
  } else if (field.type === 'MULTI_SELECT') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
      return 'Must be a list of option values.';
    const allowed = new Set(field.options?.map((option) => option.value));
    if (value.some((item) => !allowed.has(item))) return 'Contains an unsupported option.';
  } else {
    if (typeof value !== 'string') return 'Must be text.';
    if (field.minLength !== undefined && value.length < field.minLength)
      return `Must contain at least ${field.minLength} characters.`;
    if (field.maxLength !== undefined && value.length > field.maxLength)
      return `Must contain at most ${field.maxLength} characters.`;
    if (field.type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return 'Must be a valid email address.';
    if (field.type === 'URL') {
      try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) return 'Must use HTTP or HTTPS.';
      } catch {
        return 'Must be a valid URL.';
      }
    }
    if (field.type === 'SELECT' && !field.options?.some((option) => option.value === value))
      return 'Must be a supported option.';
  }
  return undefined;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export * from './format.js';
export * from './catalogue-compiler.js';
export * from './governed-catalogues.js';
