import {
  CONFIGURATION_COMPILER_VERSION,
  canonicalJson,
  compileConfiguration,
  validateConfigurationValues,
  type CompiledConfigurationManifest,
} from '@gigalibs/configuration-core';
import type {
  ActivateConfigurationDto,
  ConfigurationCondition,
  ConfigurationDefinition,
  ConfigurationExtensionValuesDto,
  ConfigurationImpactChange,
  ConfigurationImpactReport,
  ConfigurationReasonDto,
  ExportConfigurationPackageDto,
  ImportConfigurationPackageDto,
  ConfigurationSurfaceRegistration,
  CreateConfigurationChangeSetDto,
  CreateConfigurationRecordDto,
  DeleteConfigurationRecordDto,
  UpdateConfigurationChangeSetDto,
  UpdateConfigurationRecordDto,
  ListApplicationRecordsQuery,
  CreateConfigurationTemplateDto,
  UpdateConfigurationTemplateDto,
  DuplicateConfigurationTemplateDto,
  CreateSavedFilterDto,
} from '@gigalibs/contracts';
import { Prisma, prisma } from '@gigalibs/db';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID, sign as signPayload, verify as verifyPayload } from 'node:crypto';
import {
  configurationPackageSigningKey,
  trustedConfigurationPackageKey,
} from './configuration-package-signing.js';

function registeredCoreField(
  key: string,
  label: string,
  type: ConfigurationSurfaceRegistration['coreFields'][number]['type'],
  required: boolean,
  readOnly: boolean,
  lockReason: string,
  classification: ConfigurationSurfaceRegistration['coreFields'][number]['classification'] = 'INTERNAL',
): ConfigurationSurfaceRegistration['coreFields'][number] {
  return {
    key,
    label,
    type,
    required,
    readOnly,
    classification,
    lockReason,
    allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
  };
}

@Injectable()
export class ConfigurationStudioService {
  listBaseSurfaces(): readonly ConfigurationSurfaceRegistration[] {
    return [
      {
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
      {
        registrationKey: 'tenant-record-application',
        moduleKey: 'tenant-apps',
        entityKey: 'custom-record',
        surfaceKey: 'custom-form',
        route: '/apps',
        label: 'New tenant application',
        description: 'Create a tenant-owned record application with PostgreSQL-backed CRUD.',
        ownership: 'TENANT_APPLICATION',
        authoringEnabled: true,
        entityKeyEditable: true,
        surfaceKeyEditable: true,
        modes: ['CREATE', 'EDIT', 'READ', 'LIST'],
        coreFields: [],
        extensionSlots: [
          {
            key: 'application-fields',
            label: 'Application fields',
            description: 'Schema-defined fields owned by the tenant application.',
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
              'CURRENCY',
              'SELECT',
              'MULTI_SELECT',
            ],
            maximumFields: 200,
          },
        ],
      },
      {
        registrationKey: 'ar-customer-record',
        moduleKey: 'accounts-receivable',
        entityKey: 'customer',
        surfaceKey: 'customer-record',
        route: '/ar',
        label: 'AR customer record',
        description:
          'Customer identity, billing, tax and credit attributes owned by Accounts Receivable.',
        ownership: 'MODULE_EXTENSION',
        authoringEnabled: false,
        authoringDisabledReason:
          'Core-field inspection is available. Custom-field authoring remains disabled until the AR adapter persists validated extension values in the AR transaction.',
        entityKeyEditable: false,
        surfaceKeyEditable: false,
        modes: ['CREATE', 'EDIT', 'READ', 'LIST'],
        coreFields: [
          registeredCoreField('id', 'Customer ID', 'TEXT', true, true, 'Stable AR customer identity.'),
          registeredCoreField(
            'legalName',
            'Legal name',
            'TEXT',
            true,
            false,
            'Canonical customer legal identity.',
          ),
          registeredCoreField(
            'billingEmail',
            'Billing email',
            'EMAIL',
            true,
            false,
            'Invoice delivery and billing contact destination.',
          ),
          registeredCoreField(
            'externalReference',
            'External reference',
            'TEXT',
            false,
            false,
            'Module-enforced external customer identity.',
          ),
          registeredCoreField(
            'currency',
            'Currency',
            'CURRENCY',
            true,
            false,
            'Currency participates in financial validation.',
          ),
          registeredCoreField(
            'status',
            'Status',
            'SELECT',
            true,
            true,
            'Customer lifecycle transitions are module commands.',
          ),
          registeredCoreField('phone', 'Phone', 'PHONE', false, false, 'Canonical customer contact data.'),
          registeredCoreField('website', 'Website', 'URL', false, false, 'Canonical customer profile data.'),
          registeredCoreField(
            'taxId',
            'Tax identifier',
            'TEXT',
            false,
            false,
            'Tax identity is classified and module validated.',
            'CONFIDENTIAL',
          ),
          registeredCoreField(
            'taxIdType',
            'Tax identifier type',
            'SELECT',
            false,
            false,
            'Tax identifier vocabulary is code owned.',
          ),
          registeredCoreField(
            'billingAddress',
            'Billing address',
            'TEXTAREA',
            false,
            false,
            'Billing address is snapshotted during invoice issuance.',
            'CONFIDENTIAL',
          ),
          registeredCoreField(
            'paymentTermsDays',
            'Payment terms',
            'INTEGER',
            false,
            false,
            'Terms feed invoice due-date behavior.',
          ),
          registeredCoreField(
            'creditLimitMinor',
            'Credit limit',
            'CURRENCY',
            false,
            false,
            'Credit limits are financial policy inputs.',
            'CONFIDENTIAL',
          ),
          registeredCoreField(
            'notes',
            'Notes',
            'TEXTAREA',
            false,
            false,
            'Canonical AR customer notes.',
            'CONFIDENTIAL',
          ),
          registeredCoreField(
            'version',
            'Version',
            'INTEGER',
            true,
            true,
            'Optimistic concurrency token managed by AR.',
          ),
          registeredCoreField(
            'createdAt',
            'Created at',
            'DATETIME',
            true,
            true,
            'System audit timestamp.',
          ),
          registeredCoreField(
            'updatedAt',
            'Updated at',
            'DATETIME',
            true,
            true,
            'System audit timestamp.',
          ),
        ],
        extensionSlots: [
          {
            key: 'customer-additional-details',
            label: 'Additional customer details',
            description:
              'Future non-financial customer metadata after the AR adapter is certified.',
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
            maximumFields: 50,
          },
        ],
      },
      {
        registrationKey: 'ar-invoice-draft',
        moduleKey: 'accounts-receivable',
        entityKey: 'invoice',
        surfaceKey: 'invoice-draft',
        route: '/ar',
        label: 'AR invoice draft',
        description:
          'Invoice drafting surface with code-owned financial calculation and issuance invariants.',
        ownership: 'MODULE_EXTENSION',
        authoringEnabled: false,
        authoringDisabledReason:
          'Core-field inspection is available. Custom-field authoring remains disabled until draft extensions are validated in the AR transaction and snapshotted immutably at issuance.',
        entityKeyEditable: false,
        surfaceKeyEditable: false,
        modes: ['CREATE', 'EDIT', 'READ', 'LIST'],
        coreFields: [
          registeredCoreField('id', 'Invoice ID', 'TEXT', true, true, 'Stable invoice aggregate identity.'),
          registeredCoreField(
            'billingEntityId',
            'Billing entity',
            'TEXT',
            true,
            false,
            'The issuing legal entity is module controlled.',
          ),
          registeredCoreField(
            'invoiceSeriesId',
            'Invoice series',
            'TEXT',
            true,
            false,
            'Number allocation is controlled by the locked AR series.',
          ),
          registeredCoreField(
            'customerId',
            'Customer',
            'TEXT',
            true,
            false,
            'Canonical AR customer relationship.',
          ),
          registeredCoreField(
            'invoiceNumber',
            'Invoice number',
            'TEXT',
            false,
            true,
            'Allocated atomically only when the invoice is issued.',
          ),
          registeredCoreField(
            'status',
            'Status',
            'SELECT',
            true,
            true,
            'Invoice state transitions are module commands.',
          ),
          registeredCoreField(
            'currency',
            'Currency',
            'CURRENCY',
            true,
            false,
            'Currency is a financial calculation invariant.',
          ),
          registeredCoreField(
            'issueDate',
            'Issue date',
            'DATE',
            true,
            false,
            'Issue date participates in invoice validation.',
          ),
          registeredCoreField(
            'dueDate',
            'Due date',
            'DATE',
            true,
            false,
            'Due date must satisfy AR date invariants.',
          ),
          registeredCoreField(
            'purchaseOrderReference',
            'Purchase order reference',
            'TEXT',
            false,
            false,
            'Canonical commercial reference.',
          ),
          registeredCoreField(
            'lines',
            'Invoice line items',
            'TEXTAREA',
            true,
            false,
            'Line quantities and prices are calculated and validated by AR.',
          ),
          registeredCoreField(
            'subtotalMinor',
            'Subtotal',
            'CURRENCY',
            true,
            true,
            'Server-calculated financial amount.',
          ),
          registeredCoreField(
            'taxMinor',
            'Tax',
            'CURRENCY',
            true,
            true,
            'Server-calculated tax amount.',
          ),
          registeredCoreField(
            'totalMinor',
            'Total',
            'CURRENCY',
            true,
            true,
            'Server-calculated financial total.',
          ),
          registeredCoreField(
            'amountPaidMinor',
            'Amount paid',
            'CURRENCY',
            true,
            true,
            'Derived from immutable payment records.',
          ),
          registeredCoreField(
            'amountDueMinor',
            'Amount due',
            'CURRENCY',
            true,
            true,
            'Derived from invoice total and settled payments.',
          ),
          registeredCoreField(
            'version',
            'Version',
            'INTEGER',
            true,
            true,
            'Optimistic concurrency token managed by AR.',
          ),
          registeredCoreField(
            'issuedAt',
            'Issued at',
            'DATETIME',
            false,
            true,
            'Immutable issuance timestamp.',
          ),
          registeredCoreField(
            'createdAt',
            'Created at',
            'DATETIME',
            true,
            true,
            'System audit timestamp.',
          ),
          registeredCoreField(
            'updatedAt',
            'Updated at',
            'DATETIME',
            true,
            true,
            'System audit timestamp.',
          ),
        ],
        extensionSlots: [
          {
            key: 'invoice-non-financial-details',
            label: 'Additional invoice details',
            description: 'Future non-financial metadata snapshotted with the issued invoice.',
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
            maximumFields: 50,
          },
        ],
      },
    ] as const;
  }

  listSurfaces(): ReturnType<ConfigurationStudioService['listBaseSurfaces']>;
  listSurfaces(tenantId: string): Promise<Record<string, unknown>[]>;
  listSurfaces(tenantId?: string): unknown {
    const base = this.listBaseSurfaces();
    if (!tenantId) {
      return base;
    }
    return this.listDynamicSurfaces(tenantId, base);
  }

  private async listDynamicSurfaces(
    tenantId: string,
    baseSurfaces: readonly Record<string, unknown>[],
  ) {
    const activeCustomApps = await prisma.configurationActivation.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        moduleKey: 'tenant-apps',
      },
      include: {
        publishedVersion: {
          select: {
            manifest: true,
            sequence: true,
            checksum: true,
          },
        },
      },
      orderBy: { activatedAt: 'desc' },
    });

    const seen = new Set<string>();
    const customSurfaces: Record<string, unknown>[] = [];

    for (const app of activeCustomApps) {
      const key = `${app.moduleKey}:${app.entityKey}:${app.surfaceKey}`;
      if (seen.has(key) || app.entityKey === 'custom-record') continue;
      seen.add(key);

      const manifest = app.publishedVersion?.manifest as Record<string, unknown> | null;
      const label = (manifest?.title as string) || app.entityKey;
      const description =
        (manifest?.description as string) || `Custom application for ${app.entityKey}`;

      customSurfaces.push({
        registrationKey: `tenant-app-${app.entityKey}-${app.surfaceKey}`,
        moduleKey: app.moduleKey,
        entityKey: app.entityKey,
        surfaceKey: app.surfaceKey,
        label,
        description,
        route: `/apps/${app.entityKey}`,
        ownership: 'TENANT_APPLICATION',
        authoringEnabled: true,
        entityKeyEditable: false,
        surfaceKeyEditable: false,
        modes: ['CREATE', 'EDIT', 'READ', 'LIST'],
        coreFields: [],
        extensionSlots: [
          {
            key: 'application-fields',
            label: 'Application fields',
            description: 'Schema-defined fields owned by the tenant application.',
            allowedFieldTypes: [
              'TEXT', 'TEXTAREA', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME',
              'EMAIL', 'PHONE', 'URL', 'CURRENCY', 'SELECT', 'MULTI_SELECT',
            ],
            maximumFields: 200,
          },
        ],
        versionSequence: app.publishedVersion?.sequence,
      });
    }

    return [...baseSurfaces, ...customSurfaces];
  }

  listChangeSets(tenantId: string) {
    return prisma.configurationChangeSet.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  listPublishedVersions(tenantId: string) {
    return prisma.configurationPublishedVersion.findMany({
      where: { tenantId },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });
  }

  listActivations(tenantId: string) {
    return prisma.configurationActivation.findMany({
      where: { tenantId },
      include: { publishedVersion: { select: { checksum: true, sequence: true } } },
      orderBy: { activatedAt: 'desc' },
      take: 100,
    });
  }

  async changeSetImpact(tenantId: string, id: string): Promise<ConfigurationImpactReport> {
    const changeSet = await this.requireChangeSet(tenantId, id);
    if (!changeSet.compiledManifest || !changeSet.checksum) {
      throw new ConflictException(
        'The change set must compile successfully before impact can be evaluated.',
      );
    }
    const active = await prisma.configurationActivation.findFirst({
      where: {
        tenantId,
        moduleKey: changeSet.moduleKey,
        entityKey: changeSet.entityKey,
        surfaceKey: changeSet.surfaceKey,
        environmentKey: 'local-uat',
        cohortKey: 'all-users',
        status: 'ACTIVE',
      },
      include: { publishedVersion: true },
      orderBy: { activatedAt: 'desc' },
    });
    return this.analyzeImpact(
      prisma,
      tenantId,
      changeSet.compiledManifest as unknown as CompiledConfigurationManifest,
      changeSet.checksum,
      null,
      active?.publishedVersion ?? null,
    );
  }

  async exportPackage(tenantId: string, actorId: string, dto: ExportConfigurationPackageDto, permissions: string[] = ['*']) {
    const requestChecksum = checksum(dto);
    const operation = 'configuration-package.export';
    const replay = await this.idempotentReplay(
      tenantId,
      actorId,
      operation,
      dto.idempotencyKey,
      requestChecksum,
    );
    if (replay) return replay;
    const uniqueIds = [...new Set(dto.publishedVersionIds)];
    if (uniqueIds.length !== dto.publishedVersionIds.length)
      throw new BadRequestException('Published version identifiers must be unique.');
    const versions = await prisma.configurationPublishedVersion.findMany({
      where: { tenantId, id: { in: uniqueIds } },
    });
    if (versions.length !== uniqueIds.length)
      throw new NotFoundException('One or more published configuration versions were not found.');
    versions.sort((left, right) =>
      `${left.moduleKey}/${left.entityKey}/${left.surfaceKey}/${left.sequence}`.localeCompare(
        `${right.moduleKey}/${right.entityKey}/${right.surfaceKey}/${right.sequence}`,
      ),
    );
    const canExportSensitive = hasPermission(permissions, 'configuration:export-sensitive');
    const payload = {
      formatVersion: 'gigalibs.configuration-package.v1' as const,
      packageId: randomUUID(),
      exportedAt: new Date().toISOString(),
      sourceTenantId: tenantId,
      definitions: versions.map((version) => {
        const {
          compilerVersion: _compilerVersion,
          checksum: _checksum,
          ...rawDefinition
        } = version.manifest as unknown as CompiledConfigurationManifest;
        // Redact sensitive field metadata from packages when exporter lacks export-sensitive permission
        const definition = canExportSensitive
          ? rawDefinition
          : {
              ...rawDefinition,
              fields: rawDefinition.fields.map((field) => {
                if (
                  field.classification === 'CONFIDENTIAL' ||
                  field.classification === 'RESTRICTED'
                ) {
                  const { defaultValue: _dv, ...safeField } = field;
                  return { ...safeField, classification: 'RESTRICTED' as const };
                }
                return field;
              }),
            };
        return {
          sourcePublishedVersionId: version.id,
          sourceSequence: version.sequence,
          definition,
        };
      }),
    };
    const signing = configurationPackageSigningKey();
    const canonicalPayload = canonicalJson(payload);
    const envelope = {
      payload,
      signature: {
        algorithm: 'Ed25519' as const,
        keyId: signing.keyId,
        publicKeyBase64: signing.publicKeyBase64,
        payloadSha256: checksum(payload),
        valueBase64: signPayload(null, Buffer.from(canonicalPayload), signing.privateKey).toString(
          'base64',
        ),
      },
    };
    return prisma.$transaction(async (tx) => {
      await this.audit(
        tx,
        tenantId,
        actorId,
        'CREATE',
        'configuration-package-export',
        payload.packageId,
        dto.reason,
        null,
        {
          packageId: payload.packageId,
          publishedVersionIds: uniqueIds,
          payloadSha256: envelope.signature.payloadSha256,
          keyId: signing.keyId,
        },
      );
      await tx.configurationIdempotencyRecord.create({
        data: {
          tenantId,
          actorId,
          operation,
          idempotencyKey: dto.idempotencyKey,
          requestChecksum,
          response: jsonInput(envelope),
          statusCode: 200,
        },
      });
      return envelope;
    });
  }

  async importPackage(tenantId: string, actorId: string, dto: ImportConfigurationPackageDto) {
    const requestChecksum = checksum(dto);
    const operation = 'configuration-package.import';
    const replay = await this.idempotentReplay(
      tenantId,
      actorId,
      operation,
      dto.idempotencyKey,
      requestChecksum,
    );
    if (replay) return replay;
    const canonicalPayload = canonicalJson(dto.package.payload);
    if (checksum(dto.package.payload) !== dto.package.signature.payloadSha256)
      throw new BadRequestException('Configuration package payload checksum is invalid.');
    const publicKey = trustedConfigurationPackageKey(
      dto.package.signature.keyId,
      dto.package.signature.publicKeyBase64,
    );
    if (
      !verifyPayload(
        null,
        Buffer.from(canonicalPayload),
        publicKey,
        Buffer.from(dto.package.signature.valueBase64, 'base64'),
      )
    ) {
      throw new BadRequestException('Configuration package signature is invalid.');
    }
    const surfaceKeys = new Set<string>();
    const prepared: Array<{
      item: (typeof dto.package.payload.definitions)[number];
      compiled: {
        manifest: CompiledConfigurationManifest;
        findings: ReturnType<typeof compileConfiguration>['findings'];
      };
      compatibility: string;
    }> = [];
    for (const item of dto.package.payload.definitions) {
      this.assertRegisteredSurface(item.definition);
      const scope = `${item.definition.moduleKey}/${item.definition.entityKey}/${item.definition.surfaceKey}`;
      if (surfaceKeys.has(scope))
        throw new BadRequestException(`Configuration package repeats surface ${scope}.`);
      surfaceKeys.add(scope);
      const compiled = compileConfiguration(item.definition);
      if (!compiled.valid || !compiled.manifest)
        throw new BadRequestException({
          message: `Imported surface ${scope} failed deterministic compilation.`,
          findings: compiled.findings,
        });
      prepared.push({
        item,
        compiled: { manifest: compiled.manifest, findings: compiled.findings },
        compatibility: await this.compatibility(tenantId, item.definition),
      });
    }
    return prisma.$transaction(async (tx) => {
      const changeSets = [];
      for (const preparedItem of prepared) {
        const changeSet = await tx.configurationChangeSet.create({
          data: {
            tenantId,
            moduleKey: preparedItem.item.definition.moduleKey,
            entityKey: preparedItem.item.definition.entityKey,
            surfaceKey: preparedItem.item.definition.surfaceKey,
            status: 'VALIDATED',
            definition: jsonInput(preparedItem.item.definition),
            compiledManifest: jsonInput(preparedItem.compiled.manifest),
            checksum: preparedItem.compiled.manifest.checksum,
            findings: jsonInput(preparedItem.compiled.findings),
            compatibility: preparedItem.compatibility,
            reason: dto.reason,
            createdById: actorId,
          },
        });
        await this.audit(
          tx,
          tenantId,
          actorId,
          'CREATE',
          'configuration-change-set',
          changeSet.id,
          dto.reason,
          null,
          {
            importedFromPackageId: dto.package.payload.packageId,
            sourcePublishedVersionId: preparedItem.item.sourcePublishedVersionId,
            checksum: changeSet.checksum,
          },
        );
        changeSets.push(changeSet);
      }
      const response = { packageId: dto.package.payload.packageId, importedChangeSets: changeSets };
      await this.audit(
        tx,
        tenantId,
        actorId,
        'CREATE',
        'configuration-package-import',
        dto.package.payload.packageId,
        dto.reason,
        null,
        {
          sourceTenantId: dto.package.payload.sourceTenantId,
          importedChangeSetIds: changeSets.map((item) => item.id),
          keyId: dto.package.signature.keyId,
          payloadSha256: dto.package.signature.payloadSha256,
        },
      );
      await tx.configurationIdempotencyRecord.create({
        data: {
          tenantId,
          actorId,
          operation,
          idempotencyKey: dto.idempotencyKey,
          requestChecksum,
          response: jsonInput(response),
          statusCode: 201,
        },
      });
      return response;
    });
  }

  async listRuntimeApplications(tenantId: string, permissions: string[]) {
    const activations = await prisma.configurationActivation.findMany({
      where: {
        tenantId,
        moduleKey: 'tenant-apps',
        environmentKey: 'local-uat',
        cohortKey: 'all-users',
        status: 'ACTIVE',
      },
      include: { publishedVersion: true },
      orderBy: { activatedAt: 'desc' },
    });
    return activations.map((activation) => ({
      entityKey: activation.entityKey,
      surfaceKey: activation.surfaceKey,
      activationId: activation.id,
      publishedVersionId: activation.publishedVersionId,
      checksum: activation.publishedVersion.checksum,
      sequence: activation.publishedVersion.sequence,
      manifest: filterManifest(
        activation.publishedVersion.manifest as unknown as CompiledConfigurationManifest,
        permissions,
      ),
    }));
  }

  async listApplicationRecords(
    tenantId: string,
    entityKey: string,
    permissions: string[],
    query: Partial<ListApplicationRecordsQuery> = {},
  ) {
    const active = await this.requireActiveApplication(tenantId, entityKey);
    const limit = Math.min(query.limit ?? 50, 200);
    const orderBy: { updatedAt?: 'asc' | 'desc'; createdAt?: 'asc' | 'desc' } =
      query.sortKey === 'created-at'
        ? { createdAt: query.sortDirection === 'ASC' ? 'asc' : 'desc' }
        : { updatedAt: query.sortDirection === 'ASC' ? 'asc' : 'desc' };
    const dbRecords = await prisma.configurationRecord.findMany({
      where: { tenantId, entityKey, deletedAt: null },
      orderBy,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = dbRecords.length > limit;
    const page = hasMore ? dbRecords.slice(0, limit) : dbRecords;
    const manifest = active.publishedVersion.manifest as unknown as CompiledConfigurationManifest;
    const filteredManifest = filterManifest(manifest, permissions);
    const unmaskSensitive = hasPermission(permissions, 'configuration:unmask-sensitive');
    const fieldMap = new Map(filteredManifest.fields.map((f) => [f.key, f]));
    const listView = filteredManifest.listView;
    const columnKeys =
      listView?.columnKeys ?? filteredManifest.fields.slice(0, 5).map((f) => f.key);

    let records = page.map((record) => {
      const rawValues =
        record.values && typeof record.values === 'object' && !Array.isArray(record.values)
          ? (record.values as Record<string, unknown>)
          : {};
      const maskedVals = maskValues(rawValues, filteredManifest, unmaskSensitive, fieldMap);
      const columns = Object.fromEntries(
        columnKeys
          .filter((key) => fieldMap.has(key))
          .map((key) => [key, maskedVals[key] ?? null]),
      );
      return {
        id: record.id,
        tenantId: record.tenantId,
        entityKey: record.entityKey,
        publishedVersionId: record.publishedVersionId,
        manifestChecksum: record.manifestChecksum,
        version: record.version,
        createdById: record.createdById,
        updatedById: record.updatedById,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        values: maskedVals,
        columns,
      };
    });

    if (query.search?.trim()) {
      const needle = query.search.toLowerCase();
      records = records.filter((r) =>
        Object.values(r.values).some(
          (v) => typeof v === 'string' && v !== '***' && v.toLowerCase().includes(needle),
        ),
      );
    }

    if (query.filterKey && query.filterValue !== undefined) {
      const fk = query.filterKey;
      const fv = query.filterValue;
      records = records.filter((r) => {
        const val = r.values[fk];
        return val !== undefined && val !== '***' && String(val) === fv;
      });
    }

    return {
      records,
      manifest: filteredManifest,
      columnKeys,
      nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getApplicationRecord(
    tenantId: string,
    entityKey: string,
    recordId: string,
    permissions: string[],
  ) {
    const active = await this.requireActiveApplication(tenantId, entityKey);
    const record = await prisma.configurationRecord.findFirst({
      where: { tenantId, entityKey, id: recordId, deletedAt: null },
    });
    if (!record) throw new NotFoundException('Configuration record not found.');
    const manifest = active.publishedVersion.manifest as unknown as CompiledConfigurationManifest;
    const filteredManifest = filterManifest(manifest, permissions);
    const unmaskSensitive = hasPermission(permissions, 'configuration:unmask-sensitive');
    const fieldMap = new Map(filteredManifest.fields.map((f) => [f.key, f]));
    const rawValues =
      record.values && typeof record.values === 'object' && !Array.isArray(record.values)
        ? (record.values as Record<string, unknown>)
        : {};
    return {
      id: record.id,
      tenantId: record.tenantId,
      entityKey: record.entityKey,
      publishedVersionId: record.publishedVersionId,
      manifestChecksum: record.manifestChecksum,
      version: record.version,
      createdById: record.createdById,
      updatedById: record.updatedById,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      values: maskValues(rawValues, filteredManifest, unmaskSensitive, fieldMap),
      manifest: filteredManifest,
      stale: record.manifestChecksum !== active.publishedVersion.checksum,
    };
  }

  async createApplicationRecord(
    tenantId: string,
    actorId: string,
    entityKey: string,
    dto: CreateConfigurationRecordDto,
    permissions: string[],
  ) {
    const operation = `application-record.create:${entityKey}`;
    const requestChecksum = checksum(dto);
    const replay = await this.idempotentReplay(
      tenantId,
      actorId,
      operation,
      dto.idempotencyKey,
      requestChecksum,
    );
    if (replay) return replay;
    return prisma.$transaction(async (tx) => {
      const candidate = await tx.configurationPublishedVersion.findFirst({
        where: { id: dto.publishedVersionId, tenantId, moduleKey: 'tenant-apps', entityKey },
      });
      if (!candidate)
        throw new NotFoundException('Published application configuration version was not found.');
      await this.lockActivationScope(
        tx,
        tenantId,
        candidate.moduleKey,
        candidate.entityKey,
        candidate.surfaceKey,
        'local-uat',
        'all-users',
      );
      const published = await this.requireActiveApplicationVersion(
        tx,
        tenantId,
        entityKey,
        dto.publishedVersionId,
      );
      const manifest = published.manifest as unknown as CompiledConfigurationManifest;
      assertAuthorizedValues(manifest, dto.values, permissions);
      const errors = validateConfigurationValues(manifest, dto.values);
      if (Object.keys(errors).length > 0)
        throw new BadRequestException({ message: 'Record values failed validation.', errors });
      const record = await tx.configurationRecord.create({
        data: {
          tenantId,
          entityKey,
          publishedVersionId: published.id,
          manifestChecksum: published.checksum,
          values: jsonInput(dto.values),
          valuesChecksum: checksum(dto.values),
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'CREATE',
        'configuration-record',
        record.id,
        dto.reason,
        null,
        record,
      );
      await this.outbox(
        tx,
        tenantId,
        'configuration-record',
        record.id,
        'configuration.record.created.v1',
        { entityKey, recordId: record.id, manifestChecksum: published.checksum },
      );
      await tx.configurationIdempotencyRecord.create({
        data: {
          tenantId,
          actorId,
          operation,
          idempotencyKey: dto.idempotencyKey,
          requestChecksum,
          response: jsonInput(record),
          statusCode: 201,
        },
      });
      return record;
    });
  }

  async updateApplicationRecord(
    tenantId: string,
    actorId: string,
    entityKey: string,
    recordId: string,
    dto: UpdateConfigurationRecordDto,
    permissions: string[],
  ) {
    const operation = `application-record.update:${recordId}`;
    const requestChecksum = checksum(dto);
    const replay = await this.idempotentReplay(
      tenantId,
      actorId,
      operation,
      dto.idempotencyKey,
      requestChecksum,
    );
    if (replay) return replay;
    return prisma.$transaction(async (tx) => {
      const candidate = await tx.configurationPublishedVersion.findFirst({
        where: { id: dto.publishedVersionId, tenantId, moduleKey: 'tenant-apps', entityKey },
      });
      if (!candidate)
        throw new NotFoundException('Published application configuration version was not found.');
      await this.lockActivationScope(
        tx,
        tenantId,
        candidate.moduleKey,
        candidate.entityKey,
        candidate.surfaceKey,
        'local-uat',
        'all-users',
      );
      const published = await this.requireActiveApplicationVersion(
        tx,
        tenantId,
        entityKey,
        dto.publishedVersionId,
      );
      const manifest = published.manifest as unknown as CompiledConfigurationManifest;
      const existing = await tx.configurationRecord.findFirst({
        where: { id: recordId, tenantId, entityKey, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('Application record was not found.');
      if (existing.version !== dto.expectedVersion)
        throw new ConflictException('The application record changed; reload before saving.');
      assertAuthorizedValues(manifest, dto.values, permissions, existing.values);
      const mergedValues = { ...(existing.values as Record<string, unknown>), ...dto.values };
      const errors = validateConfigurationValues(manifest, mergedValues, { allowReadOnly: true });
      if (Object.keys(errors).length > 0)
        throw new BadRequestException({ message: 'Record values failed validation.', errors });
      const result = await tx.configurationRecord.updateMany({
        where: { id: recordId, tenantId, entityKey, deletedAt: null, version: dto.expectedVersion },
        data: {
          publishedVersionId: published.id,
          manifestChecksum: published.checksum,
          values: jsonInput(mergedValues),
          valuesChecksum: checksum(mergedValues),
          updatedById: actorId,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new ConflictException('The application record changed; reload before saving.');
      const record = await tx.configurationRecord.findUniqueOrThrow({ where: { id: recordId } });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'UPDATE',
        'configuration-record',
        record.id,
        dto.reason,
        existing,
        record,
      );
      await this.outbox(
        tx,
        tenantId,
        'configuration-record',
        record.id,
        'configuration.record.updated.v1',
        { entityKey, recordId: record.id, manifestChecksum: published.checksum },
      );
      await tx.configurationIdempotencyRecord.create({
        data: {
          tenantId,
          actorId,
          operation,
          idempotencyKey: dto.idempotencyKey,
          requestChecksum,
          response: jsonInput(record),
          statusCode: 200,
        },
      });
      return record;
    });
  }

  async deleteApplicationRecord(
    tenantId: string,
    actorId: string,
    entityKey: string,
    recordId: string,
    dto: DeleteConfigurationRecordDto,
  ) {
    const operation = `application-record.delete:${recordId}`;
    const requestChecksum = checksum(dto);
    const replay = await this.idempotentReplay(
      tenantId,
      actorId,
      operation,
      dto.idempotencyKey,
      requestChecksum,
    );
    if (replay) return replay;
    return prisma.$transaction(async (tx) => {
      const existing = await tx.configurationRecord.findFirst({
        where: { id: recordId, tenantId, entityKey, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('Application record was not found.');
      if (existing.version !== dto.expectedVersion)
        throw new ConflictException('The application record changed; reload before deleting.');
      const result = await tx.configurationRecord.updateMany({
        where: { id: recordId, tenantId, entityKey, deletedAt: null, version: dto.expectedVersion },
        data: { deletedAt: new Date(), updatedById: actorId, version: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException('The application record changed; reload before deleting.');
      const record = await tx.configurationRecord.findUniqueOrThrow({ where: { id: recordId } });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'STATUS_CHANGE',
        'configuration-record',
        record.id,
        dto.reason,
        existing,
        record,
      );
      await this.outbox(
        tx,
        tenantId,
        'configuration-record',
        record.id,
        'configuration.record.deleted.v1',
        { entityKey, recordId: record.id },
      );
      await tx.configurationIdempotencyRecord.create({
        data: {
          tenantId,
          actorId,
          operation,
          idempotencyKey: dto.idempotencyKey,
          requestChecksum,
          response: jsonInput(record),
          statusCode: 200,
        },
      });
      return record;
    });
  }

  async createChangeSet(tenantId: string, actorId: string, dto: CreateConfigurationChangeSetDto) {
    this.assertRegisteredSurface(dto.definition);
    const requestChecksum = checksum(dto);
    const replay = await this.idempotentReplay(
      tenantId,
      actorId,
      'change-set.create',
      dto.idempotencyKey,
      requestChecksum,
    );
    if (replay) return replay;
    const compiled = compileConfiguration(dto.definition);
    const result = await prisma.$transaction(async (tx) => {
      const changeSet = await tx.configurationChangeSet.create({
        data: {
          tenantId,
          moduleKey: dto.definition.moduleKey,
          entityKey: dto.definition.entityKey,
          surfaceKey: dto.definition.surfaceKey,
          status: compiled.valid ? 'VALIDATED' : 'DRAFT',
          definition: dto.definition as Prisma.InputJsonValue,
          compiledManifest: compiled.manifest ? jsonInput(compiled.manifest) : Prisma.JsonNull,
          checksum: compiled.manifest?.checksum ?? null,
          findings: jsonInput(compiled.findings),
          compatibility: await this.compatibility(tenantId, dto.definition),
          reason: dto.reason,
          createdById: actorId,
        },
      });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'CREATE',
        'configuration-change-set',
        changeSet.id,
        dto.reason,
        null,
        changeSet,
      );
      await tx.configurationIdempotencyRecord.create({
        data: {
          tenantId,
          actorId,
          operation: 'change-set.create',
          idempotencyKey: dto.idempotencyKey,
          requestChecksum,
          response: jsonInput(changeSet),
          statusCode: 201,
        },
      });
      return changeSet;
    });
    return result;
  }

  async updateChangeSet(
    tenantId: string,
    actorId: string,
    id: string,
    dto: UpdateConfigurationChangeSetDto,
  ) {
    this.assertRegisteredSurface(dto.definition);
    const current = await this.requireChangeSet(tenantId, id);
    if (!['DRAFT', 'VALIDATED'].includes(current.status))
      throw new ConflictException('Only draft or validated change sets can be edited.');
    if (current.version !== dto.expectedVersion)
      throw new ConflictException('The change set changed; reload before editing.');
    const compiled = compileConfiguration(dto.definition);
    const updated = await prisma.configurationChangeSet.updateMany({
      where: { id, tenantId, version: dto.expectedVersion },
      data: {
        moduleKey: dto.definition.moduleKey,
        entityKey: dto.definition.entityKey,
        surfaceKey: dto.definition.surfaceKey,
        status: compiled.valid ? 'VALIDATED' : 'DRAFT',
        definition: dto.definition as Prisma.InputJsonValue,
        compiledManifest: compiled.manifest ? jsonInput(compiled.manifest) : Prisma.JsonNull,
        checksum: compiled.manifest?.checksum ?? null,
        findings: jsonInput(compiled.findings),
        compatibility: await this.compatibility(tenantId, dto.definition),
        reason: dto.reason,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      throw new ConflictException('The change set changed; reload before editing.');
    const result = await this.requireChangeSet(tenantId, id);
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: actorId,
        action: 'UPDATE',
        resource: 'configuration-change-set',
        resourceId: id,
        before: jsonInput(current),
        after: jsonInput(result),
        metadata: { reason: dto.reason },
      },
    });
    return result;
  }

  async submit(tenantId: string, actorId: string, id: string, dto: ConfigurationReasonDto) {
    return this.transition(tenantId, actorId, id, dto, 'VALIDATED', 'SUBMITTED', {
      submittedAt: new Date(),
    });
  }

  async approve(tenantId: string, actorId: string, id: string, dto: ConfigurationReasonDto) {
    const current = await this.requireChangeSet(tenantId, id);
    if (current.createdById === actorId)
      throw new ForbiddenException('The author cannot approve this change set.');
    return this.transition(tenantId, actorId, id, dto, 'SUBMITTED', 'APPROVED', {
      approvedById: actorId,
      approvedAt: new Date(),
    });
  }

  async reject(tenantId: string, actorId: string, id: string, dto: ConfigurationReasonDto) {
    return this.transition(tenantId, actorId, id, dto, 'SUBMITTED', 'REJECTED', {
      rejectedById: actorId,
      rejectedAt: new Date(),
    });
  }

  async publish(tenantId: string, actorId: string, id: string, dto: ConfigurationReasonDto) {
    const current = await this.requireChangeSet(tenantId, id);
    if (
      current.status !== 'APPROVED' ||
      current.version !== dto.expectedVersion ||
      !current.compiledManifest ||
      !current.checksum
    ) {
      throw new ConflictException('Only the current approved checksum can be published.');
    }
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "configuration_change_sets" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const locked = await tx.configurationChangeSet.findFirst({ where: { id, tenantId } });
      if (!locked || locked.status !== 'APPROVED' || locked.version !== dto.expectedVersion)
        throw new ConflictException('The approved change set changed.');
      const latest = await tx.configurationPublishedVersion.findFirst({
        where: {
          tenantId,
          moduleKey: locked.moduleKey,
          entityKey: locked.entityKey,
          surfaceKey: locked.surfaceKey,
        },
        orderBy: { sequence: 'desc' },
      });
      const published = await tx.configurationPublishedVersion.create({
        data: {
          tenantId,
          changeSetId: id,
          moduleKey: locked.moduleKey,
          entityKey: locked.entityKey,
          surfaceKey: locked.surfaceKey,
          sequence: (latest?.sequence ?? 0) + 1,
          manifest: jsonInput(locked.compiledManifest),
          checksum: locked.checksum!,
          compilerVersion: CONFIGURATION_COMPILER_VERSION,
          publishedById: actorId,
        },
      });
      await tx.configurationChangeSet.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          reason: dto.reason,
          version: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'CREATE',
        'configuration-version',
        published.id,
        dto.reason,
        null,
        published,
      );
      await this.outbox(
        tx,
        tenantId,
        'configuration-version',
        published.id,
        'configuration.version.published.v1',
        { publishedVersionId: published.id, checksum: published.checksum },
      );
      return published;
    });
  }

  async activate(tenantId: string, actorId: string, dto: ActivateConfigurationDto) {
    const requestChecksum = checksum(dto);
    const replay = await this.idempotentReplay(
      tenantId,
      actorId,
      'activation.create',
      dto.idempotencyKey,
      requestChecksum,
    );
    if (replay) return replay;
    const published = await prisma.configurationPublishedVersion.findFirst({
      where: { id: dto.publishedVersionId, tenantId },
    });
    if (!published) throw new NotFoundException('Published configuration version was not found.');
    return prisma.$transaction(async (tx) => {
      await this.lockActivationScope(
        tx,
        tenantId,
        published.moduleKey,
        published.entityKey,
        published.surfaceKey,
        dto.environmentKey,
        dto.cohortKey,
      );
      const active = await tx.configurationActivation.findFirst({
        where: {
          tenantId,
          moduleKey: published.moduleKey,
          entityKey: published.entityKey,
          surfaceKey: published.surfaceKey,
          environmentKey: dto.environmentKey,
          cohortKey: dto.cohortKey,
          status: 'ACTIVE',
        },
        include: { publishedVersion: true },
        orderBy: { activatedAt: 'desc' },
      });
      const impact = await this.analyzeImpact(
        tx,
        tenantId,
        published.manifest as unknown as CompiledConfigurationManifest,
        published.checksum,
        published.id,
        active?.publishedVersion ?? null,
      );
      if (!impact.activationAllowed) {
        throw new ConflictException({
          message:
            'Activation is blocked because persisted records are incompatible with the target configuration.',
          impact,
        });
      }
      await tx.configurationActivation.updateMany({
        where: {
          tenantId,
          moduleKey: published.moduleKey,
          entityKey: published.entityKey,
          surfaceKey: published.surfaceKey,
          environmentKey: dto.environmentKey,
          cohortKey: dto.cohortKey,
          status: 'ACTIVE',
        },
        data: { status: 'INACTIVE', deactivatedAt: new Date() },
      });
      const activation = await tx.configurationActivation.create({
        data: {
          tenantId,
          publishedVersionId: published.id,
          moduleKey: published.moduleKey,
          entityKey: published.entityKey,
          surfaceKey: published.surfaceKey,
          environmentKey: dto.environmentKey,
          cohortKey: dto.cohortKey,
          reason: dto.reason,
          activatedById: actorId,
        },
      });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'STATUS_CHANGE',
        'configuration-activation',
        activation.id,
        dto.reason,
        null,
        activation,
      );
      await this.outbox(
        tx,
        tenantId,
        'configuration-activation',
        activation.id,
        'configuration.activation.changed.v1',
        {
          activationId: activation.id,
          publishedVersionId: published.id,
          checksum: published.checksum,
        },
      );
      await tx.configurationIdempotencyRecord.create({
        data: {
          tenantId,
          actorId,
          operation: 'activation.create',
          idempotencyKey: dto.idempotencyKey,
          requestChecksum,
          response: activation as Prisma.InputJsonValue,
          statusCode: 201,
        },
      });
      return activation;
    });
  }

  async rollback(tenantId: string, actorId: string, dto: ActivateConfigurationDto) {
    const requestChecksum = checksum(dto);
    const operation = 'activation.rollback';
    const replay = await this.idempotentReplay(
      tenantId,
      actorId,
      operation,
      dto.idempotencyKey,
      requestChecksum,
    );
    if (replay) return replay;
    const target = await prisma.configurationPublishedVersion.findFirst({
      where: { id: dto.publishedVersionId, tenantId },
    });
    if (!target) throw new NotFoundException('Rollback configuration version was not found.');
    return prisma.$transaction(async (tx) => {
      await this.lockActivationScope(
        tx,
        tenantId,
        target.moduleKey,
        target.entityKey,
        target.surfaceKey,
        dto.environmentKey,
        dto.cohortKey,
      );
      const active = await tx.configurationActivation.findFirst({
        where: {
          tenantId,
          moduleKey: target.moduleKey,
          entityKey: target.entityKey,
          surfaceKey: target.surfaceKey,
          environmentKey: dto.environmentKey,
          cohortKey: dto.cohortKey,
          status: 'ACTIVE',
        },
        include: { publishedVersion: true },
        orderBy: { activatedAt: 'desc' },
      });
      if (!active) throw new ConflictException('There is no active version to roll back.');
      if (target.sequence >= active.publishedVersion.sequence)
        throw new ConflictException('Rollback must select an older published version.');
      const impact = await this.analyzeImpact(
        tx,
        tenantId,
        target.manifest as unknown as CompiledConfigurationManifest,
        target.checksum,
        target.id,
        active.publishedVersion,
      );
      if (!impact.activationAllowed) {
        throw new ConflictException({
          message:
            'Rollback is blocked because persisted records are incompatible with the target configuration.',
          impact,
        });
      }
      const updated = await tx.configurationActivation.updateMany({
        where: { id: active.id, status: 'ACTIVE' },
        data: { status: 'INACTIVE', deactivatedAt: new Date() },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'The active configuration changed; reload before rolling back.',
        );
      const activation = await tx.configurationActivation.create({
        data: {
          tenantId,
          publishedVersionId: target.id,
          moduleKey: target.moduleKey,
          entityKey: target.entityKey,
          surfaceKey: target.surfaceKey,
          environmentKey: dto.environmentKey,
          cohortKey: dto.cohortKey,
          reason: dto.reason,
          activatedById: actorId,
        },
      });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'STATUS_CHANGE',
        'configuration-activation',
        activation.id,
        dto.reason,
        active,
        activation,
      );
      await this.outbox(
        tx,
        tenantId,
        'configuration-activation',
        activation.id,
        'configuration.activation.rolled-back.v1',
        {
          activationId: activation.id,
          fromPublishedVersionId: active.publishedVersionId,
          toPublishedVersionId: target.id,
          checksum: target.checksum,
        },
      );
      await tx.configurationIdempotencyRecord.create({
        data: {
          tenantId,
          actorId,
          operation,
          idempotencyKey: dto.idempotencyKey,
          requestChecksum,
          response: jsonInput(activation),
          statusCode: 201,
        },
      });
      return activation;
    });
  }

  async runtimeManifest(
    tenantId: string,
    moduleKey: string,
    entityKey: string,
    surfaceKey: string,
    environmentKey: string,
    cohortKey: string,
    permissions: string[],
  ) {
    const activation = await prisma.configurationActivation.findFirst({
      where: {
        tenantId,
        moduleKey,
        entityKey,
        surfaceKey,
        environmentKey,
        cohortKey,
        status: 'ACTIVE',
      },
      include: { publishedVersion: true },
      orderBy: { activatedAt: 'desc' },
    });
    if (!activation) throw new NotFoundException('No active configuration exists for this scope.');
    return {
      activationId: activation.id,
      publishedVersionId: activation.publishedVersionId,
      activatedAt: activation.activatedAt,
      manifest: filterManifest(
        activation.publishedVersion.manifest as unknown as CompiledConfigurationManifest,
        permissions,
      ),
      checksum: activation.publishedVersion.checksum,
    };
  }

  async getExtensionValues(
    tenantId: string,
    ownerType: string,
    ownerId: string,
    permissions: string[],
  ) {
    this.assertExtensionOwner(tenantId, ownerType, ownerId);
    const record = await prisma.configurationExtensionValue.findFirst({
      where: { tenantId, ownerType, ownerId },
      include: { publishedVersion: true },
    });
    if (!record) return null;
    const { publishedVersion: _publishedVersion, ...result } = record;
    return {
      ...result,
      values: filterValues(
        record.values,
        record.publishedVersion.manifest as unknown as CompiledConfigurationManifest,
        permissions,
      ),
    };
  }

  async saveExtensionValues(
    tenantId: string,
    actorId: string,
    ownerType: string,
    ownerId: string,
    dto: ConfigurationExtensionValuesDto,
    permissions: string[],
  ) {
    this.assertExtensionOwner(tenantId, ownerType, ownerId);
    const operation = `extension-values.save:${ownerType}:${ownerId}`;
    const requestChecksum = checksum(dto);
    const replay = await this.idempotentReplay(
      tenantId,
      actorId,
      operation,
      dto.idempotencyKey,
      requestChecksum,
    );
    if (replay) return replay;
    const published = await prisma.configurationPublishedVersion.findFirst({
      where: { id: dto.publishedVersionId, tenantId },
    });
    if (!published) throw new NotFoundException('Published configuration version was not found.');
    if (
      published.moduleKey !== 'tenant-settings' ||
      published.entityKey !== 'tenant-profile' ||
      published.surfaceKey !== 'profile-extension'
    ) {
      throw new BadRequestException(
        'The published version is not registered for tenant-profile extension values.',
      );
    }
    return prisma.$transaction(async (tx) => {
      await this.lockActivationScope(
        tx,
        tenantId,
        published.moduleKey,
        published.entityKey,
        published.surfaceKey,
        'local-uat',
        'all-users',
      );
      const active = await tx.configurationActivation.findFirst({
        where: {
          tenantId,
          publishedVersionId: published.id,
          moduleKey: published.moduleKey,
          entityKey: published.entityKey,
          surfaceKey: published.surfaceKey,
          environmentKey: 'local-uat',
          cohortKey: 'all-users',
          status: 'ACTIVE',
        },
      });
      if (!active)
        throw new ConflictException(
          'The selected tenant-profile manifest is not active for local UAT.',
        );
      const manifest = published.manifest as unknown as CompiledConfigurationManifest;
      const existing = await tx.configurationExtensionValue.findFirst({
        where: { tenantId, ownerType, ownerId },
      });
      if ((existing?.version ?? 0) !== dto.expectedVersion)
        throw new ConflictException('Extension values changed; reload before saving.');
      assertAuthorizedValues(manifest, dto.values, permissions, existing?.values);
      const mergedValues = existing
        ? { ...(existing.values as Record<string, unknown>), ...dto.values }
        : dto.values;
      const errors = validateConfigurationValues(manifest, mergedValues, {
        allowReadOnly: Boolean(existing),
      });
      if (Object.keys(errors).length > 0)
        throw new BadRequestException({ message: 'Extension values failed validation.', errors });
      const valuesChecksum = checksum(mergedValues);
      const record = existing
        ? await tx.configurationExtensionValue.update({
            where: { id: existing.id },
            data: {
              publishedVersionId: published.id,
              manifestChecksum: published.checksum,
              values: jsonInput(mergedValues),
              valuesChecksum,
              updatedById: actorId,
              version: { increment: 1 },
            },
          })
        : await tx.configurationExtensionValue.create({
            data: {
              tenantId,
              ownerType,
              ownerId,
              publishedVersionId: published.id,
              manifestChecksum: published.checksum,
              values: jsonInput(mergedValues),
              valuesChecksum,
              createdById: actorId,
              updatedById: actorId,
            },
          });
      await this.audit(
        tx,
        tenantId,
        actorId,
        existing ? 'UPDATE' : 'CREATE',
        'configuration-extension-values',
        record.id,
        dto.reason,
        existing,
        record,
      );
      await tx.configurationIdempotencyRecord.create({
        data: {
          tenantId,
          actorId,
          operation,
          idempotencyKey: dto.idempotencyKey,
          requestChecksum,
          response: jsonInput(record),
          statusCode: 200,
        },
      });
      return record;
    });
  }

  private async transition(
    tenantId: string,
    actorId: string,
    id: string,
    dto: ConfigurationReasonDto,
    from: string,
    to: string,
    extra: Record<string, unknown>,
  ) {
    const current = await this.requireChangeSet(tenantId, id);
    if (current.status !== from || current.version !== dto.expectedVersion)
      throw new ConflictException(`Expected ${from} at version ${dto.expectedVersion}.`);
    const result = await prisma.configurationChangeSet.updateMany({
      where: { id, tenantId, status: from, version: dto.expectedVersion },
      data: { status: to, reason: dto.reason, version: { increment: 1 }, ...extra },
    });
    if (result.count !== 1)
      throw new ConflictException('The change set changed; reload before continuing.');
    const updated = await this.requireChangeSet(tenantId, id);
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: actorId,
        action: 'STATUS_CHANGE',
        resource: 'configuration-change-set',
        resourceId: id,
        before: jsonInput(current),
        after: jsonInput(updated),
        metadata: { reason: dto.reason },
      },
    });
    return updated;
  }

  private async requireChangeSet(tenantId: string, id: string) {
    const record = await prisma.configurationChangeSet.findFirst({ where: { id, tenantId } });
    if (!record) throw new NotFoundException('Configuration change set was not found.');
    return record;
  }

  private async requireActiveApplicationVersion(
    db: Prisma.TransactionClient | typeof prisma,
    tenantId: string,
    entityKey: string,
    publishedVersionId: string,
  ) {
    const activation = await db.configurationActivation.findFirst({
      where: {
        tenantId,
        moduleKey: 'tenant-apps',
        entityKey,
        environmentKey: 'local-uat',
        cohortKey: 'all-users',
        status: 'ACTIVE',
        publishedVersionId,
      },
      include: { publishedVersion: true },
    });
    if (!activation)
      throw new ConflictException('The selected application manifest is not active for local UAT.');
    return activation.publishedVersion;
  }

  private async requireActiveApplication(tenantId: string, entityKey: string) {
    const activation = await prisma.configurationActivation.findFirst({
      where: {
        tenantId,
        moduleKey: 'tenant-apps',
        entityKey,
        environmentKey: 'local-uat',
        cohortKey: 'all-users',
        status: 'ACTIVE',
      },
      include: { publishedVersion: true },
      orderBy: { activatedAt: 'desc' },
    });
    if (!activation) throw new NotFoundException('This tenant application is not active.');
    return activation;
  }

  private async compatibility(tenantId: string, definition: ConfigurationDefinition) {
    const latest = await prisma.configurationPublishedVersion.findFirst({
      where: {
        tenantId,
        moduleKey: definition.moduleKey,
        entityKey: definition.entityKey,
        surfaceKey: definition.surfaceKey,
      },
      orderBy: { sequence: 'desc' },
    });
    if (!latest) return 'COMPATIBLE';
    return impactClassification(
      compareConfigurationFields(
        latest.manifest as unknown as CompiledConfigurationManifest,
        definition as unknown as CompiledConfigurationManifest,
      ),
    );
  }

  private async lockActivationScope(
    tx: Prisma.TransactionClient,
    tenantId: string,
    moduleKey: string,
    entityKey: string,
    surfaceKey: string,
    environmentKey: string,
    cohortKey: string,
  ) {
    const scope = [tenantId, moduleKey, entityKey, surfaceKey, environmentKey, cohortKey].join('/');
    await tx.$queryRaw`SELECT 1::int AS "locked" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))) AS "activation_lock"`;
  }

  private async analyzeImpact(
    db: Prisma.TransactionClient | typeof prisma,
    tenantId: string,
    target: CompiledConfigurationManifest,
    targetChecksum: string,
    targetPublishedVersionId: string | null,
    baseline: { id: string; manifest: Prisma.JsonValue } | null,
  ): Promise<ConfigurationImpactReport> {
    const changes = compareConfigurationFields(
      baseline?.manifest as unknown as CompiledConfigurationManifest | undefined,
      target,
    );
    const report: ConfigurationImpactReport = {
      moduleKey: target.moduleKey,
      entityKey: target.entityKey,
      surfaceKey: target.surfaceKey,
      baselinePublishedVersionId: baseline?.id ?? null,
      targetPublishedVersionId,
      targetChecksum,
      classification: impactClassification(changes),
      changes,
      scanned: { configurationRecords: 0, extensionValues: 0 },
      incompatible: { configurationRecords: 0, extensionValues: 0, samples: [] },
      activationAllowed: true,
    };

    if (target.moduleKey === 'tenant-apps') {
      let cursor: string | undefined;
      do {
        const records = await db.configurationRecord.findMany({
          where: { tenantId, entityKey: target.entityKey, deletedAt: null },
          orderBy: { id: 'asc' },
          take: 250,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true, values: true },
        });
        for (const record of records) {
          report.scanned.configurationRecords += 1;
          const fieldKeys = Object.keys(
            validateConfigurationValues(target, record.values as Record<string, unknown>, {
              allowReadOnly: true,
            }),
          );
          if (fieldKeys.length > 0) {
            report.incompatible.configurationRecords += 1;
            if (report.incompatible.samples.length < 20)
              report.incompatible.samples.push({
                recordType: 'CONFIGURATION_RECORD',
                recordId: record.id,
                fieldKeys,
              });
          }
        }
        cursor = records.length === 250 ? records.at(-1)?.id : undefined;
      } while (cursor);
    }

    if (target.moduleKey === 'tenant-settings' && target.entityKey === 'tenant-profile') {
      const values = await db.configurationExtensionValue.findMany({
        where: { tenantId, ownerType: 'tenant-profile', ownerId: tenantId },
        select: { id: true, values: true },
      });
      for (const record of values) {
        report.scanned.extensionValues += 1;
        const fieldKeys = Object.keys(
          validateConfigurationValues(target, record.values as Record<string, unknown>, {
            allowReadOnly: true,
          }),
        );
        if (fieldKeys.length > 0) {
          report.incompatible.extensionValues += 1;
          if (report.incompatible.samples.length < 20)
            report.incompatible.samples.push({
              recordType: 'EXTENSION_VALUE',
              recordId: record.id,
              fieldKeys,
            });
        }
      }
    }

    report.activationAllowed =
      report.incompatible.configurationRecords === 0 && report.incompatible.extensionValues === 0;
    return report;
  }

  private async idempotentReplay(
    tenantId: string,
    actorId: string,
    operation: string,
    idempotencyKey: string,
    requestChecksum: string,
  ) {
    const existing = await prisma.configurationIdempotencyRecord.findUnique({
      where: {
        tenantId_actorId_operation_idempotencyKey: { tenantId, actorId, operation, idempotencyKey },
      },
    });
    if (!existing) return null;
    if (existing.requestChecksum !== requestChecksum)
      throw new ConflictException('Idempotency key was already used with different content.');
    return existing.response;
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string,
    action: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE',
    resource: string,
    resourceId: string,
    reason: string,
    before: unknown,
    after: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        tenantId,
        userId: actorId,
        action,
        resource,
        resourceId,
        before: nullableJsonInput(before),
        after: nullableJsonInput(after),
        metadata: { reason },
      },
    });
  }

  private outbox(
    tx: Prisma.TransactionClient,
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    return tx.controlOutboxEvent.create({
      data: {
        eventId: randomUUID(),
        tenantId,
        aggregateType,
        aggregateId,
        eventType,
        payload: jsonInput(payload),
      },
    });
  }

  private assertRegisteredSurface(definition: ConfigurationDefinition) {
    const surface = this.listBaseSurfaces().find(
      (surface) =>
        surface.moduleKey === definition.moduleKey &&
        (surface.entityKeyEditable || surface.entityKey === definition.entityKey) &&
        (surface.surfaceKeyEditable || surface.surfaceKey === definition.surfaceKey) &&
        (surface.modes as readonly string[]).includes(definition.mode),
    );
    if (!surface) {
      throw new BadRequestException(
        'This module surface is not registered for governed configuration.',
      );
    }
    if (!surface.authoringEnabled) {
      throw new BadRequestException(
        surface.authoringDisabledReason ??
          'This module surface is available for inspection but not configuration authoring.',
      );
    }
    const coreKeys = new Set(surface.coreFields.map((field) => field.key));
    const shadowedKey = definition.fields.find((field) => coreKeys.has(field.key))?.key;
    if (shadowedKey) {
      throw new BadRequestException(
        `Field ${shadowedKey} is module-owned core and cannot be redefined by configuration.`,
      );
    }
  }

  private assertExtensionOwner(tenantId: string, ownerType: string, ownerId: string) {
    if (ownerType !== 'tenant-profile' || ownerId !== tenantId) {
      throw new BadRequestException(
        'This extension owner is not registered for direct value storage.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Template catalog (P1)
  // ---------------------------------------------------------------------------

  async listTemplates(tenantId: string, entityKey: string, permissions: string[]) {
    const active = await this.requireActiveApplication(tenantId, entityKey);
    const manifest = active.publishedVersion.manifest as unknown as CompiledConfigurationManifest;
    const filteredManifest = filterManifest(manifest, permissions);
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        tenantId: string;
        entityKey: string;
        name: string;
        description: string | null;
        publishedVersionId: string;
        manifestChecksum: string;
        values: unknown;
        valuesChecksum: string;
        sourceTemplateId: string | null;
        version: number;
        createdById: string;
        updatedById: string;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT id, "tenantId", "entityKey", name, description, "publishedVersionId",
             "manifestChecksum", values, "valuesChecksum", "sourceTemplateId",
             version, "createdById", "updatedById", "createdAt", "updatedAt"
      FROM configuration_templates
      WHERE "tenantId" = ${tenantId}
        AND "entityKey" = ${entityKey}
        AND "deletedAt" IS NULL
      ORDER BY "updatedAt" DESC
      LIMIT 200
    `;
    const unmaskSensitive = hasPermission(permissions, 'configuration:unmask-sensitive');
    const fieldMap = new Map(filteredManifest.fields.map((f) => [f.key, f]));
    const staleChecksum = active.publishedVersion.checksum;
    return {
      templates: rows.map((row) => ({
        ...row,
        values: maskValues(row.values as Record<string, unknown>, filteredManifest, unmaskSensitive, fieldMap),
        stale: row.manifestChecksum !== staleChecksum,
      })),
      manifest: filteredManifest,
    };
  }

  async createTemplate(
    tenantId: string,
    entityKey: string,
    actorId: string,
    dto: CreateConfigurationTemplateDto,
    permissions: string[],
  ) {
    const active = await this.requireActiveApplication(tenantId, entityKey);
    const manifest = active.publishedVersion.manifest as unknown as CompiledConfigurationManifest;
    const filteredManifest = filterManifest(manifest, permissions);
    assertAuthorizedValues(filteredManifest, dto.values as Record<string, unknown>, permissions);
    const errors = validateConfigurationValues(filteredManifest, dto.values as Record<string, unknown>, { allowReadOnly: false });
    if (Object.keys(errors).length > 0) throw new BadRequestException({ message: 'Template values contain validation errors.', errors });
    const id = randomUUID();
    const valuesCs = checksum(dto.values);
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO configuration_templates
        (id, "tenantId", "entityKey", name, description,
         "publishedVersionId", "manifestChecksum",
         values, "valuesChecksum",
         version, "createdById", "updatedById", "createdAt", "updatedAt")
      VALUES
        (${id}, ${tenantId}, ${entityKey}, ${dto.name}, ${dto.description ?? null},
         ${active.publishedVersion.id}, ${active.publishedVersion.checksum},
         ${JSON.stringify(dto.values)}::jsonb, ${valuesCs},
         1, ${actorId}, ${actorId}, ${now}, ${now})
    `;
    return { id, tenantId, entityKey, name: dto.name, description: dto.description ?? null,
             publishedVersionId: active.publishedVersion.id,
             manifestChecksum: active.publishedVersion.checksum,
             values: dto.values, valuesChecksum: valuesCs,
             sourceTemplateId: null, version: 1,
             createdById: actorId, updatedById: actorId,
             createdAt: now, updatedAt: now, stale: false };
  }

  async updateTemplate(
    tenantId: string,
    entityKey: string,
    templateId: string,
    actorId: string,
    dto: UpdateConfigurationTemplateDto,
    permissions: string[],
  ) {
    const rows = await prisma.$queryRaw<Array<{ id: string; version: number; values: unknown; manifestChecksum: string }>>`
      SELECT id, version, values, "manifestChecksum"
      FROM configuration_templates
      WHERE id = ${templateId} AND "tenantId" = ${tenantId} AND "entityKey" = ${entityKey} AND "deletedAt" IS NULL
    `;
    if (rows.length === 0) throw new NotFoundException('Template not found.');
    const row = rows[0]!;
    if (row.version !== dto.expectedVersion)
      throw new ConflictException('Template version mismatch. Fetch the latest version and retry.');
    const active = await this.requireActiveApplication(tenantId, entityKey);
    const manifest = active.publishedVersion.manifest as unknown as CompiledConfigurationManifest;
    const filteredManifest = filterManifest(manifest, permissions);
    const mergedValues = { ...(row.values as Record<string, unknown>), ...(dto.values ?? {}) };
    if (dto.values) {
      assertAuthorizedValues(filteredManifest, dto.values as Record<string, unknown>, permissions, row.values);
      const errors = validateConfigurationValues(filteredManifest, mergedValues, { allowReadOnly: false });
      if (Object.keys(errors).length > 0) throw new BadRequestException({ message: 'Template values contain validation errors.', errors });
    }
    const newValuesCs = checksum(mergedValues);
    const now = new Date();
    await prisma.$executeRaw`
      UPDATE configuration_templates
      SET name             = COALESCE(${dto.name ?? null}, name),
          description      = COALESCE(${dto.description ?? null}, description),
          values           = ${JSON.stringify(mergedValues)}::jsonb,
          "valuesChecksum" = ${newValuesCs},
          version          = version + 1,
          "updatedById"    = ${actorId},
          "updatedAt"      = ${now}
      WHERE id = ${templateId} AND "tenantId" = ${tenantId} AND version = ${dto.expectedVersion}
    `;
    return { id: templateId, tenantId, entityKey, version: dto.expectedVersion + 1, updatedAt: now };
  }

  async duplicateTemplate(
    tenantId: string,
    entityKey: string,
    templateId: string,
    actorId: string,
    dto: DuplicateConfigurationTemplateDto,
  ) {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; values: unknown; publishedVersionId: string; manifestChecksum: string }>
    >`
      SELECT id, values, "publishedVersionId", "manifestChecksum"
      FROM configuration_templates
      WHERE id = ${templateId} AND "tenantId" = ${tenantId} AND "entityKey" = ${entityKey} AND "deletedAt" IS NULL
    `;
    if (rows.length === 0) throw new NotFoundException('Source template not found.');
    const source = rows[0]!;
    const newId = randomUUID();
    const valuesCs = checksum(source.values);
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO configuration_templates
        (id, "tenantId", "entityKey", name,
         "publishedVersionId", "manifestChecksum",
         values, "valuesChecksum", "sourceTemplateId",
         version, "createdById", "updatedById", "createdAt", "updatedAt")
      VALUES
        (${newId}, ${tenantId}, ${entityKey}, ${dto.name},
         ${source.publishedVersionId}, ${source.manifestChecksum},
         ${JSON.stringify(source.values)}::jsonb, ${valuesCs}, ${templateId},
         1, ${actorId}, ${actorId}, ${now}, ${now})
    `;
    return { id: newId, tenantId, entityKey, name: dto.name, sourceTemplateId: templateId,
             publishedVersionId: source.publishedVersionId, manifestChecksum: source.manifestChecksum,
             values: source.values, valuesChecksum: valuesCs,
             version: 1, createdById: actorId, updatedById: actorId,
             createdAt: now, updatedAt: now };
  }

  async deleteTemplate(tenantId: string, entityKey: string, templateId: string, actorId: string) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM configuration_templates
      WHERE id = ${templateId} AND "tenantId" = ${tenantId} AND "entityKey" = ${entityKey} AND "deletedAt" IS NULL
    `;
    if (rows.length === 0) throw new NotFoundException('Template not found.');
    const now = new Date();
    await prisma.$executeRaw`
      UPDATE configuration_templates
      SET "deletedAt" = ${now}, "updatedById" = ${actorId}, "updatedAt" = ${now}
      WHERE id = ${templateId} AND "tenantId" = ${tenantId}
    `;
    return { id: templateId, deletedAt: now };
  }

  // ---------------------------------------------------------------------------
  // Saved filters (P1)
  // ---------------------------------------------------------------------------

  async listSavedFilters(tenantId: string, entityKey: string) {
    return prisma.$queryRaw<
      Array<{
        id: string; tenantId: string; entityKey: string; name: string;
        filterKey: string | null; filterValue: string | null; search: string | null;
        sortKey: string | null; sortDirection: string;
        createdById: string; createdAt: Date; updatedAt: Date;
      }>
    >`
      SELECT id, "tenantId", "entityKey", name,
             "filterKey", "filterValue", search, "sortKey", "sortDirection",
             "createdById", "createdAt", "updatedAt"
      FROM configuration_saved_filters
      WHERE "tenantId" = ${tenantId} AND "entityKey" = ${entityKey}
      ORDER BY "createdAt" DESC
      LIMIT 200
    `;
  }

  async createSavedFilter(tenantId: string, entityKey: string, actorId: string, dto: CreateSavedFilterDto) {
    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO configuration_saved_filters
        (id, "tenantId", "entityKey", name,
         "filterKey", "filterValue", search, "sortKey", "sortDirection",
         "createdById", "createdAt", "updatedAt")
      VALUES
        (${id}, ${tenantId}, ${entityKey}, ${dto.name},
         ${dto.filterKey ?? null}, ${dto.filterValue ?? null},
         ${dto.search ?? null}, ${dto.sortKey ?? null}, ${dto.sortDirection},
         ${actorId}, ${now}, ${now})
    `;
    return { id, tenantId, entityKey, name: dto.name,
             filterKey: dto.filterKey ?? null, filterValue: dto.filterValue ?? null,
             search: dto.search ?? null, sortKey: dto.sortKey ?? null,
             sortDirection: dto.sortDirection, createdById: actorId,
             createdAt: now, updatedAt: now };
  }

  async deleteSavedFilter(tenantId: string, entityKey: string, filterId: string, actorId: string) {
    const rows = await prisma.$queryRaw<Array<{ id: string; createdById: string }>>`
      SELECT id, "createdById" FROM configuration_saved_filters
      WHERE id = ${filterId} AND "tenantId" = ${tenantId} AND "entityKey" = ${entityKey}
    `;
    if (rows.length === 0) throw new NotFoundException('Saved filter not found.');
    // Only creator or tenant admin (checked by caller via permission) can delete
    if (rows[0]!.createdById !== actorId)
      throw new ForbiddenException('Only the creator can delete a saved filter.');
    await prisma.$executeRaw`
      DELETE FROM configuration_saved_filters WHERE id = ${filterId} AND "tenantId" = ${tenantId}
    `;
    return { id: filterId, deleted: true };
  }
}

function checksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nullableJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined ? Prisma.JsonNull : jsonInput(value);
}

function compareConfigurationFields(
  baseline: CompiledConfigurationManifest | undefined,
  target: CompiledConfigurationManifest,
): ConfigurationImpactChange[] {
  if (!baseline) {
    return target.fields.map((field) => ({
      fieldKey: field.key,
      kind: 'FIELD_ADDED',
      severity: 'SAFE',
      message: `Field ${field.label} is introduced on a new surface.`,
    }));
  }
  const changes: ConfigurationImpactChange[] = [];
  const previousFields = new Map(baseline.fields.map((field) => [field.key, field]));
  const nextFields = new Map(target.fields.map((field) => [field.key, field]));
  for (const field of baseline.fields) {
    const next = nextFields.get(field.key);
    if (!next) {
      changes.push({
        fieldKey: field.key,
        kind: 'FIELD_REMOVED',
        severity: 'BREAKING',
        message: `Field ${field.label} is removed.`,
      });
      continue;
    }
    if (next.type !== field.type) {
      changes.push({
        fieldKey: field.key,
        kind: 'TYPE_CHANGED',
        severity: 'BREAKING',
        message: `Field ${field.label} changes from ${field.type} to ${next.type}.`,
      });
      continue;
    }
    if (!field.required && next.required) {
      changes.push({
        fieldKey: field.key,
        kind: 'REQUIRED_ADDED',
        severity: 'CONDITIONAL',
        message: `Field ${field.label} becomes required.`,
      });
    }
    const removedOptions = (field.options ?? []).filter(
      (option) => !(next.options ?? []).some((candidate) => candidate.value === option.value),
    );
    if (removedOptions.length > 0) {
      changes.push({
        fieldKey: field.key,
        kind: 'OPTIONS_REMOVED',
        severity: 'CONDITIONAL',
        message: `${removedOptions.length} allowed option value(s) are removed from ${field.label}.`,
      });
    }
    const tightened = [
      next.minimum !== undefined && (field.minimum === undefined || next.minimum > field.minimum),
      next.maximum !== undefined && (field.maximum === undefined || next.maximum < field.maximum),
      next.minLength !== undefined &&
        (field.minLength === undefined || next.minLength > field.minLength),
      next.maxLength !== undefined &&
        (field.maxLength === undefined || next.maxLength < field.maxLength),
    ].some(Boolean);
    if (tightened) {
      changes.push({
        fieldKey: field.key,
        kind: 'CONSTRAINT_TIGHTENED',
        severity: 'CONDITIONAL',
        message: `Validation constraints are tightened for ${field.label}.`,
      });
    }
  }
  for (const field of target.fields) {
    if (!previousFields.has(field.key)) {
      changes.push({
        fieldKey: field.key,
        kind: 'FIELD_ADDED',
        severity: field.required && field.defaultValue === undefined ? 'CONDITIONAL' : 'SAFE',
        message: `Field ${field.label} is added${field.required && field.defaultValue === undefined ? ' without a default value' : ''}.`,
      });
    }
  }
  return changes;
}

function impactClassification(
  changes: ConfigurationImpactChange[],
): ConfigurationImpactReport['classification'] {
  if (changes.some((change) => change.severity === 'BREAKING')) return 'BREAKING';
  if (changes.some((change) => change.severity === 'CONDITIONAL')) return 'CONDITIONAL';
  return 'COMPATIBLE';
}

function hasPermission(permissions: string[], required: string | undefined): boolean {
  if (!required) return true;
  const [requiredResource, requiredAction] = required.split(':');
  return permissions.some((permission) => {
    if (permission === '*' || permission === 'all' || permission === required) return true;
    const [resource, action] = permission.split(':');
    return (
      (resource === '*' || resource === requiredResource) &&
      (action === '*' || action === requiredAction)
    );
  });
}

function filterManifest(
  manifest: CompiledConfigurationManifest,
  permissions: string[],
): CompiledConfigurationManifest {
  let visibleFields = manifest.fields.filter((field) =>
    hasPermission(permissions, field.readPermission),
  );
  let changed = true;
  while (changed) {
    const visibleKeys = new Set(visibleFields.map((field) => field.key));
    const filtered = visibleFields.filter((field) =>
      [...conditionReferences(field.visibleWhen), ...conditionReferences(field.requiredWhen)].every(
        (key) => visibleKeys.has(key),
      ),
    );
    changed = filtered.length !== visibleFields.length;
    visibleFields = filtered;
  }
  const visibleKeys = new Set(visibleFields.map((field) => field.key));
  const sections = manifest.sections
    .map((section) => ({
      ...section,
      fieldKeys: section.fieldKeys.filter((key) => visibleKeys.has(key)),
    }))
    .filter((section) => section.fieldKeys.length > 0);
  return { ...manifest, fields: visibleFields, sections };
}

/** Apply field-level masking: CONFIDENTIAL and RESTRICTED values are replaced
 *  with the sentinel "***" unless the caller has configuration:unmask-sensitive. */
function maskValues(
  values: Record<string, unknown>,
  _filteredManifest: CompiledConfigurationManifest,
  unmaskSensitive: boolean,
  fieldMap: Map<string, CompiledConfigurationManifest["fields"][number]>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => fieldMap.has(key))
      .map(([key, value]) => {
        const field = fieldMap.get(key)!;
        if (
          !unmaskSensitive &&
          (field.classification === 'CONFIDENTIAL' || field.classification === 'RESTRICTED')
        ) {
          return [key, '***'];
        }
        return [key, value];
      }),
  );
}

function filterValues(
  values: unknown,
  manifest: CompiledConfigurationManifest,
  permissions: string[],
): Record<string, unknown> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
  const filtered = filterManifest(manifest, permissions);
  const unmaskSensitive = hasPermission(permissions, 'configuration:unmask-sensitive');
  const fieldMap = new Map(filtered.fields.map((f) => [f.key, f]));
  return maskValues(values as Record<string, unknown>, filtered, unmaskSensitive, fieldMap);
}

function conditionReferences(condition: ConfigurationCondition | undefined): Set<string> {
  if (!condition) return new Set();
  if (condition.kind === 'PREDICATE') return new Set([condition.fieldKey]);
  return new Set(condition.conditions.flatMap((item) => [...conditionReferences(item)]));
}

function assertAuthorizedValues(
  manifest: CompiledConfigurationManifest,
  values: Record<string, unknown>,
  permissions: string[],
  existingValues?: unknown,
) {
  const fields = new Map(manifest.fields.map((field) => [field.key, field]));
  const existing =
    existingValues && typeof existingValues === 'object' && !Array.isArray(existingValues)
      ? (existingValues as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(values)) {
    const field = fields.get(key);
    if (!field) continue;
    const unchanged =
      Object.prototype.hasOwnProperty.call(existing, key) &&
      canonicalJson(existing[key]) === canonicalJson(value);
    if (unchanged) continue;
    if (
      field.readOnly ||
      !hasPermission(permissions, field.readPermission) ||
      !hasPermission(permissions, field.writePermission)
    ) {
      throw new ForbiddenException(`Field ${key} cannot be changed with the current permissions.`);
    }
  }
}
