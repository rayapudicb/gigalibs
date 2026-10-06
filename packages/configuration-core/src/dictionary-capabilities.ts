import {
  DICTIONARY_EXECUTABLE_CAPABILITIES,
  permissionParts,
  type DictionaryPackageDefinitionV1,
  type DictionaryValidationExpression,
} from '@gigalibs/contracts';
import type { ConfigurationFinding } from './index.js';

// WI-OI-120f (F0.1): a dictionary package may publish only what the metadata window executes, and every view, tab,
// placement, rule and action must point at something that exists (ADR-0033 D1; metadata investigation M-01). Anything
// else is refused at publish time, never published and silently ignored.

const capabilities = DICTIONARY_EXECUTABLE_CAPABILITIES;
const MAX_REGEX_LENGTH = 200;
const VALUELESS_OPERATORS = new Set(['IS_NULL', 'IS_NOT_NULL']);
const LIST_OPERATORS = new Set(['IN', 'NOT_IN']);

function error(code: string, path: string, message: string): ConfigurationFinding {
  return { code, path, message, severity: 'ERROR' };
}

/**
 * WI-OI-120q (R1): a permission a window names must be a permission code. Anything else would match nobody, not even
 * `*`, and hide the field or action from everyone.
 */
function permissionFindings(permission: string | undefined, path: string): ConfigurationFinding[] {
  if (permission === undefined || permission === '*' || permissionParts(permission)) return [];
  return [error('PERMISSION_INVALID', path, `${permission} is not a permission code such as finance:journals:post or cmms.work-orders.read.`)];
}

/** Checks one expression tree: every leaf names a known field and a usable operator and value. */
export function expressionFindings(
  expression: DictionaryValidationExpression,
  knownFields: ReadonlySet<string>,
  path: string,
  depth = 1,
): ConfigurationFinding[] {
  if (depth > 10) return [error('EXPRESSION_TOO_DEEP', path, 'Expression nesting exceeds the maximum depth of 10.')];
  const groups = [expression.all, expression.any].filter((group) => group !== undefined);
  const branches = groups.length + (expression.not ? 1 : 0);
  const isLeaf = expression.field !== undefined || expression.operator !== undefined;
  if (branches + (isLeaf ? 1 : 0) !== 1) {
    return [error('EXPRESSION_AMBIGUOUS', path, 'An expression is exactly one of: a comparison, all, any or not.')];
  }
  if (expression.all) {
    if (expression.all.length === 0) return [error('EXPRESSION_EMPTY_GROUP', `${path}.all`, '"all" needs at least one condition.')];
    return expression.all.flatMap((child, index) => expressionFindings(child, knownFields, `${path}.all.${index}`, depth + 1));
  }
  if (expression.any) {
    if (expression.any.length === 0) return [error('EXPRESSION_EMPTY_GROUP', `${path}.any`, '"any" needs at least one condition.')];
    return expression.any.flatMap((child, index) => expressionFindings(child, knownFields, `${path}.any.${index}`, depth + 1));
  }
  if (expression.not) return expressionFindings(expression.not, knownFields, `${path}.not`, depth + 1);

  const findings: ConfigurationFinding[] = [];
  if (!expression.field || !expression.operator) {
    return [error('EXPRESSION_INCOMPLETE', path, 'A comparison needs both a field and an operator.')];
  }
  if (!knownFields.has(expression.field)) {
    findings.push(error('EXPRESSION_UNKNOWN_FIELD', `${path}.field`, `Unknown field '${expression.field}'.`));
  }
  if (VALUELESS_OPERATORS.has(expression.operator)) return findings;
  if (expression.value === undefined) {
    findings.push(error('EXPRESSION_VALUE_REQUIRED', `${path}.value`, `Operator ${expression.operator} needs a value.`));
  } else if (LIST_OPERATORS.has(expression.operator) && !Array.isArray(expression.value)) {
    findings.push(error('EXPRESSION_LIST_REQUIRED', `${path}.value`, `Operator ${expression.operator} needs a list.`));
  } else if (expression.operator === 'MATCHES_REGEX') {
    if (typeof expression.value !== 'string' || expression.value.length > MAX_REGEX_LENGTH) {
      findings.push(error('EXPRESSION_REGEX_INVALID', `${path}.value`, `A pattern is text of at most ${MAX_REGEX_LENGTH} characters.`));
    } else {
      try {
        new RegExp(expression.value);
      } catch {
        findings.push(error('EXPRESSION_REGEX_INVALID', `${path}.value`, 'The pattern is not a valid regular expression.'));
      }
    }
  }
  return findings;
}

/**
 * Everything in the package that the window cannot execute, or that points at nothing. `baselineEntityKeys` and
 * `baselineFieldKeys` are the module's own entities and fields, which a tenant package may extend.
 */
export function executableCapabilityFindings(
  pkg: DictionaryPackageDefinitionV1,
  baseline: Pick<DictionaryPackageDefinitionV1, 'entities' | 'fields' | 'relationships'> | undefined,
): ConfigurationFinding[] {
  const findings: ConfigurationFinding[] = [];
  const entities = new Set([...(baseline?.entities ?? []), ...pkg.entities].map((entity) => entity.entityKey));
  const allFields = [...(baseline?.fields ?? []), ...pkg.fields];
  const fieldsByEntity = new Map<string, Set<string>>();
  for (const field of allFields) {
    if (!fieldsByEntity.has(field.entityKey)) fieldsByEntity.set(field.entityKey, new Set());
    fieldsByEntity.get(field.entityKey)!.add(field.fieldKey);
  }
  const everyFieldKey = new Set(allFields.map((field) => field.fieldKey));
  const relationships = new Map(
    [...(baseline?.relationships ?? []), ...pkg.relationships].map((relationship) => [relationship.relationshipKey, relationship]),
  );
  const references = new Map(pkg.references.map((reference) => [reference.referenceKey, reference]));

  for (const field of pkg.fields) {
    const path = `fields.${field.fieldKey}`;
    findings.push(...permissionFindings(field.readPermission, `${path}.readPermission`));
    findings.push(...permissionFindings(field.writePermission, `${path}.writePermission`));
    if (!(capabilities.fieldTypes as readonly string[]).includes(field.type)) {
      findings.push(error('UNSUPPORTED_FIELD_TYPE', `${path}.type`, `Field type ${field.type} is not executed by the metadata window.`));
    }
    if (field.scale !== undefined && !(capabilities.exactDecimalTypes as readonly string[]).includes(field.type)) {
      findings.push(error('SCALE_NOT_ALLOWED', `${path}.scale`, `Only NUMBER and CURRENCY fields have a scale.`));
    }
    if ((field.type === 'SELECT' || field.type === 'REFERENCE') && !field.referenceKey) {
      findings.push(error('REFERENCE_REQUIRED', `${path}.referenceKey`, `A ${field.type} field needs a reference.`));
    }
    const reference = field.referenceKey ? references.get(field.referenceKey) : undefined;
    if (field.type === 'REFERENCE' && reference && reference.referenceType === 'VALUE_LIST') {
      findings.push(error('REFERENCE_NEEDS_LOOKUP', `${path}.referenceKey`, 'A REFERENCE field needs a lookup reference; use SELECT for a value list.'));
    }
  }

  for (const reference of pkg.references) {
    const path = `references.${reference.referenceKey}`;
    if (!(capabilities.referenceTypes as readonly string[]).includes(reference.referenceType)) {
      findings.push(error('UNSUPPORTED_REFERENCE_TYPE', `${path}.referenceType`, `Reference type ${reference.referenceType} is not executed.`));
    }
    if (reference.referenceType === 'VALUE_LIST' && !reference.staticValues?.length) {
      findings.push(error('VALUE_LIST_EMPTY', `${path}.staticValues`, 'A value list needs at least one value.'));
    }
    if (reference.referenceType !== 'VALUE_LIST' && !reference.resolverKey) {
      findings.push(error('RESOLVER_REQUIRED', `${path}.resolverKey`, 'A lookup reference needs a registered resolver.'));
    }
  }

  for (const rule of pkg.validationRules) {
    findings.push(...expressionFindings(rule.condition, everyFieldKey, `validationRules.${rule.ruleKey}.condition`));
  }

  for (const item of pkg.navigation) {
    (item.requiredPermissions ?? []).forEach((permission, index) =>
      findings.push(...permissionFindings(permission, `navigation.${item.itemKey}.requiredPermissions.${index}`)),
    );
  }

  for (const action of pkg.actions) {
    const path = `actions.${action.actionKey}`;
    action.requiredPermissions.forEach((permission, index) => findings.push(...permissionFindings(permission, `${path}.requiredPermissions.${index}`)));
    if (!(capabilities.actionTypes as readonly string[]).includes(action.type)) {
      findings.push(error('UNSUPPORTED_ACTION_TYPE', `${path}.type`, `Action type ${action.type} is not executed yet.`));
    }
    if (action.visibilityCondition) {
      findings.push(...expressionFindings(action.visibilityCondition, everyFieldKey, `${path}.visibilityCondition`));
    }
  }

  for (const view of pkg.views) {
    const viewPath = `views.${view.viewKey}`;
    if (!(capabilities.viewModes as readonly string[]).includes(view.mode)) {
      findings.push(error('UNSUPPORTED_VIEW_MODE', `${viewPath}.mode`, `View mode ${view.mode} is not executed.`));
    }
    const rootTabs = view.tabs.filter((tab) => tab.level === 0);
    if (rootTabs.length === 0) {
      findings.push(error('ROOT_TAB_REQUIRED', `${viewPath}.tabs`, 'A view needs a level-0 tab for its main record.'));
    }
    const rootEntity = rootTabs[0]?.targetEntityKey;
    const rootFields = rootEntity ? (fieldsByEntity.get(rootEntity) ?? new Set<string>()) : new Set<string>();
    for (const key of [...(view.searchFields ?? []), ...(view.filterFields ?? []), ...(view.defaultSortField ? [view.defaultSortField] : [])]) {
      if (!rootFields.has(key)) {
        findings.push(error('VIEW_FIELD_NOT_ON_ENTITY', viewPath, `Search, filter or sort field '${key}' is not a field of ${rootEntity ?? 'the main entity'}.`));
      }
    }
    for (const tab of view.tabs) {
      const tabPath = `${viewPath}.tabs.${tab.tabKey}`;
      if (!entities.has(tab.targetEntityKey)) {
        findings.push(error('MISSING_TAB_ENTITY', `${tabPath}.targetEntityKey`, `Tab targets unknown entity '${tab.targetEntityKey}'.`));
      }
      if (tab.level > 0) {
        const relationship = tab.parentRelationshipKey ? relationships.get(tab.parentRelationshipKey) : undefined;
        if (!relationship) {
          findings.push(error('CHILD_TAB_RELATIONSHIP_REQUIRED', `${tabPath}.parentRelationshipKey`, 'A child tab needs a declared parent relationship.'));
        } else if (relationship.targetEntityKey !== tab.targetEntityKey || relationship.type !== 'ONE_TO_MANY') {
          findings.push(error('CHILD_TAB_RELATIONSHIP_MISMATCH', `${tabPath}.parentRelationshipKey`, `Relationship '${relationship.relationshipKey}' must be ONE_TO_MANY to ${tab.targetEntityKey}.`));
        }
      }
      const tabFields = fieldsByEntity.get(tab.targetEntityKey) ?? new Set<string>();
      const sections = new Set(tab.sections.map((section) => section.sectionKey));
      if (tab.visibilityCondition) findings.push(...expressionFindings(tab.visibilityCondition, everyFieldKey, `${tabPath}.visibilityCondition`));
      for (const placement of tab.fields) {
        const placementPath = `${tabPath}.fields.${placement.fieldKey}`;
        if (!tabFields.has(placement.fieldKey)) {
          findings.push(error('FIELD_NOT_ON_TAB_ENTITY', placementPath, `Field '${placement.fieldKey}' is not a field of ${tab.targetEntityKey}.`));
        }
        if (placement.sectionKey && !sections.has(placement.sectionKey)) {
          findings.push(error('MISSING_SECTION', `${placementPath}.sectionKey`, `Section '${placement.sectionKey}' is not declared on the tab.`));
        }
        if (!(capabilities.componentKeys as readonly string[]).includes(placement.componentKey)) {
          findings.push(error('UNSUPPORTED_COMPONENT', `${placementPath}.componentKey`, `Component '${placement.componentKey}' is not executed.`));
        }
        for (const [name, condition] of [
          ['visibilityCondition', placement.visibilityCondition],
          ['readOnlyCondition', placement.readOnlyCondition],
          ['requiredCondition', placement.requiredCondition],
        ] as const) {
          if (condition) findings.push(...expressionFindings(condition, tabFields, `${placementPath}.${name}`));
        }
      }
    }
  }
  return findings;
}
