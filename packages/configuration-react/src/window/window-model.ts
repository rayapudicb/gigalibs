import type {
  CompiledDictionaryManifestV1,
  DictionaryActionV1,
  DictionaryFieldPlacementV1,
  DictionaryFieldV1,
  DictionaryPanelPlacementV1,
  DictionaryTabV1,
  DictionaryViewV1,
} from '@gigalibs/contracts';
import { holdsPermission } from '@gigalibs/contracts';
import {
  evaluateDictionaryCondition,
  parseExactDecimal,
  validateDictionaryRules,
} from '@gigalibs/configuration-core/dictionary-evaluator';
import { defaultValueToken, entityRules, type EntityRules } from '@gigalibs/configuration-core/record-rules';

// WI-OI-120f (F0.4, ADR-0033 D1): the logic of a metadata window, kept free of React so every rule is unit-tested:
// which view and tabs to draw, which fields a user may see or change, which actions apply to a record, how child
// tabs find their records, how values travel (exact decimals as strings), and how API failures become screen states.

export type RecordValues = Readonly<Record<string, unknown>>;

export interface WindowModel {
  readonly manifest: CompiledDictionaryManifestV1;
  readonly view: DictionaryViewV1;
  readonly rootTab: DictionaryTabV1;
  /**
   * WI-OI-120bs: the tabs drawn for one record, the main tab first: further level-0 tabs on the main entity, which
   * hold panels only (the compiler refuses anything else).
   */
  readonly recordTabs: readonly DictionaryTabV1[];
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
  /** WI-OI-149: fields the picked option fills from its attributes. */
  readonly fills?: Readonly<Record<string, string>>;
}

/**
 * WI-OI-149 (QA-022): an action parameter that names a lookup reference, drawn as the same picker a form field uses;
 * null for a typed parameter or a reference without a resolver (the dialog then keeps a text box).
 */
export function parameterLookup(
  model: WindowModel,
  parameter: NonNullable<DictionaryActionV1['parameters']>[number],
): PlacedField | null {
  if (!parameter.referenceKey) return null;
  const reference = model.manifest.references.find((candidate) => candidate.referenceKey === parameter.referenceKey);
  if (!reference || reference.referenceType === 'VALUE_LIST' || !reference.resolverKey) return null;
  return {
    placement: { fieldKey: parameter.key } as DictionaryFieldPlacementV1,
    field: {
      fieldKey: parameter.key,
      entityKey: model.rootTab.targetEntityKey,
      label: parameter.label,
      type: 'REFERENCE',
      required: parameter.required,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      maskOnDisplay: false,
      referenceKey: parameter.referenceKey,
    } as DictionaryFieldV1,
    readOnly: false,
    required: parameter.required,
    resolverKey: reference.resolverKey,
    ...(reference.fills ? { fills: reference.fills } : {}),
  };
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
    recordTabs: [rootTab, ...tabs.filter((tab) => tab !== rootTab && tab.level === 0 && tab.targetEntityKey === rootTab.targetEntityKey)],
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
          ...(reference?.fills ? { fills: reference.fills } : {}),
        },
      ];
    });
}

/** WI-OI-120bs: a panel the user may see on this record, in position order. */
export interface PlacedPanel {
  readonly placement: DictionaryPanelPlacementV1;
}

/**
 * The tab's panels this user may see for this record: denied by default like fields (a named read permission must be
 * held) and hidden by the placement's visibility condition, in position order.
 */
export function placedPanels(tab: DictionaryTabV1, values: RecordValues, permissions: readonly string[]): PlacedPanel[] {
  return [...(tab.panels ?? [])]
    .sort((a, b) => a.position - b.position)
    .filter((placement) => holds(permissions, placement.readPermission))
    .filter((placement) => !placement.visibilityCondition || evaluateDictionaryCondition(placement.visibilityCondition, values))
    .map((placement) => ({ placement }));
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

/**
 * WI-OI-149: money kept as a whole number of minor units (cents) — fields keyed `…-minor` or labelled "(minor)" /
 * "(minor units)" — is shown and typed in normal units (12.50) and stored as before (1250).
 */
export function isMinorMoney(field: DictionaryFieldV1): boolean {
  return (field.type === 'INTEGER' || field.type === 'TEXT') && (/-minor$/.test(field.fieldKey) || /\(minor( units)?\)/i.test(field.label));
}

/** The label people read: "(minor units)" is a storage detail, not theirs. */
export function fieldLabel(field: DictionaryFieldV1): string {
  return field.label.replace(/\s*\((minor|minor units)\)/i, '').trim();
}

/** Minor units as normal money text: 125000 → "1250.00". */
export function moneyFromMinor(value: unknown): string {
  const minor = typeof value === 'number' ? value : /^-?\d+$/.test(String(value).trim()) ? Number(String(value).trim()) : Number.NaN;
  return Number.isFinite(minor) ? (minor / 100).toFixed(2) : String(value);
}

/** A form input's text as the value sent to the server: exact decimals stay strings, booleans and integers convert. */
export function valueFromInput(field: DictionaryFieldV1, input: string | boolean): unknown {
  if (field.type === 'BOOLEAN') return input === true || input === 'true';
  const text = String(input).trim();
  if (text === '') return null;
  if (field.type === 'INTEGER' && isMinorMoney(field))
    return /^-?\d+(\.\d{1,2})?$/.test(text) ? Math.round(Number(text) * 100) : text;
  if (field.type === 'INTEGER') return /^-?\d+$/.test(text) ? Number(text) : text;
  return text;
}

/**
 * WI-OI-120ce: a form input's text while the user types, kept exactly as typed (a trailing space too), so typing
 * "Pyrimidine methanol" works; `submittedValues` trims it when the form is saved.
 */
export function valueWhileTyping(field: DictionaryFieldV1, input: string | boolean): unknown {
  if (field.type === 'BOOLEAN') return input === true || input === 'true';
  const text = String(input);
  if (text.trim() === '') return null;
  // Money in normal units stays as typed ("12.5") until it is saved, when valueFromInput makes it minor units.
  if (isMinorMoney(field)) return text;
  if (field.type === 'INTEGER') return /^-?\d+$/.test(text.trim()) ? Number(text.trim()) : text;
  return text;
}

/**
 * WI-OI-120ce: a create form leaves out the fields the system fills (status, created by, created, last change): shown
 * disabled and empty they only confused; they appear on the record once it exists.
 */
export function createFormFields(fields: readonly PlacedField[]): PlacedField[] {
  return fields.filter((placed) => !placed.field.readOnly);
}

/** The form's values as they are saved: typed text trimmed and converted as `valueFromInput` does. */
export function submittedValues(fields: readonly PlacedField[], values: RecordValues): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const placed of fields) {
    const value = out[placed.field.fieldKey];
    if (typeof value === 'string') out[placed.field.fieldKey] = valueFromInput(placed.field, value);
  }
  return out;
}

/** A stored value as form input text. */
export function inputFromValue(field: DictionaryFieldV1, value: unknown): string {
  if (value === null || value === undefined) return '';
  // A stored number (or a read-only total) of minor units shows in normal units; text being typed shows as typed.
  if (isMinorMoney(field) && (typeof value === 'number' || field.type === 'TEXT')) return moneyFromMinor(value);
  if (field.type === 'DATE' && typeof value === 'string') return value.slice(0, 10);
  if (field.type === 'DATETIME' && typeof value === 'string') return value.slice(0, 16);
  return String(value);
}

const rulesByManifest = new WeakMap<CompiledDictionaryManifestV1, Map<string, EntityRules>>();

/** The window's field rules for one record type, as the module's record dispatcher enforces them (WI-OI-120r). */
function rulesOf(model: WindowModel, entityKey: string): EntityRules | undefined {
  let rules = rulesByManifest.get(model.manifest);
  if (!rules) rulesByManifest.set(model.manifest, (rules = entityRules([model.manifest]).rules));
  return rules.get(entityKey);
}

/**
 * Errors before submitting: required fields, exact decimal format and scale, whole numbers, and the validation rules
 * of the record type that are errors. Without `entityKey` every ERROR rule of the window applies.
 */
export function validateValues(model: WindowModel, fields: readonly PlacedField[], values: RecordValues, entityKey?: string): Record<string, string> {
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
    if (field.type === 'INTEGER' && !Number.isInteger(value))
      errors[field.fieldKey] = isMinorMoney(field)
        ? `${fieldLabel(field)} must be an amount such as 12.50.`
        : `${field.label} must be a whole number.`;
    if (field.type === 'NUMBER' || field.type === 'CURRENCY') {
      const decimal = parseExactDecimal(value);
      if (!decimal) errors[field.fieldKey] = `${field.label} must be a number.`;
      else if (field.scale !== undefined && decimal.scale > field.scale) {
        errors[field.fieldKey] = `${field.label} allows at most ${field.scale} decimal place(s).`;
      }
    }
  }
  const rules = (entityKey ? (rulesOf(model, entityKey)?.validationRules ?? []) : model.manifest.validationRules).filter(
    (rule) => (rule.severity ?? 'ERROR') === 'ERROR',
  );
  const ruleErrors = validateDictionaryRules(rules, values);
  for (const [key, message] of Object.entries(ruleErrors)) errors[key] ??= message;
  return errors;
}

/** WARNING and INFO rules of the record type that fail for these values: shown, never blocking. */
export function formWarnings(model: WindowModel, entityKey: string, values: RecordValues): Record<string, string> {
  const rules = (rulesOf(model, entityKey)?.validationRules ?? []).filter((rule) => (rule.severity ?? 'ERROR') !== 'ERROR');
  return validateDictionaryRules(rules, values);
}

/** What the screen knows of the workspace for computed defaults (WI-OI-153). */
export interface WorkspaceDefaults {
  readonly defaultCurrency?: string;
}

/**
 * The values a new record starts with: each placed field's default, fixed or computed. `TODAY` is the local date and
 * `NOW` the current time; `CURRENT_USER` is filled in by the server, which knows who is signed in; `WORKSPACE_CURRENCY`
 * is the workspace's base currency when the screen has read it.
 */
export function newRecordDefaults(
  model: WindowModel,
  tab: DictionaryTabV1,
  now: Date = new Date(),
  workspace: WorkspaceDefaults = {},
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const placement of tab.fields) {
    const field = fieldOf(model, tab, placement.fieldKey);
    if (!field || field.defaultValue === undefined) continue;
    const token = defaultValueToken(field.defaultValue);
    if (token === undefined) defaults[field.fieldKey] = field.defaultValue;
    else if (token === 'TODAY') defaults[field.fieldKey] = localDate(now);
    else if (token === 'NOW') defaults[field.fieldKey] = now.toISOString();
    else if (token === 'WORKSPACE_CURRENCY' && workspace.defaultCurrency) defaults[field.fieldKey] = workspace.defaultCurrency;
  }
  return defaults;
}

function localDate(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
