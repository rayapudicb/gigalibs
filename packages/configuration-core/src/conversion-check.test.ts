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
          rest: {
            read: 'GET v1/things',
            create: 'POST v1/things',
            update: 'PATCH v1/things/{id}',
            actions: { close: 'POST v1/things/{id}/close' },
          } as { read: string | null; create?: string | null; update?: string | null; actions?: Record<string, string | null> },
        } as Record<string, any>,
      ],
      resolvers: [{ key: 'probe-owners', permission: 'probe:read' }],
    },
    manifest: {
      spec: {
        gateway: {
          records: true,
          routes: [
            { path: 'v1/things', GET: 'probe:read', POST: 'probe:things:manage' },
            { path: 'v1/things/{id}', GET: 'probe:read', PATCH: 'probe:things:manage' },
            { path: 'v1/things/{id}/close', POST: 'probe:things:close' },
          ] as Record<string, string>[],
        },
        ui: { pages: [{ route: '/probe' }] },
        catalog: [{ key: 'probe' }],
      },
    },
    roles: [{ catalogKey: 'probe', key: 'probe-operator', permissions: ['probe:read', 'probe:things:manage', 'probe:things:close'] }],
    servedLookups: new Set(['probe-owners']),
    engine: { executableCapabilityFindings, entityRules, holdsPermission },
    heldBack: new Map<string, string>(),
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
    expect(check(mismatched)).toEqual([
      'probe-things: action probe.things.close is shown for probe:things:close but the server requires probe:things:approve',
      // WI-OI-120af: the server's own permission is also not what REST asks for the same action.
      'probe.things: action close needs probe:things:approve, wider than POST v1/things/{id}/close (probe:things:close)',
    ]);
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

  // WI-OI-120u: a permission held only by administrators (NOT_DELEGABLE_PERMISSIONS) is not asked of a module role.
  it('does not ask a module role for a permission that is never delegable', () => {
    const input = valid();
    dictionaryOf(input).fields[2] = field('owner', { type: 'REFERENCE', referenceKey: 'owner-ref', writePermission: 'probe:owners:link' }) as never;
    expect(check(input)).toEqual(['permission probe:owners:link is granted by no module role']);
    const notDelegable = (permission: string) => permission === 'probe:owners:link';
    expect(check({ ...input, engine: { ...input.engine, notDelegable } } as never)).toEqual([]);
  });

  it('fails a window that does not compile', () => {
    const input = valid();
    dictionaryOf(input).fields[0] = field('name', { required: true, readPermission: 'Not A Code' }) as never;
    expect(check(input)).toContain('probe-things: PERMISSION_INVALID at fields.name.readPermission');
  });

  // WI-OI-120af: the record API is never wider than the REST route each operation mirrors.
  it('fails a record type that names no REST routes, or an operation that names none', () => {
    const none = valid();
    delete none.description.entities[0]!.rest;
    expect(check(none)).toEqual(['probe.things: names no REST routes it mirrors (rest)']);
    const partial = valid();
    delete partial.description.entities[0]!.rest.update;
    partial.description.entities[0]!.rest.actions = {};
    expect(check(partial)).toEqual([
      'probe.things: update names no REST route (null when there is none)',
      'probe.things: action close names no REST route (null when there is none)',
    ]);
  });

  it('accepts null for an operation that no REST route does', () => {
    const input = valid();
    input.description.entities[0]!.rest.actions = { close: null };
    expect(check(input)).toEqual([]);
  });

  it('fails a mirrored route the gateway does not declare', () => {
    const input = valid();
    input.description.entities[0]!.rest.create = 'POST v1/thingz';
    expect(check(input)).toEqual(['probe.things: create mirrors POST v1/thingz, which the gateway does not declare']);
  });

  it('fails a record permission wider than its REST route', () => {
    const input = valid();
    // The record API would let a reader create what REST lets only a manager create.
    input.description.entities[0]!.permissions.create = 'probe:read';
    expect(check(input)).toEqual(['probe.things: create needs probe:read, wider than POST v1/things (probe:things:manage)']);
    const action = valid();
    action.description.entities[0]!.rest.actions = { close: 'PATCH v1/things/{id}' };
    expect(check(action)).toEqual([
      'probe.things: action close needs probe:things:close, wider than PATCH v1/things/{id} (probe:things:manage)',
    ]);
  });

  it('compares a read that needs several permissions, and a route that accepts any of a list', () => {
    const input = valid();
    // The record read asks for both; REST asks for the second alone, so the record API is not wider.
    input.description.entities[0]!.permissions.read = ['probe:read', 'probe:things:audit'] as never;
    input.manifest.spec.gateway.routes[0]!.GET = 'probe:things:audit';
    input.roles[0]!.permissions.push('probe:things:audit');
    expect(check(input)).toEqual([]);
    // A route that accepts either of two permissions is satisfied by holding one of them.
    const list = valid();
    (list.manifest.spec.gateway.routes[2] as Record<string, unknown>).POST = ['probe:things:manage', 'probe:things:close'];
    expect(check(list)).toEqual([]);
    (list.manifest.spec.gateway.routes[2] as Record<string, unknown>).POST = ['probe:things:manage', 'probe:things:approve'];
    expect(check(list)).toEqual([
      'probe.things: action close needs probe:things:close, wider than POST v1/things/{id}/close (probe:things:manage or probe:things:approve)',
    ]);
  });

  it('fails a record type the record API serves but no window shows, unless held back by a card', () => {
    const input = valid();
    input.description.entities.push({ ...input.description.entities[0]!, entityKey: 'probe.secrets' });
    expect(check(input)).toEqual([
      'probe.secrets is served by the record API but shown by no window; show it, or hold it back with its card',
    ]);
    input.heldBack = new Map([['probe.secrets', 'WI-OI-999']]);
    expect(check(input)).toEqual([]);
  });

  it('fails a stale held-back entry', () => {
    const shown = valid();
    shown.heldBack = new Map([['probe.things', 'WI-OI-999']]);
    expect(check(shown)).toEqual(['held back probe.things (WI-OI-999) is shown by a window; remove it from the held-back list']);
    const gone = valid();
    gone.heldBack = new Map([['probe.gone', 'WI-OI-999']]);
    expect(check(gone)).toEqual(['held back probe.gone (WI-OI-999) is not registered; remove it from the held-back list']);
  });
});
