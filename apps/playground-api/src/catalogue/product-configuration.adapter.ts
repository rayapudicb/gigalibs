import {
  holdsPermission,
  ModuleAdapterDescriptorV1Schema,
  type ModuleAdapterDescriptorV1,
} from '@gigalibs/contracts';
import type { ModuleConfigurationAdapterV1 } from '../tenant-profile-configuration.adapter.js';

const PRODUCT_DESCRIPTOR = ModuleAdapterDescriptorV1Schema.parse({
  contractVersion: '1.0',
  adapterKey: 'product-catalogue-v1',
  moduleKey: 'product-catalogue',
  entityKey: 'products',
  surfaceKey: 'product-catalogue',
  entitlementModuleKey: 'product-catalogue',
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
    discover: 'products:read',
    runtimeRead: 'products:read',
    extensionRead: 'products:read',
    extensionWrite: 'products:update',
    administrativePreview: ['configuration-runtime:read', 'products:read'],
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
    registrationKey: 'product-catalogue-surface',
    moduleKey: 'product-catalogue',
    entityKey: 'products',
    surfaceKey: 'product-catalogue',
    route: '/products',
    label: 'Product Catalogue',
    description: 'Master directory of products, services, UOMs, categories, and governed price lists.',
    ownership: 'MODULE_EXTENSION',
    authoringEnabled: true,
    entityKeyEditable: false,
    surfaceKeyEditable: false,
    modes: ['LIST', 'READ', 'CREATE', 'EDIT'],
    coreFields: [
      {
        key: 'code',
        label: 'Product Code / SKU',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Unique tenant-scoped product SKU.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'name',
        label: 'Product Name',
        type: 'TEXT',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
        lockReason: 'Canonical product display name.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'product-type',
        label: 'Product Type',
        type: 'SELECT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Product kind (good, service, resource, bundle).',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'status',
        label: 'Lifecycle Status',
        type: 'SELECT',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
        lockReason: 'Product operational status.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
    ],
    extensionSlots: [
      {
        key: 'product-overview-panel',
        label: 'Product Overview Slot',
        description: 'Tenant custom attributes displayed on product dossier overview.',
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
        key: 'product-grid-column',
        label: 'Product Grid Custom Column',
        description: 'Tenant custom field displayed in main product table view.',
        allowedFieldTypes: ['TEXT', 'NUMBER', 'SELECT'],
        maximumFields: 10,
      },
    ],
  },
  dictionaryContribution: {
    packageKey: 'product-catalogue-dictionary',
    name: 'Product Catalogue Application Dictionary',
    version: '1.0.0',
    moduleKey: 'product-catalogue',
    targetEntityKey: 'catalogue.product',
    entities: [
      {
        entityKey: 'catalogue.product',
        moduleKey: 'product-catalogue',
        label: 'Product',
        ownership: 'MODULE_CORE',
        primaryKeyField: 'id',
        isVersioned: true,
        isAuditLogged: true,
        isSoftDeletable: false,
      },
    ],
    fields: [
      {
        fieldKey: 'code',
        entityKey: 'catalogue.product',
        label: 'Product Code / SKU',
        type: 'TEXT',
        required: true,
        readOnly: true,
        isSystemLocked: true,
        classification: 'INTERNAL',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'name',
        entityKey: 'catalogue.product',
        label: 'Product Name',
        type: 'TEXT',
        required: true,
        readOnly: false,
        isSystemLocked: true,
        classification: 'INTERNAL',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'product-type',
        entityKey: 'catalogue.product',
        label: 'Product Type',
        type: 'SELECT',
        required: true,
        readOnly: true,
        isSystemLocked: true,
        classification: 'INTERNAL',
        referenceKey: 'ref-product-types',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'status',
        entityKey: 'catalogue.product',
        label: 'Status',
        type: 'SELECT',
        required: true,
        readOnly: false,
        isSystemLocked: true,
        classification: 'INTERNAL',
        referenceKey: 'ref-product-statuses',
        maskOnDisplay: false,
      },
    ],
    relationships: [],
    references: [
      {
        referenceKey: 'ref-product-types',
        referenceType: 'VALUE_LIST',
        staticValues: [
          { value: 'GOOD', label: 'Good', isDefault: true },
          { value: 'SERVICE', label: 'Service' },
          { value: 'DIGITAL', label: 'Digital' },
          { value: 'RESOURCE', label: 'Resource' },
          { value: 'BUNDLE', label: 'Bundle' },
        ],
      },
      {
        referenceKey: 'ref-product-statuses',
        referenceType: 'VALUE_LIST',
        staticValues: [
          { value: 'DRAFT', label: 'Draft', isDefault: true },
          { value: 'ACTIVE', label: 'Active' },
          { value: 'DISCONTINUED', label: 'Discontinued' },
          { value: 'ARCHIVED', label: 'Archived' },
        ],
      },
    ],
    validationRules: [
      {
        ruleKey: 'rule-code-required',
        label: 'Product Code Required',
        errorMessage: 'Product code is mandatory and unique',
        severity: 'ERROR',
        condition: {
          field: 'code',
          operator: 'IS_NOT_NULL',
        },
      },
    ],
    views: [
      {
        viewKey: 'product-main-form',
        label: 'Product Details',
        mode: 'EDIT',
        device: 'ALL',
        tabs: [
          {
            tabKey: 'general-tab',
            label: 'General Information',
            position: 0,
            level: 0,
            targetEntityKey: 'catalogue.product',
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
                fieldKey: 'code',
                sectionKey: 'core-section',
                position: 0,
                span: 6,
                componentKey: 'text-input',
              },
              {
                fieldKey: 'name',
                sectionKey: 'core-section',
                position: 1,
                span: 6,
                componentKey: 'text-input',
              },
              {
                fieldKey: 'product-type',
                sectionKey: 'core-section',
                position: 2,
                span: 6,
                componentKey: 'select',
              },
              {
                fieldKey: 'status',
                sectionKey: 'core-section',
                position: 3,
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
        itemKey: 'nav-product-catalogue',
        label: 'Products',
        route: '/products',
        icon: 'Package',
        position: 120,
        requiredPermissions: ['products:read'],
      },
    ],
    actions: [],
  },
});

export class ProductConfigurationAdapterV1 implements ModuleConfigurationAdapterV1 {
  readonly descriptor: ModuleAdapterDescriptorV1 = PRODUCT_DESCRIPTOR;

  ownsExtensionOwner(ownerType: string): boolean {
    const normalized = ownerType.trim().toLowerCase();
    return (
      normalized === 'product' ||
      normalized === 'products' ||
      normalized === 'catalogue' ||
      normalized === 'price_list' ||
      normalized === 'pricelist' ||
      normalized === 'uom'
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
