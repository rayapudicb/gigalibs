import {
  holdsPermission,
  ModuleAdapterDescriptorV1Schema,
  type ModuleAdapterDescriptorV1,
} from '@gigalibs/contracts';
import type { ModuleConfigurationAdapterV1 } from '../tenant-profile-configuration.adapter.js';

const PROCUREMENT_DESCRIPTOR = ModuleAdapterDescriptorV1Schema.parse({
  contractVersion: '1.0',
  adapterKey: 'universal-procurement-v1',
  moduleKey: 'universal-procurement',
  entityKey: 'purchase-orders',
  surfaceKey: 'universal-procurement',
  entitlementModuleKey: 'universal-procurement',
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
    discover: 'procurement:read',
    runtimeRead: 'procurement:read',
    extensionRead: 'procurement:read',
    extensionWrite: 'procurement:update',
    administrativePreview: ['configuration-runtime:read', 'procurement:read'],
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
    registrationKey: 'universal-procurement-surface',
    moduleKey: 'universal-procurement',
    entityKey: 'purchase-orders',
    surfaceKey: 'universal-procurement',
    route: '/procurement',
    label: 'Universal Procurement & Payables',
    description: 'Purchase requisitions, delegation of authority, purchase orders, 3-way matching and vendor payables.',
    ownership: 'MODULE_EXTENSION',
    authoringEnabled: true,
    entityKeyEditable: false,
    surfaceKeyEditable: false,
    modes: ['LIST', 'READ', 'CREATE', 'EDIT'],
    coreFields: [
      {
        key: 'order-number',
        label: 'PO Number',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Unique tenant-scoped purchase order identifier.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'vendor-id',
        label: 'Vendor Party ID',
        type: 'TEXT',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
        lockReason: 'Vendor master reference in gigalibs_party.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'status',
        label: 'Order Status',
        type: 'SELECT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Order lifecycle status controlled by platform commands.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'total-amount',
        label: 'Total Amount',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Minor currency units total calculated from order lines.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
    ],
    extensionSlots: [
      {
        key: 'po-header-custom-fields',
        label: 'PO Header Custom Attributes',
        description: 'Tenant custom attributes on PO header (cost center, project code, custom incoterm).',
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
        key: 'vendor-invoice-tax-compliance',
        label: 'Vendor Invoice Tax & Compliance Checklist',
        description: 'Tenant custom compliance checklist fields on vendor bills and invoice matching.',
        allowedFieldTypes: ['TEXT', 'BOOLEAN', 'SELECT', 'DATE'],
        maximumFields: 20,
      },
    ],
  },
  dictionaryContribution: {
    packageKey: 'universal-procurement-dictionary',
    name: 'Universal Procurement Application Dictionary',
    version: '1.0.0',
    moduleKey: 'universal-procurement',
    targetEntityKey: 'procurement.purchase_order',
    entities: [
      {
        entityKey: 'procurement.purchase_order',
        moduleKey: 'universal-procurement',
        label: 'Purchase Order',
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
        entityKey: 'procurement.purchase_order',
        label: 'PO Number',
        type: 'TEXT',
        required: true,
        readOnly: true,
        isSystemLocked: true,
        classification: 'INTERNAL',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'vendor-id',
        entityKey: 'procurement.purchase_order',
        label: 'Vendor',
        type: 'TEXT',
        required: true,
        readOnly: false,
        isSystemLocked: true,
        classification: 'INTERNAL',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'status',
        entityKey: 'procurement.purchase_order',
        label: 'Order Status',
        type: 'SELECT',
        required: true,
        readOnly: true,
        isSystemLocked: true,
        classification: 'INTERNAL',
        referenceKey: 'ref-po-statuses',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'total-amount',
        entityKey: 'procurement.purchase_order',
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
        referenceKey: 'ref-po-statuses',
        referenceType: 'VALUE_LIST',
        staticValues: [
          { value: 'DRAFT', label: 'Draft', isDefault: true },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'ISSUED', label: 'Issued' },
          { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
          { value: 'CLOSED', label: 'Closed' },
          { value: 'CANCELLED', label: 'Cancelled' },
        ],
      },
    ],
    validationRules: [
      {
        ruleKey: 'rule-order-number-required',
        label: 'PO Number Required',
        errorMessage: 'PO Number is mandatory',
        severity: 'ERROR',
        condition: {
          field: 'order-number',
          operator: 'IS_NOT_NULL',
        },
      },
      {
        ruleKey: 'rule-vendor-party-required',
        label: 'Vendor Party Required',
        errorMessage: 'Select an active vendor from workspace parties',
        severity: 'ERROR',
        condition: {
          field: 'vendor-id',
          operator: 'IS_NOT_NULL',
        },
      },
    ],
    views: [
      {
        viewKey: 'po-main-form',
        label: 'Purchase Order Details',
        mode: 'EDIT',
        device: 'ALL',
        tabs: [
          {
            tabKey: 'general-tab',
            label: 'General Information',
            position: 0,
            level: 0,
            targetEntityKey: 'procurement.purchase_order',
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
                fieldKey: 'vendor-id',
                sectionKey: 'core-section',
                position: 1,
                span: 6,
                componentKey: 'text-input',
              },
              {
                fieldKey: 'status',
                sectionKey: 'core-section',
                position: 2,
                span: 6,
                componentKey: 'select',
              },
              {
                fieldKey: 'total-amount',
                sectionKey: 'core-section',
                position: 3,
                span: 6,
                componentKey: 'text-input',
              },
            ],
          },
        ],
        defaultSortDirection: 'ASC',
      },
    ],
    navigation: [
      {
        itemKey: 'nav-procurement',
        label: 'Procurement & Payables',
        route: '/procurement',
        icon: 'ShoppingCart',
        position: 128,
        requiredPermissions: ['procurement:read'],
      },
    ],
    actions: [
      {
        actionKey: 'po-issue',
        label: 'Issue Order to Vendor',
        type: 'COMMAND',
        handlerKey: 'procurement.order.issue',
        requiredPermissions: ['procurement:orders:issue'],
        confirmationPrompt: 'Are you sure you want to issue this purchase order to the vendor?',
      },
    ],
  },
});

export class ProcurementConfigurationAdapterV1 implements ModuleConfigurationAdapterV1 {
  readonly descriptor: ModuleAdapterDescriptorV1 = PROCUREMENT_DESCRIPTOR;

  ownsExtensionOwner(ownerType: string): boolean {
    const normalized = ownerType.trim().toLowerCase();
    return (
      normalized === 'order' ||
      normalized === 'orders' ||
      normalized === 'purchase_order' ||
      normalized === 'purchase-order' ||
      normalized === 'purchase-orders' ||
      normalized === 'purchase_orders' ||
      normalized === 'requisition' ||
      normalized === 'requisitions' ||
      normalized === 'procurement_requisition' ||
      normalized === 'procurement-requisition' ||
      normalized === 'vendor_bill' ||
      normalized === 'vendor-bill' ||
      normalized === 'vendor-bills' ||
      normalized === 'debit_memo' ||
      normalized === 'debit-memo' ||
      normalized === 'debit-memos' ||
      normalized === 'procurement'
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
