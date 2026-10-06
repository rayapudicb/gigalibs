import type { DictionaryFieldV1, DictionaryValidationRuleV1, DictionaryViewV1 } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { checkRecord, defaultsFor, defaultValueToken, entityRules, type DictionaryRuleSource } from './record-rules.js';

// WI-OI-120r (S1): the field rules the window and the record dispatcher share.
const field = (fieldKey: string, extra: Partial<DictionaryFieldV1> = {}): DictionaryFieldV1 =>
  ({
    fieldKey,
    entityKey: 'maintenance.requests',
    label: fieldKey.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase()),
    type: 'TEXT',
    required: false,
    readOnly: false,
    isSystemLocked: false,
    classification: 'INTERNAL',
    maskOnDisplay: false,
    ...extra,
  }) as DictionaryFieldV1;

const view = (placements: Array<Record<string, unknown>>, entity = 'maintenance.requests'): DictionaryViewV1 =>
  ({
    viewKey: 'requests',
    label: 'Requests',
    mode: 'LIST',
    device: 'ALL',
    defaultSortDirection: 'ASC',
    tabs: [{ tabKey: 'main', label: 'Main', targetEntityKey: entity, level: 0, position: 0, sections: [], fields: placements }],
  }) as unknown as DictionaryViewV1;

const rule = (ruleKey: string, condition: Record<string, unknown>, severity: 'ERROR' | 'WARNING' = 'ERROR'): DictionaryValidationRuleV1 =>
  ({ ruleKey, label: ruleKey, errorMessage: `${ruleKey} failed`, severity, condition }) as DictionaryValidationRuleV1;

const source: DictionaryRuleSource = {
  fields: [
    field('title', { required: true }),
    field('priority'),
    field('reason-for-urgency'),
    field('status', { readOnly: true }),
    field('cost', { type: 'NUMBER', readPermission: 'maintenance:costs:read', writePermission: 'maintenance:costs:write' }),
    field('due-on', { type: 'DATE', defaultValue: { $default: 'TODAY' } }),
    field('raised-by', { type: 'REFERENCE', defaultValue: { $default: 'CURRENT_USER' } }),
    field('channel', { defaultValue: 'PHONE' }),
    field('closing-note'),
  ],
  validationRules: [
    rule('title-short', { field: 'title', operator: 'MATCHES_REGEX', value: '^.{1,40}$' }),
    rule('cost-sensible', { field: 'cost', operator: 'LTE', value: 10000 }, 'WARNING'),
  ],
  views: [
    view([
      { fieldKey: 'title', position: 0 },
      { fieldKey: 'priority', position: 1 },
      // required when urgent
      { fieldKey: 'reason-for-urgency', position: 2, requiredCondition: { field: 'priority', operator: 'EQ', value: 'URGENT' } },
      // locked once closed
      { fieldKey: 'cost', position: 3, readOnlyCondition: { field: 'status', operator: 'EQ', value: 'CLOSED' } },
      // shown only when closed
      { fieldKey: 'closing-note', position: 4, visibilityCondition: { field: 'status', operator: 'EQ', value: 'CLOSED' } },
      { fieldKey: 'status', position: 5 },
      { fieldKey: 'due-on', position: 6 },
      { fieldKey: 'raised-by', position: 7 },
      { fieldKey: 'channel', position: 8 },
    ]),
  ],
};

const { rules, conflicts } = entityRules([source]);
const requests = rules.get('maintenance.requests')!;
const everyone = ['maintenance:costs:read', 'maintenance:costs:write'];
const create = (changes: Record<string, unknown>, permissions = everyone) =>
  checkRecord(requests, { mode: 'CREATE', current: {}, changes, permissions });
const update = (current: Record<string, unknown>, changes: Record<string, unknown>, permissions = everyone) =>
  checkRecord(requests, { mode: 'UPDATE', current, changes, permissions });

describe('entityRules', () => {
  it('groups fields, placements and validation rules by record type', () => {
    expect(conflicts).toEqual([]);
    expect([...requests.fields.keys()]).toContain('reason-for-urgency');
    expect(requests.fields.get('reason-for-urgency')?.requiredCondition).toEqual({ field: 'priority', operator: 'EQ', value: 'URGENT' });
    expect(requests.validationRules.map((candidate) => candidate.ruleKey)).toEqual(['title-short', 'cost-sensible']);
  });

  it("ignores a field a window declares but does not show (a child tab's parent link)", () => {
    const parent: DictionaryRuleSource = { fields: [field('title', { required: false })], validationRules: [], views: [] };
    expect(entityRules([source, parent]).conflicts).toEqual([]);
    expect(entityRules([parent]).rules.size).toBe(0);
  });

  it('refuses a field placed with different rules in two windows', () => {
    const other: DictionaryRuleSource = { ...source, validationRules: [], views: [view([{ fieldKey: 'reason-for-urgency', position: 0 }])] };
    expect(entityRules([source, other]).conflicts).toEqual([
      'maintenance.requests.reason-for-urgency: shown, locked or required by different rules in two places',
    ]);
  });

  it('refuses a field declared differently, and a rule reading two record types', () => {
    const other: DictionaryRuleSource = {
      fields: [field('title', { required: false }), field('code', { entityKey: 'maintenance.sites' })],
      validationRules: [rule('mixed', { all: [{ field: 'title', operator: 'IS_NOT_NULL' }, { field: 'code', operator: 'IS_NOT_NULL' }] })],
      views: [
        view([{ fieldKey: 'title', position: 0 }]),
        view([{ fieldKey: 'code', position: 0 }], 'maintenance.sites'),
      ],
    };
    expect(entityRules([source, other]).conflicts).toEqual([
      'maintenance.requests.title: declared with different rules in two windows',
      'validation rule mixed: must read the fields of exactly one record type',
    ]);
  });
});

describe('checkRecord', () => {
  it('requires a required field on a new record', () => {
    expect(create({}).errors).toEqual({ title: 'Title is required.' });
    expect(create({ title: 'Leaking tap' }).errors).toEqual({});
  });

  it('requires a field by rule only when the rule holds', () => {
    expect(create({ title: 'Leak', priority: 'URGENT' }).errors).toEqual({ 'reason-for-urgency': 'Reason for urgency is required.' });
    expect(create({ title: 'Leak', priority: 'URGENT', 'reason-for-urgency': 'Flooding' }).errors).toEqual({});
    expect(create({ title: 'Leak', priority: 'LOW' }).errors).toEqual({});
  });

  it('refuses a locked field, always or by rule on the record as changed', () => {
    expect(update({ title: 'Leak', status: 'OPEN' }, { status: 'CLOSED' }).errors).toEqual({ status: 'Status cannot be changed.' });
    expect(update({ title: 'Leak', status: 'CLOSED', cost: 10 }, { cost: 20 }).errors).toEqual({ cost: 'Cost cannot be changed.' });
    expect(update({ title: 'Leak', status: 'OPEN', cost: 10 }, { cost: 20 }).errors).toEqual({});
    // sending a locked field's current value is not a change
    expect(update({ title: 'Leak', status: 'CLOSED', cost: 10 }, { cost: 10, title: 'Leak!' }).errors).toEqual({});
  });

  it('refuses a field hidden by rule', () => {
    expect(update({ title: 'Leak', status: 'OPEN' }, { 'closing-note': 'done' }).errors).toEqual({
      'closing-note': 'Closing note does not apply here and cannot be set.',
    });
    expect(update({ title: 'Leak', status: 'CLOSED' }, { 'closing-note': 'done' }).errors).toEqual({});
  });

  it('refuses a field the user may not write, and ignores one the user may not see', () => {
    expect(update({ title: 'Leak', status: 'OPEN' }, { cost: 5 }, ['maintenance:costs:read']).errors).toEqual({ cost: 'Cost cannot be changed.' });
    expect(create({ title: 'Leak' }, []).errors).toEqual({});
  });

  it('refuses a failing ERROR rule and reports a failing WARNING rule', () => {
    expect(create({ title: 'x'.repeat(41) }).errors).toEqual({ title: 'title-short failed' });
    const check = update({ title: 'Leak', status: 'OPEN', cost: 10 }, { cost: 20000 });
    expect(check.errors).toEqual({});
    expect(check.warnings).toEqual({ cost: 'cost-sensible failed' });
  });

  it('lets an old record be edited when the change does not touch what a rule reads', () => {
    // saved before the rules existed: no title, urgent without a reason, a long title elsewhere
    expect(update({ priority: 'URGENT' }, { channel: 'EMAIL' }).errors).toEqual({});
    expect(update({ title: '' }, { title: '' }).errors).toEqual({});
    expect(update({ title: 'Leak' }, { title: '' }).errors).toEqual({ title: 'Title is required.' });
    // the change makes the field required
    expect(update({ title: 'Leak', priority: 'LOW' }, { priority: 'URGENT' }).errors).toEqual({
      'reason-for-urgency': 'Reason for urgency is required.',
    });
  });
});

describe('defaults', () => {
  const context = { userId: '11111111-1111-4111-8111-111111111111', now: new Date('2026-10-06T22:30:00Z') };

  it('fills fixed and computed defaults the values leave out', () => {
    expect(defaultsFor(requests, { title: 'Leak' }, context)).toEqual({
      'due-on': '2026-10-06',
      'raised-by': context.userId,
      channel: 'PHONE',
    });
    expect(defaultsFor(requests, { channel: 'EMAIL', 'due-on': '2026-10-09' }, context)).toEqual({ 'raised-by': context.userId });
  });

  it('recognises tokens and refuses unknown ones', () => {
    expect(defaultValueToken({ $default: 'NOW' })).toBe('NOW');
    expect(defaultValueToken('PHONE')).toBeUndefined();
    expect(defaultValueToken({ $default: 'YESTERDAY' })).toBeNull();
    expect(defaultValueToken({ $default: 'TODAY', extra: 1 })).toBeNull();
  });

  it('treats a value equal to its default as unchanged', () => {
    const defaults = defaultsFor(requests, { title: 'Leak' }, context);
    expect(checkRecord(requests, { mode: 'CREATE', current: defaults, changes: { title: 'Leak', channel: 'PHONE' }, permissions: everyone }).errors).toEqual({});
  });
});
