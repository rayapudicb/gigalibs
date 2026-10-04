import {
  ModuleAdapterDescriptorV1Schema,
  type ModuleAdapterDescriptorV1,
} from '@gigalibs/contracts';
import type { ModuleConfigurationAdapterV1 } from '../tenant-profile-configuration.adapter.js';

const INVENTORY_DESCRIPTOR = ModuleAdapterDescriptorV1Schema.parse({
  contractVersion: '1.0',
  adapterKey: 'universal-inventory-v1',
  moduleKey: 'universal-inventory',
  entityKey: 'inventory-lots',
  surfaceKey: 'universal-inventory',
  entitlementModuleKey: 'universal-inventory',
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
    discover: 'inventory:read',
    runtimeRead: 'inventory:read',
    extensionRead: 'inventory:read',
    extensionWrite: 'inventory:receive',
    administrativePreview: ['configuration-runtime:read', 'inventory:read'],
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
    registrationKey: 'universal-inventory-surface',
    moduleKey: 'universal-inventory',
    entityKey: 'inventory-lots',
    surfaceKey: 'universal-inventory',
    route: '/inventory',
    label: 'Universal Inventory & Warehouses',
    description: 'Multi-warehouse stock ledger, balances, lot/serial traceability, receiving, kitting and cycle counts.',
    ownership: 'MODULE_EXTENSION',
    authoringEnabled: true,
    entityKeyEditable: false,
    surfaceKeyEditable: false,
    modes: ['LIST', 'READ', 'CREATE', 'EDIT'],
    coreFields: [
      {
        key: 'lot-number',
        label: 'Lot / Batch Number',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Unique tenant-scoped lot traceability identifier.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'status',
        label: 'Stock Status',
        type: 'SELECT',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
        lockReason: 'Quality status of the inventory batch.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
    ],
    extensionSlots: [
      {
        key: 'lot-attributes-slot',
        label: 'Lot Attributes & Specifications',
        description: 'Tenant custom attributes displayed on lot details (cold-chain, potency, hazmat).',
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
        key: 'receipt-inspection-checklist-slot',
        label: 'Receiving Inspection Checklist',
        description: 'Tenant dynamic inspection fields on inbound receipt lines.',
        allowedFieldTypes: ['TEXT', 'BOOLEAN', 'SELECT'],
        maximumFields: 20,
      },
    ],
  },
  dictionaryContribution: {
    packageKey: 'universal-inventory-dictionary',
    name: 'Universal Inventory Application Dictionary',
    version: '1.0.0',
    moduleKey: 'universal-inventory',
    targetEntityKey: 'inventory.lot',
    entities: [
      {
        entityKey: 'inventory.lot',
        moduleKey: 'universal-inventory',
        label: 'Inventory Lot & Batch',
        ownership: 'MODULE_CORE',
        primaryKeyField: 'id',
        isVersioned: true,
        isAuditLogged: true,
        isSoftDeletable: false,
      },
    ],
    fields: [
      {
        fieldKey: 'lot-number',
        entityKey: 'inventory.lot',
        label: 'Lot Number',
        type: 'TEXT',
        required: true,
        readOnly: true,
        isSystemLocked: true,
        classification: 'INTERNAL',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'status',
        entityKey: 'inventory.lot',
        label: 'Stock Status',
        type: 'SELECT',
        required: true,
        readOnly: false,
        isSystemLocked: true,
        classification: 'INTERNAL',
        referenceKey: 'ref-stock-statuses',
        maskOnDisplay: false,
      },
    ],
    relationships: [],
    references: [
      {
        referenceKey: 'ref-stock-statuses',
        referenceType: 'VALUE_LIST',
        staticValues: [
          { value: 'AVAILABLE', label: 'Available', isDefault: true },
          { value: 'RESERVED', label: 'Reserved' },
          { value: 'QUARANTINED', label: 'Quarantined' },
          { value: 'INSPECTION', label: 'Under Inspection' },
          { value: 'DAMAGED', label: 'Damaged' },
          { value: 'BLOCKED', label: 'Blocked' },
          { value: 'EXPIRED', label: 'Expired' },
        ],
      },
    ],
    validationRules: [
      {
        ruleKey: 'rule-lot-number-required',
        label: 'Lot Number Required',
        errorMessage: 'Lot number is mandatory',
        severity: 'ERROR',
        condition: {
          field: 'lot-number',
          operator: 'IS_NOT_NULL',
        },
      },
    ],
    views: [
      {
        viewKey: 'lot-main-form',
        label: 'Lot Details',
        mode: 'EDIT',
        device: 'ALL',
        tabs: [
          {
            tabKey: 'general-tab',
            label: 'General Information',
            position: 0,
            level: 0,
            targetEntityKey: 'inventory.lot',
            sections: [
              {
                sectionKey: 'core-section',
                label: 'Core Details',
                collapsible: false,
                defaultCollapsed: false,
                position: 0,
              },
            ],
            fields: [
              {
                fieldKey: 'lot-number',
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
            ],
          },
        ],
        defaultSortDirection: 'ASC',
      },
    ],
    navigation: [
      {
        itemKey: 'nav-inventory',
        label: 'Inventory & Warehouses',
        route: '/inventory',
        icon: 'Boxes',
        position: 126,
        requiredPermissions: ['inventory:read'],
      },
    ],
    actions: [],
  },
});

export class InventoryConfigurationAdapterV1 implements ModuleConfigurationAdapterV1 {
  readonly descriptor: ModuleAdapterDescriptorV1 = INVENTORY_DESCRIPTOR;

  ownsExtensionOwner(ownerType: string): boolean {
    const normalized = ownerType.trim().toLowerCase();
    return (
      normalized === 'lot' ||
      normalized === 'lots' ||
      normalized === 'inventory_lot' ||
      normalized === 'inventory-lot' ||
      normalized === 'inventory-lots' ||
      normalized === 'warehouse' ||
      normalized === 'warehouses'
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
    if (Array.isArray(required)) {
      return required.every((req) => permissions.includes(req));
    }
    return permissions.includes(required);
  }
}
