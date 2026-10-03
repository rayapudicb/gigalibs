import { describe, expect, it } from 'vitest';
import {
  CompiledDictionaryManifestV1Schema,
  DictionaryActionV1Schema,
  DictionaryEntityV1Schema,
  DictionaryFieldV1Schema,
  DictionaryMessageV1Schema,
  DictionaryNavigationItemV1Schema,
  DictionaryPackageDefinitionV1Schema,
  DictionaryReferenceV1Schema,
  DictionaryRelationshipV1Schema,
  DictionaryValidationRuleV1Schema,
  DictionaryViewV1Schema,
} from './dictionary.js';

describe('Application Dictionary Contracts (WI-OI-110 / AD-0)', () => {
  it('validates a registered entity definition', () => {
    const valid = DictionaryEntityV1Schema.parse({
      entityKey: 'platform.tenant-profile',
      moduleKey: 'platform',
      label: 'Tenant Profile',
      description: 'Core organizational profile metadata',
      ownership: 'MODULE_CORE',
      primaryKeyField: 'id',
      isVersioned: true,
      isAuditLogged: true,
    });
    expect(valid.entityKey).toBe('platform.tenant-profile');
    expect(valid.ownership).toBe('MODULE_CORE');

    // Rejects invalid key pattern
    expect(() =>
      DictionaryEntityV1Schema.parse({
        entityKey: 'INVALID_CAPS',
        moduleKey: 'platform',
        label: 'Tenant Profile',
        ownership: 'MODULE_CORE',
      }),
    ).toThrow();
  });

  it('validates a field with data classification and constraints', () => {
    const validField = DictionaryFieldV1Schema.parse({
      fieldKey: 'tax-identification-number',
      entityKey: 'platform.tenant-profile',
      label: 'Tax Identification Number',
      type: 'TEXT',
      required: false,
      readOnly: false,
      classification: 'CONFIDENTIAL',
      maskOnDisplay: true,
    });
    expect(validField.classification).toBe('CONFIDENTIAL');
    expect(validField.maskOnDisplay).toBe(true);

    // Rejects unregistered field type
    expect(() =>
      DictionaryFieldV1Schema.parse({
        fieldKey: 'custom-calc',
        entityKey: 'platform.tenant-profile',
        label: 'Custom Calc',
        type: 'UNREGISTERED_SCRIPT_TYPE',
      }),
    ).toThrow();
  });

  it('validates relationships and reference definitions', () => {
    const relationship = DictionaryRelationshipV1Schema.parse({
      relationshipKey: 'tenant-to-contacts',
      sourceEntityKey: 'platform.tenant-profile',
      targetEntityKey: 'platform.tenant-contact',
      type: 'ONE_TO_MANY',
      foreignKeyField: 'tenantId',
      cascadeDelete: false,
    });
    expect(relationship.type).toBe('ONE_TO_MANY');

    const reference = DictionaryReferenceV1Schema.parse({
      referenceKey: 'industry-types',
      referenceType: 'VALUE_LIST',
      staticValues: [
        { value: 'MFG', label: 'Manufacturing', isDefault: true },
        { value: 'AGR', label: 'Agriculture' },
      ],
    });
    expect(reference.staticValues).toHaveLength(2);
  });

  it('validates safe validation AST conditions without raw code/eval', () => {
    const rule = DictionaryValidationRuleV1Schema.parse({
      ruleKey: 'require-postal-when-country-us',
      label: 'US Postal Code Required',
      errorMessage: 'Postal code is required when country is US',
      severity: 'ERROR',
      condition: {
        all: [
          { field: 'countryCode', operator: 'EQ', value: 'US' },
          { field: 'postalCode', operator: 'IS_NOT_NULL' },
        ],
      },
    });
    expect(rule.condition.all).toHaveLength(2);

    // Rejects arbitrary unsafe operators
    expect(() =>
      DictionaryValidationRuleV1Schema.parse({
        ruleKey: 'unsafe-rule',
        label: 'Unsafe Rule',
        errorMessage: 'Invalid',
        condition: {
          field: 'amount',
          operator: 'RAW_SQL_EXECUTE',
          value: 'DROP TABLE',
        },
      }),
    ).toThrow();
  });

  it('validates surface presentation views, tabs, sections and field placements', () => {
    const view = DictionaryViewV1Schema.parse({
      viewKey: 'tenant-profile-edit',
      label: 'Edit Tenant Profile',
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
              sectionKey: 'primary-section',
              label: 'Primary Details',
              collapsible: false,
              defaultCollapsed: false,
              position: 0,
            },
          ],
          fields: [
            {
              fieldKey: 'organization-name',
              sectionKey: 'primary-section',
              position: 0,
              span: 6,
              componentKey: 'text-input',
            },
          ],
        },
      ],
    });
    expect(view.tabs[0]?.fields[0]?.span).toBe(6);
  });

  it('validates navigation and registered action definitions', () => {
    const nav = DictionaryNavigationItemV1Schema.parse({
      itemKey: 'nav-tenant-profile',
      label: 'Tenant Profile',
      route: '/settings/tenant-profile',
      position: 10,
      requiredPermissions: ['settings:tenant-profile:read'],
    });
    expect(nav.route).toBe('/settings/tenant-profile');

    const action = DictionaryActionV1Schema.parse({
      actionKey: 'recalculate-compliance',
      label: 'Recalculate Compliance',
      type: 'COMMAND',
      handlerKey: 'platform.tenant-profile.recalculate-compliance',
      requiredPermissions: ['settings:tenant-profile:admin'],
    });
    expect(action.handlerKey).toBe('platform.tenant-profile.recalculate-compliance');

    const msg = DictionaryMessageV1Schema.parse({
      messageKey: 'org.welcome',
      locale: 'en-US',
      value: 'Welcome to GigaLibs',
      category: 'LABEL',
    });
    expect(msg.locale).toBe('en-US');
  });

  it('validates a complete dictionary package definition', () => {
    const pkg = DictionaryPackageDefinitionV1Schema.parse({
      packageKey: 'tenant-profile-pkg',
      name: 'Tenant Profile Package',
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
        },
      ],
      fields: [],
      relationships: [],
      references: [],
      validationRules: [],
      views: [],
      navigation: [],
      actions: [],
      messages: [],
    });
    expect(pkg.version).toBe('1.0.0');
  });

  it('validates a complete dictionary package and compiled runtime manifest', () => {
    const manifest = CompiledDictionaryManifestV1Schema.parse({
      manifestVersion: 1,
      packageKey: 'tenant-profile-core',
      checksum: 'sha256:' + 'a'.repeat(64),
      compiledAt: new Date().toISOString(),
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      publishedVersionId: '550e8400-e29b-41d4-a716-446655440001',
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
          fieldKey: 'display-name',
          entityKey: 'platform.tenant-profile',
          label: 'Display Name',
          type: 'TEXT',
          required: true,
          readOnly: false,
          isSystemLocked: true,
          classification: 'PUBLIC',
          maskOnDisplay: false,
        },
      ],
      relationships: [],
      references: [],
      validationRules: [],
      views: [
        {
          viewKey: 'profile-main-view',
          label: 'Profile Overview',
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
                  fieldKey: 'display-name',
                  position: 0,
                  span: 12,
                  componentKey: 'text-input',
                },
              ],
            },
          ],
        },
      ],
      navigation: [],
      actions: [],
      messages: [],
    });
    expect(manifest.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.fields).toHaveLength(1);
  });
});
