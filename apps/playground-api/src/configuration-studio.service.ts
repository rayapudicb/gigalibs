import { createHash, randomUUID, sign as signPayload, verify as verifyPayload } from 'node:crypto';
import {
  CONFIGURATION_COMPILER_VERSION,
  type CompiledConfigurationManifest,
  canonicalJson,
  bundledGovernedCatalogue,
  classifyConfigurationImpact,
  classifyDictionaryImpact,
  classifyGovernedCatalogueChange,
  compareConfigurationDefinitions,
  compileConfiguration,
  compileDictionaryPackage,
  compileGovernedCatalogue,
  listBundledGovernedCatalogues,
  validateConfigurationValues,
} from '@gigalibs/configuration-core';
import {
  holdsPermission,
  GOVERNED_CATALOGUE_SCOPES,
  LEGACY_GOVERNED_CATALOGUE_SCOPES,
  SOLUTION_CONFIGURATION_MODULE_KEY,
  isGovernedCatalogueDefinition,
  isDictionaryChangeSetDefinition,
  isDictionaryManifest,
  type CompiledDictionaryManifestV1,
  normaliseCountryPack,
  normaliseIndustryPack,
  type CountryPackV2,
  type IndustryPackV2,
} from '@gigalibs/contracts';
import type {
  ActivateConfigurationDto,
  ConfigurationChangeSetDefinition,
  ConfigurationCondition,
  ConfigurationDefinition,
  GovernedCatalogueDefinition,
  GovernedCatalogueKind,
  InstallGovernedCatalogueDto,
  ConfigurationExtensionValuesDto,
  ConfigurationImpactReport,
  ConfigurationReasonDto,
  ModuleAdapterDescriptorV1,
  ConfigurationRuntimeScopeV1,
  ConfigurationSurfaceRegistration,
  CreateConfigurationChangeSetDto,
  CreateConfigurationRecordDto,
  CreateConfigurationTemplateDto,
  CreateSavedFilterDto,
  DeleteConfigurationRecordDto,
  DuplicateConfigurationTemplateDto,
  ExportConfigurationPackageDto,
  ImportConfigurationPackageDto,
  ListApplicationRecordsQuery,
  UpdateConfigurationChangeSetDto,
  UpdateConfigurationRecordDto,
  UpdateConfigurationTemplateDto,
  ModuleWindowBaselineV1,
} from '@gigalibs/contracts';
import { Prisma, prisma } from '@gigalibs/db';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { KernelPackApplicationsService } from './kernel-pack-applications.service.js';
import {
  ConfigurationManifestCache,
  type ConfigurationManifestScope,
} from './configuration-manifest.cache.js';
import { ConfigurationAdapterRegistry } from './configuration-adapter.registry.js';
import { configurationRuntimeError } from './configuration-runtime.error.js';
import {
  ConfigurationRuntimeMetrics,
  type ConfigurationRuntimeOperation,
  type ConfigurationRuntimeResult,
} from './configuration-runtime.metrics.js';
import { ConfigurationRuntimeScopeResolver } from './configuration-runtime-scope.resolver.js';
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
  private readonly logger = new Logger(ConfigurationStudioService.name);

  constructor(
    private readonly manifestCache: ConfigurationManifestCache = new ConfigurationManifestCache(),
    private readonly adapterRegistry: ConfigurationAdapterRegistry = new ConfigurationAdapterRegistry(),
    private readonly runtimeScope: ConfigurationRuntimeScopeResolver = new ConfigurationRuntimeScopeResolver(),
    private readonly runtimeMetrics: ConfigurationRuntimeMetrics = new ConfigurationRuntimeMetrics(),
    // WI-OI-107: activating a pack sends each module its section through kernel jobs.
    @Optional() private readonly packApplications?: KernelPackApplicationsService,
  ) {}

  listBaseSurfaces(): readonly ConfigurationSurfaceRegistration[] {
    return [
      ...this.adapterRegistry.surfaces(),
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
            maximumFields: 250,
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
          registeredCoreField(
            'id',
            'Customer ID',
            'TEXT',
            true,
            true,
            'Stable AR customer identity.',
          ),
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
          registeredCoreField(
            'phone',
            'Phone',
            'PHONE',
            false,
            false,
            'Canonical customer contact data.',
          ),
          registeredCoreField(
            'website',
            'Website',
            'URL',
            false,
            false,
            'Canonical customer profile data.',
          ),
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
          registeredCoreField(
            'id',
            'Invoice ID',
            'TEXT',
            true,
            true,
            'Stable invoice aggregate identity.',
          ),
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

  listDescriptors(): readonly ModuleAdapterDescriptorV1[] {
    return this.adapterRegistry.descriptors();
  }

  listDictionaryContributions() {
    return this.adapterRegistry
      .descriptors()
      .filter((d) => d.dictionaryContribution !== undefined)
      .map((d) => ({
        moduleKey: d.moduleKey,
        entityKey: d.entityKey,
        surfaceKey: d.surfaceKey,
        dictionaryContribution: d.dictionaryContribution!,
      }));
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
            maximumFields: 250,
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

  async exportPackage(
    tenantId: string,
    actorId: string,
    dto: ExportConfigurationPackageDto,
    permissions: string[] = ['*'],
  ) {
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
        columnKeys.filter((key) => fieldMap.has(key)).map((key) => [key, maskedVals[key] ?? null]),
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
    await this.assertAuthorable(tenantId, dto.definition);
    const requestChecksum = checksum(dto);
    const replay = await this.idempotentReplay(
      tenantId,
      actorId,
      'change-set.create',
      dto.idempotencyKey,
      requestChecksum,
    );
    if (replay) return replay;
    const descriptor = this.adapterRegistry.descriptor(
      dto.definition.moduleKey,
      dto.definition.entityKey,
      dto.definition.surfaceKey,
    );
    const compiled = compileChangeSetDefinition(dto.definition, descriptor);
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
    await this.assertAuthorable(tenantId, dto.definition);
    const current = await this.requireChangeSet(tenantId, id);
    if (!['DRAFT', 'VALIDATED'].includes(current.status))
      throw new ConflictException('Only draft or validated change sets can be edited.');
    if (current.version !== dto.expectedVersion)
      throw new ConflictException('The change set changed; reload before editing.');
    const descriptor = this.adapterRegistry.descriptor(
      dto.definition.moduleKey,
      dto.definition.entityKey,
      dto.definition.surfaceKey,
    );
    const compiled = compileChangeSetDefinition(dto.definition, descriptor);
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
    const activation = await prisma.$transaction(async (tx) => {
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
      await this.deactivateOtherPacks(tx, tenantId, published.entityKey, published.surfaceKey, dto.environmentKey, dto.cohortKey);
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
    this.manifestCache.invalidate({
      tenantId,
      moduleKey: published.moduleKey,
      entityKey: published.entityKey,
      surfaceKey: published.surfaceKey,
      environmentKey: dto.environmentKey,
      cohortKey: dto.cohortKey,
    });
    return { ...activation, ...(await this.applyPack(tenantId, actorId, activation.id, published)) };
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
    const activation = await prisma.$transaction(async (tx) => {
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
    this.manifestCache.invalidate({
      tenantId,
      moduleKey: target.moduleKey,
      entityKey: target.entityKey,
      surfaceKey: target.surfaceKey,
      environmentKey: dto.environmentKey,
      cohortKey: dto.cohortKey,
    });
    return { ...activation, ...(await this.applyPack(tenantId, actorId, activation.id, target)) };
  }

  async runtimeManifest(
    tenantId: string,
    moduleKey: string,
    entityKey: string,
    surfaceKey: string,
    environmentKey: string | undefined,
    cohortKey: string | undefined,
    permissions: string[],
  ) {
    return this.withRuntimeMetric('legacy', async () => {
      const descriptor = this.adapterRegistry.descriptor(moduleKey, entityKey, surfaceKey);
      const scope = this.runtimeScope.resolve(descriptor?.entitlementModuleKey ?? 'tenant-access');
      this.runtimeScope.assertLegacyAssertions(scope, {
        ...(environmentKey === undefined ? {} : { environmentKey }),
        ...(cohortKey === undefined ? {} : { cohortKey }),
      });
      if (descriptor) {
        await this.requireEntitlement(tenantId, descriptor.entitlementModuleKey);
      }
      return this.loadRuntimeManifest(
        tenantId,
        descriptor?.moduleKey ?? moduleKey,
        descriptor?.entityKey ?? entityKey,
        descriptor?.surfaceKey ?? surfaceKey,
        scope.environmentKey,
        scope.cohortKey,
        permissions,
      );
    });
  }

  async currentRuntimeManifest(
    tenantId: string,
    moduleKey: string,
    entityKey: string,
    surfaceKey: string,
    permissions: string[],
  ) {
    return this.withRuntimeMetric('current', async () => {
      const { descriptor, scope } = await this.authorizedRuntimeScope(
        tenantId,
        moduleKey,
        entityKey,
        surfaceKey,
      );
      const manifest = await this.loadRuntimeManifest(
        tenantId,
        descriptor.moduleKey,
        descriptor.entityKey,
        descriptor.surfaceKey,
        scope.environmentKey,
        scope.cohortKey,
        permissions,
      );
      return {
        ...manifest,
        scope,
        adapter: {
          adapterKey: descriptor.adapterKey,
          descriptorVersion: descriptor.compatibility.descriptorVersion,
        },
      };
    });
  }

  async previewRuntimeManifest(
    tenantId: string,
    actorId: string,
    moduleKey: string,
    entityKey: string,
    surfaceKey: string,
    environmentKey: string,
    cohortKey: string,
    permissions: string[],
  ) {
    return this.withRuntimeMetric('preview', async () => {
      const descriptor = await this.authorizedAdapter(tenantId, moduleKey, entityKey, surfaceKey);
      const manifest = await this.loadRuntimeManifest(
        tenantId,
        descriptor.moduleKey,
        descriptor.entityKey,
        descriptor.surfaceKey,
        environmentKey,
        cohortKey,
        permissions,
      );
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: actorId,
          action: 'EXPORT',
          resource: 'configuration-runtime-preview',
          resourceId: manifest.activationId,
          metadata: {
            eventType: descriptor.audit.previewEventType,
            adapterKey: descriptor.adapterKey,
            environmentKey,
            cohortKey,
          },
        },
      });
      return manifest;
    });
  }

  private async loadRuntimeManifest(
    tenantId: string,
    moduleKey: string,
    entityKey: string,
    surfaceKey: string,
    environmentKey: string,
    cohortKey: string,
    permissions: string[],
  ) {
    const scope: ConfigurationManifestScope = {
      tenantId,
      moduleKey,
      entityKey,
      surfaceKey,
      environmentKey,
      cohortKey,
    };
    const activation = await this.manifestCache.read(scope, async () => {
      const current = await prisma.configurationActivation.findFirst({
        where: { ...scope, status: 'ACTIVE' },
        include: { publishedVersion: true },
        orderBy: { activatedAt: 'desc' },
      });
      if (!current) {
        throw configurationRuntimeError(
          'CONFIGURATION_MANIFEST_UNAVAILABLE',
          'No active runtime configuration is available.',
          false,
          404,
        );
      }
      return {
        activationId: current.id,
        publishedVersionId: current.publishedVersionId,
        activatedAt: current.activatedAt,
        manifest: current.publishedVersion.manifest as unknown as CompiledConfigurationManifest,
        checksum: current.publishedVersion.checksum,
      };
    });
    return {
      activationId: activation.activationId,
      publishedVersionId: activation.publishedVersionId,
      activatedAt: activation.activatedAt,
      manifest: isGovernedCatalogueDefinition(activation.manifest)
        ? activation.manifest
        : isDictionaryManifest(activation.manifest)
          ? filterDictionaryManifest(activation.manifest as unknown as CompiledDictionaryManifestV1, permissions)
          : filterManifest(activation.manifest, permissions),
      checksum: activation.checksum,
    };
  }

  /** WI-OI-064c: platform-shipped catalogues with the tenant's latest change set and active version. */
  async listGovernedCatalogues(tenantId: string) {
    // Packs installed under Workforce before WI-OI-107 still count as installed and active.
    const scopes = [...Object.values(GOVERNED_CATALOGUE_SCOPES), ...Object.values(LEGACY_GOVERNED_CATALOGUE_SCOPES)];
    const identity = scopes.map(({ moduleKey, entityKey }) => ({ moduleKey, entityKey }));
    const [changeSets, activations] = await Promise.all([
      prisma.configurationChangeSet.findMany({
        where: { tenantId, OR: identity },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, moduleKey: true, entityKey: true, surfaceKey: true, status: true, version: true, updatedAt: true },
      }),
      prisma.configurationActivation.findMany({
        where: { tenantId, status: 'ACTIVE', OR: identity },
        orderBy: { activatedAt: 'desc' },
        select: { publishedVersionId: true, moduleKey: true, entityKey: true, surfaceKey: true, environmentKey: true, cohortKey: true, activatedAt: true },
      }),
    ]);
    return listBundledGovernedCatalogues().map((item) => {
      const scope = GOVERNED_CATALOGUE_SCOPES[item.kind];
      const legacy = item.kind === 'METRIC_CATALOGUE' ? null : LEGACY_GOVERNED_CATALOGUE_SCOPES[item.kind];
      const inScope = (target: { moduleKey: string; entityKey: string } | null) => (row: { moduleKey: string; entityKey: string; surfaceKey: string }) =>
        target !== null && row.moduleKey === target.moduleKey && row.entityKey === target.entityKey && row.surfaceKey === item.surfaceKey;
      return {
        ...item,
        ...scope,
        latestChangeSet: changeSets.find(inScope(scope)) ?? changeSets.find(inScope(legacy)) ?? null,
        activation: activations.find(inScope(scope)) ?? activations.find(inScope(legacy)) ?? null,
      };
    });
  }

  /** Creates a change set from a platform-shipped catalogue; it then follows the normal approval lifecycle. */
  async installGovernedCatalogue(tenantId: string, actorId: string, dto: InstallGovernedCatalogueDto) {
    const definition = bundledGovernedCatalogue(dto.kind, dto.surfaceKey);
    if (!definition) throw new NotFoundException('This catalogue is not shipped with the platform.');
    return this.createChangeSet(tenantId, actorId, {
      definition,
      reason: dto.reason,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /** The active catalogue for this tenant's runtime scope, for server-side consumers such as the web BFF. */
  async currentGovernedCatalogue(tenantId: string, kind: GovernedCatalogueKind, surfaceKey: string) {
    return this.withRuntimeMetric('current', async () => {
      const { moduleKey, entityKey } = GOVERNED_CATALOGUE_SCOPES[kind];
      // Packs belong to the solution, not a module (WI-OI-107): no module entitlement is needed to read them.
      if (moduleKey !== SOLUTION_CONFIGURATION_MODULE_KEY) await this.requireEntitlement(tenantId, moduleKey);
      const scope = this.runtimeScope.resolve(moduleKey);
      const load = (fromModuleKey: string) =>
        this.loadRuntimeManifest(tenantId, fromModuleKey, entityKey, surfaceKey, scope.environmentKey, scope.cohortKey, []);
      try {
        return { ...(await load(moduleKey)), scope };
      } catch (error) {
        // A pack installed under Workforce before WI-OI-107 is still read.
        if (kind === 'METRIC_CATALOGUE' || !(error instanceof HttpException) || error.getStatus() !== 404) throw error;
        return { ...(await load(LEGACY_GOVERNED_CATALOGUE_SCOPES[kind].moduleKey)), scope };
      }
    });
  }

  /**
   * WI-OI-120f (F0.2, ADR-0033 D1): publishes and activates a module's own window for a tenant that has the module
   * enabled, as the administrator who enabled it. Writes the same change set, version, activation, audit and outbox
   * records as the normal lifecycle. Independent approval is not required because the window ships, reviewed, with
   * the module; the audit reason says so.
   *
   * - No active version: the baseline is published and activated.
   * - The active version is an older baseline: the new baseline replaces it.
   * - The active version is the tenant's own: it stays in force, and the outcome tells the caller a baseline update
   *   is waiting for review.
   */
  async activateModuleBaseline(
    tenantId: string,
    actorId: string,
    baseline: ModuleWindowBaselineV1,
  ): Promise<{ status: 'ACTIVATED' | 'UPGRADED' | 'UNCHANGED' | 'CUSTOMISED_KEPT'; checksum: string }> {
    const { definition } = baseline;
    const descriptor = this.registeredAdapter(definition.moduleKey, definition.entityKey, definition.surfaceKey);
    const compiled = compileDictionaryPackage(definition.dictionary, {
      moduleBaseline: true,
      registeredResolvers: descriptor.registeredResolvers,
      registeredActionHandlers: descriptor.registeredActionHandlers,
    });
    if (!compiled.valid || !compiled.manifest) {
      throw new BadRequestException({ message: 'The module window failed compilation.', findings: compiled.findings });
    }
    const manifest = compiled.manifest;
    const scope = this.runtimeScope.resolve(definition.moduleKey);
    const where = {
      tenantId,
      moduleKey: definition.moduleKey,
      entityKey: definition.entityKey,
      surfaceKey: definition.surfaceKey,
      environmentKey: scope.environmentKey,
      cohortKey: scope.cohortKey,
    };
    const reason =
      `Module window ${definition.surfaceKey} (${definition.dictionary.packageKey} ${definition.dictionary.version}) ` +
      'activated with the module; shipped and reviewed with the module, so independent approval is not required';
    const now = new Date();
    const outcome = await prisma.$transaction(async (tx) => {
      await this.lockActivationScope(tx, tenantId, where.moduleKey, where.entityKey, where.surfaceKey, where.environmentKey, where.cohortKey);
      const active = await tx.configurationActivation.findFirst({
        where: { ...where, status: 'ACTIVE' },
        include: { publishedVersion: { select: { checksum: true, manifest: true } } },
      });
      const activeManifest = active?.publishedVersion.manifest as { packageKey?: unknown } | null | undefined;
      if (active && activeManifest?.packageKey !== definition.dictionary.packageKey) {
        // The tenant is told once per baseline version, in its own audit log, that an update waits for review.
        const resourceId = `${definition.surfaceKey}:${manifest.checksum}`;
        const told = await tx.auditLog.findFirst({ where: { tenantId, resource: 'configuration-baseline-update', resourceId } });
        if (!told) {
          await this.audit(
            tx,
            tenantId,
            actorId,
            'UPDATE',
            'configuration-baseline-update',
            resourceId,
            `Module window ${definition.surfaceKey} ${definition.dictionary.version} is available; the tenant's own ` +
              'version stays active until it is reviewed in Configuration Studio',
            null,
            { surfaceKey: definition.surfaceKey, version: definition.dictionary.version, checksum: manifest.checksum },
          );
        }
        return { status: 'CUSTOMISED_KEPT' as const };
      }
      if (active?.publishedVersion.checksum === manifest.checksum) return { status: 'UNCHANGED' as const };

      // One version per checksum and tenant: a baseline published before (then replaced) is reactivated, not copied.
      let published = await tx.configurationPublishedVersion.findFirst({ where: { tenantId, checksum: manifest.checksum } });
      if (!published) {
        const changeSet = await tx.configurationChangeSet.create({
          data: {
            tenantId,
            moduleKey: where.moduleKey,
            entityKey: where.entityKey,
            surfaceKey: where.surfaceKey,
            status: 'PUBLISHED',
            definition: definition as unknown as Prisma.InputJsonValue,
            compiledManifest: jsonInput(manifest),
            checksum: manifest.checksum,
            findings: jsonInput(compiled.findings),
            compatibility: 'COMPATIBLE',
            reason,
            createdById: actorId,
            submittedAt: now,
            approvedById: actorId,
            approvedAt: now,
            publishedAt: now,
          },
        });
        await this.audit(tx, tenantId, actorId, 'CREATE', 'configuration-change-set', changeSet.id, reason, null, changeSet);
        const latest = await tx.configurationPublishedVersion.findFirst({
          where: { tenantId, moduleKey: where.moduleKey, entityKey: where.entityKey, surfaceKey: where.surfaceKey },
          orderBy: { sequence: 'desc' },
        });
        published = await tx.configurationPublishedVersion.create({
          data: {
            tenantId,
            changeSetId: changeSet.id,
            moduleKey: where.moduleKey,
            entityKey: where.entityKey,
            surfaceKey: where.surfaceKey,
            sequence: (latest?.sequence ?? 0) + 1,
            manifest: jsonInput(manifest),
            checksum: manifest.checksum,
            compilerVersion: CONFIGURATION_COMPILER_VERSION,
            publishedById: actorId,
          },
        });
        await this.audit(tx, tenantId, actorId, 'CREATE', 'configuration-version', published.id, reason, null, published);
        await this.outbox(tx, tenantId, 'configuration-version', published.id, 'configuration.version.published.v1', {
          publishedVersionId: published.id,
          checksum: published.checksum,
        });
      }
      await tx.configurationActivation.updateMany({
        where: { ...where, status: 'ACTIVE' },
        data: { status: 'INACTIVE', deactivatedAt: now },
      });
      const created = await tx.configurationActivation.create({
        data: { ...where, publishedVersionId: published.id, reason, activatedById: actorId },
      });
      const before = active ? { id: active.id, publishedVersionId: active.publishedVersionId } : null;
      await this.audit(tx, tenantId, actorId, 'STATUS_CHANGE', 'configuration-activation', created.id, reason, before, created);
      await this.outbox(tx, tenantId, 'configuration-activation', created.id, 'configuration.activation.changed.v1', {
        activationId: created.id,
        publishedVersionId: published.id,
        checksum: published.checksum,
      });
      return { status: active ? ('UPGRADED' as const) : ('ACTIVATED' as const) };
    });
    if (outcome.status === 'ACTIVATED' || outcome.status === 'UPGRADED') this.manifestCache.invalidate(where);
    return { ...outcome, checksum: manifest.checksum };
  }

  /**
   * WI-OI-107: a tenant has one active industry pack and one active country pack. Activating one deactivates the
   * other packs of that kind, whether installed at the solution scope or under Workforce before WI-OI-107.
   */
  private async deactivateOtherPacks(
    tx: Prisma.TransactionClient,
    tenantId: string,
    entityKey: string,
    surfaceKey: string,
    environmentKey: string,
    cohortKey: string,
  ): Promise<void> {
    if (entityKey !== 'industry-pack' && entityKey !== 'country-pack') return;
    await tx.configurationActivation.updateMany({
      where: {
        tenantId,
        moduleKey: { in: [SOLUTION_CONFIGURATION_MODULE_KEY, LEGACY_GOVERNED_CATALOGUE_SCOPES.INDUSTRY_PACK.moduleKey] },
        entityKey,
        surfaceKey: { not: surfaceKey },
        environmentKey,
        cohortKey,
        status: 'ACTIVE',
      },
      data: { status: 'INACTIVE', deactivatedAt: new Date() },
    });
  }

  /** WI-OI-107: after a pack version becomes active, each module that reads it is sent its section (kernel jobs). */
  private async applyPack(
    tenantId: string,
    actorId: string,
    activationId: string,
    published: { id: string; checksum: string; manifest: unknown },
  ): Promise<{ packApplications?: Array<{ moduleKey: string; jobId: string }>; packApplicationError?: string }> {
    if (!this.packApplications || !isGovernedCatalogueDefinition(published.manifest)) return {};
    try {
      const queued = await this.packApplications.enqueueForActivation({
        tenantId,
        actorId,
        activationId,
        publishedVersionId: published.id,
        checksum: published.checksum,
        manifest: published.manifest,
      });
      return queued.length ? { packApplications: queued } : {};
    } catch (error) {
      // The activation stands; the modules keep their previous section until the pack is activated again.
      this.logger.error(`[tenant:${tenantId}] pack ${published.id} was activated but not sent to modules: ${(error as Error).message}`);
      return { packApplicationError: 'The pack is active, but sending it to the modules failed; activate it again to retry.' };
    }
  }

  /**
   * WI-OI-107: the tenant's active industry and country packs, in the solution-layer format whichever scope they were
   * installed in, for server-side readers such as Demo Lab.
   */
  async activePacks(tenantId: string): Promise<{
    industry: { surfaceKey: string; publishedVersionId: string; activatedAt: Date; pack: IndustryPackV2 } | null;
    country: { surfaceKey: string; publishedVersionId: string; activatedAt: Date; pack: CountryPackV2 } | null;
  }> {
    const active = await prisma.configurationActivation.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        moduleKey: { in: [SOLUTION_CONFIGURATION_MODULE_KEY, LEGACY_GOVERNED_CATALOGUE_SCOPES.INDUSTRY_PACK.moduleKey] },
        entityKey: { in: ['industry-pack', 'country-pack'] },
      },
      include: { publishedVersion: { select: { manifest: true } } },
      orderBy: { activatedAt: 'desc' },
    });
    const pick = (entityKey: string) => active.find((row) => row.entityKey === entityKey && isGovernedCatalogueDefinition(row.publishedVersion.manifest));
    const industry = pick('industry-pack');
    const country = pick('country-pack');
    const catalogueOf = (row: (typeof active)[number]) => (row.publishedVersion.manifest as unknown as GovernedCatalogueDefinition).catalogue;
    return {
      industry: industry
        ? { surfaceKey: industry.surfaceKey, publishedVersionId: industry.publishedVersionId, activatedAt: industry.activatedAt, pack: normaliseIndustryPack(catalogueOf(industry) as Parameters<typeof normaliseIndustryPack>[0]) }
        : null,
      country: country
        ? { surfaceKey: country.surfaceKey, publishedVersionId: country.publishedVersionId, activatedAt: country.activatedAt, pack: normaliseCountryPack(catalogueOf(country) as Parameters<typeof normaliseCountryPack>[0]) }
        : null,
    };
  }

  private async assertAuthorable(tenantId: string, definition: ConfigurationChangeSetDefinition) {
    if (isGovernedCatalogueDefinition(definition)) {
      // The schema pins each catalogue kind to its module and entity; the tenant must be entitled to that module.
      // Packs belong to the solution layer (WI-OI-107) and need no module entitlement.
      const { moduleKey } = definition as GovernedCatalogueDefinition;
      if (moduleKey !== SOLUTION_CONFIGURATION_MODULE_KEY) await this.requireEntitlement(tenantId, moduleKey);
      return;
    }
    if (isDictionaryChangeSetDefinition(definition)) {
      await this.requireEntitlement(tenantId, definition.moduleKey);
      return;
    }
    this.assertRegisteredSurface(definition as ConfigurationDefinition);
  }

  async getExtensionValues(
    tenantId: string,
    ownerType: string,
    ownerId: string,
    permissions: string[],
  ) {
    this.assertExtensionOwner(tenantId, ownerType, ownerId);
    await this.authorizedRuntimeScope(
      tenantId,
      'tenant-settings',
      'tenant-profile',
      'profile-extension',
    );
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
    const { scope } = await this.authorizedRuntimeScope(
      tenantId,
      'tenant-settings',
      'tenant-profile',
      'profile-extension',
    );
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
        scope.environmentKey,
        scope.cohortKey,
      );
      const active = await tx.configurationActivation.findFirst({
        where: {
          tenantId,
          publishedVersionId: published.id,
          moduleKey: published.moduleKey,
          entityKey: published.entityKey,
          surfaceKey: published.surfaceKey,
          environmentKey: scope.environmentKey,
          cohortKey: scope.cohortKey,
          status: 'ACTIVE',
        },
      });
      if (!active)
        throw new ConflictException(
          'The selected tenant-profile manifest is not active for the current runtime scope.',
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
      await tx.platformOutboxEvent.create({
        data: {
          tenantId,
          eventType: 'tenant.profile.extensions.updated.v1',
          aggregateType: 'tenant_profile',
          aggregateId: ownerId,
          aggregateVersion: record.version,
          payload: {
            ownerType,
            ownerId,
            publishedVersionId: published.id,
            valuesChecksum: record.valuesChecksum,
            version: record.version,
            updatedFieldKeys: Object.keys(dto.values),
          },
          status: 'PENDING',
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

  private async compatibility(tenantId: string, definition: ConfigurationChangeSetDefinition) {
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
    if (isGovernedCatalogueDefinition(definition)) {
      return classifyGovernedCatalogueChange(
        latest.manifest as unknown as GovernedCatalogueDefinition,
        definition as GovernedCatalogueDefinition,
      );
    }
    if (isDictionaryChangeSetDefinition(definition)) {
      return classifyDictionaryImpact(
        (latest.manifest as any) ?? {},
        definition.dictionary,
      ).classification;
    }
    return classifyConfigurationImpact(
      compareConfigurationDefinitions(
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
    if (isGovernedCatalogueDefinition(target)) {
      // Catalogues hold no tenant records to scan; losing a referenced entry is reported as breaking.
      const catalogue = target as unknown as GovernedCatalogueDefinition;
      return {
        moduleKey: catalogue.moduleKey,
        entityKey: catalogue.entityKey,
        surfaceKey: catalogue.surfaceKey,
        baselinePublishedVersionId: baseline?.id ?? null,
        targetPublishedVersionId,
        targetChecksum,
        classification: baseline
          ? classifyGovernedCatalogueChange(baseline.manifest as unknown as GovernedCatalogueDefinition, catalogue)
          : 'COMPATIBLE',
        changes: [],
        scanned: { configurationRecords: 0, extensionValues: 0 },
        incompatible: { configurationRecords: 0, extensionValues: 0, samples: [] },
        activationAllowed: true,
      };
    }
    if (isDictionaryManifest(target) || isDictionaryChangeSetDefinition(target)) {
      const targetDict = isDictionaryChangeSetDefinition(target)
        ? target.dictionary
        : target;
      const targetKey = isDictionaryChangeSetDefinition(target)
        ? { moduleKey: target.moduleKey, entityKey: target.entityKey, surfaceKey: target.surfaceKey }
        : {
            moduleKey: (target as any).entities?.[0]?.moduleKey ?? 'tenant-settings',
            entityKey: (target as any).entities?.[0]?.entityKey ?? 'tenant-profile',
            surfaceKey: (target as any).packageKey ?? 'tenant-profile-dictionary',
          };
      return {
        moduleKey: targetKey.moduleKey,
        entityKey: targetKey.entityKey,
        surfaceKey: targetKey.surfaceKey,
        baselinePublishedVersionId: baseline?.id ?? null,
        targetPublishedVersionId,
        targetChecksum,
        classification: baseline
          ? classifyDictionaryImpact(
              (baseline.manifest as any) ?? {},
              targetDict as any,
            ).classification
          : 'COMPATIBLE',
        changes: [],
        scanned: { configurationRecords: 0, extensionValues: 0 },
        incompatible: { configurationRecords: 0, extensionValues: 0, samples: [] },
        activationAllowed: true,
      };
    }
    const changes = compareConfigurationDefinitions(
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
      classification: classifyConfigurationImpact(changes),
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
    const extensionSlots = surface.extensionSlots;
    const maximumFields = extensionSlots.reduce((total, slot) => total + slot.maximumFields, 0);
    if (definition.fields.length > maximumFields) {
      throw new BadRequestException(
        `This surface permits at most ${maximumFields} configurable fields.`,
      );
    }
    const allowedFieldTypes = new Set(
      extensionSlots.flatMap((slot) => [...slot.allowedFieldTypes]),
    );
    const unsupportedType = definition.fields.find(
      (field) => !allowedFieldTypes.has(field.type),
    )?.type;
    if (unsupportedType) {
      throw new BadRequestException(
        `Field type ${unsupportedType} is not permitted by this surface.`,
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
    if (!this.adapterRegistry.validatesExtensionOwner(tenantId, ownerType, ownerId)) {
      throw new BadRequestException(
        'This extension owner is not registered for direct value storage.',
      );
    }
  }

  private registeredAdapter(
    moduleKey: string,
    entityKey: string,
    surfaceKey: string,
  ): ModuleAdapterDescriptorV1 {
    const descriptor = this.adapterRegistry.descriptor(moduleKey, entityKey, surfaceKey);
    if (!descriptor) {
      throw configurationRuntimeError(
        'CONFIGURATION_ADAPTER_NOT_FOUND',
        'The requested configuration adapter is not available.',
        false,
        404,
      );
    }
    return descriptor;
  }

  private async requireEntitlement(tenantId: string, moduleKey: string): Promise<void> {
    const now = new Date();
    const entitlement = await prisma.tenantModuleEntitlement.findUnique({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      select: { status: true, startsAt: true, endsAt: true },
    });
    if (
      !entitlement ||
      entitlement.status !== 'ENABLED' ||
      entitlement.startsAt > now ||
      (entitlement.endsAt !== null && entitlement.endsAt <= now)
    ) {
      const error = configurationRuntimeError(
        'CONFIGURATION_RUNTIME_SCOPE_DENIED',
        'The requested runtime scope is not available.',
        false,
        403,
      ) as HttpException & { configurationRuntimeResult?: ConfigurationRuntimeResult };
      Object.defineProperty(error, 'configurationRuntimeResult', {
        value: 'entitlement-denied',
      });
      throw error;
    }
  }

  private async authorizedAdapter(
    tenantId: string,
    moduleKey: string,
    entityKey: string,
    surfaceKey: string,
  ): Promise<ModuleAdapterDescriptorV1> {
    const descriptor = this.registeredAdapter(moduleKey, entityKey, surfaceKey);
    await this.requireEntitlement(tenantId, descriptor.entitlementModuleKey);
    return descriptor;
  }

  private async authorizedRuntimeScope(
    tenantId: string,
    moduleKey: string,
    entityKey: string,
    surfaceKey: string,
  ): Promise<{ descriptor: ModuleAdapterDescriptorV1; scope: ConfigurationRuntimeScopeV1 }> {
    const descriptor = this.registeredAdapter(moduleKey, entityKey, surfaceKey);
    const scope = this.runtimeScope.resolve(descriptor.entitlementModuleKey);
    await this.requireEntitlement(tenantId, descriptor.entitlementModuleKey);
    return { descriptor, scope };
  }

  private async withRuntimeMetric<T>(
    operation: ConfigurationRuntimeOperation,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await run();
      this.runtimeMetrics.record(operation, 'success');
      return result;
    } catch (error) {
      const explicitResult = (error as { configurationRuntimeResult?: ConfigurationRuntimeResult })
        .configurationRuntimeResult;
      let result: ConfigurationRuntimeResult = explicitResult ?? 'failed';
      if (!explicitResult && error instanceof HttpException) {
        const response = error.getResponse();
        const code =
          typeof response === 'object' && response !== null && 'code' in response
            ? (response as { code?: unknown }).code
            : undefined;
        if (code === 'CONFIGURATION_ADAPTER_NOT_FOUND') result = 'adapter-not-found';
        else if (code === 'CONFIGURATION_RUNTIME_SCOPE_DENIED') result = 'scope-denied';
        else if (code === 'CONFIGURATION_MANIFEST_UNAVAILABLE') result = 'manifest-unavailable';
      }
      this.runtimeMetrics.record(operation, result);
      throw error;
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
        values: maskValues(
          row.values as Record<string, unknown>,
          filteredManifest,
          unmaskSensitive,
          fieldMap,
        ),
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
    const errors = validateConfigurationValues(
      filteredManifest,
      dto.values as Record<string, unknown>,
      { allowReadOnly: false },
    );
    if (Object.keys(errors).length > 0)
      throw new BadRequestException({
        message: 'Template values contain validation errors.',
        errors,
      });
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
    return {
      id,
      tenantId,
      entityKey,
      name: dto.name,
      description: dto.description ?? null,
      publishedVersionId: active.publishedVersion.id,
      manifestChecksum: active.publishedVersion.checksum,
      values: dto.values,
      valuesChecksum: valuesCs,
      sourceTemplateId: null,
      version: 1,
      createdById: actorId,
      updatedById: actorId,
      createdAt: now,
      updatedAt: now,
      stale: false,
    };
  }

  async updateTemplate(
    tenantId: string,
    entityKey: string,
    templateId: string,
    actorId: string,
    dto: UpdateConfigurationTemplateDto,
    permissions: string[],
  ) {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; version: number; values: unknown; manifestChecksum: string }>
    >`
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
      assertAuthorizedValues(
        filteredManifest,
        dto.values as Record<string, unknown>,
        permissions,
        row.values,
      );
      const errors = validateConfigurationValues(filteredManifest, mergedValues, {
        allowReadOnly: false,
      });
      if (Object.keys(errors).length > 0)
        throw new BadRequestException({
          message: 'Template values contain validation errors.',
          errors,
        });
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
    return {
      id: templateId,
      tenantId,
      entityKey,
      version: dto.expectedVersion + 1,
      updatedAt: now,
    };
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
    return {
      id: newId,
      tenantId,
      entityKey,
      name: dto.name,
      description: null,
      sourceTemplateId: templateId,
      publishedVersionId: source.publishedVersionId,
      manifestChecksum: source.manifestChecksum,
      values: source.values,
      valuesChecksum: valuesCs,
      version: 1,
      createdById: actorId,
      updatedById: actorId,
      createdAt: now,
      updatedAt: now,
    };
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
        id: string;
        tenantId: string;
        entityKey: string;
        name: string;
        filterKey: string | null;
        filterValue: string | null;
        search: string | null;
        sortKey: string | null;
        sortDirection: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
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

  async createSavedFilter(
    tenantId: string,
    entityKey: string,
    actorId: string,
    dto: CreateSavedFilterDto,
  ) {
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
    return {
      id,
      tenantId,
      entityKey,
      name: dto.name,
      filterKey: dto.filterKey ?? null,
      filterValue: dto.filterValue ?? null,
      search: dto.search ?? null,
      sortKey: dto.sortKey ?? null,
      sortDirection: dto.sortDirection,
      createdById: actorId,
      createdAt: now,
      updatedAt: now,
    };
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

/**
 * No permission named means open; otherwise the one permission rule (WI-OI-120q). `all`, `*:action` and a two-part
 * grant covering a three-part code no longer match; no role grants them.
 */
function hasPermission(permissions: string[], required: string | undefined): boolean {
  return !required || holdsPermission(permissions, required);
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
  fieldMap: Map<string, CompiledConfigurationManifest['fields'][number]>,
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

function compileChangeSetDefinition(
  definition: ConfigurationChangeSetDefinition,
  descriptor?: ModuleAdapterDescriptorV1,
) {
  if (isGovernedCatalogueDefinition(definition)) {
    return compileGovernedCatalogue(definition);
  }
  if (isDictionaryChangeSetDefinition(definition)) {
    return compileDictionaryPackage(definition.dictionary, {
      baseline: descriptor?.dictionaryContribution,
      registeredActionHandlers: descriptor?.registeredActionHandlers,
      registeredResolvers: descriptor?.registeredResolvers,
    });
  }
  return compileConfiguration(definition);
}

function filterDictionaryManifest(
  manifest: CompiledDictionaryManifestV1,
  permissions: string[],
): CompiledDictionaryManifestV1 {
  const filteredNav = manifest.navigation.filter(
    (item) =>
      !item.requiredPermissions?.length ||
      item.requiredPermissions.every((p) => hasPermission(permissions, p)),
  );
  const filteredActions = manifest.actions.filter(
    (act) =>
      !act.requiredPermissions?.length ||
      act.requiredPermissions.every((p) => hasPermission(permissions, p)),
  );
  const filteredFields = manifest.fields.filter(
    (f) => !f.readPermission || hasPermission(permissions, f.readPermission),
  );
  return {
    ...manifest,
    navigation: filteredNav,
    actions: filteredActions,
    fields: filteredFields,
  };
}
