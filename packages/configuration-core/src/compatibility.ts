import type {
  ConfigurationDefinition,
  ConfigurationField,
  ConfigurationImpactChange,
  ConfigurationImpactReport,
} from '@gigalibs/contracts';

/**
 * Compare two validated configuration definitions using the compatibility
 * policy in ADR-0002. Record-aware checks remain in the owning service because
 * only it can determine whether a removed option is in use.
 */
export function compareConfigurationDefinitions(
  baseline: ConfigurationDefinition | undefined,
  target: ConfigurationDefinition,
): ConfigurationImpactChange[] {
  if (!baseline) {
    return target.fields.map((field) => ({
      fieldKey: field.key,
      kind: 'FIELD_ADDED',
      severity: 'SAFE',
      message: `Field ${field.label} is introduced on a new surface.`,
    }));
  }

  const changes: ConfigurationImpactChange[] = [];
  const previousFields = new Map(baseline.fields.map((field) => [field.key, field]));
  const nextFields = new Map(target.fields.map((field) => [field.key, field]));

  for (const field of baseline.fields) {
    const next = nextFields.get(field.key);
    if (!next) {
      changes.push({
        fieldKey: field.key,
        kind: 'FIELD_REMOVED',
        severity: 'BREAKING',
        message: `Field ${field.label} is removed.`,
      });
      continue;
    }
    if (next.type !== field.type) {
      changes.push({
        fieldKey: field.key,
        kind: 'TYPE_CHANGED',
        severity: 'BREAKING',
        message: `Field ${field.label} changes from ${field.type} to ${next.type}.`,
      });
      continue;
    }
    if (!field.required && next.required) {
      changes.push({
        fieldKey: field.key,
        kind: 'REQUIRED_ADDED',
        severity: 'CONDITIONAL',
        message: `Field ${field.label} becomes required and needs an explicit data checkpoint.`,
      });
    }
    if (field.required && !next.required) {
      changes.push({
        fieldKey: field.key,
        kind: 'REQUIRED_REMOVED',
        severity: 'BREAKING',
        message: `Field ${field.label} is no longer required, relaxing a published invariant.`,
      });
    }

    const removedOptions = (field.options ?? []).filter(
      (option) => !(next.options ?? []).some((candidate) => candidate.value === option.value),
    );
    if (removedOptions.length > 0) {
      changes.push({
        fieldKey: field.key,
        kind: 'OPTIONS_REMOVED',
        severity: 'CONDITIONAL',
        message: `${removedOptions.length} allowed option value(s) are removed from ${field.label}.`,
      });
    }

    if (constraintsTightened(field, next)) {
      changes.push({
        fieldKey: field.key,
        kind: 'CONSTRAINT_TIGHTENED',
        severity: 'CONDITIONAL',
        message: `Validation constraints are tightened for ${field.label}.`,
      });
    }
    if (constraintsRelaxed(field, next)) {
      changes.push({
        fieldKey: field.key,
        kind: 'CONSTRAINT_RELAXED',
        severity: 'BREAKING',
        message: `Validation constraints are relaxed for ${field.label}.`,
      });
    }

    const authority = compareFieldAuthority(field, next);
    if (authority === 'REDUCED') {
      changes.push({
        fieldKey: field.key,
        kind: 'PERMISSION_REDUCED',
        severity: 'CONDITIONAL',
        message: `Access to ${field.label} is reduced and needs an explicit authorization checkpoint.`,
      });
    }
    if (authority === 'BROADENED') {
      changes.push({
        fieldKey: field.key,
        kind: 'PERMISSION_BROADENED',
        severity: 'BREAKING',
        message: `Access to ${field.label} is broadened or cannot be proven monotonic.`,
      });
    }
  }

  for (const field of target.fields) {
    if (!previousFields.has(field.key)) {
      changes.push({
        fieldKey: field.key,
        kind: 'FIELD_ADDED',
        severity: field.required ? 'CONDITIONAL' : 'SAFE',
        message: `Field ${field.label} is added${field.required ? ' and requires a data checkpoint' : ''}.`,
      });
    }
  }

  if (!sameJson(baseline.listView, target.listView)) {
    changes.push({
      fieldKey: 'list-view',
      kind: 'PROJECTION_CHANGED',
      severity: 'CONDITIONAL',
      message: 'The list projection changes and requires an explicit projection checkpoint.',
    });
  }

  return changes;
}

export function classifyConfigurationImpact(
  changes: ConfigurationImpactChange[],
): ConfigurationImpactReport['classification'] {
  if (changes.some((change) => change.severity === 'BREAKING')) return 'BREAKING';
  if (changes.some((change) => change.severity === 'CONDITIONAL')) return 'CONDITIONAL';
  return 'COMPATIBLE';
}

function constraintsTightened(previous: ConfigurationField, next: ConfigurationField): boolean {
  return [
    lowerBoundTightened(previous.minimum, next.minimum),
    upperBoundTightened(previous.maximum, next.maximum),
    lowerBoundTightened(previous.minLength, next.minLength),
    upperBoundTightened(previous.maxLength, next.maxLength),
    previous.patternKey === undefined && next.patternKey !== undefined,
  ].some(Boolean);
}

function constraintsRelaxed(previous: ConfigurationField, next: ConfigurationField): boolean {
  return [
    lowerBoundRelaxed(previous.minimum, next.minimum),
    upperBoundRelaxed(previous.maximum, next.maximum),
    lowerBoundRelaxed(previous.minLength, next.minLength),
    upperBoundRelaxed(previous.maxLength, next.maxLength),
    previous.patternKey !== undefined && next.patternKey === undefined,
    previous.patternKey !== undefined &&
      next.patternKey !== undefined &&
      previous.patternKey !== next.patternKey,
  ].some(Boolean);
}

function lowerBoundTightened(previous: number | undefined, next: number | undefined): boolean {
  return next !== undefined && (previous === undefined || next > previous);
}

function lowerBoundRelaxed(previous: number | undefined, next: number | undefined): boolean {
  return previous !== undefined && (next === undefined || next < previous);
}

function upperBoundTightened(previous: number | undefined, next: number | undefined): boolean {
  return next !== undefined && (previous === undefined || next < previous);
}

function upperBoundRelaxed(previous: number | undefined, next: number | undefined): boolean {
  return previous !== undefined && (next === undefined || next > previous);
}

function compareFieldAuthority(
  previous: ConfigurationField,
  next: ConfigurationField,
): 'UNCHANGED' | 'REDUCED' | 'BROADENED' {
  const permissionTransitions = [
    comparePermission(previous.readPermission, next.readPermission),
    comparePermission(previous.writePermission, next.writePermission),
  ];
  const classificationOrder = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;
  const previousClassification = classificationOrder.indexOf(previous.classification);
  const nextClassification = classificationOrder.indexOf(next.classification);
  const readOnlyTransition =
    previous.readOnly === next.readOnly ? 'UNCHANGED' : next.readOnly ? 'REDUCED' : 'BROADENED';

  if (
    permissionTransitions.includes('BROADENED') ||
    readOnlyTransition === 'BROADENED' ||
    nextClassification < previousClassification
  ) {
    return 'BROADENED';
  }
  if (
    permissionTransitions.includes('REDUCED') ||
    readOnlyTransition === 'REDUCED' ||
    nextClassification > previousClassification
  ) {
    return 'REDUCED';
  }
  return 'UNCHANGED';
}

function comparePermission(
  previous: string | undefined,
  next: string | undefined,
): 'UNCHANGED' | 'REDUCED' | 'BROADENED' {
  if (previous === next) return 'UNCHANGED';
  if (previous === undefined && next !== undefined) return 'REDUCED';
  return 'BROADENED';
}

function sameJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameJson(item, right[index]))
    );
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && sameJson(leftRecord[key], rightRecord[key]),
    )
  );
}
