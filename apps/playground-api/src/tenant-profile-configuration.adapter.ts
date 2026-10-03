import {
  ModuleAdapterDescriptorV1Schema,
  type ModuleAdapterDescriptorV1,
} from '@gigalibs/contracts';

export interface ModuleConfigurationAdapterV1 {
  readonly descriptor: ModuleAdapterDescriptorV1;
  ownsExtensionOwner(ownerType: string): boolean;
  validatesExtensionOwner(tenantId: string, ownerType: string, ownerId: string): boolean;
}

const TENANT_PROFILE_DESCRIPTOR = ModuleAdapterDescriptorV1Schema.parse({
  contractVersion: '1.0',
  adapterKey: 'tenant-profile-v1',
  moduleKey: 'tenant-settings',
  entityKey: 'tenant-profile',
  surfaceKey: 'profile-extension',
  entitlementModuleKey: 'tenant-access',
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
    maximumExtensionSlots: 1,
    maximumFilterDepth: 5,
    maximumFilterPredicates: 20,
  },
  permissions: {
    discover: 'configuration:read',
    runtimeRead: 'configuration-runtime:read',
    extensionRead: 'configuration-values:read',
    extensionWrite: 'configuration-values:write',
    administrativePreview: ['configuration-runtime:read', 'configuration:read'],
  },
  audit: {
    extensionMutationAudited: true,
    previewEventType: 'configuration.runtime.previewed.v1',
  },
  filterContract: {
    enabled: false,
    operators: [],
    maximumDepth: 5,
    maximumPredicates: 20,
  },
  surface: {
    registrationKey: 'tenant-profile-extension',
    moduleKey: 'tenant-settings',
    entityKey: 'tenant-profile',
    surfaceKey: 'profile-extension',
    route: '/settings',
    label: 'Tenant profile',
    description: 'Add governed tenant-specific attributes to the organization profile.',
    ownership: 'MODULE_EXTENSION',
    authoringEnabled: true,
    entityKeyEditable: false,
    surfaceKeyEditable: false,
    modes: ['EDIT'],
    coreFields: [
      {
        key: 'name',
        label: 'Workspace name',
        type: 'TEXT',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
        lockReason: 'Canonical tenant identity used throughout the control plane.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'slug',
        label: 'Workspace slug',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Stable tenant routing identity managed by the tenant service.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT'],
      },
      {
        key: 'status',
        label: 'Workspace status',
        type: 'SELECT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Tenant lifecycle is controlled by authorized platform commands.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'region',
        label: 'Data region',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Residency and deployment binding require an operator-controlled workflow.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
    ],
    extensionSlots: [
      {
        key: 'profile-details',
        label: 'Additional workspace details',
        description: 'Tenant-specific, non-secret profile attributes.',
        allowedFieldTypes: [
          'TEXT',
          'TEXTAREA',
          'NUMBER',
          'INTEGER',
          'BOOLEAN',
          'DATE',
          'DATETIME',
          'EMAIL',
          'PHONE',
          'URL',
          'SELECT',
          'MULTI_SELECT',
        ],
        maximumFields: 100,
      },
    ],
  },
  dictionaryContribution: {
    packageKey: 'tenant-profile-dictionary',
    name: 'Tenant Profile Application Dictionary',
    version: '1.0.0',
    moduleKey: 'tenant-settings',
    targetEntityKey: 'platform.tenant-profile',
    entities: [
      {
        entityKey: 'platform.tenant-profile',
        moduleKey: 'tenant-settings',
        label: 'Tenant Profile',
        ownership: 'MODULE_CORE',
        primaryKeyField: 'id',
        isVersioned: true,
        isAuditLogged: true,
        isSoftDeletable: false,
      },
    ],
    fields: [
      {
        fieldKey: 'name',
        entityKey: 'platform.tenant-profile',
        label: 'Workspace name',
        type: 'TEXT',
        required: true,
        readOnly: false,
        isSystemLocked: true,
        classification: 'INTERNAL',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'slug',
        entityKey: 'platform.tenant-profile',
        label: 'Workspace slug',
        type: 'TEXT',
        required: true,
        readOnly: true,
        isSystemLocked: true,
        classification: 'INTERNAL',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'status',
        entityKey: 'platform.tenant-profile',
        label: 'Workspace status',
        type: 'SELECT',
        required: true,
        readOnly: true,
        isSystemLocked: true,
        classification: 'INTERNAL',
        referenceKey: 'ref-tenant-statuses',
        maskOnDisplay: false,
      },
      {
        fieldKey: 'region',
        entityKey: 'platform.tenant-profile',
        label: 'Data region',
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
        referenceKey: 'ref-tenant-statuses',
        referenceType: 'VALUE_LIST',
        staticValues: [
          { value: 'ACTIVE', label: 'Active', isDefault: true },
          { value: 'SUSPENDED', label: 'Suspended' },
          { value: 'ARCHIVED', label: 'Archived' },
        ],
      },
    ],
    validationRules: [
      {
        ruleKey: 'rule-name-required',
        label: 'Workspace Name Required',
        errorMessage: 'Workspace name cannot be empty',
        severity: 'ERROR',
        condition: {
          field: 'name',
          operator: 'IS_NOT_NULL',
        },
      },
    ],
    views: [
      {
        viewKey: 'tenant-profile-main',
        label: 'Workspace Profile',
        mode: 'EDIT',
        device: 'ALL',
        tabs: [
          {
            tabKey: 'general-tab',
            label: 'General Information',
            position: 0,
            level: 0,
            targetEntityKey: 'platform.tenant-profile',
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
                fieldKey: 'name',
                sectionKey: 'core-section',
                position: 0,
                span: 6,
                componentKey: 'text-input',
              },
              {
                fieldKey: 'slug',
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
                fieldKey: 'region',
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
        itemKey: 'nav-tenant-profile',
        label: 'Organization Profile',
        route: '/settings',
        position: 10,
        requiredPermissions: ['configuration:read'],
      },
    ],
    actions: [
      {
        actionKey: 'verify-domain',
        label: 'Verify Domain',
        type: 'COMMAND',
        handlerKey: 'platform.tenant-profile.verify-domain',
        requiredPermissions: ['configuration:write'],
      },
    ],
    messages: [
      {
        messageKey: 'profile.title',
        locale: 'en-US',
        value: 'Workspace Profile',
        category: 'LABEL',
      },
    ],
  },
  registeredResolvers: ['ref-tenant-statuses'],
  registeredActionHandlers: ['platform.tenant-profile.verify-domain'],
});

export class TenantProfileConfigurationAdapterV1 implements ModuleConfigurationAdapterV1 {
  readonly descriptor = TENANT_PROFILE_DESCRIPTOR;

  ownsExtensionOwner(ownerType: string): boolean {
    return ownerType === 'tenant-profile';
  }

  validatesExtensionOwner(tenantId: string, ownerType: string, ownerId: string): boolean {
    return this.ownsExtensionOwner(ownerType) && ownerId === tenantId;
  }
}
