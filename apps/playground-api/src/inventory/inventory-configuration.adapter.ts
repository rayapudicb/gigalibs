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
    maximumExtensionSlots: 3,
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
    defaultBaselineOnly: false,
    allowedFieldTypes: [
      'STRING',
      'INTEGER',
      'DECIMAL',
      'BOOLEAN',
      'DATE',
      'SELECT',
      'MULTI_SELECT',
      'JSON',
    ],
    supportedComponents: [
      'TEXT_INPUT',
      'NUMBER_INPUT',
      'CHECKBOX',
      'SELECT_DROPDOWN',
      'BADGE_STATUS',
      'METRIC_CARD',
      'SUMMARY_PANEL',
      'DATA_TABLE',
      'TABS_LAYOUT',
      'DRAWER',
    ],
    supportedActionHandlers: [
      'core.action.navigate',
      'core.action.drawer.open',
      'core.action.filter.apply',
      'core.action.export',
    ],
    lockedProperties: [
      'id',
      'tenantId',
      'productId',
      'lotNumber',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    ],
    extensionSlots: [
      {
        slotKey: 'lot-attributes-slot',
        label: 'Lot Attributes & Specifications',
        description: 'Tenant custom attributes displayed on lot details (cold-chain, potency, hazmat).',
        targetViewType: 'DETAIL',
        allowMultipleFields: true,
      },
      {
        slotKey: 'receipt-inspection-checklist-slot',
        label: 'Receiving Inspection Checklist',
        description: 'Tenant dynamic inspection fields on inbound receipt lines.',
        targetViewType: 'FORM',
        allowMultipleFields: true,
      },
    ],
  },
  defaultBaseline: {
    entities: [
      {
        entityKey: 'inventory-lots',
        name: 'Inventory Lots & Batches',
        description: 'Governed lot/batch tracking with quality status and custody.',
        primaryKeyField: 'id',
        ownership: 'MODULE_OWNED',
        dataClassification: 'INTERNAL',
        fields: [
          {
            fieldKey: 'lotNumber',
            label: 'Lot / Batch Number',
            dataType: 'STRING',
            controlType: 'TEXT_INPUT',
            ownership: 'MODULE_OWNED',
            dataClassification: 'INTERNAL',
            required: true,
            unique: true,
            locked: true,
          },
          {
            fieldKey: 'status',
            label: 'Stock Status',
            dataType: 'SELECT',
            controlType: 'BADGE_STATUS',
            ownership: 'MODULE_OWNED',
            dataClassification: 'INTERNAL',
            required: true,
            unique: false,
            locked: false,
            referenceKey: 'ref-stock-statuses',
          },
        ],
      },
    ],
    fields: [],
    relationships: [],
    references: [
      {
        referenceKey: 'ref-stock-statuses',
        name: 'Stock Status Reference',
        referenceType: 'ENUM',
        ownership: 'MODULE_OWNED',
        values: [
          { value: 'AVAILABLE', label: 'Available' },
          { value: 'RESERVED', label: 'Reserved' },
          { value: 'QUARANTINED', label: 'Quarantined' },
          { value: 'INSPECTION', label: 'Under Inspection' },
          { value: 'DAMAGED', label: 'Damaged' },
          { value: 'BLOCKED', label: 'Blocked' },
          { value: 'EXPIRED', label: 'Expired' },
        ],
      },
    ],
    validationRules: [],
    views: [
      {
        viewKey: 'lots-list',
        entityKey: 'inventory-lots',
        viewType: 'LIST',
        title: 'Lot Directory',
        layout: {
          density: 'REGULAR',
          columns: [
            { fieldKey: 'lotNumber', header: 'Lot Number', sortable: true, filterable: true, priority: 1 },
            { fieldKey: 'status', header: 'Status', sortable: true, filterable: true, priority: 2 },
          ],
        },
      },
    ],
    navigation: [
      {
        navigationKey: 'nav-inventory',
        label: 'Inventory & Warehouses',
        route: '/inventory',
        icon: 'boxes',
        priority: 126,
      },
    ],
    actions: [],
    messages: [
      {
        messageKey: 'msg.lot.created',
        defaultTemplate: 'Lot {lotNumber} created successfully.',
      },
    ],
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
