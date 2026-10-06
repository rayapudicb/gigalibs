import type {
  CompiledDictionaryManifestV1,
  DictionaryActionV1,
  DictionaryFieldPlacementV1,
  DictionaryFieldV1,
  DictionaryTabV1,
  DictionaryViewV1,
} from '@gigalibs/contracts';
import { holdsPermission } from '@gigalibs/contracts';
import {
  evaluateDictionaryCondition,
  parseExactDecimal,
  validateDictionaryRules,
} from '@gigalibs/configuration-core/dictionary-evaluator';

// WI-OI-120f (F0.4, ADR-0033 D1): the logic of a metadata window, kept free of React so every rule is unit-tested:
// which view and tabs to draw, which fields a user may see or change, which actions apply to a record, how child
// tabs find their records, how values travel (exact decimals as strings), and how API failures become screen states.

export type RecordValues = Readonly<Record<string, unknown>>;

export interface WindowModel {
  readonly manifest: CompiledDictionaryManifestV1;
  readonly view: DictionaryViewV1;
  readonly rootTab: DictionaryTabV1;
  readonly childTabs: readonly DictionaryTabV1[];
  readonly fields: ReadonlyMap<string, DictionaryFieldV1>;
}

export interface PlacedField {
  readonly placement: DictionaryFieldPlacementV1;
  readonly field: DictionaryFieldV1;
  readonly readOnly: boolean;
  readonly required: boolean;
  /** A SELECT field's value list. */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  /** A REFERENCE field's lookup resolver, served by the module's record dispatcher. */
  readonly resolverKey?: string;
  /** WI-OI-120 (F0.6): the window that creates the reference's records, for "Add new" and "Open" from the picker. */
  readonly createWith?: { readonly moduleKey: string; readonly surfaceKey: string; readonly permission: string };
}

/** No permission named means open; otherwise the one permission rule (WI-OI-120q, `permissionMatches`). */
export function holds(permissions: readonly string[], permission: string | undefined): boolean {
  return !permission || holdsPermission(permissions, permission);
}

/** The window for a LIST view (or the requested view); null when the manifest declares none. */
export function windowModel(manifest: CompiledDictionaryManifestV1, viewKey?: string): WindowModel | null {
  const view = viewKey
    ? manifest.views.find((candidate) => candidate.viewKey === viewKey)
    : (manifest.views.find((candidate) => candidate.mode === 'LIST') ?? manifest.views[0]);
  if (!view) return null;
  const tabs = [...view.tabs].sort((a, b) => a.position - b.position);
  const rootTab = tabs.find((tab) => tab.level === 0);
  if (!rootTab) return null;
  return {
    manifest,
    view,
    rootTab,
    childTabs: tabs.filter((tab) => tab.level === 1 && tab.parentRelationshipKey),
    fields: new Map(manifest.fields.filter((field) => field.entityKey === rootTab.targetEntityKey || tabs.some((tab) => tab.targetEntityKey === field.entityKey)).map((field) => [`${field.entityKey}/${field.fieldKey}`, field])),
  };
}

function fieldOf(model: WindowModel, tab: DictionaryTabV1, fieldKey: string): DictionaryFieldV1 | undefined {
  return model.fields.get(`${tab.targetEntityKey}/${fieldKey}`);
}

/** The tab's fields the user may see, in order, with their read-only and required state for these values. */
export function placedFields(
  model: WindowModel,
  tab: DictionaryTabV1,
  values: RecordValues,
  permissions: readonly string[],
  mode: 'CREATE' | 'EDIT' | 'READ',
): PlacedField[] {
  return [...tab.fields]
    .sort((a, b) => a.position - b.position)
    .flatMap((placement) => {
      const field = fieldOf(model, tab, placement.fieldKey);
      if (!field || !holds(permissions, field.readPermission)) return [];
      if (placement.visibilityCondition && !evaluateDictionaryCondition(placement.visibilityCondition, values)) return [];
      const lockedByRule = placement.readOnlyCondition ? evaluateDictionaryCondition(placement.readOnlyCondition, values) : false;
      const readOnly = mode === 'READ' || field.readOnly || lockedByRule || !holds(permissions, field.writePermission);
      const required = !readOnly && (field.required || (placement.requiredCondition ? evaluateDictionaryCondition(placement.requiredCondition, values) : false));
      const reference = field.referenceKey ? model.manifest.references.find((candidate) => candidate.referenceKey === field.referenceKey) : undefined;
      return [
        {
          placement,
          field,
          readOnly,
          required,
          ...(reference?.referenceType === 'VALUE_LIST' ? { options: (reference.staticValues ?? []).map(({ value, label }) => ({ value, label })) } : {}),
          ...(reference && reference.referenceType !== 'VALUE_LIST' && reference.resolverKey ? { resolverKey: reference.resolverKey } : {}),
          ...(reference?.createWith ? { createWith: reference.createWith } : {}),
        },
      ];
    });
}

/** Grid columns: the tab's readable fields, in placement order. */
export function gridColumns(model: WindowModel, tab: DictionaryTabV1, permissions: readonly string[]): PlacedField[] {
  return placedFields(model, tab, {}, permissions, 'READ').filter((placed) => placed.field.type !== 'TEXTAREA');
}

/** The field linking a child tab's records to the parent, from the tab's declared relationship. */
export function parentField(model: WindowModel, tab: DictionaryTabV1): string | null {
  const relationship = model.manifest.relationships.find((candidate) => candidate.relationshipKey === tab.parentRelationshipKey);
  return relationship?.foreignKeyField ?? null;
}

/**
 * The COMMAND actions of an entity's record, permitted and visible for its values. An action belongs to an entity
 * when its handler key is `<entity key>.<action key>`, the name the module's record dispatcher registers.
 */
export function recordActions(
  model: WindowModel,
  entityKey: string,
  record: RecordValues,
  permissions: readonly string[],
): DictionaryActionV1[] {
  return model.manifest.actions.filter(
    (action) =>
      action.type === 'COMMAND' &&
      action.handlerKey.startsWith(`${entityKey}.`) &&
      action.requiredPermissions.every((permission) => holds(permissions, permission)) &&
      (!action.visibilityCondition || evaluateDictionaryCondition(action.visibilityCondition, record)),
  );
}

export function actionKey(action: DictionaryActionV1, entityKey: string): string {
  return action.handlerKey.slice(entityKey.length + 1);
}

/** A form input's text as the value sent to the server: exact decimals stay strings, booleans and integers convert. */
export function valueFromInput(field: DictionaryFieldV1, input: string | boolean): unknown {
  if (field.type === 'BOOLEAN') return input === true || input === 'true';
  const text = String(input).trim();
  if (text === '') return null;
  if (field.type === 'INTEGER') return /^-?\d+$/.test(text) ? Number(text) : text;
  return text;
}

/** A stored value as form input text. */
export function inputFromValue(field: DictionaryFieldV1, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (field.type === 'DATE' && typeof value === 'string') return value.slice(0, 10);
  if (field.type === 'DATETIME' && typeof value === 'string') return value.slice(0, 16);
  return String(value);
}

/** Errors before submitting: required fields, exact decimal format and scale, whole numbers, and the manifest's rules. */
export function validateValues(model: WindowModel, fields: readonly PlacedField[], values: RecordValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { field, readOnly, required } of fields) {
    if (readOnly) continue;
    const value = values[field.fieldKey];
    const empty = value === null || value === undefined || value === '';
    if (required && empty && field.type !== 'BOOLEAN') {
      errors[field.fieldKey] = `${field.label} is required.`;
      continue;
    }
    if (empty) continue;
    if (field.type === 'INTEGER' && !Number.isInteger(value)) errors[field.fieldKey] = `${field.label} must be a whole number.`;
    if (field.type === 'NUMBER' || field.type === 'CURRENCY') {
      const decimal = parseExactDecimal(value);
      if (!decimal) errors[field.fieldKey] = `${field.label} must be a number.`;
      else if (field.scale !== undefined && decimal.scale > field.scale) {
        errors[field.fieldKey] = `${field.label} allows at most ${field.scale} decimal place(s).`;
      }
    }
  }
  const ruleErrors = validateDictionaryRules(model.manifest.validationRules, values);
  for (const [key, message] of Object.entries(ruleErrors)) errors[key] ??= message;
  return errors;
}

/** Only the values a user may write, for the fields shown in the form. */
export function writableValues(fields: readonly PlacedField[], values: RecordValues, original?: RecordValues): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const { field, readOnly } of fields) {
    if (readOnly || !(field.fieldKey in values)) continue;
    if (original && values[field.fieldKey] === original[field.fieldKey]) continue;
    result[field.fieldKey] = values[field.fieldKey];
  }
  return result;
}

export type FailureKind = 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'DUPLICATE_IN_PROGRESS' | 'UNAVAILABLE';

/** What the screen says for an API failure. */
export function describeFailure(status: number | undefined, message: string | undefined): { kind: FailureKind; message: string } {
  if (status === 403) return { kind: 'FORBIDDEN', message: message ?? 'You do not have permission for this.' };
  if (status === 404) return { kind: 'NOT_FOUND', message: message ?? 'The record was not found.' };
  if (status === 412) return { kind: 'CONFLICT', message: 'Someone else changed this record. Reload it and make your change again.' };
  if (status === 409) return { kind: 'DUPLICATE_IN_PROGRESS', message: message ?? 'This request conflicts with another one.' };
  if (status !== undefined && status >= 400 && status < 500) return { kind: 'INVALID', message: message ?? 'The request was refused.' };
  return { kind: 'UNAVAILABLE', message: 'The service is unavailable. Try again shortly.' };
}

/**
 * The record's display title: its first plain text field (a code or name), else its tab and first whole number
 * ("Version 3"), else its id. A reference, a value-list code or a date is never a title (WI-OI-120k: a catalogue
 * version showed its catalogue's id).
 */
export function recordTitle(model: WindowModel, record: RecordValues): string {
  const placements = [...model.rootTab.fields].sort((a, b) => a.position - b.position);
  const typeOf = (fieldKey: string) => model.fields.get(`${model.rootTab.targetEntityKey}/${fieldKey}`)?.type;
  for (const placement of placements) {
    const value = record[placement.fieldKey];
    if (typeOf(placement.fieldKey) === 'TEXT' && typeof value === 'string' && value.trim()) return value;
  }
  for (const placement of placements) {
    const value = record[placement.fieldKey];
    if (typeOf(placement.fieldKey) === 'INTEGER' && (typeof value === 'number' || (typeof value === 'string' && value.trim()))) {
      return `${model.rootTab.label} ${value}`;
    }
  }
  return String(record.id ?? '');
}
