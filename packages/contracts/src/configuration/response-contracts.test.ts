import { describe, expect, it } from 'vitest';
import {
  ConfigurationActivationResponseSchema,
  ActivateConfigurationSchema,
  ConfigurationChangeSetResponseSchema,
  ConfigurationRecordMutationResponseSchema,
  ConfigurationRuntimeErrorResponseSchema,
  ConfigurationRuntimeCurrentQuerySchema,
  ConfigurationRuntimePreviewQuerySchema,
  ConfigurationRuntimeManifestCurrentResponseSchema,
  ConfigurationRuntimeManifestResponseSchema,
  ModuleAdapterDescriptorV1Schema,
} from './index.js';

const checksum = `sha256:${'a'.repeat(64)}`;
const now = new Date('2026-09-16T00:00:00.000Z');

describe('Configuration Studio v1 response contracts', () => {
  it('requires explicit activation environment and cohort authority', () => {
    expect(
      ActivateConfigurationSchema.safeParse({
        publishedVersionId: 'published-1',
        reason: 'Activate an approved configuration',
        idempotencyKey: 'activation-001',
      }).success,
    ).toBe(false);
  });

  it('normalizes persisted dates to portable ISO-8601 strings', () => {
    const response = ConfigurationActivationResponseSchema.parse({
      id: 'activation-1',
      tenantId: 'tenant-1',
      publishedVersionId: 'published-1',
      moduleKey: 'tenant-apps',
      entityKey: 'portable-record',
      surfaceKey: 'custom-form',
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      status: 'ACTIVE',
      reason: 'Activate portable response',
      activatedById: 'user-1',
      activatedAt: now,
      deactivatedAt: null,
    });

    expect(response.activatedAt).toBe('2026-09-16T00:00:00.000Z');
  });

  it('rejects an undeclared ORM column at the API boundary', () => {
    const result = ConfigurationChangeSetResponseSchema.safeParse({
      id: 'change-set-1',
      tenantId: 'tenant-1',
      moduleKey: 'tenant-apps',
      entityKey: 'portable-record',
      surfaceKey: 'custom-form',
      status: 'VALIDATED',
      definition: {
        contractVersion: '1.0',
        moduleKey: 'tenant-apps',
        entityKey: 'portable-record',
        surfaceKey: 'custom-form',
        mode: 'EDIT',
        title: 'Portable record',
        fields: [],
        sections: [],
      },
      compiledManifest: {},
      checksum,
      findings: [],
      compatibility: 'COMPATIBLE',
      reason: 'Create portable response',
      version: 1,
      createdById: 'user-1',
      submittedAt: null,
      approvedById: null,
      approvedAt: null,
      rejectedById: null,
      rejectedAt: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      internalDatabaseColumn: 'must-not-escape',
    });

    expect(result.success).toBe(false);
  });

  it('keeps mutation records explicit, including soft-delete state', () => {
    const response = ConfigurationRecordMutationResponseSchema.parse({
      id: 'record-1',
      tenantId: 'tenant-1',
      entityKey: 'portable-record',
      publishedVersionId: 'published-1',
      manifestChecksum: checksum,
      values: { reference: 'PORTABLE-1' },
      valuesChecksum: checksum,
      version: 2,
      createdById: 'user-1',
      updatedById: 'user-2',
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });

    expect(response.deletedAt).toBe('2026-09-16T00:00:00.000Z');
    expect(Object.keys(response)).not.toContain('publishedVersion');
  });

  it('preserves the exact legacy runtime response while current scope is separately named', () => {
    const legacy = {
      activationId: 'activation-1',
      publishedVersionId: 'published-1',
      activatedAt: now,
      manifest: {},
      checksum,
    };

    expect(ConfigurationRuntimeManifestResponseSchema.parse(legacy)).toEqual({
      ...legacy,
      activatedAt: '2026-09-16T00:00:00.000Z',
    });
    expect(
      ConfigurationRuntimeManifestResponseSchema.safeParse({
        ...legacy,
        scope: { environmentKey: 'local-uat' },
      }).success,
    ).toBe(false);
    expect(
      ConfigurationRuntimeManifestCurrentResponseSchema.parse({
        ...legacy,
        scope: {
          contractVersion: '1.0',
          environmentKey: 'local-uat',
          cohortKey: 'all-users',
          policyKey: 'ALL_ENTITLED_USERS_V1',
          entitlementModuleKey: 'tenant-access',
          resolutionSource: 'SERVER_POLICY',
        },
        adapter: { adapterKey: 'tenant-profile-v1', descriptorVersion: '1.0' },
      }).scope.policyKey,
    ).toBe('ALL_ENTITLED_USERS_V1');
  });

  it('separates normal current-runtime identity from administrative preview scope', () => {
    expect(
      ConfigurationRuntimeCurrentQuerySchema.safeParse({
        moduleKey: 'tenant-settings',
        entityKey: 'tenant-profile',
        surfaceKey: 'profile-extension',
        environmentKey: 'local-uat',
      }).success,
    ).toBe(false);
    expect(
      ConfigurationRuntimePreviewQuerySchema.safeParse({
        moduleKey: 'tenant-settings',
        entityKey: 'tenant-profile',
        surfaceKey: 'profile-extension',
        environmentKey: 'local-uat',
        cohortKey: 'all-users',
      }).success,
    ).toBe(true);
  });

  it('keeps runtime errors strict and identity-free', () => {
    expect(
      ConfigurationRuntimeErrorResponseSchema.parse({
        contractVersion: '1.0',
        code: 'CONFIGURATION_RUNTIME_SCOPE_DENIED',
        message: 'The requested runtime scope is not available.',
        retryable: false,
      }),
    ).toEqual({
      contractVersion: '1.0',
      code: 'CONFIGURATION_RUNTIME_SCOPE_DENIED',
      message: 'The requested runtime scope is not available.',
      retryable: false,
    });
    expect(
      ConfigurationRuntimeErrorResponseSchema.safeParse({
        contractVersion: '1.0',
        code: 'CONFIGURATION_RUNTIME_SCOPE_DENIED',
        message: 'Denied.',
        retryable: false,
        tenantId: 'must-not-escape',
      }).success,
    ).toBe(false);
  });

  it('validates the code-owned tenant-profile adapter contract', () => {
    expect(
      ModuleAdapterDescriptorV1Schema.parse({
        contractVersion: '1.0',
        adapterKey: 'tenant-profile-v1',
        moduleKey: 'tenant-settings',
        entityKey: 'tenant-profile',
        surfaceKey: 'profile-extension',
        entitlementModuleKey: 'tenant-access',
        capabilities: ['SURFACE_DISCOVERY', 'RUNTIME_MANIFEST'],
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
          description: 'Tenant profile extension.',
          ownership: 'MODULE_EXTENSION',
          authoringEnabled: true,
          entityKeyEditable: false,
          surfaceKeyEditable: false,
          modes: ['EDIT'],
          coreFields: [],
          extensionSlots: [
            {
              key: 'profile-details',
              label: 'Profile details',
              description: 'Tenant profile attributes.',
              allowedFieldTypes: ['TEXT'],
              maximumFields: 100,
            },
          ],
        },
      }).entitlementModuleKey,
    ).toBe('tenant-access');
  });
});
