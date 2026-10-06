import {
  DICTIONARY_EXECUTABLE_CAPABILITIES,
  holdsPermission,
  moduleWindowBaselines,
  type DictionaryFieldPlacementV1,
  type DictionaryFieldV1,
  type DictionaryValidationExpression,
  type DictionaryValidationRuleV1,
  type DictionaryViewV1,
} from '@gigalibs/contracts';
import { evaluateDictionaryCondition } from './dictionary-evaluator.js';

// WI-OI-120r (S1): one set of field rules per record type, used by the window on screen and by the record dispatcher
// on the server, so the two cannot disagree. A window may say when a field is shown, locked or required, give it a
// default, and add validation rules; what the screen would prevent, the server refuses with the same message.

/** Computed defaults, written `{ "$default": "TODAY" }` (DICTIONARY_EXECUTABLE_CAPABILITIES.defaultTokens). */
export type DefaultValueToken = keyof typeof DICTIONARY_EXECUTABLE_CAPABILITIES.defaultTokens;
export const DEFAULT_VALUE_TOKENS = Object.keys(DICTIONARY_EXECUTABLE_CAPABILITIES.defaultTokens) as readonly DefaultValueToken[];

/** The token of a computed default, `undefined` for a fixed default, or `null` for an object that is no token. */
export function defaultValueToken(value: unknown): DefaultValueToken | null | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const keys = Object.keys(value);
  const token = (value as Record<string, unknown>)['$default'];
  return keys.length === 1 && (DEFAULT_VALUE_TOKENS as readonly unknown[]).includes(token) ? (token as DefaultValueToken) : null;
}

/** Field types each token can fill. A fixed default must suit its field (checked at publish). */
export const DEFAULT_TOKEN_FIELD_TYPES: Readonly<Record<DefaultValueToken, readonly DictionaryFieldV1['type'][]>> =
  DICTIONARY_EXECUTABLE_CAPABILITIES.defaultTokens;

export interface DictionaryRuleSource {
  readonly fields: readonly DictionaryFieldV1[];
  readonly validationRules: readonly DictionaryValidationRuleV1[];
  readonly views: readonly DictionaryViewV1[];
}

type PlacementRules = Pick<DictionaryFieldPlacementV1, 'visibilityCondition' | 'readOnlyCondition' | 'requiredCondition'>;

export interface FieldRule extends PlacementRules {
  readonly fieldKey: string;
  readonly label: string;
  readonly type: DictionaryFieldV1['type'];
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly readPermission?: string;
  readonly writePermission?: string;
  readonly defaultValue?: unknown;
}

export interface EntityRules {
  readonly entityKey: string;
  readonly fields: ReadonlyMap<string, FieldRule>;
  /** ERROR rules refuse a change; WARNING and INFO rules are reported only. */
  readonly validationRules: readonly DictionaryValidationRuleV1[];
}

export type RecordValues = Readonly<Record<string, unknown>>;

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

/** Every field a condition reads. */
export function conditionFields(expression: DictionaryValidationExpression | undefined, into = new Set<string>()): Set<string> {
  if (!expression) return into;
  if (expression.field) into.add(expression.field);
  for (const child of [...(expression.all ?? []), ...(expression.any ?? []), ...(expression.not ? [expression.not] : [])])
    conditionFields(child, into);
  return into;
}

/**
 * The rules of each record type across a module's windows (or one published window). A field must have the same rules
 * wherever it is placed, and a validation rule must read fields of one record type that some window shows; anything
 * else is a conflict, which the module's start-up and the manifest tests refuse. A field no window shows has no rules.
 */
export function entityRules(sources: readonly DictionaryRuleSource[]): { rules: Map<string, EntityRules>; conflicts: string[] } {
  const conflicts: string[] = [];
  const fields = new Map<string, Map<string, FieldRule>>();
  const ruleSets = new Map<string, Map<string, DictionaryValidationRuleV1>>();
  const placed = new Map<string, PlacementRules>();

  // A window's rules for a field count only where that window places the field: a field it declares but never shows
  // (for example the parent link of a child tab, which the window fills itself) imposes nothing there.
  for (const source of sources) {
    const shownHere = new Set(
      source.views.flatMap((candidate) => candidate.tabs.flatMap((tab) => tab.fields.map((placement) => `${tab.targetEntityKey}/${placement.fieldKey}`))),
    );
    for (const field of source.fields) {
      if (!shownHere.has(`${field.entityKey}/${field.fieldKey}`)) continue;
      const byKey = fields.get(field.entityKey) ?? fields.set(field.entityKey, new Map()).get(field.entityKey)!;
      const rule: FieldRule = {
        fieldKey: field.fieldKey,
        label: field.label,
        type: field.type,
        required: field.required ?? false,
        readOnly: field.readOnly ?? false,
        ...(field.readPermission ? { readPermission: field.readPermission } : {}),
        ...(field.writePermission ? { writePermission: field.writePermission } : {}),
        ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
      };
      const existing = byKey.get(field.fieldKey);
      if (!existing) byKey.set(field.fieldKey, rule);
      else if (!same({ ...existing, label: '' }, { ...rule, label: '' }))
        conflicts.push(`${field.entityKey}.${field.fieldKey}: declared with different rules in two windows`);
    }
  }
  for (const source of sources) {
    for (const view of source.views)
      for (const tab of view.tabs)
        for (const placement of tab.fields) {
          const key = `${tab.targetEntityKey}/${placement.fieldKey}`;
          const rules: PlacementRules = {
            ...(placement.visibilityCondition ? { visibilityCondition: placement.visibilityCondition } : {}),
            ...(placement.readOnlyCondition ? { readOnlyCondition: placement.readOnlyCondition } : {}),
            ...(placement.requiredCondition ? { requiredCondition: placement.requiredCondition } : {}),
          };
          const existing = placed.get(key);
          if (!existing) placed.set(key, rules);
          else if (!same(existing, rules))
            conflicts.push(`${tab.targetEntityKey}.${placement.fieldKey}: shown, locked or required by different rules in two places`);
        }
    for (const rule of source.validationRules) {
      const read = [...conditionFields(rule.condition)];
      const owners = [...fields.entries()].filter(([, byKey]) => read.length > 0 && read.every((fieldKey) => byKey.has(fieldKey)));
      if (owners.length !== 1) {
        conflicts.push(`validation rule ${rule.ruleKey}: must read the fields of exactly one record type`);
        continue;
      }
      const entityKey = owners[0]![0];
      const byKey = ruleSets.get(entityKey) ?? ruleSets.set(entityKey, new Map()).get(entityKey)!;
      const existing = byKey.get(rule.ruleKey);
      if (!existing) byKey.set(rule.ruleKey, rule);
      else if (!same(existing, rule)) conflicts.push(`validation rule ${rule.ruleKey}: declared differently in two windows`);
    }
  }

  const rules = new Map<string, EntityRules>();
  for (const [entityKey, byKey] of fields) {
    const merged = new Map<string, FieldRule>();
    for (const [fieldKey, rule] of byKey) merged.set(fieldKey, { ...rule, ...(placed.get(`${entityKey}/${fieldKey}`) ?? {}) });
    rules.set(entityKey, { entityKey, fields: merged, validationRules: [...(ruleSets.get(entityKey)?.values() ?? [])] });
  }
  return { rules, conflicts };
}

export interface DefaultContext {
  /** The signed-in user's id, for `CURRENT_USER`. */
  readonly userId: string;
  readonly now: Date;
}

/** The value a default gives now, or undefined when the field has none. `TODAY` is the UTC date on the server. */
export function resolveDefault(rule: FieldRule, context: DefaultContext): unknown {
  if (rule.defaultValue === undefined) return undefined;
  const token = defaultValueToken(rule.defaultValue);
  if (token === undefined) return rule.defaultValue;
  if (token === 'TODAY') return context.now.toISOString().slice(0, 10);
  if (token === 'NOW') return context.now.toISOString();
  if (token === 'CURRENT_USER') return context.userId;
  return undefined;
}

/** The defaults for a new record: every field with a default that the values leave out. */
export function defaultsFor(rules: EntityRules, values: RecordValues, context: DefaultContext): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const rule of rules.fields.values()) {
    if (values[rule.fieldKey] !== undefined) continue;
    const value = resolveDefault(rule, context);
    if (value !== undefined) defaults[rule.fieldKey] = value;
  }
  return defaults;
}

export interface RecordCheck {
  /** Refusals by field: the screen shows each under its field. */
  readonly errors: Record<string, string>;
  /** WARNING and INFO rules that failed; reported, never refused. */
  readonly warnings: Record<string, string>;
}

/**
 * Checks a new record or a change as the window would. `current` is the stored record (for a new record, its
 * defaults); `changes` are the values sent. On a change, a field already empty in stored data is required only when
 * this change touches it or makes it required, and a validation rule is checked when the change touches a field it
 * reads, so records saved before a rule existed can still be edited.
 */
export function checkRecord(
  rules: EntityRules,
  input: { readonly mode: 'CREATE' | 'UPDATE'; readonly current: RecordValues; readonly changes: RecordValues; readonly permissions: readonly string[] },
): RecordCheck {
  const { mode, current, changes, permissions } = input;
  const creating = mode === 'CREATE';
  const after: Record<string, unknown> = { ...current, ...changes };
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const touched = (fieldKey: string) => fieldKey in changes && !same(changes[fieldKey], current[fieldKey]);

  for (const rule of rules.fields.values()) {
    if (rule.readPermission && !holdsPermission(permissions, rule.readPermission)) continue;
    const shown = !rule.visibilityCondition || evaluateDictionaryCondition(rule.visibilityCondition, after);
    const locked = rule.readOnly || (rule.readOnlyCondition ? evaluateDictionaryCondition(rule.readOnlyCondition, after) : false);
    const writable = !locked && (!rule.writePermission || holdsPermission(permissions, rule.writePermission));
    if (touched(rule.fieldKey)) {
      if (!shown) errors[rule.fieldKey] = `${rule.label} does not apply here and cannot be set.`;
      else if (!writable) errors[rule.fieldKey] = `${rule.label} cannot be changed.`;
      if (errors[rule.fieldKey]) continue;
    }
    if (!shown || !writable || rule.type === 'BOOLEAN') continue;
    const requiredByRule = rule.requiredCondition ? evaluateDictionaryCondition(rule.requiredCondition, after) : false;
    if (!(rule.required || requiredByRule) || !isEmpty(after[rule.fieldKey])) continue;
    const becameRequired =
      requiredByRule && !rule.required && !evaluateDictionaryCondition(rule.requiredCondition!, current);
    if (creating || touched(rule.fieldKey) || becameRequired) errors[rule.fieldKey] = `${rule.label} is required.`;
  }

  for (const rule of rules.validationRules) {
    const read = conditionFields(rule.condition);
    if (!creating && ![...read].some((fieldKey) => touched(fieldKey))) continue;
    if (evaluateDictionaryCondition(rule.condition, after)) continue;
    const fieldKey = rule.condition.field ?? rule.ruleKey;
    const into = (rule.severity ?? 'ERROR') === 'ERROR' ? errors : warnings;
    into[fieldKey] ??= rule.errorMessage;
  }
  return { errors, warnings };
}

/**
 * The field rules a module's record dispatcher enforces, from the windows the module ships. Conflicting windows stop
 * the module at start-up rather than enforce one of two rule sets. A record type no window shows has no rules.
 */
export function moduleRecordRules(
  sources: readonly DictionaryRuleSource[],
  moduleKey: string,
  clock: () => Date = () => new Date(),
): {
  defaults(entityKey: string, values: RecordValues, principal: { readonly subject: string }): Record<string, unknown>;
  check(
    entityKey: string,
    input: { readonly mode: 'CREATE' | 'UPDATE'; readonly current: RecordValues; readonly changes: RecordValues; readonly permissions: readonly string[] },
  ): RecordCheck;
} {
  const { rules, conflicts } = entityRules(sources);
  if (conflicts.length > 0) throw new Error(`${moduleKey} windows give conflicting field rules: ${conflicts.join('; ')}`);
  return {
    defaults: (entityKey, values, principal) => {
      const entity = rules.get(entityKey);
      return entity ? defaultsFor(entity, values, { userId: principal.subject, now: clock() }) : {};
    },
    check: (entityKey, input) => {
      const entity = rules.get(entityKey);
      return entity ? checkRecord(entity, input) : { errors: {}, warnings: {} };
    },
  };
}

/** The field rules of the windows a module ships (`modules/<module>/dictionary/*.window.json`). */
export function shippedRecordRules(moduleKey: string): ReturnType<typeof moduleRecordRules> {
  const sources = moduleWindowBaselines()
    .filter((baseline) => baseline.definition.moduleKey === moduleKey)
    .map((baseline) => baseline.definition.dictionary);
  return moduleRecordRules(sources, moduleKey);
}
