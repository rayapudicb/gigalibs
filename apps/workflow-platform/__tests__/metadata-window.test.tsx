import type { CompiledDictionaryManifestV1 } from '@gigalibs/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createRecordClient,
  manifestState,
  manifestUrl,
  MetadataWindow,
  metadataWindowModel,
  RecordClientError,
} from '@gigalibs/configuration-react';

const {
  actionKey,
  describeFailure,
  gridColumns,
  holds,
  parentField,
  placedFields,
  recordActions,
  validateValues,
  valueFromInput,
  windowModel,
  writableValues,
} = metadataWindowModel;

// WI-OI-120f (F0.4): the metadata window's logic, its client for the record routes, and its published-manifest loading.
const field = (fieldKey: string, entityKey: string, extra: Record<string, unknown> = {}) => ({
  fieldKey,
  entityKey,
  label: fieldKey,
  type: 'TEXT',
  required: false,
  readOnly: false,
  isSystemLocked: false,
  classification: 'INTERNAL',
  maskOnDisplay: false,
  ...extra,
});

const manifest = {
  manifestVersion: 1,
  packageKey: 'universal-inventory-receipts-module-baseline',
  checksum: `sha256:${'0'.repeat(64)}`,
  compiledAt: '2026-10-05T00:00:00.000Z',
  entities: [],
  fields: [
    field('receipt-number', 'inventory.receipts', { required: true }),
    field('status', 'inventory.receipts', { type: 'SELECT', readOnly: true, referenceKey: 'receipt-status' }),
    field('warehouse-id', 'inventory.receipts', { type: 'REFERENCE', required: true, referenceKey: 'warehouses' }),
    field('notes', 'inventory.receipts', { type: 'TEXTAREA' }),
    field('unit-cost', 'inventory.receipts', { type: 'CURRENCY', scale: 2, readPermission: 'finance:read', writePermission: 'finance:post' }),
    field('expected-quantity', 'inventory.receipt-lines', { type: 'NUMBER', scale: 3, required: true }),
    field('receipt-id', 'inventory.receipt-lines'),
  ],
  relationships: [
    { relationshipKey: 'receipt-lines', sourceEntityKey: 'inventory.receipts', targetEntityKey: 'inventory.receipt-lines', type: 'ONE_TO_MANY', foreignKeyField: 'receipt-id' },
  ],
  references: [
    { referenceKey: 'receipt-status', referenceType: 'VALUE_LIST', staticValues: [{ value: 'DRAFT', label: 'Draft' }, { value: 'COMPLETED', label: 'Completed' }] },
    { referenceKey: 'warehouses', referenceType: 'TABLE_DIR', targetEntityKey: 'inventory.warehouses', resolverKey: 'warehouses' },
  ],
  validationRules: [],
  views: [
    {
      viewKey: 'receipts',
      label: 'Receipts',
      mode: 'LIST',
      device: 'ALL',
      searchFields: ['receipt-number'],
      defaultSortField: 'receipt-number',
      defaultSortDirection: 'DESC',
      tabs: [
        {
          tabKey: 'lines',
          label: 'Lines',
          position: 1,
          level: 1,
          targetEntityKey: 'inventory.receipt-lines',
          parentRelationshipKey: 'receipt-lines',
          sections: [],
          fields: [{ fieldKey: 'expected-quantity', position: 0, span: 6, componentKey: 'number-input' }],
        },
        {
          tabKey: 'receipt',
          label: 'Receipt',
          position: 0,
          level: 0,
          targetEntityKey: 'inventory.receipts',
          sections: [],
          fields: [
            { fieldKey: 'receipt-number', position: 0, span: 6, componentKey: 'text-input' },
            { fieldKey: 'status', position: 1, span: 6, componentKey: 'select' },
            { fieldKey: 'warehouse-id', position: 2, span: 6, componentKey: 'lookup', readOnlyCondition: { field: 'status', operator: 'EQ', value: 'COMPLETED' } },
            { fieldKey: 'notes', position: 3, span: 12, componentKey: 'textarea' },
            { fieldKey: 'unit-cost', position: 4, span: 6, componentKey: 'currency-input' },
          ],
        },
      ],
    },
  ],
  navigation: [],
  actions: [
    {
      actionKey: 'complete',
      label: 'Complete receipt',
      type: 'COMMAND',
      handlerKey: 'inventory.receipts.complete',
      requiredPermissions: ['inventory:receive'],
      confirmationPrompt: 'Complete this receipt and post the stock?',
      visibilityCondition: { field: 'status', operator: 'EQ', value: 'DRAFT' },
    },
    { actionKey: 'report', label: 'Print', type: 'COMMAND', handlerKey: 'inventory.warehouses.print', requiredPermissions: [] },
  ],
  messages: [],
} as unknown as CompiledDictionaryManifestV1;

const model = windowModel(manifest)!;
const clerk = ['inventory:read', 'inventory:receive'];

describe('window model', () => {
  it('finds the list view, its main tab and its child tabs, whatever their order', () => {
    expect(model.view.viewKey).toBe('receipts');
    expect(model.rootTab.tabKey).toBe('receipt');
    expect(model.childTabs.map((tab) => tab.tabKey)).toEqual(['lines']);
    expect(parentField(model, model.childTabs[0]!)).toBe('receipt-id');
    expect(windowModel({ ...manifest, views: [] })).toBeNull();
  });

  it('shows only permitted fields, and locks fields by rule, by permission and in read mode', () => {
    const draft = placedFields(model, model.rootTab, { status: 'DRAFT' }, clerk, 'EDIT');
    expect(draft.map((placed) => placed.field.fieldKey)).toEqual(['receipt-number', 'status', 'warehouse-id', 'notes']);
    expect(draft.find((placed) => placed.field.fieldKey === 'status')?.readOnly).toBe(true);
    expect(draft.find((placed) => placed.field.fieldKey === 'warehouse-id')).toMatchObject({ readOnly: false, required: true, resolverKey: 'warehouses' });
    expect(draft.find((placed) => placed.field.fieldKey === 'status')?.options).toEqual([
      { value: 'DRAFT', label: 'Draft' },
      { value: 'COMPLETED', label: 'Completed' },
    ]);
    const completed = placedFields(model, model.rootTab, { status: 'COMPLETED' }, clerk, 'EDIT');
    expect(completed.find((placed) => placed.field.fieldKey === 'warehouse-id')?.readOnly).toBe(true);
    const financeReader = placedFields(model, model.rootTab, {}, [...clerk, 'finance:read'], 'EDIT');
    expect(financeReader.find((placed) => placed.field.fieldKey === 'unit-cost')?.readOnly).toBe(true);
    expect(placedFields(model, model.rootTab, {}, clerk, 'READ').every((placed) => placed.readOnly)).toBe(true);
    expect(gridColumns(model, model.rootTab, clerk).map((placed) => placed.field.fieldKey)).not.toContain('notes');
  });

  it('hands a picker the window that creates its records, only when the reference names one (WI-OI-120, F0.6)', async () => {
    const { DictionaryReferenceV1Schema } = await import('@gigalibs/contracts');
    const createWith = { moduleKey: 'universal-inventory', surfaceKey: 'inventory-warehouses', permission: 'inventory:warehouses:manage' };
    const withCreate = metadataWindowModel.windowModel({
      ...manifest,
      references: manifest.references.map((reference) => (reference.referenceKey === 'warehouses' ? { ...reference, createWith } : reference)),
    })!;
    const picker = (m: typeof model) => placedFields(m, m.rootTab, { status: 'DRAFT' }, clerk, 'EDIT').find((placed) => placed.field.fieldKey === 'warehouse-id');
    expect(picker(withCreate)?.createWith).toEqual(createWith);
    expect(picker(model)?.createWith).toBeUndefined();
    const reference = { referenceKey: 'warehouses', referenceType: 'SEARCH_LOOKUP', resolverKey: 'warehouses' };
    expect(DictionaryReferenceV1Schema.safeParse({ ...reference, createWith }).success).toBe(true);
    expect(DictionaryReferenceV1Schema.safeParse({ ...reference, createWith: { moduleKey: 'universal-inventory', surfaceKey: 'inventory-warehouses' } }).success).toBe(false);
  });

  it('titles a record by its text field, never by a reference id or a status code (WI-OI-120k)', () => {
    const warehouse = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
    expect(metadataWindowModel.recordTitle(model, { id: 'r-1', 'receipt-number': 'GR-7', status: 'DRAFT', 'warehouse-id': warehouse })).toBe('GR-7');
    expect(metadataWindowModel.recordTitle(model, { id: 'r-1', status: 'DRAFT', 'warehouse-id': warehouse })).toBe('r-1');
  });

  it('offers an action only on its own entity, when permitted and visible for the record', () => {
    expect(recordActions(model, 'inventory.receipts', { status: 'DRAFT' }, clerk).map((action) => action.actionKey)).toEqual(['complete']);
    expect(recordActions(model, 'inventory.receipts', { status: 'COMPLETED' }, clerk)).toEqual([]);
    expect(recordActions(model, 'inventory.receipts', { status: 'DRAFT' }, ['inventory:read'])).toEqual([]);
    expect(actionKey(manifest.actions[0]!, 'inventory.receipts')).toBe('complete');
  });

  it('keeps exact decimals as strings and checks their scale, required fields and whole numbers', () => {
    const lines = placedFields(model, model.childTabs[0]!, {}, clerk, 'CREATE');
    const quantity = lines[0]!.field;
    expect(valueFromInput(quantity, '12.500')).toBe('12.500');
    expect(valueFromInput(quantity, '')).toBeNull();
    expect(valueFromInput({ ...quantity, type: 'BOOLEAN' }, true)).toBe(true);
    expect(validateValues(model, lines, {})).toEqual({ 'expected-quantity': 'expected-quantity is required.' });
    expect(validateValues(model, lines, { 'expected-quantity': '1.2345' })).toEqual({
      'expected-quantity': 'expected-quantity allows at most 3 decimal place(s).',
    });
    expect(validateValues(model, lines, { 'expected-quantity': 'many' })).toEqual({ 'expected-quantity': 'expected-quantity must be a number.' });
    expect(validateValues(model, lines, { 'expected-quantity': '0.125' })).toEqual({});
  });

  it('sends only changed, writable values on an update', () => {
    const fields = placedFields(model, model.rootTab, { status: 'DRAFT' }, clerk, 'EDIT');
    const original = { id: 'r-1', version: 3, 'receipt-number': 'RCV-1', status: 'DRAFT', notes: 'old' };
    expect(writableValues(fields, { ...original, notes: 'new', status: 'COMPLETED' }, original)).toEqual({ notes: 'new' });
  });

  it('explains failures in words the user can act on', () => {
    expect(describeFailure(412, 'x').message).toMatch(/Someone else changed this record/);
    expect(describeFailure(403, undefined).kind).toBe('FORBIDDEN');
    expect(describeFailure(undefined, undefined).kind).toBe('UNAVAILABLE');
    expect(holds(['inventory:*'], 'inventory.receipts.read')).toBe(true);
    expect(holds([], 'inventory:read')).toBe(false);
  });
});

describe('record client', () => {
  it('calls the signed module gateway with paging, filters, If-Match and Idempotency-Key', async () => {
    const send = vi.fn(async (_input: string, _init?: RequestInit) => Response.json({ items: [], total: 0, page: 1, pageSize: 25 }));
    const client = createRecordClient({ basePath: '/api/universal-inventory/', lookupBasePaths: { 'catalogue-products': '/api/product-catalogue' }, fetch: send as never });
    await client.list('inventory.receipts', { page: 2, pageSize: 25, search: 'RCV', sort: 'receipt-number', direction: 'DESC', filters: { status: 'DRAFT' }, parentId: 'p-1' });
    expect(send.mock.calls[0]?.[0]).toBe(
      '/api/universal-inventory/v1/records/inventory.receipts?page=2&pageSize=25&search=RCV&sort=receipt-number&direction=DESC&parentId=p-1&filter.status=DRAFT',
    );
    await client.update('inventory.receipts', 'r-1', { notes: 'x' }, 3);
    expect(send.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH', headers: expect.objectContaining({ 'If-Match': '"3"' }) });
    await client.action('inventory.receipts', 'r-1', 'complete', {}, 'key-1');
    expect(send.mock.calls[2]?.[0]).toBe('/api/universal-inventory/v1/records/inventory.receipts/r-1/actions/complete');
    expect(send.mock.calls[2]?.[1]).toMatchObject({ method: 'POST', headers: expect.objectContaining({ 'Idempotency-Key': 'key-1' }) });
    await client.lookup('catalogue-products', { search: 'bolt' });
    expect(send.mock.calls[3]?.[0]).toBe('/api/product-catalogue/v1/lookups/catalogue-products?search=bolt');
  });

  it('turns a refusal into a RecordClientError with the server message, and a network failure too', async () => {
    const refused = createRecordClient({
      basePath: '/api/x',
      fetch: (async () => Response.json({ code: 'RECORD_VERSION_CONFLICT', message: 'Changed.' }, { status: 412 })) as never,
    });
    await expect(refused.get('inventory.receipts', 'r-1')).rejects.toMatchObject({ status: 412, code: 'RECORD_VERSION_CONFLICT', message: 'Changed.' });
    const offline = createRecordClient({ basePath: '/api/x', fetch: (async () => Promise.reject(new TypeError('offline'))) as never });
    await expect(offline.get('inventory.receipts', 'r-1')).rejects.toBeInstanceOf(RecordClientError);
  });
});

describe('published manifest', () => {
  it('shows a missing or empty definition as such, never a built-in copy', () => {
    expect(manifestUrl({ moduleKey: 'universal-inventory', entityKey: 'inventory-receipts', surfaceKey: 'inventory-receipts' })).toBe(
      '/api/control/configuration/runtime/manifest/current?moduleKey=universal-inventory&entityKey=inventory-receipts&surfaceKey=inventory-receipts',
    );
    // The runtime endpoint wraps the manifest (ConfigurationRuntimeManifestCurrentResponseSchema).
    const answer = (body: unknown) => ({
      activationId: 'a-1',
      publishedVersionId: 'v-1',
      activatedAt: '2026-10-05T15:33:51.000Z',
      manifest: body,
      checksum: `sha256:${'0'.repeat(64)}`,
      scope: { contractVersion: '1.0', environmentKey: 'local', cohortKey: 'all-users', policyKey: 'ALL_ENTITLED_USERS_V1', entitlementModuleKey: 'universal-inventory', resolutionSource: 'SERVER_POLICY' },
      adapter: { adapterKey: 'inventory-receipts-window', descriptorVersion: '1.0' },
    });
    expect(manifestState(404, null).status).toBe('missing');
    expect(manifestState(403, null).status).toBe('forbidden');
    expect(manifestState(200, answer({ ...manifest, views: [] })).status).toBe('missing');
    expect(manifestState(200, answer(manifest))).toEqual({ status: 'ready', manifest });
    // A bare manifest is not the endpoint's shape and is not accepted.
    expect(manifestState(200, manifest).status).toBe('missing');
    expect(manifestState(503, null).status).toBe('error');
  });

  it('renders the list first, while it loads, and a visible notice when no view can be drawn', () => {
    const client = createRecordClient({ basePath: '/api/x', fetch: vi.fn() as never });
    expect(renderToStaticMarkup(React.createElement(MetadataWindow, { manifest, client, permissions: clerk }))).toContain('Loading');
    expect(renderToStaticMarkup(React.createElement(MetadataWindow, { manifest: { ...manifest, views: [] }, client, permissions: clerk }))).toContain(
      'This window cannot be drawn',
    );
  });
});
