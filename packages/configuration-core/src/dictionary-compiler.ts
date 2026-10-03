import { createHash } from 'node:crypto';
import {
  type CompiledDictionaryManifestV1,
  type DictionaryActionV1,
  type DictionaryEntityV1,
  type DictionaryFieldV1,
  type DictionaryMessageV1,
  type DictionaryNavigationItemV1,
  type DictionaryPackageDefinitionV1,
  DictionaryPackageDefinitionV1Schema,
  type DictionaryReferenceV1,
  type DictionaryRelationshipV1,
  type DictionaryValidationExpression,
  type DictionaryValidationRuleV1,
  type DictionaryViewV1,
  CONFIGURATION_MAX_FIELDS,
} from '@gigalibs/contracts';
import { canonicalJson, type ConfigurationFinding } from './index.js';

export type { DictionaryPackageDefinitionV1, CompiledDictionaryManifestV1 };

export interface CompileDictionaryOptions {
  tenantId?: string | undefined;
  publishedVersionId?: string | undefined;
  baseline?: Partial<DictionaryPackageDefinitionV1> | undefined;
  registeredActionHandlers?: readonly string[] | undefined;
  registeredResolvers?: readonly string[] | undefined;
}

export interface CompileDictionaryResult {
  valid: boolean;
  findings: ConfigurationFinding[];
  manifest?: CompiledDictionaryManifestV1;
}

/**
 * Validates maximum AST expression nesting depth to prevent stack overflow or ReDoS.
 */
function getExpressionDepth(expr: DictionaryValidationExpression, current = 1): number {
  if (current > 10) return current;
  let maxChild = current;
  if (expr.all) {
    for (const child of expr.all) {
      maxChild = Math.max(maxChild, getExpressionDepth(child, current + 1));
    }
  }
  if (expr.any) {
    for (const child of expr.any) {
      maxChild = Math.max(maxChild, getExpressionDepth(child, current + 1));
    }
  }
  if (expr.not) {
    maxChild = Math.max(maxChild, getExpressionDepth(expr.not, current + 1));
  }
  return maxChild;
}

/**
 * Checks for cyclic parent-child hierarchy in navigation items.
 */
function findNavigationCycle(items: readonly DictionaryNavigationItemV1[]): string | null {
  const itemMap = new Map(items.map((item) => [item.itemKey, item]));
  for (const item of items) {
    const visited = new Set<string>();
    let curr: DictionaryNavigationItemV1 | undefined = item;
    while (curr) {
      if (visited.has(curr.itemKey)) {
        return curr.itemKey;
      }
      visited.add(curr.itemKey);
      curr = curr.parentItemKey ? itemMap.get(curr.parentItemKey) : undefined;
    }
  }
  return null;
}

/**
 * Compiles an Application Dictionary package into an immutable, checksummed runtime manifest.
 */
export function compileDictionaryPackage(
  input: unknown,
  options: CompileDictionaryOptions = {},
): CompileDictionaryResult {
  const parsed = DictionaryPackageDefinitionV1Schema.safeParse(input);
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

  const pkg = parsed.data;
  const findings: ConfigurationFinding[] = [];

  // 1. Bound check field count
  if (pkg.fields.length > CONFIGURATION_MAX_FIELDS) {
    findings.push({
      code: 'FIELD_LIMIT_EXCEEDED',
      path: 'fields',
      message: `Total field count (${pkg.fields.length}) exceeds the maximum allowed envelope (${CONFIGURATION_MAX_FIELDS}).`,
      severity: 'ERROR',
    });
  }

  // 2. Uniqueness & Reserved Name checks
  const RESERVED_CORE_ENTITIES = new Set([
    'party',
    'user',
    'tenant',
    'account',
    'invoice',
    'payment',
    'supplier-invoice',
    'asset',
    'work-order',
    'journal',
    'workflow',
    'audit',
    'credential',
  ]);

  const entityKeys = new Set<string>();
  for (const entity of pkg.entities) {
    if (entityKeys.has(entity.entityKey)) {
      findings.push({
        code: 'DUPLICATE_ENTITY_KEY',
        path: `entities.${entity.entityKey}`,
        message: `Duplicate entity key: ${entity.entityKey}`,
        severity: 'ERROR',
      });
    }
    entityKeys.add(entity.entityKey);

    const entityBase = entity.entityKey.includes('.') ? entity.entityKey.split('.').pop()! : entity.entityKey;
    if (entity.ownership === 'TENANT_EXTENSION' && RESERVED_CORE_ENTITIES.has(entityBase.toLowerCase())) {
      findings.push({
        code: 'RESERVED_ENTITY_NAME',
        path: `entities.${entity.entityKey}`,
        message: `Custom non-core entity cannot use reserved core name: '${entityBase}'`,
        severity: 'ERROR',
      });
    }
  }

  const fieldKeys = new Set<string>();
  for (const field of pkg.fields) {
    const compositeKey = `${field.entityKey}:${field.fieldKey}`;
    if (fieldKeys.has(compositeKey)) {
      findings.push({
        code: 'DUPLICATE_FIELD_KEY',
        path: `fields.${field.fieldKey}`,
        message: `Duplicate field key '${field.fieldKey}' on entity '${field.entityKey}'`,
        severity: 'ERROR',
      });
    }
    fieldKeys.add(compositeKey);

    if (!entityKeys.has(field.entityKey)) {
      findings.push({
        code: 'MISSING_ENTITY_REFERENCE',
        path: `fields.${field.fieldKey}.entityKey`,
        message: `Field references unknown entity: ${field.entityKey}`,
        severity: 'ERROR',
      });
    }
  }

  // 3. Reference checks
  const referenceKeys = new Set<string>();
  for (const ref of pkg.references) {
    if (referenceKeys.has(ref.referenceKey)) {
      findings.push({
        code: 'DUPLICATE_REFERENCE_KEY',
        path: `references.${ref.referenceKey}`,
        message: `Duplicate reference key: ${ref.referenceKey}`,
        severity: 'ERROR',
      });
    }
    referenceKeys.add(ref.referenceKey);

    if (ref.targetEntityKey && !entityKeys.has(ref.targetEntityKey)) {
      findings.push({
        code: 'MISSING_TARGET_ENTITY',
        path: `references.${ref.referenceKey}.targetEntityKey`,
        message: `Reference '${ref.referenceKey}' targets unknown entity '${ref.targetEntityKey}'`,
        severity: 'ERROR',
      });
    }

    if (options.registeredResolvers && ref.resolverKey && !options.registeredResolvers.includes(ref.resolverKey)) {
      findings.push({
        code: 'UNREGISTERED_RESOLVER',
        path: `references.${ref.referenceKey}.resolverKey`,
        message: `Reference '${ref.referenceKey}' uses unregistered resolver '${ref.resolverKey}'`,
        severity: 'ERROR',
      });
    }
  }

  for (const field of pkg.fields) {
    if (field.referenceKey && !referenceKeys.has(field.referenceKey)) {
      findings.push({
        code: 'MISSING_REFERENCE',
        path: `fields.${field.fieldKey}.referenceKey`,
        message: `Field '${field.fieldKey}' references missing reference '${field.referenceKey}'`,
        severity: 'ERROR',
      });
    }
  }

  // 4. Validation rules check
  const ruleKeys = new Set<string>();
  for (const rule of pkg.validationRules) {
    if (ruleKeys.has(rule.ruleKey)) {
      findings.push({
        code: 'DUPLICATE_RULE_KEY',
        path: `validationRules.${rule.ruleKey}`,
        message: `Duplicate validation rule key: ${rule.ruleKey}`,
        severity: 'ERROR',
      });
    }
    ruleKeys.add(rule.ruleKey);

    const depth = getExpressionDepth(rule.condition);
    if (depth > 10) {
      findings.push({
        code: 'EXPRESSION_TOO_DEEP',
        path: `validationRules.${rule.ruleKey}.condition`,
        message: `Validation expression depth (${depth}) exceeds maximum limit of 10`,
        severity: 'ERROR',
      });
    }
  }

  // 5. Actions check
  const actionKeys = new Set<string>();
  for (const action of pkg.actions) {
    if (actionKeys.has(action.actionKey)) {
      findings.push({
        code: 'DUPLICATE_ACTION_KEY',
        path: `actions.${action.actionKey}`,
        message: `Duplicate action key: ${action.actionKey}`,
        severity: 'ERROR',
      });
    }
    actionKeys.add(action.actionKey);

    if (
      options.registeredActionHandlers &&
      !options.registeredActionHandlers.includes(action.handlerKey)
    ) {
      findings.push({
        code: 'UNREGISTERED_ACTION_HANDLER',
        path: `actions.${action.actionKey}.handlerKey`,
        message: `Action '${action.actionKey}' uses unregistered handler '${action.handlerKey}'`,
        severity: 'ERROR',
      });
    }
  }

  // 6. Navigation cycle check
  const cycleKey = findNavigationCycle(pkg.navigation);
  if (cycleKey) {
    findings.push({
      code: 'NAVIGATION_CYCLE_DETECTED',
      path: `navigation.${cycleKey}`,
      message: `Cyclic navigation hierarchy detected involving item: ${cycleKey}`,
      severity: 'ERROR',
    });
  }

  // 7. Baseline locked field protection check
  if (options.baseline?.fields) {
    const baselineFieldMap = new Map(options.baseline.fields.map((f) => [f.fieldKey, f]));
    for (const field of pkg.fields) {
      const base = baselineFieldMap.get(field.fieldKey);
      if (base?.isSystemLocked) {
        if (field.type !== base.type) {
          findings.push({
            code: 'LOCKED_PROPERTY_MUTATION',
            path: `fields.${field.fieldKey}.type`,
            message: `Cannot alter type of system-locked field '${field.fieldKey}' (was ${base.type}, attempted ${field.type})`,
            severity: 'ERROR',
          });
        }
        if (field.classification !== base.classification) {
          findings.push({
            code: 'LOCKED_PROPERTY_MUTATION',
            path: `fields.${field.fieldKey}.classification`,
            message: `Cannot alter data classification of system-locked field '${field.fieldKey}'`,
            severity: 'ERROR',
          });
        }
      }
    }
  }

  if (findings.some((f) => f.severity === 'ERROR')) {
    return {
      valid: false,
      findings,
    };
  }

  // 8. Deterministic Canonical Ordering
  const sortedEntities: DictionaryEntityV1[] = [...pkg.entities].sort((a, b) =>
    a.entityKey.localeCompare(b.entityKey),
  );
  const sortedFields: DictionaryFieldV1[] = [...pkg.fields].sort((a, b) =>
    a.fieldKey.localeCompare(b.fieldKey),
  );
  const sortedRelationships: DictionaryRelationshipV1[] = [...pkg.relationships].sort((a, b) =>
    a.relationshipKey.localeCompare(b.relationshipKey),
  );
  const sortedReferences: DictionaryReferenceV1[] = [...pkg.references].sort((a, b) =>
    a.referenceKey.localeCompare(b.referenceKey),
  );
  const sortedValidationRules: DictionaryValidationRuleV1[] = [...pkg.validationRules].sort((a, b) =>
    a.ruleKey.localeCompare(b.ruleKey),
  );
  const sortedViews: DictionaryViewV1[] = [...pkg.views].sort((a, b) =>
    a.viewKey.localeCompare(b.viewKey),
  );
  const sortedNavigation: DictionaryNavigationItemV1[] = [...pkg.navigation].sort((a, b) =>
    a.position !== b.position ? a.position - b.position : a.itemKey.localeCompare(b.itemKey),
  );
  const sortedActions: DictionaryActionV1[] = [...pkg.actions].sort((a, b) =>
    a.actionKey.localeCompare(b.actionKey),
  );
  const sortedMessages: DictionaryMessageV1[] = [...pkg.messages].sort((a, b) =>
    a.locale !== b.locale ? a.locale.localeCompare(b.locale) : a.messageKey.localeCompare(b.messageKey),
  );

  const normalizedPayload = {
    manifestVersion: 1 as const,
    packageKey: pkg.packageKey,
    ...(options.tenantId ? { tenantId: options.tenantId } : {}),
    ...(options.publishedVersionId ? { publishedVersionId: options.publishedVersionId } : {}),
    entities: sortedEntities,
    fields: sortedFields,
    relationships: sortedRelationships,
    references: sortedReferences,
    validationRules: sortedValidationRules,
    views: sortedViews,
    navigation: sortedNavigation,
    actions: sortedActions,
    messages: sortedMessages,
  };

  const canonical = canonicalJson(normalizedPayload);
  const checksum = `sha256:${createHash('sha256').update(canonical).digest('hex')}`;

  const manifest: CompiledDictionaryManifestV1 = {
    ...normalizedPayload,
    compiledAt: new Date().toISOString(),
    checksum,
  };

  return {
    valid: true,
    findings,
    manifest,
  };
}

/**
 * Classifies impact when comparing a previously published package against a new candidate.
 */
export function classifyDictionaryImpact(
  previous: DictionaryPackageDefinitionV1,
  next: DictionaryPackageDefinitionV1,
): {
  classification: 'COMPATIBLE' | 'CONDITIONAL' | 'BREAKING';
  changes: Array<{ key: string; kind: string; message: string; severity: 'SAFE' | 'CONDITIONAL' | 'BREAKING' }>;
} {
  const changes: Array<{ key: string; kind: string; message: string; severity: 'SAFE' | 'CONDITIONAL' | 'BREAKING' }> = [];

  const prevFieldMap = new Map(previous.fields.map((f) => [f.fieldKey, f]));
  const nextFieldMap = new Map(next.fields.map((f) => [f.fieldKey, f]));

  // 1. Removed fields
  for (const [key] of prevFieldMap) {
    if (!nextFieldMap.has(key)) {
      changes.push({
        key,
        kind: 'FIELD_REMOVED',
        message: `Field '${key}' was removed from dictionary package`,
        severity: 'BREAKING',
      });
    }
  }

  // 2. Modified fields
  for (const [key, nextField] of nextFieldMap) {
    const prevField = prevFieldMap.get(key);
    if (!prevField) {
      if (nextField.required && nextField.defaultValue === undefined) {
        changes.push({
          key,
          kind: 'REQUIRED_FIELD_ADDED_WITHOUT_DEFAULT',
          message: `Required field '${key}' was added without a default value`,
          severity: 'BREAKING',
        });
      } else {
        changes.push({
          key,
          kind: 'FIELD_ADDED',
          message: `Field '${key}' added`,
          severity: 'SAFE',
        });
      }
      continue;
    }

    if (prevField.type !== nextField.type) {
      changes.push({
        key,
        kind: 'FIELD_TYPE_CHANGED',
        message: `Field '${key}' type changed from ${prevField.type} to ${nextField.type}`,
        severity: 'BREAKING',
      });
    }

    if (!prevField.required && nextField.required) {
      changes.push({
        key,
        kind: 'FIELD_MADE_REQUIRED',
        message: `Optional field '${key}' is now required`,
        severity: 'CONDITIONAL',
      });
    }
  }

  let classification: 'COMPATIBLE' | 'CONDITIONAL' | 'BREAKING' = 'COMPATIBLE';
  if (changes.some((c) => c.severity === 'BREAKING')) {
    classification = 'BREAKING';
  } else if (changes.some((c) => c.severity === 'CONDITIONAL')) {
    classification = 'CONDITIONAL';
  }

  return {
    classification,
    changes,
  };
}
