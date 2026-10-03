import { describe, expect, it } from 'vitest';
import {
  type DictionaryPackageDefinitionV1,
  compileDictionaryPackage,
  classifyDictionaryImpact,
} from './dictionary-compiler.js';

const validBasePackage: DictionaryPackageDefinitionV1 = {
  packageKey: 'test-package',
  name: 'Test Package',
  version: '1.0.0',
  moduleKey: 'platform',
  targetEntityKey: 'platform.tenant-profile',
  entities: [
    {
      entityKey: 'platform.tenant-profile',
      moduleKey: 'platform',
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
      fieldKey: 'organization-name',
      entityKey: 'platform.tenant-profile',
      label: 'Organization Name',
      type: 'TEXT',
      required: true,
      readOnly: false,
      isSystemLocked: true,
      classification: 'PUBLIC',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'industry-type',
      entityKey: 'platform.tenant-profile',
      label: 'Industry Type',
      type: 'SELECT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      referenceKey: 'ref-industries',
      maskOnDisplay: false,
    },
  ],
  relationships: [],
  references: [
    {
      referenceKey: 'ref-industries',
      referenceType: 'VALUE_LIST',
      staticValues: [{ value: 'TECH', label: 'Technology' }],
    },
  ],
  validationRules: [
    {
      ruleKey: 'rule-org-length',
      label: 'Org Name Length',
      errorMessage: 'Org name must not be empty',
      severity: 'ERROR',
      condition: {
        field: 'organization-name',
        operator: 'IS_NOT_NULL',
      },
    },
  ],
  views: [
    {
      viewKey: 'profile-view',
      label: 'Profile View',
      mode: 'READ',
      device: 'ALL',
      tabs: [
        {
          tabKey: 'main-tab',
          label: 'Main',
          position: 0,
          level: 0,
          targetEntityKey: 'platform.tenant-profile',
          sections: [],
          fields: [
            {
              fieldKey: 'organization-name',
              position: 0,
              span: 12,
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
      itemKey: 'nav-profile',
      label: 'Profile',
      route: '/settings/profile',
      position: 1,
      requiredPermissions: [],
    },
  ],
  actions: [
    {
      actionKey: 'sync-profile',
      label: 'Sync Profile',
      type: 'COMMAND',
      handlerKey: 'platform.sync-profile-handler',
      requiredPermissions: [],
    },
  ],
  messages: [
    {
      messageKey: 'msg.welcome',
      locale: 'en-US',
      value: 'Welcome to Profile',
      category: 'LABEL',
    },
  ],
};

describe('Application Dictionary Compiler (WI-OI-110 / AD-1)', () => {
  const options = {
    tenantId: '550e8400-e29b-41d4-a716-446655440000',
    publishedVersionId: '550e8400-e29b-41d4-a716-446655440001',
    registeredActionHandlers: ['platform.sync-profile-handler'],
  };

  it('compiles a valid package into an immutable manifest with deterministic SHA-256', () => {
    const res1 = compileDictionaryPackage(validBasePackage, options);
    expect(res1.valid).toBe(true);
    expect(res1.manifest).toBeDefined();
    expect(res1.manifest?.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Reorder inputs and verify identical checksum
    const shuffledPackage = {
      ...validBasePackage,
      fields: [...validBasePackage.fields].reverse(),
    };
    const res2 = compileDictionaryPackage(shuffledPackage, options);
    expect(res2.manifest?.checksum).toBe(res1.manifest?.checksum);
  });

  it('rejects duplicate entity and field keys', () => {
    const duplicatePkg = {
      ...validBasePackage,
      entities: [...validBasePackage.entities, validBasePackage.entities[0]!],
    };
    const result = compileDictionaryPackage(duplicatePkg, options);
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.code === 'DUPLICATE_ENTITY_KEY')).toBe(true);
  });

  it('rejects missing reference keys in field definitions', () => {
    const invalidRefPkg = {
      ...validBasePackage,
      fields: [
        ...validBasePackage.fields,
        {
          fieldKey: 'missing-ref-field',
          entityKey: 'platform.tenant-profile',
          label: 'Missing Ref',
          type: 'SELECT' as const,
          required: false,
          readOnly: false,
          isSystemLocked: false,
          classification: 'INTERNAL' as const,
          referenceKey: 'non-existent-reference',
          maskOnDisplay: false,
        },
      ],
    };
    const result = compileDictionaryPackage(invalidRefPkg, options);
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.code === 'MISSING_REFERENCE')).toBe(true);
  });

  it('detects and rejects navigation hierarchy cycles', () => {
    const cyclicNavPkg = {
      ...validBasePackage,
      navigation: [
        {
          itemKey: 'nav-a',
          label: 'Nav A',
          route: '/a',
          parentItemKey: 'nav-b',
          position: 1,
          requiredPermissions: [],
        },
        {
          itemKey: 'nav-b',
          label: 'Nav B',
          route: '/b',
          parentItemKey: 'nav-a',
          position: 2,
          requiredPermissions: [],
        },
      ],
    };
    const result = compileDictionaryPackage(cyclicNavPkg, options);
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.code === 'NAVIGATION_CYCLE_DETECTED')).toBe(true);
  });

  it('protects baseline system-locked field properties from tenant mutation', () => {
    const baseline = {
      fields: [validBasePackage.fields[0]!],
    };

    // Attempting to change locked field type from TEXT to NUMBER
    const mutatedPkg = {
      ...validBasePackage,
      fields: [
        {
          ...validBasePackage.fields[0]!,
          type: 'NUMBER' as const,
        },
        validBasePackage.fields[1]!,
      ],
    };

    const result = compileDictionaryPackage(mutatedPkg, {
      ...options,
      baseline,
    });
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.code === 'LOCKED_PROPERTY_MUTATION')).toBe(true);
  });

  it('rejects unregistered action handlers', () => {
    const unregActionPkg = {
      ...validBasePackage,
      actions: [
        {
          actionKey: 'malicious-action',
          label: 'Unregistered Action',
          type: 'COMMAND' as const,
          handlerKey: 'unregistered.arbitrary.handler',
          requiredPermissions: [],
        },
      ],
    };
    const result = compileDictionaryPackage(unregActionPkg, {
      ...options,
      registeredActionHandlers: ['platform.sync-profile-handler'],
    });
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.code === 'UNREGISTERED_ACTION_HANDLER')).toBe(true);
  });

  it('classifies dictionary package impact correctly', () => {
    // 1. Compatible addition of an optional field
    const nextCompatible: DictionaryPackageDefinitionV1 = {
      ...validBasePackage,
      fields: [
        ...validBasePackage.fields,
        {
          fieldKey: 'custom-notes',
          entityKey: 'platform.tenant-profile',
          label: 'Custom Notes',
          type: 'TEXT',
          required: false,
          readOnly: false,
          isSystemLocked: false,
          classification: 'INTERNAL',
          maskOnDisplay: false,
        },
      ],
    };
    const impact1 = classifyDictionaryImpact(validBasePackage, nextCompatible);
    expect(impact1.classification).toBe('COMPATIBLE');

    // 2. Breaking removal of a field
    const nextBreakingRemove: DictionaryPackageDefinitionV1 = {
      ...validBasePackage,
      fields: [validBasePackage.fields[0]!],
    };
    const impact2 = classifyDictionaryImpact(validBasePackage, nextBreakingRemove);
    expect(impact2.classification).toBe('BREAKING');
    expect(impact2.changes.some((c) => c.kind === 'FIELD_REMOVED')).toBe(true);

    // 3. Breaking field type mutation
    const nextBreakingType: DictionaryPackageDefinitionV1 = {
      ...validBasePackage,
      fields: [
        validBasePackage.fields[0]!,
        {
          ...validBasePackage.fields[1]!,
          type: 'NUMBER',
        },
      ],
    };
    const impact3 = classifyDictionaryImpact(validBasePackage, nextBreakingType);
    expect(impact3.classification).toBe('BREAKING');
    expect(impact3.changes.some((c) => c.kind === 'FIELD_TYPE_CHANGED')).toBe(true);
  });

  it('rejects custom non-core entities that use reserved core entity names', () => {
    const invalidCustomApp: DictionaryPackageDefinitionV1 = {
      ...validBasePackage,
      packageKey: 'custom-app',
      name: 'Custom App With Reserved Name',
      entities: [
        {
          entityKey: 'custom.invoice',
          moduleKey: 'custom',
          label: 'Custom Invoice',
          ownership: 'TENANT_EXTENSION',
          primaryKeyField: 'id',
          isVersioned: true,
          isAuditLogged: true,
          isSoftDeletable: false,
        },
      ],
      fields: [
        {
          fieldKey: 'ref-number',
          entityKey: 'custom.invoice',
          label: 'Reference Number',
          type: 'TEXT',
          required: true,
          readOnly: false,
          isSystemLocked: false,
          classification: 'INTERNAL',
          maskOnDisplay: false,
        },
      ],
      views: [
        {
          ...validBasePackage.views[0]!,
          tabs: [
            {
              ...validBasePackage.views[0]!.tabs[0]!,
              targetEntityKey: 'custom.invoice',
              fields: [
                {
                  fieldKey: 'ref-number',
                  position: 0,
                  span: 12,
                  componentKey: 'text-input',
                },
              ],
            },
          ],
        },
      ],
    };

    const result = compileDictionaryPackage(invalidCustomApp);
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.code === 'RESERVED_ENTITY_NAME')).toBe(true);
  });
});

