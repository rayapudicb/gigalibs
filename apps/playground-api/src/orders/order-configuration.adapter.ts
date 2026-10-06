import {
  holdsPermission,
  ModuleAdapterDescriptorV1Schema,
  type ModuleAdapterDescriptorV1,
} from '@gigalibs/contracts';
import type { ModuleConfigurationAdapterV1 } from '../tenant-profile-configuration.adapter.js';

const ORDER_DESCRIPTOR = ModuleAdapterDescriptorV1Schema.parse({
  contractVersion: '1.0',
  adapterKey: 'universal-orders-v1',
  moduleKey: 'universal-orders',
  entityKey: 'sales-orders',
  surfaceKey: 'universal-orders',
  entitlementModuleKey: 'universal-orders',
  capabilities: [
    'SURFACE_DISCOVERY',
    'RUNTIME_MANIFEST',
    'EXTENSION_VALUE_READ',
    'EXTENSION_VALUE_WRITE',
    'ADMINISTRATIVE_PREVIEW',
  ],
  storageStrategy: 'CONTROL_PLANE_EXTENSION_VALUES',
  compatibility: {
    descriptorVersion: '1.0',
    manifestContractVersion: '1.0',
    minimumRuntimeVersion: '1.0',
  },
  limits: {
    maximumFields: 100,
    maximumExtensionSlots: 2,
    maximumFilterDepth: 5,
    maximumFilterPredicates: 20,
  },
  permissions: {
    discover: 'orders:read',
    runtimeRead: 'orders:read',
    extensionRead: 'orders:read',
    extensionWrite: 'orders:manage',
    administrativePreview: ['configuration-runtime:read', 'orders:read'],
  },
  audit: {
    extensionMutationAudited: true,
    previewEventType: 'configuration.runtime.previewed.v1',
  },
  filterContract: {
    enabled: true,
    operators: ['EQUALS', 'IN', 'CONTAINS'],
    maximumDepth: 3,
    maximumPredicates: 10,
  },
  surface: {
    registrationKey: 'universal-orders-surface',
    moduleKey: 'universal-orders',
    entityKey: 'sales-orders',
    surfaceKey: 'universal-orders',
    route: '/orders',
    label: 'Universal Order Management & Fulfillment',
    description: 'Sales quotes, sales orders, ATP allocations, warehouse fulfillment and customer accounts receivable.',
    ownership: 'MODULE_EXTENSION',
    authoringEnabled: true,
    entityKeyEditable: false,
    surfaceKeyEditable: false,
    modes: ['LIST', 'READ', 'CREATE', 'EDIT'],
    coreFields: [
      {
        key: 'order-number',
        label: 'Order Number',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Unique tenant-scoped sales order document number.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'customer-id',
        label: 'Customer Party ID',
        type: 'TEXT',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
        lockReason: 'Customer master reference in gigalibs_party.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'status',
        label: 'Order Status',
        type: 'SELECT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Order lifecycle state machine controlled by platform commands.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'total-amount',
        label: 'Total Amount',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Total minor currency units computed from confirmed order lines.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
    ],
    extensionSlots: [
      {
        key: 'order-header-custom-fields',
        label: 'Order Header Custom Attributes',
        description: 'Tenant custom attributes on sales order header (channel, priority, delivery instructions).',
        allowedFieldTypes: [
          'TEXT',
          'TEXTAREA',
          'NUMBER',
          'INTEGER',
          'BOOLEAN',
          'DATE',
          'SELECT',
          'MULTI_SELECT',
        ],
        maximumFields: 50,
      },
      {
        key: 'fulfillment-custom-fields',
        label: 'Fulfillment & Dispatch Attributes',
        description: 'Tenant custom attributes on warehouse fulfillment and dispatch packaging.',
        allowedFieldTypes: ['TEXT', 'BOOLEAN', 'SELECT', 'DATE'],
        maximumFields: 20,
      },
    ],
  },
  dictionaryContribution: {
    packageKey: 'universal-orders-dictionary',
    name: 'Universal Orders Application Dictionary',
    version: '1.0.0',
    moduleKey: 'universal-orders',
    targetEntityKey: 'orders.sales_order',
    entities: [
      {
        entityKey: 'orders.sales_order',
        moduleKey: 'universal-orders',
        label: 'Sales Order',
        ownership: 'MODULE_CORE',
        primaryKeyField: 'id',
        isVersioned: true,
        isAuditLogged: true,
        isSoftDeletable: false,
      },
    ],
    fields: [
      {
        fieldKey: 'order-number',
        entityKey: 'orders.sales_order',
        label: 'Order Number',
        type: 'TEXT',
        required: true,
        readOnly: true,
        isSystemLocked: true,
        classification: 'INTERNAL',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'status',
        entityKey: 'orders.sales_order',
        label: 'Order Status',
        type: 'SELECT',
        required: true,
        readOnly: true,
        isSystemLocked: true,
        classification: 'INTERNAL',
        referenceKey: 'ref-order-statuses',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'total-amount',
        entityKey: 'orders.sales_order',
        label: 'Total Amount',
        type: 'TEXT',
        required: true,
        readOnly: true,
        isSystemLocked: true,
        classification: 'INTERNAL',
        maskOnDisplay: false,
      },
    ],
    relationships: [],
    references: [
      {
        referenceKey: 'ref-order-statuses',
        referenceType: 'VALUE_LIST',
        staticValues: [
          { value: 'DRAFT', label: 'Draft', isDefault: true },
          { value: 'CONFIRMED', label: 'Confirmed' },
          { value: 'PROCESSING', label: 'Processing' },
          { value: 'PARTIALLY_FULFILLED', label: 'Partially Fulfilled' },
          { value: 'FULFILLED', label: 'Fulfilled' },
          { value: 'CLOSED', label: 'Closed' },
          { value: 'CANCELLED', label: 'Cancelled' },
        ],
      },
    ],
    validationRules: [
      {
        ruleKey: 'rule-order-number-required',
        label: 'Order Number Required',
        errorMessage: 'Order Number is mandatory',
        severity: 'ERROR',
        condition: {
          field: 'order-number',
          operator: 'IS_NOT_NULL',
        },
      },
    ],
    views: [
      {
        viewKey: 'so-main-form',
        label: 'Sales Order Details',
        mode: 'EDIT',
        device: 'ALL',
        tabs: [
          {
            tabKey: 'general-tab',
            label: 'General Information',
            position: 0,
            level: 0,
            targetEntityKey: 'orders.sales_order',
            sections: [
              {
                sectionKey: 'core-section',
                label: 'Order Details',
                collapsible: false,
                defaultCollapsed: false,
                position: 0,
              },
            ],
            fields: [
              {
                fieldKey: 'order-number',
                sectionKey: 'core-section',
                position: 0,
                span: 6,
                componentKey: 'text-input',
              },
              {
                fieldKey: 'status',
                sectionKey: 'core-section',
                position: 1,
                span: 6,
                componentKey: 'select',
              },
              {
                fieldKey: 'total-amount',
                sectionKey: 'core-section',
                position: 2,
                span: 6,
                componentKey: 'text-input',
              },
            ],
          },
        ],
        defaultSortDirection: 'ASC',
      },
    ],
  },
});

export class OrderConfigurationAdapterV1 implements ModuleConfigurationAdapterV1 {
  readonly descriptor: ModuleAdapterDescriptorV1 = ORDER_DESCRIPTOR;

  ownsExtensionOwner(ownerType: string): boolean {
    const normalized = ownerType.trim().toLowerCase();
    return (
      normalized === 'order' ||
      normalized === 'orders' ||
      normalized === 'sales_order' ||
      normalized === 'sales-order' ||
      normalized === 'sales-orders' ||
      normalized === 'sales_orders' ||
      normalized === 'quote' ||
      normalized === 'quotes' ||
      normalized === 'sales_quote' ||
      normalized === 'sales-quote' ||
      normalized === 'sales-quotes' ||
      normalized === 'fulfillment' ||
      normalized === 'fulfillments' ||
      normalized === 'fulfillment_order' ||
      normalized === 'customer_invoice' ||
      normalized === 'customer-invoice' ||
      normalized === 'customer-invoices' ||
      normalized === 'customer_credit_memo' ||
      normalized === 'customer-credit-memo' ||
      normalized === 'credit_memo'
    );
  }

  validatesExtensionOwner(tenantId: string, ownerType: string, ownerId: string): boolean {
    if (!tenantId || !ownerId) return false;
    return this.ownsExtensionOwner(ownerType);
  }

  isAuthorizedForScope(
    tenantId: string,
    permissions: readonly string[],
    action: 'discover' | 'runtimeRead' | 'extensionRead' | 'extensionWrite' | 'administrativePreview',
  ): boolean {
    if (!tenantId) return false;
    const required = this.descriptor.permissions[action];
    if (!required) return true;
    // The one permission rule (WI-OI-120q).
    if (Array.isArray(required)) {
      return required.every((req) => holdsPermission(permissions, req));
    }
    return holdsPermission(permissions, required);
  }
}
