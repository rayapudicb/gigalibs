import {
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
      'code',
      'productType',
      'baseUomId',
      'version',
      'createdAt',
      'updatedAt',
    ],
    extensionSlots: [
      {
        slotKey: 'product-overview-panel',
        label: 'Product Overview Slot',
        description: 'Tenant custom attributes displayed on product dossier overview.',
        targetViewType: 'DETAIL',
        allowMultipleFields: true,
      },
      {
        slotKey: 'product-grid-column',
        label: 'Product Grid Custom Column',
        description: 'Tenant custom field displayed in main product table view.',
        targetViewType: 'LIST',
        allowMultipleFields: true,
      },
    ],
  },
  defaultBaseline: {
    entities: [
      {
        entityKey: 'products',
        name: 'Product & Service Master',
        description: 'Governed product, service, and resource master catalog.',
        primaryKeyField: 'id',
        ownership: 'MODULE_OWNED',
        dataClassification: 'INTERNAL',
        fields: [
          {
            fieldKey: 'code',
            label: 'Product Code / SKU',
            dataType: 'STRING',
            controlType: 'TEXT_INPUT',
            ownership: 'MODULE_OWNED',
            dataClassification: 'INTERNAL',
            required: true,
            unique: true,
            locked: true,
          },
          {
            fieldKey: 'name',
            label: 'Product Name',
            dataType: 'STRING',
            controlType: 'TEXT_INPUT',
            ownership: 'MODULE_OWNED',
            dataClassification: 'INTERNAL',
            required: true,
            unique: false,
            locked: false,
          },
          {
            fieldKey: 'productType',
            label: 'Product Type',
            dataType: 'SELECT',
            controlType: 'SELECT_DROPDOWN',
            ownership: 'MODULE_OWNED',
            dataClassification: 'INTERNAL',
            required: true,
            unique: false,
            locked: true,
            referenceKey: 'ref-product-types',
          },
          {
            fieldKey: 'status',
            label: 'Lifecycle Status',
            dataType: 'SELECT',
            controlType: 'BADGE_STATUS',
            ownership: 'MODULE_OWNED',
            dataClassification: 'INTERNAL',
            required: true,
            unique: false,
            locked: false,
            referenceKey: 'ref-product-statuses',
          },
          {
            fieldKey: 'baseUomId',
            label: 'Base UOM',
            dataType: 'STRING',
            controlType: 'SELECT_DROPDOWN',
            ownership: 'MODULE_OWNED',
            dataClassification: 'INTERNAL',
            required: true,
            unique: false,
            locked: true,
          },
        ],
      },
    ],
    fields: [],
    relationships: [],
    references: [
      {
        referenceKey: 'ref-product-types',
        name: 'Product Types Reference',
        referenceType: 'ENUM',
        ownership: 'MODULE_OWNED',
        values: [
          { value: 'GOOD', label: 'Physical Good / Item' },
          { value: 'SERVICE', label: 'Service' },
          { value: 'DIGITAL', label: 'Digital Product' },
          { value: 'RESOURCE', label: 'Resource / Capacity' },
          { value: 'BUNDLE', label: 'Commercial Bundle' },
        ],
      },
      {
        referenceKey: 'ref-product-statuses',
        name: 'Product Statuses Reference',
        referenceType: 'ENUM',
        ownership: 'MODULE_OWNED',
        values: [
          { value: 'DRAFT', label: 'Draft' },
          { value: 'ACTIVE', label: 'Active' },
          { value: 'DISCONTINUED', label: 'Discontinued' },
          { value: 'ARCHIVED', label: 'Archived' },
        ],
      },
    ],
    validationRules: [],
    views: [
      {
        viewKey: 'products-list',
        entityKey: 'products',
        viewType: 'LIST',
        title: 'Products & Services Directory',
        layout: {
          density: 'REGULAR',
          columns: [
            { fieldKey: 'code', header: 'Code / SKU', sortable: true, filterable: true, priority: 1 },
            { fieldKey: 'name', header: 'Name', sortable: true, filterable: true, priority: 2 },
            { fieldKey: 'productType', header: 'Type', sortable: true, filterable: true, priority: 3 },
            { fieldKey: 'status', header: 'Status', sortable: true, filterable: true, priority: 4 },
          ],
        },
      },
      {
        viewKey: 'product-detail',
        entityKey: 'products',
        viewType: 'DETAIL',
        title: 'Product Dossier',
        layout: {
          density: 'REGULAR',
          sections: [
            {
              sectionKey: 'sec-overview',
              title: 'Overview',
              collapsible: false,
              fields: [
                { fieldKey: 'code', span: 1 },
                { fieldKey: 'name', span: 2 },
                { fieldKey: 'productType', span: 1 },
                { fieldKey: 'status', span: 1 },
              ],
            },
          ],
        },
      },
    ],
    navigation: [
      {
        navigationKey: 'nav-products',
        label: 'Products & Catalogues',
        route: '/products',
        icon: 'boxes',
        priority: 125,
      },
    ],
    actions: [
      {
        actionKey: 'product.action.create',
        label: 'New Product',
        handlerKey: 'core.action.drawer.open',
        requiresPermission: 'products:create',
      },
    ],
    messages: [
      {
        messageKey: 'msg.product.created',
        defaultTemplate: 'Product {name} ({code}) created successfully.',
      },
      {
        messageKey: 'msg.price.resolved',
        defaultTemplate: 'Resolved price for {code}: {amount} {currency}.',
      },
    ],
  },
});

export class ProductConfigurationAdapterV1 implements ModuleConfigurationAdapterV1 {
  readonly descriptor: ModuleAdapterDescriptorV1 = PRODUCT_DESCRIPTOR;

  ownsExtensionOwner(ownerType: string): boolean {
    return (
      ownerType.trim().toLowerCase() === 'product' ||
      ownerType.trim().toLowerCase() === 'products'
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
