import { holdsPermission } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { executableCapabilityFindings } from './dictionary-capabilities.js';
import { entityRules } from './record-rules.js';
// @ts-expect-error -- a plain ES module shared with scripts/verify-module-conversion.mjs
import { conversionFindings } from '../../../scripts/lib/conversion-check.mjs';

// WI-OI-120s (S16): the conversion check, on one valid module and one deliberately broken copy per failure.
const field = (fieldKey: string, extra: Record<string, unknown> = {}) => ({
  fieldKey,
  entityKey: 'probe.things',
  label: fieldKey,
  type: 'TEXT',
  required: false,
  readOnly: false,
  isSystemLocked: false,
  classification: 'INTERNAL',
  maskOnDisplay: false,
  ...extra,
});

function valid() {
  const dictionary = {
    packageKey: 'probe-things-module-baseline',
    name: 'Things',
    version: '1.0.0',
    moduleKey: 'probe',
    targetEntityKey: 'probe.things',
    entities: [{ entityKey: 'probe.things', moduleKey: 'probe', label: 'Things', ownership: 'MODULE_CORE', primaryKeyField: 'id', isVersioned: true, isAuditLogged: true, isSoftDeletable: false }],
    fields: [field('name', { required: true }), field('status', { readOnly: true }), field('owner', { type: 'REFERENCE', referenceKey: 'owner-ref' })],
    relationships: [],
    references: [{ referenceKey: 'owner-ref', referenceType: 'SEARCH_LOOKUP', resolverKey: 'probe-owners' }],
    validationRules: [],
    views: [
      {
        viewKey: 'things',
        label: 'Things',
        mode: 'LIST',
        device: 'ALL',
        defaultSortDirection: 'ASC',
        tabs: [
          {
            tabKey: 'thing',
            label: 'Thing',
            position: 0,
            level: 0,
            targetEntityKey: 'probe.things',
            sections: [],
            fields: [
              { fieldKey: 'name', position: 0, span: 6, componentKey: 'text-input' },
              { fieldKey: 'status', position: 1, span: 3, componentKey: 'text-input' },
              { fieldKey: 'owner', position: 2, span: 3, componentKey: 'lookup' },
            ],
          },
        ],
      },
    ],
    navigation: [],
    actions: [
      {
        actionKey: 'close',
        label: 'Close',
        type: 'COMMAND',
        handlerKey: 'probe.things.close',
        requiredPermissions: ['probe:things:close'],
        visibilityCondition: { field: 'status', operator: 'EQ', value: 'OPEN' },
      },
    ],
    messages: [],
  };
  return {
    windows: [{ window: { route: '/probe', readPermission: 'probe:read' }, definition: { surfaceKey: 'probe-things', moduleKey: 'probe', dictionary } }],
    description: {
      entities: [
        {
          entityKey: 'probe.things',
          permissions: { read: 'probe:read', create: 'probe:things:manage', update: 'probe:things:manage' },
          fields: { name: { writable: true }, status: { writable: false }, owner: { writable: true } },
          actions: { close: 'probe:things:close' },
        },
      ],
      resolvers: [{ key: 'probe-owners', permission: 'probe:read' }],
    },
    manifest: { spec: { gateway: { records: true }, ui: { pages: [{ route: '/probe' }] }, catalog: [{ key: 'probe' }] } },
    roles: [{ catalogKey: 'probe', key: 'probe-operator', permissions: ['probe:read', 'probe:things:manage', 'probe:things:close'] }],
    servedLookups: new Set(['probe-owners']),
    engine: { executableCapabilityFindings, entityRules, holdsPermission },
  };
}
const check = (input: ReturnType<typeof valid>) => (conversionFindings(input) as { findings: string[] }).findings;
const dictionaryOf = (input: ReturnType<typeof valid>) => input.windows[0]!.definition.dictionary;

describe('conversion check', () => {
  it('passes a complete conversion', () => {
    expect(check(valid())).toEqual([]);
  });

  it('fails a window field the adapter does not declare', () => {
    const input = valid();
    delete (input.description.entities[0]!.fields as Record<string, unknown>).owner;
    expect(check(input)).toEqual(['probe-things: probe.things.owner is shown but the adapter does not declare it']);
  });

  it('fails a field the window lets people edit but the adapter refuses', () => {
    const input = valid();
    input.description.entities[0]!.fields.name = { writable: false };
    expect(check(input)).toEqual(['probe-things: probe.things.name is editable in the window but the adapter does not accept it']);
  });

  it('fails a tab on a record type the dispatcher does not register', () => {
    const input = valid();
    input.description.entities[0]!.entityKey = 'probe.other';
    expect(check(input)[0]).toBe('probe-things: tab thing shows probe.things, which the dispatcher does not register');
  });

  it('fails an action that is not registered, or that asks the server for another permission', () => {
    const missing = valid();
    missing.description.entities[0]!.actions = {} as never;
    expect(check(missing)).toEqual(['probe-things: action probe.things.close is not registered by the dispatcher']);
    const mismatched = valid();
    mismatched.description.entities[0]!.actions.close = 'probe:things:approve';
    expect(check(mismatched)).toEqual(['probe-things: action probe.things.close is shown for probe:things:close but the server requires probe:things:approve']);
  });

  it('fails a lookup no converted module serves', () => {
    const input = valid();
    input.servedLookups = new Set();
    expect(check(input)).toEqual(['probe-things: lookup probe-owners is registered by no converted module']);
  });

  it('fails a window on a route that is not a module page, and a gateway without record routes', () => {
    const input = valid();
    input.manifest.spec.ui.pages = [{ route: '/elsewhere' }];
    input.manifest.spec.gateway.records = false;
    expect(check(input)).toEqual([
      'probe-things: opens on /probe, which is not a page of the module',
      'the gateway does not expose the record routes (records: true)',
    ]);
  });

  it('fails a permission no module role grants', () => {
    const input = valid();
    input.roles[0]!.permissions = ['probe:read', 'probe:things:manage'];
    expect(check(input)).toEqual(['permission probe:things:close is granted by no module role']);
  });

  it('fails a window that does not compile', () => {
    const input = valid();
    dictionaryOf(input).fields[0] = field('name', { required: true, readPermission: 'Not A Code' }) as never;
    expect(check(input)).toContain('probe-things: PERMISSION_INVALID at fields.name.readPermission');
  });
});
