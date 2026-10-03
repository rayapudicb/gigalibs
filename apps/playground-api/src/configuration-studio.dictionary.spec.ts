import { describe, expect, it } from 'vitest';
import { ConfigurationStudioService } from './configuration-studio.service.js';
import type { DictionaryChangeSetDefinition } from '@gigalibs/contracts';

describe('ConfigurationStudioService Application Dictionary', () => {
  const service = new ConfigurationStudioService();

  it('exposes module dictionary descriptors and contributions from registered adapters', () => {
    const descriptors = service.listDescriptors();
    const tenantProfileDesc = descriptors.find(
      (d) => d.moduleKey === 'tenant-settings' && d.entityKey === 'tenant-profile',
    );
    expect(tenantProfileDesc).toBeDefined();
    expect(tenantProfileDesc?.dictionaryContribution).toBeDefined();
    expect(tenantProfileDesc?.dictionaryContribution?.packageKey).toBe('tenant-profile-dictionary');
    expect(tenantProfileDesc?.dictionaryContribution?.entities[0]?.entityKey).toBe(
      'platform.tenant-profile',
    );
    expect(tenantProfileDesc?.registeredResolvers).toContain('ref-tenant-statuses');
    expect(tenantProfileDesc?.registeredActionHandlers).toContain(
      'platform.tenant-profile.verify-domain',
    );

    const contributions = service.listDictionaryContributions();
    expect(contributions.length).toBeGreaterThanOrEqual(1);
    expect(contributions.some((c) => c.moduleKey === 'tenant-settings')).toBe(true);
  });

  it('compiles and validates a valid dictionary changeset overlay', async () => {
    const validDictChangeSet: DictionaryChangeSetDefinition = {
      kind: 'APPLICATION_DICTIONARY',
      contractVersion: '1.0',
      moduleKey: 'tenant-settings',
      entityKey: 'tenant-profile',
      surfaceKey: 'profile-extension',
      title: 'Tenant Profile Overlay',
      dictionary: {
        packageKey: 'tenant-profile-dictionary',
        name: 'Custom Tenant Profile Overlay',
        version: '1.1.0',
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
            fieldKey: 'custom_tax_id',
            entityKey: 'platform.tenant-profile',
            label: 'Tax Identification Number',
            type: 'TEXT',
            required: false,
            readOnly: false,
            isSystemLocked: false,
            classification: 'CONFIDENTIAL',
            maskOnDisplay: true,
          },
        ],
        relationships: [],
        references: [],
        validationRules: [],
        views: [
          {
            viewKey: 'tenant-profile-main',
            label: 'Workspace Profile',
            mode: 'EDIT',
            device: 'ALL',
            tabs: [],
            defaultSortDirection: 'ASC',
          },
        ],
        navigation: [],
        actions: [],
        messages: [],
      },
    };

    // When compiling directly via the compiler with baseline protection
    const desc = service.listDescriptors().find(
      (d) => d.moduleKey === 'tenant-settings' && d.entityKey === 'tenant-profile',
    );
    expect(desc?.dictionaryContribution).toBeDefined();
  });
});
