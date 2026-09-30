import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  CompleteSourceFileDto,
  CreateConnectionDto,
  CreateCredentialReferenceDto,
  CreateDataContractDto,
  CreateEnvironmentDto,
  IngestOperationalEventDto,
  PublishDataContractDto,
  RequestSourceFileUploadDto,
} from '@gigalibs/contracts';
import { OperationalJsonObjectSchema, WebhookOperationalEventSchema } from '@gigalibs/contracts';
import { type Prisma, prisma } from '@gigalibs/db';
import { logger } from '@gigalibs/logger';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { runtimeConfig } from './config/runtime-config.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { type ConnectorCredential, ConnectorCredentialService } from './connector-credential.service.js';
import { ConnectorFailure } from './connector-errors.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ConnectorProfileService } from './connector-profile.service.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { JsonSchemaService } from './json-schema.service.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ObjectStorageService } from './object-storage.service.js';
import { assertNoEmbeddedSecrets, canonicalJson, jsonByteLength } from './operational-json.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { PayloadCryptoService } from './payload-crypto.service.js';
import { sourceEventAuthenticatedContext } from './payload-crypto.service.js';
import { resolveTenantId } from './tenant-resolver.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { SourcePayloadParserService } from './source-payload-parser.service.js';

/**
 * WI-OI-104f (ADR-0016 F8, owner decision option A): pulling outside systems is Connector Hub's job. The core no longer
 * creates, tests or profiles REST, CSV-over-HTTP or PostgreSQL connections; existing ones stay readable. The core keeps
 * its push intake (webhooks, file uploads, the events API) until that moves too (FOUNDATION-CLOSE item 8).
 */
const RETIRED_PULL_INTERFACES: ReadonlySet<string> = new Set(['REST', 'CSV_HTTP', 'POSTGRESQL']);
const PULL_RETIRED_MESSAGE =
  'Pulling from REST, CSV-over-HTTP and PostgreSQL sources is done in Connector Hub now: set the source up under Connections › Connector Hub.';

interface StoredWebhookConnectorConfiguration {
  signatureHeader: string;
  timestampHeader: string;
  maxSkewSeconds: number;
  sampleRecordLimit: number;
}

interface StoredFileConnectorConfiguration {
  acceptedContentTypes: Array<'application/json' | 'text/csv'>;
  csvDelimiter: string;
  sampleRecordLimit: number;
}

type StoredConnectorConfiguration = StoredWebhookConnectorConfiguration | StoredFileConnectorConfiguration;

interface ConnectionWithCredential {
  id: string;
  tenantId: string;
  environmentId: string;
  endpoint: string;
  interfaceType: 'REST' | 'CSV_HTTP' | 'WEBHOOK' | 'POSTGRESQL' | 'FILE_UPLOAD';
  status: 'UNTESTED' | 'READY' | 'READY_WITH_LIMITS' | 'NOT_READY' | 'DISABLED';
  circuitOpenUntil: Date | null;
  configuration: Prisma.JsonValue;
  credentialReference: ConnectorCredential | null;
}

@Injectable()
export class OperationalIntelligenceService {
  constructor(
    private readonly connectorCredentialService: ConnectorCredentialService,
    private readonly connectorProfileService: ConnectorProfileService,
    private readonly jsonSchemaService: JsonSchemaService,
    private readonly payloadCryptoService: PayloadCryptoService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly sourcePayloadParser: SourcePayloadParserService,
  ) {}

  async listEnvironments(tenantId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma.tenantEnvironment.findMany({
      where: { tenantId: resolvedTenantId },
      include: {
        _count: { select: { connections: true, dataContracts: true, sourceEvents: true } },
      },
      orderBy: [{ kind: 'asc' }, { displayName: 'asc' }],
    });
  }

  async createEnvironment(tenantId: string, userId: string, dto: CreateEnvironmentDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    if (dto.expiresAt && new Date(dto.expiresAt) <= new Date()) {
      throw new BadRequestException('Environment expiration must be in the future.');
    }
    assertNoEmbeddedSecrets(dto.configuration);
    try {
      return await prisma.$transaction(async (transaction) => {
        const environment = await transaction.tenantEnvironment.create({
          data: {
            tenantId: resolvedTenantId,
            slug: dto.slug,
            displayName: dto.displayName,
            kind: dto.kind,
            region: dto.region,
            retentionDays: dto.retentionDays,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            ...(dto.configuration
              ? { configuration: dto.configuration as Prisma.InputJsonValue }
              : {}),
            createdById: userId,
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            userId,
            action: 'CREATE',
            resource: 'operational-environment',
            resourceId: environment.id,
            after: { slug: environment.slug, kind: environment.kind, region: environment.region },
          },
        });
        return environment;
      });
    } catch (error) {
      if (this.isUniqueConstraint(error))
        throw new ConflictException(`Environment slug '${dto.slug}' already exists.`);
      throw error;
    }
  }

  async listCredentialReferences(tenantId: string, environmentId?: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const references = await prisma.credentialReference.findMany({
      where: { tenantId: resolvedTenantId, ...(environmentId ? { environmentId } : {}) },
      select: {
        id: true,
        environmentId: true,
        label: true,
        provider: true,
        authType: true,
        headerName: true,
        status: true,
        lastValidatedAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { connections: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return references.map((reference) => ({ ...reference, referenceConfigured: true }));
  }

  async createCredentialReference(
    tenantId: string,
    userId: string,
    dto: CreateCredentialReferenceDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    await this.requireEnvironment(resolvedTenantId, dto.environmentId);
    try {
      const created = await prisma.$transaction(async (transaction) => {
        const reference = await transaction.credentialReference.create({
          data: {
            tenantId: resolvedTenantId,
            environmentId: dto.environmentId,
            label: dto.label,
            provider: dto.provider,
            reference: dto.reference,
            authType: dto.authType,
            headerName: dto.headerName ?? null,
            createdById: userId,
          },
          select: {
            id: true,
            environmentId: true,
            label: true,
            provider: true,
            authType: true,
            headerName: true,
            status: true,
            createdAt: true,
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            userId,
            action: 'CREATE',
            resource: 'credential-reference',
            resourceId: reference.id,
            after: {
              environmentId: dto.environmentId,
              provider: reference.provider,
              authType: reference.authType,
            },
          },
        });
        return reference;
      });
      return { ...created, referenceConfigured: true };
    } catch (error) {
      if (this.isUniqueConstraint(error))
        throw new ConflictException('This credential reference is already registered.');
      throw error;
    }
  }

  async revokeCredentialReference(tenantId: string, userId: string, credentialId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const existing = await prisma.credentialReference.findFirst({
      where: { id: credentialId, tenantId: resolvedTenantId },
    });
    if (!existing)
      throw new NotFoundException(`Credential reference '${credentialId}' was not found.`);
    if (existing.status === 'REVOKED')
      return { id: existing.id, status: existing.status, revokedAt: existing.revokedAt };
    return prisma.$transaction(async (transaction) => {
      const revoked = await transaction.credentialReference.update({
        where: { id: credentialId },
        data: { status: 'REVOKED', revokedAt: new Date() },
        select: { id: true, status: true, revokedAt: true },
      });
      await transaction.sourceConnection.updateMany({
        where: { tenantId: resolvedTenantId, credentialReferenceId: credentialId },
        data: { status: 'NOT_READY', statusReasonCode: 'CREDENTIAL_REVOKED' },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: resolvedTenantId,
          userId,
          action: 'STATUS_CHANGE',
          resource: 'credential-reference',
          resourceId: credentialId,
          before: { status: existing.status },
          after: { status: 'REVOKED' },
        },
      });
      return revoked;
    });
  }

  async listConnections(tenantId: string, environmentId?: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma.sourceConnection.findMany({
      where: { tenantId: resolvedTenantId, ...(environmentId ? { environmentId } : {}) },
      include: {
        environment: {
          select: { id: true, slug: true, displayName: true, kind: true, status: true },
        },
        credentialReference: {
          select: { id: true, label: true, provider: true, authType: true, status: true },
        },
        _count: { select: { schemaVersions: true, dataContracts: true, sourceEvents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getConnection(tenantId: string, connectionId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const connection = await prisma.sourceConnection.findFirst({
      where: { id: connectionId, tenantId: resolvedTenantId },
      include: {
        environment: true,
        credentialReference: {
          select: {
            id: true,
            label: true,
            provider: true,
            authType: true,
            headerName: true,
            status: true,
          },
        },
        schemaVersions: { orderBy: { version: 'desc' }, take: 10 },
        attempts: { orderBy: { startedAt: 'desc' }, take: 20 },
      },
    });
    if (!connection) throw new NotFoundException(`Connection '${connectionId}' was not found.`);
    return connection;
  }

  async createConnection(tenantId: string, userId: string, dto: CreateConnectionDto) {
    if (RETIRED_PULL_INTERFACES.has(dto.interfaceType)) throw new BadRequestException(PULL_RETIRED_MESSAGE);
    const resolvedTenantId = await resolveTenantId(tenantId);
    await this.requireEnvironment(resolvedTenantId, dto.environmentId);
    assertNoEmbeddedSecrets(dto.configuration);
    let credential: { authType: string } | null = null;
    if (dto.credentialReferenceId) {
      credential = await prisma.credentialReference.findFirst({
        where: {
          id: dto.credentialReferenceId,
          tenantId: resolvedTenantId,
          environmentId: dto.environmentId,
          status: 'ACTIVE',
        },
      });
      if (!credential)
        throw new BadRequestException(
          'The selected credential reference is unavailable in this environment.',
        );
    }
    this.assertCompatibleCredential(dto.interfaceType, credential?.authType ?? 'NONE');
    const connectionId = randomUUID();
    const endpoint =
      dto.interfaceType === 'WEBHOOK'
        ? `/api/v1/operational-intelligence/webhooks/${connectionId}`
        : dto.interfaceType === 'FILE_UPLOAD'
          ? `s3://${runtimeConfig.storageBucket}/sources/${resolvedTenantId}/${dto.environmentId}/${connectionId}`
          : dto.endpoint;
    try {
      return await prisma.$transaction(async (transaction) => {
        const connection = await transaction.sourceConnection.create({
          data: {
            id: connectionId,
            tenantId: resolvedTenantId,
            environmentId: dto.environmentId,
            credentialReferenceId: dto.credentialReferenceId ?? null,
            slug: dto.slug,
            name: dto.name,
            interfaceType: dto.interfaceType,
            mode: dto.mode,
            endpoint,
            configuration: dto.configuration as Prisma.InputJsonValue,
            createdById: userId,
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            userId,
            action: 'CREATE',
            resource: 'source-connection',
            resourceId: connection.id,
            after: {
              environmentId: connection.environmentId,
              interfaceType: connection.interfaceType,
              mode: connection.mode,
              credentialReferenceConfigured: !!connection.credentialReferenceId,
            },
          },
        });
        return connection;
      });
    } catch (error) {
      if (this.isUniqueConstraint(error))
        throw new ConflictException(
          `Connection slug '${dto.slug}' already exists in this environment.`,
        );
      throw error;
    }
  }

  async testConnection(tenantId: string, userId: string, connectionId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const { fetchResult, traceId, interfaceType } = await this.executeConnector(
      resolvedTenantId,
      connectionId,
      'TEST',
    );
    const recordShapeReadable = Array.isArray(fetchResult.body)
      ? fetchResult.body.length === 0 || fetchResult.body.some((item) => this.isRecord(item))
      : this.isRecord(fetchResult.body);
    const sourceRoleHasWritePrivileges = this.sourceRoleHasWritePrivileges(fetchResult);
    const status =
      recordShapeReadable && !sourceRoleHasWritePrivileges ? 'READY' : 'READY_WITH_LIMITS';
    const statusReasonCode = !recordShapeReadable
      ? 'PROFILE_SHAPE_UNSUPPORTED'
      : sourceRoleHasWritePrivileges
        ? 'SOURCE_ROLE_HAS_WRITE_PRIVILEGES'
        : null;
    await prisma.$transaction([
      prisma.sourceConnection.update({
        where: { id: connectionId },
        data: {
          status,
          statusReasonCode,
        },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: resolvedTenantId,
          userId,
          action: 'STATUS_CHANGE',
          resource: 'source-connection-test',
          resourceId: connectionId,
          correlationId: traceId,
          after: {
            status,
            statusReasonCode,
            reachable: true,
            authenticated: true,
            recordShapeReadable,
            sourceRoleHasWritePrivileges,
          },
        },
      }),
    ]);
    return {
      connectionId,
      traceId,
      status,
      checks: {
        policy: 'passed',
        ...(interfaceType === 'REST' ||
        interfaceType === 'CSV_HTTP' ||
        interfaceType === 'POSTGRESQL'
          ? { dns: 'passed' }
          : {}),
        reachable: true,
        authenticated: true,
        interfaceType,
        contentType: fetchResult.contentType,
        recordShapeReadable,
        ...('diagnostics' in fetchResult ? fetchResult.diagnostics : {}),
      },
      latencyMs: fetchResult.latencyMs,
      bytesReceived: fetchResult.bytesReceived,
      testedAt: new Date().toISOString(),
    };
  }

  async profileConnection(tenantId: string, userId: string, connectionId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const connection = await this.requireConnection(resolvedTenantId, connectionId);
    if (RETIRED_PULL_INTERFACES.has(connection.interfaceType)) throw new GoneException(PULL_RETIRED_MESSAGE);
    if (connection.interfaceType === 'FILE_UPLOAD') {
      throw new BadRequestException(
        'File connections are profiled when a checksum-verified source file is completed.',
      );
    }
    const configuration = this.connectorConfiguration(
      connection.interfaceType,
      connection.configuration,
    );
    const { fetchResult, traceId } = await this.executeConnector(
      resolvedTenantId,
      connectionId,
      'PROFILE',
    );
    const sourceRoleHasWritePrivileges = this.sourceRoleHasWritePrivileges(fetchResult);
    return this.persistSourceProfile(
      resolvedTenantId,
      userId,
      connectionId,
      traceId,
      fetchResult.body,
      configuration.sampleRecordLimit,
      sourceRoleHasWritePrivileges
        ? {
            status: 'READY_WITH_LIMITS',
            statusReasonCode: 'SOURCE_ROLE_HAS_WRITE_PRIVILEGES',
          }
        : { status: 'READY', statusReasonCode: null },
    );
  }

  async getConnectionHealth(tenantId: string, connectionId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const connection = await this.requireConnection(resolvedTenantId, connectionId);
    const attempts = await prisma.connectorAttempt.findMany({
      where: { tenantId: resolvedTenantId, connectionId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    return {
      connectionId,
      status: connection.status,
      statusReasonCode: connection.statusReasonCode,
      lastTestedAt: connection.lastTestedAt,
      lastSuccessfulAt: connection.lastSuccessfulAt,
      lastLatencyMs: connection.lastLatencyMs,
      consecutiveFailures: connection.consecutiveFailures,
      circuitOpenUntil: connection.circuitOpenUntil,
      attempts,
    };
  }

  async listDataContracts(tenantId: string, environmentId?: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma.dataContract.findMany({
      where: { tenantId: resolvedTenantId, ...(environmentId ? { environmentId } : {}) },
      include: {
        connection: { select: { id: true, name: true, slug: true, status: true } },
        versions: { orderBy: { version: 'desc' }, take: 10 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDataContract(tenantId: string, userId: string, dto: CreateDataContractDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const connection = await this.requireConnection(resolvedTenantId, dto.connectionId);
    if (connection.environmentId !== dto.environmentId) {
      throw new BadRequestException('The connection does not belong to the selected environment.');
    }
    try {
      return await prisma.$transaction(async (transaction) => {
        const contract = await transaction.dataContract.create({
          data: { tenantId: resolvedTenantId, createdById: userId, ...dto },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            userId,
            action: 'CREATE',
            resource: 'data-contract',
            resourceId: contract.id,
            after: { eventType: contract.eventType, connectionId: contract.connectionId },
          },
        });
        return contract;
      });
    } catch (error) {
      if (this.isUniqueConstraint(error))
        throw new ConflictException(
          `A contract for '${dto.eventType}' already exists in this environment.`,
        );
      throw error;
    }
  }

  async publishDataContract(
    tenantId: string,
    userId: string,
    contractId: string,
    dto: PublishDataContractDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    if (jsonByteLength(dto.jsonSchema) > runtimeConfig.connectorHttpMaxResponseBytes) {
      throw new BadRequestException('The data contract schema exceeds the configured byte limit.');
    }
    this.jsonSchemaService.validateDefinition(dto.jsonSchema);
    assertNoEmbeddedSecrets(dto.mapping);
    const checksum = createHash('sha256')
      .update(canonicalJson({ jsonSchema: dto.jsonSchema, mapping: dto.mapping }))
      .digest('hex');

    return this.withSerializableRetry(async () =>
      prisma.$transaction(
        async (transaction) => {
          const contract = await transaction.dataContract.findFirst({
            where: { id: contractId, tenantId: resolvedTenantId },
          });
          if (!contract)
            throw new NotFoundException(`Data contract '${contractId}' was not found.`);
          const duplicate = await transaction.dataContractVersion.findUnique({
            where: { contractId_checksum: { contractId, checksum } },
          });
          if (duplicate) return duplicate;
          const previous = await transaction.dataContractVersion.findFirst({
            where: { contractId, tenantId: resolvedTenantId },
            orderBy: { version: 'desc' },
          });
          const compatibility = this.jsonSchemaService.compatibility(
            previous?.jsonSchema as Record<string, unknown> | null,
            dto.jsonSchema,
            dto.compatibilityMode,
          );
          if (!compatibility.compatible) {
            throw new ConflictException({
              message: 'The data contract is incompatible with the active version.',
              compatibility,
            });
          }
          const version = (previous?.version ?? 0) + 1;
          const created = await transaction.dataContractVersion.create({
            data: {
              tenantId: resolvedTenantId,
              contractId,
              version,
              jsonSchema: dto.jsonSchema as Prisma.InputJsonValue,
              mapping: dto.mapping as Prisma.InputJsonValue,
              checksum,
              compatibilityReport: compatibility as unknown as Prisma.InputJsonValue,
              publishedById: userId,
            },
          });
          await transaction.dataContract.update({
            where: { id: contractId },
            data: { status: 'ACTIVE', currentVersion: version },
          });
          await transaction.auditLog.create({
            data: {
              tenantId: resolvedTenantId,
              userId,
              action: 'UPDATE',
              resource: 'data-contract-version',
              resourceId: created.id,
              after: { contractId, version, checksum, compatibilityMode: dto.compatibilityMode },
            },
          });
          return created;
        },
        { isolationLevel: 'Serializable' },
      ),
    );
  }

  async ingestEvent(tenantId: string, userId: string | null, dto: IngestOperationalEventDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    if (dto.tenantId !== tenantId && dto.tenantId !== resolvedTenantId) {
      throw new BadRequestException(
        'The event tenant does not match the authenticated tenant context.',
      );
    }
    const connection = await this.requireConnection(resolvedTenantId, dto.sourceId);
    if (connection.environmentId !== dto.environmentId) {
      throw new BadRequestException('The event environment does not match its source connection.');
    }
    if (connection.status === 'DISABLED')
      throw new ServiceUnavailableException('The source connection is disabled.');
    const contract = await prisma.dataContract.findFirst({
      where: {
        tenantId: resolvedTenantId,
        environmentId: dto.environmentId,
        connectionId: dto.sourceId,
        eventType: dto.eventType,
        status: 'ACTIVE',
        currentVersion: dto.eventVersion,
      },
      include: { versions: { where: { version: dto.eventVersion }, take: 1 } },
    });
    const version = contract?.versions[0];
    if (!contract || !version) {
      throw new UnprocessableEntityException(
        'No active data contract matches the event type and version.',
      );
    }
    const validationIssues = this.jsonSchemaService.validatePayload(
      version.jsonSchema as Record<string, unknown>,
      dto.payload,
    );
    const aad = sourceEventAuthenticatedContext(
      resolvedTenantId,
      dto.eventId,
      dto.eventType,
      dto.eventVersion,
    );
    const encrypted = this.payloadCryptoService.encrypt(dto.payload, aad);
    if (validationIssues.length > 0) {
      await this.persistRejectedEvent(
        resolvedTenantId,
        userId,
        dto,
        version.id,
        encrypted,
        validationIssues,
      );
      throw new UnprocessableEntityException({
        message: 'The event payload violates its active data contract.',
        code: 'DATA_CONTRACT_VALIDATION_FAILED',
        issues: validationIssues,
      });
    }

    const existing = await prisma.sourceEvent.findFirst({
      where: {
        tenantId: resolvedTenantId,
        sourceConnectionId: dto.sourceId,
        idempotencyKey: dto.idempotencyKey,
      },
      select: {
        id: true,
        eventId: true,
        eventType: true,
        eventVersion: true,
        payloadHash: true,
        status: true,
        receivedAt: true,
      },
    });
    if (existing) return this.idempotentEventResponse(existing, dto, encrypted.hash);

    try {
      const created = await prisma.$transaction(async (transaction) => {
        const event = await transaction.sourceEvent.create({
          data: {
            eventId: dto.eventId,
            tenantId: resolvedTenantId,
            environmentId: dto.environmentId,
            sourceConnectionId: dto.sourceId,
            dataContractVersionId: version.id,
            eventType: dto.eventType,
            eventVersion: dto.eventVersion,
            occurredAt: new Date(dto.occurredAt),
            correlationId: dto.correlationId,
            idempotencyKey: dto.idempotencyKey,
            actorType: dto.actor.type,
            actorId: dto.actor.id ?? null,
            entityRefs: dto.entityRefs as Prisma.InputJsonValue,
            classification: dto.classification,
            payloadCiphertext: Uint8Array.from(encrypted.ciphertext),
            payloadIv: Uint8Array.from(encrypted.iv),
            payloadAuthTag: Uint8Array.from(encrypted.authTag),
            payloadHash: encrypted.hash,
            payloadKeyVersion: encrypted.keyVersion,
            status: 'VALIDATED',
          },
        });
        await transaction.controlOutboxEvent.create({
          data: {
            eventId: randomUUID(),
            tenantId: resolvedTenantId,
            aggregateType: 'source-event',
            aggregateId: event.id,
            eventType: 'operational.source-event.validated.v1',
            payload: {
              sourceEventId: event.id,
              eventId: event.eventId,
              eventType: event.eventType,
              eventVersion: event.eventVersion,
              correlationId: event.correlationId,
            },
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            userId,
            action: 'IMPORT',
            resource: 'source-event',
            resourceId: event.id,
            correlationId: dto.correlationId,
            after: {
              eventId: dto.eventId,
              eventType: dto.eventType,
              eventVersion: dto.eventVersion,
              sourceConnectionId: dto.sourceId,
              classification: dto.classification,
              payloadHash: encrypted.hash,
            },
          },
        });
        return event;
      });
      return {
        id: created.id,
        eventId: created.eventId,
        status: created.status,
        receivedAt: created.receivedAt,
        duplicate: false,
      };
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      const raced = await prisma.sourceEvent.findFirst({
        where: {
          tenantId: resolvedTenantId,
          sourceConnectionId: dto.sourceId,
          idempotencyKey: dto.idempotencyKey,
        },
        select: {
          id: true,
          eventId: true,
          eventType: true,
          eventVersion: true,
          payloadHash: true,
          status: true,
          receivedAt: true,
        },
      });
      if (!raced) throw error;
      return this.idempotentEventResponse(raced, dto, encrypted.hash);
    }
  }

  async ingestWebhook(
    connectionId: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ) {
    const connection = await prisma.sourceConnection.findUnique({
      where: { id: connectionId },
      include: {
        credentialReference: {
          select: {
            id: true,
            provider: true,
            reference: true,
            authType: true,
            headerName: true,
            status: true,
          },
        },
      },
    });
    if (!connection || connection.interfaceType !== 'WEBHOOK') {
      throw new NotFoundException(`Webhook connection '${connectionId}' was not found.`);
    }
    if (connection.status === 'DISABLED') {
      throw new ServiceUnavailableException('The webhook connection is disabled.');
    }
    const configuration = this.connectorConfiguration(
      connection.interfaceType,
      connection.configuration,
    ) as StoredWebhookConnectorConfiguration;
    const traceId = randomUUID();
    const attempt = await prisma.connectorAttempt.create({
      data: {
        tenantId: connection.tenantId,
        environmentId: connection.environmentId,
        connectionId,
        operation: 'INGEST',
        status: 'BLOCKED',
        traceId,
        result: { phase: 'signature-validation' },
      },
    });
    const startedAt = performance.now();
    try {
      this.verifyWebhookSignature(
        rawBody,
        headers,
        configuration,
        connection.credentialReference,
      );
      const parsed = WebhookOperationalEventSchema.safeParse(body);
      if (!parsed.success) {
        throw new BadRequestException({
          message: 'The webhook event envelope is invalid.',
          code: 'WEBHOOK_ENVELOPE_INVALID',
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
        });
      }
      const result = await this.ingestEvent(connection.tenantId, null, {
        ...parsed.data,
        tenantId: connection.tenantId,
        environmentId: connection.environmentId,
        sourceId: connection.id,
      });
      const completedAt = new Date();
      const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
      await prisma.$transaction([
        prisma.connectorAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'SUCCEEDED',
            responseCode: 202,
            latencyMs,
            bytesReceived: rawBody?.length ?? 0,
            result: { sourceEventId: result.id, duplicate: result.duplicate },
            completedAt,
          },
        }),
        prisma.sourceConnection.update({
          where: { id: connection.id },
          data: {
            status: 'READY',
            statusReasonCode: null,
            lastTestedAt: completedAt,
            lastSuccessfulAt: completedAt,
            lastLatencyMs: latencyMs,
            responseContentType: 'application/json',
            consecutiveFailures: 0,
            circuitOpenUntil: null,
          },
        }),
        ...(connection.credentialReference
          ? [
              prisma.credentialReference.update({
                where: { id: connection.credentialReference.id },
                data: { status: 'ACTIVE', lastValidatedAt: completedAt },
              }),
            ]
          : []),
      ]);
      return { ...result, traceId };
    } catch (error) {
      const errorCode =
        error instanceof ConnectorFailure
          ? error.code
          : error instanceof UnauthorizedException
            ? 'WEBHOOK_SIGNATURE_INVALID'
            : error instanceof BadRequestException
              ? 'WEBHOOK_ENVELOPE_INVALID'
              : 'WEBHOOK_INGESTION_FAILED';
      await prisma.connectorAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          bytesReceived: rawBody?.length ?? null,
          result: { phase: 'rejected' },
          errorCode,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async listSourceFiles(tenantId: string, connectionId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const connection = await this.requireConnection(resolvedTenantId, connectionId);
    if (connection.interfaceType !== 'FILE_UPLOAD') {
      throw new BadRequestException('Source files are only available for file-upload connections.');
    }
    return prisma.sourceFileImport.findMany({
      where: { tenantId: resolvedTenantId, connectionId },
      select: {
        id: true,
        originalName: true,
        contentType: true,
        declaredByteSize: true,
        actualByteSize: true,
        checksumSha256: true,
        classification: true,
        status: true,
        failureCode: true,
        sourceEventId: true,
        uploadExpiresAt: true,
        completedAt: true,
        storageDeletedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async requestSourceFileUpload(
    tenantId: string,
    userId: string,
    connectionId: string,
    dto: RequestSourceFileUploadDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const connection = await this.requireConnection(resolvedTenantId, connectionId);
    if (connection.interfaceType !== 'FILE_UPLOAD') {
      throw new BadRequestException('Uploads are only available for file-upload connections.');
    }
    const configuration = this.connectorConfiguration(
      connection.interfaceType,
      connection.configuration,
    ) as StoredFileConnectorConfiguration;
    if (!configuration.acceptedContentTypes.includes(dto.contentType)) {
      throw new BadRequestException('The file content type is not enabled for this connection.');
    }
    if (dto.byteSize > runtimeConfig.storageMaxFileBytes || dto.byteSize > 2_147_483_647) {
      throw new BadRequestException('The file exceeds the deployment file-size policy.');
    }
    const fileId = randomUUID();
    const storageKey = `sources/${resolvedTenantId}/${connection.environmentId}/${connectionId}/${fileId}`;
    const uploadExpiresAt = new Date(Date.now() + runtimeConfig.storagePresignSeconds * 1_000);
    await prisma.$transaction([
      prisma.sourceFileImport.create({
        data: {
          id: fileId,
          tenantId: resolvedTenantId,
          environmentId: connection.environmentId,
          connectionId,
          storageKey,
          originalName: dto.fileName,
          contentType: dto.contentType,
          declaredByteSize: dto.byteSize,
          checksumSha256: dto.checksumSha256,
          createdById: userId,
          uploadExpiresAt,
        },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: resolvedTenantId,
          userId,
          action: 'CREATE',
          resource: 'source-file-import',
          resourceId: fileId,
          after: {
            connectionId,
            contentType: dto.contentType,
            byteSize: dto.byteSize,
            checksumSha256: dto.checksumSha256,
            uploadExpiresAt: uploadExpiresAt.toISOString(),
          },
        },
      }),
    ]);
    try {
      const signed = await this.objectStorageService.createUploadUrl({
        storageKey,
        contentType: dto.contentType,
        byteSize: dto.byteSize,
        checksumSha256: dto.checksumSha256,
      });
      return {
        fileId,
        uploadUrl: signed.uploadUrl,
        requiredHeaders: signed.requiredHeaders,
        expiresAt: uploadExpiresAt,
      };
    } catch (error) {
      await prisma.sourceFileImport.update({
        where: { id: fileId },
        data: { status: 'FAILED', failureCode: 'OBJECT_STORAGE_SIGNING_FAILED' },
      });
      throw error;
    }
  }

  async completeSourceFile(
    tenantId: string,
    userId: string,
    connectionId: string,
    fileId: string,
    dto: CompleteSourceFileDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const file = await prisma.sourceFileImport.findFirst({
      where: { id: fileId, tenantId: resolvedTenantId, connectionId },
      include: { connection: true },
    });
    if (!file || file.connection.interfaceType !== 'FILE_UPLOAD') {
      throw new NotFoundException(`Source file '${fileId}' was not found.`);
    }
    if (file.status === 'PROFILED' || file.status === 'INGESTED') {
      return {
        fileId: file.id,
        status: file.status,
        sourceEventId: file.sourceEventId,
        duplicate: true,
        storageCleanupPending: file.storageDeletedAt === null,
      };
    }
    if (file.status !== 'UPLOAD_PENDING') {
      throw new ConflictException(`Source file '${fileId}' cannot be completed from ${file.status}.`);
    }
    if (file.uploadExpiresAt <= new Date()) {
      await prisma.sourceFileImport.update({
        where: { id: file.id },
        data: { status: 'EXPIRED', failureCode: 'UPLOAD_EXPIRED' },
      });
      throw new ConflictException('The source-file upload URL has expired.');
    }
    const configuration = this.connectorConfiguration(
      file.connection.interfaceType,
      file.connection.configuration,
    ) as StoredFileConnectorConfiguration;
    const traceId = randomUUID();
    const attempt = await prisma.connectorAttempt.create({
      data: {
        tenantId: resolvedTenantId,
        environmentId: file.environmentId,
        connectionId,
        operation: dto.operation === 'INGEST' ? 'INGEST' : 'PROFILE',
        status: 'BLOCKED',
        traceId,
        result: { sourceFileId: file.id, phase: 'object-verification' },
      },
    });
    const startedAt = performance.now();
    try {
      const bytes = await this.objectStorageService.readVerifiedObject({
        storageKey: file.storageKey,
        contentType: file.contentType,
        byteSize: file.declaredByteSize,
        checksumSha256: file.checksumSha256,
      });
      const actualChecksum = createHash('sha256').update(bytes).digest('hex');
      if (actualChecksum !== file.checksumSha256) {
        throw new ConnectorFailure(
          'FILE_CHECKSUM_MISMATCH',
          'The uploaded object checksum does not match the declared checksum.',
        );
      }
      await prisma.sourceFileImport.update({
        where: { id: file.id },
        data: {
          status: 'AVAILABLE',
          actualByteSize: bytes.length,
          classification: dto.classification,
        },
      });
      const contentType = file.contentType as 'application/json' | 'text/csv';
      const parsed = this.sourcePayloadParser.parse(bytes, contentType, configuration.csvDelimiter);
      const profile = await this.persistSourceProfile(
        resolvedTenantId,
        userId,
        connectionId,
        traceId,
        parsed,
        configuration.sampleRecordLimit,
      );
      let sourceEventId: string | null = null;
      if (dto.operation === 'INGEST') {
        const records = Array.isArray(parsed) ? parsed : [parsed];
        if (records.length !== 1 || !this.isRecord(records[0])) {
          throw new BadRequestException(
            'File ingestion requires exactly one JSON object or one CSV data row per upload.',
          );
        }
        const payload = OperationalJsonObjectSchema.safeParse(records[0]);
        if (!payload.success) {
          throw new BadRequestException('The file record is not a supported JSON object.');
        }
        const ingested = await this.ingestEvent(resolvedTenantId, userId, {
          eventId: dto.eventId,
          tenantId: resolvedTenantId,
          environmentId: file.environmentId,
          sourceId: connectionId,
          eventType: dto.eventType,
          eventVersion: dto.eventVersion,
          occurredAt: dto.occurredAt,
          correlationId: dto.correlationId,
          idempotencyKey: dto.idempotencyKey,
          actor: dto.actor,
          entityRefs: dto.entityRefs,
          classification: dto.classification,
          payload: payload.data,
        });
        sourceEventId = ingested.id;
      }
      const completedAt = new Date();
      const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
      const status = dto.operation === 'INGEST' ? 'INGESTED' : 'PROFILED';
      await prisma.$transaction([
        prisma.sourceFileImport.update({
          where: { id: file.id },
          data: { status, sourceEventId, completedAt },
        }),
        prisma.connectorAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'SUCCEEDED',
            responseCode: 200,
            latencyMs,
            bytesReceived: bytes.length,
            result: { sourceFileId: file.id, sourceEventId, schemaVersion: profile.version },
            completedAt,
          },
        }),
        prisma.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            userId,
            action: 'IMPORT',
            resource: 'source-file-completion',
            resourceId: file.id,
            correlationId: traceId,
            after: {
              status,
              connectionId,
              sourceEventId,
              schemaVersion: profile.version,
              classification: dto.classification,
              checksumSha256: actualChecksum,
            },
          },
        }),
      ]);
      let storageCleanupPending = false;
      try {
        await this.objectStorageService.deleteObject(file.storageKey);
        await prisma.sourceFileImport.update({
          where: { id: file.id },
          data: { storageDeletedAt: new Date() },
        });
      } catch {
        storageCleanupPending = true;
      }
      return {
        fileId: file.id,
        status,
        sourceEventId,
        schemaVersion: profile.version,
        classification: dto.classification,
        duplicate: false,
        storageCleanupPending,
      };
    } catch (error) {
      const errorCode =
        error instanceof ConnectorFailure ? error.code : 'FILE_PROCESSING_FAILED';
      await prisma.$transaction([
        prisma.sourceFileImport.updateMany({
          where: { id: file.id, status: { in: ['UPLOAD_PENDING', 'AVAILABLE'] } },
          data: { status: 'FAILED', failureCode: errorCode },
        }),
        prisma.connectorAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'FAILED',
            result: { sourceFileId: file.id, phase: 'failed' },
            errorCode,
            completedAt: new Date(),
          },
        }),
      ]);
      await this.objectStorageService.deleteObject(file.storageKey).catch(() => undefined);
      if (error instanceof ConnectorFailure) {
        throw new UnprocessableEntityException({ message: error.message, code: error.code });
      }
      throw error;
    }
  }

  async getEventMetadata(tenantId: string, eventId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const event = await prisma.sourceEvent.findFirst({
      where: { tenantId: resolvedTenantId, eventId },
      select: {
        id: true,
        eventId: true,
        environmentId: true,
        sourceConnectionId: true,
        eventType: true,
        eventVersion: true,
        occurredAt: true,
        receivedAt: true,
        correlationId: true,
        actorType: true,
        actorId: true,
        entityRefs: true,
        classification: true,
        payloadHash: true,
        payloadKeyVersion: true,
        payloadPurgedAt: true,
        status: true,
        rejectionCode: true,
        rejectionDetail: true,
        processedAt: true,
      },
    });
    if (!event) throw new NotFoundException(`Source event '${eventId}' was not found.`);
    return event;
  }

  private async executeConnector(
    tenantId: string,
    connectionId: string,
    operation: 'TEST' | 'PROFILE',
  ) {
    const connection = await this.requireConnection(tenantId, connectionId);
    // Before any attempt is recorded: a retired pull connection is not tested or profiled here any more.
    if (RETIRED_PULL_INTERFACES.has(connection.interfaceType)) throw new GoneException(PULL_RETIRED_MESSAGE);
    if (connection.status === 'DISABLED')
      throw new ServiceUnavailableException('The source connection is disabled.');
    const traceId = randomUUID();
    const now = new Date();
    if (connection.circuitOpenUntil && connection.circuitOpenUntil > now) {
      await prisma.connectorAttempt.create({
        data: {
          tenantId,
          environmentId: connection.environmentId,
          connectionId,
          operation,
          status: 'BLOCKED',
          traceId,
          result: { circuitOpenUntil: connection.circuitOpenUntil.toISOString() },
          errorCode: 'CIRCUIT_OPEN',
          completedAt: now,
        },
      });
      throw new ServiceUnavailableException(
        'The connector circuit is open after repeated failures.',
      );
    }
    const attempt = await prisma.connectorAttempt.create({
      data: {
        tenantId,
        environmentId: connection.environmentId,
        connectionId,
        operation,
        status: 'BLOCKED',
        traceId,
        result: { phase: 'started' },
      },
    });
    const configuration = this.connectorConfiguration(
      connection.interfaceType,
      connection.configuration,
    );
    try {
      const fetchResult = await this.executeConnectorTransport(connection, configuration, operation);
      const completedAt = new Date();
      await prisma.$transaction([
        prisma.connectorAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'SUCCEEDED',
            responseCode: fetchResult.statusCode,
            latencyMs: fetchResult.latencyMs,
            bytesReceived: fetchResult.bytesReceived,
            result: { contentType: fetchResult.contentType },
            completedAt,
          },
        }),
        prisma.sourceConnection.update({
          where: { id: connectionId },
          data: {
            lastTestedAt: completedAt,
            lastSuccessfulAt: completedAt,
            lastLatencyMs: fetchResult.latencyMs,
            responseContentType: fetchResult.contentType,
            consecutiveFailures: 0,
            circuitOpenUntil: null,
            statusReasonCode: null,
          },
        }),
        ...(connection.credentialReference
          ? [
              prisma.credentialReference.update({
                where: {
                  id: (connection.credentialReference as ConnectorCredential & { id: string }).id,
                },
                data: { lastValidatedAt: completedAt, status: 'ACTIVE' },
              }),
            ]
          : []),
      ]);
      return { fetchResult, traceId, interfaceType: connection.interfaceType };
    } catch (error) {
      const failure =
        error instanceof ConnectorFailure
          ? error
          : new ConnectorFailure(
              'CONNECTOR_OPERATION_FAILED',
              'The connector operation failed validation.',
            );
      const latest = await prisma.sourceConnection.findFirst({
        where: { id: connectionId, tenantId },
        select: { consecutiveFailures: true },
      });
      const failures = (latest?.consecutiveFailures ?? 0) + 1;
      const circuitOpenUntil =
        failures >= runtimeConfig.connectorFailureThreshold
          ? new Date(Date.now() + runtimeConfig.connectorCircuitCooldownSeconds * 1_000)
          : null;
      await prisma.$transaction([
        prisma.connectorAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'FAILED',
            responseCode: failure.statusCode ?? null,
            result: { safeMessage: failure.message },
            errorCode: failure.code,
            completedAt: new Date(),
          },
        }),
        prisma.sourceConnection.update({
          where: { id: connectionId },
          data: {
            status: 'NOT_READY',
            statusReasonCode: failure.code,
            lastTestedAt: new Date(),
            consecutiveFailures: failures,
            circuitOpenUntil,
          },
        }),
      ]);
      logger.warn(
        { tenantId, connectionId, traceId, operation, errorCode: failure.code },
        'Connector operation failed',
      );
      throw new ServiceUnavailableException({
        message: failure.message,
        code: failure.code,
        traceId,
        circuitOpenUntil,
      });
    }
  }

  private async executeConnectorTransport(
    connection: ConnectionWithCredential,
    configuration: StoredConnectorConfiguration,
    operation: 'TEST' | 'PROFILE',
  ) {
    if (connection.interfaceType === 'FILE_UPLOAD') {
      if (operation !== 'TEST') {
        throw new ConnectorFailure(
          'FILE_SAMPLE_REQUIRED',
          'A checksum-verified file must be uploaded to profile a file connection.',
        );
      }
      const { latencyMs } = await this.objectStorageService.testBucket();
      const body = { objectStorageReachable: true, temporaryObjectLifecycle: true };
      return {
        statusCode: 200,
        latencyMs,
        contentType: 'application/json' as const,
        bytesReceived: jsonByteLength(body),
        body,
        diagnostics: { objectStorageReachable: true, temporaryObjectLifecycle: true },
      };
    }

    const webhookConfiguration = configuration as StoredWebhookConnectorConfiguration;
    if (connection.credentialReference?.authType !== 'HMAC_SHA256') {
      throw new ConnectorFailure(
        'CREDENTIAL_TYPE_MISMATCH',
        'Webhook ingestion requires an HMAC-SHA256 credential reference.',
      );
    }
    this.connectorCredentialService.resolveSecret(connection.credentialReference);
    if (operation === 'TEST') {
      const body = { inboundEndpointConfigured: true, signatureVerificationConfigured: true };
      return {
        statusCode: 200,
        latencyMs: 0,
        contentType: 'application/json' as const,
        bytesReceived: jsonByteLength(body),
        body,
        diagnostics: {
          inboundEndpointConfigured: true,
          signatureVerificationConfigured: true,
        },
      };
    }
    const latest = await prisma.sourceEvent.findFirst({
      where: {
        tenantId: connection.tenantId,
        sourceConnectionId: connection.id,
        status: { not: 'REJECTED' },
        payloadPurgedAt: null,
      },
      orderBy: { receivedAt: 'desc' },
      select: {
        eventId: true,
        eventType: true,
        eventVersion: true,
        payloadCiphertext: true,
        payloadIv: true,
        payloadAuthTag: true,
        payloadKeyVersion: true,
      },
    });
    if (!latest) {
      throw new ConnectorFailure(
        'WEBHOOK_SAMPLE_UNAVAILABLE',
        'No verified webhook event is available to profile.',
      );
    }
    const body = this.payloadCryptoService.decrypt(
      {
        ciphertext: latest.payloadCiphertext,
        iv: latest.payloadIv,
        authTag: latest.payloadAuthTag,
        keyVersion: latest.payloadKeyVersion,
      },
      sourceEventAuthenticatedContext(
        connection.tenantId,
        latest.eventId,
        latest.eventType,
        latest.eventVersion,
      ),
    );
    return {
      statusCode: 200,
      latencyMs: 0,
      contentType: 'application/json' as const,
      bytesReceived: jsonByteLength(body),
      body,
      diagnostics: {
        signatureHeader: webhookConfiguration.signatureHeader,
        sampleSource: 'verified-encrypted-source-event',
      },
    };
  }

  private async persistRejectedEvent(
    tenantId: string,
    userId: string | null,
    dto: IngestOperationalEventDto,
    dataContractVersionId: string,
    encrypted: ReturnType<PayloadCryptoService['encrypt']>,
    issues: Array<{ path: string; code: string; message: string }>,
  ) {
    const existing = await prisma.sourceEvent.findFirst({
      where: { tenantId, sourceConnectionId: dto.sourceId, idempotencyKey: dto.idempotencyKey },
      select: { payloadHash: true },
    });
    if (existing) {
      if (existing.payloadHash !== encrypted.hash)
        throw new ConflictException(
          'The idempotency key was already used with a different payload.',
        );
      return;
    }
    try {
      await prisma.$transaction(async (transaction) => {
        const event = await transaction.sourceEvent.create({
          data: {
            eventId: dto.eventId,
            tenantId,
            environmentId: dto.environmentId,
            sourceConnectionId: dto.sourceId,
            dataContractVersionId,
            eventType: dto.eventType,
            eventVersion: dto.eventVersion,
            occurredAt: new Date(dto.occurredAt),
            correlationId: dto.correlationId,
            idempotencyKey: dto.idempotencyKey,
            actorType: dto.actor.type,
            actorId: dto.actor.id ?? null,
            entityRefs: dto.entityRefs as Prisma.InputJsonValue,
            classification: dto.classification,
            payloadCiphertext: Uint8Array.from(encrypted.ciphertext),
            payloadIv: Uint8Array.from(encrypted.iv),
            payloadAuthTag: Uint8Array.from(encrypted.authTag),
            payloadHash: encrypted.hash,
            payloadKeyVersion: encrypted.keyVersion,
            status: 'REJECTED',
            rejectionCode: 'DATA_CONTRACT_VALIDATION_FAILED',
            rejectionDetail: { issues } as Prisma.InputJsonValue,
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId,
            userId,
            action: 'IMPORT',
            resource: 'source-event-rejection',
            resourceId: event.id,
            correlationId: dto.correlationId,
            after: {
              eventId: dto.eventId,
              eventType: dto.eventType,
              rejectionCode: 'DATA_CONTRACT_VALIDATION_FAILED',
              issueCount: issues.length,
              payloadHash: encrypted.hash,
            },
          },
        });
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
    }
  }

  private idempotentEventResponse(
    existing: {
      id: string;
      eventId: string;
      eventType: string;
      eventVersion: number;
      payloadHash: string;
      status: string;
      receivedAt: Date;
    },
    dto: IngestOperationalEventDto,
    payloadHash: string,
  ) {
    if (
      existing.eventId !== dto.eventId ||
      existing.eventType !== dto.eventType ||
      existing.eventVersion !== dto.eventVersion ||
      existing.payloadHash !== payloadHash
    ) {
      throw new ConflictException(
        'The idempotency key was already used with different event content.',
      );
    }
    return {
      id: existing.id,
      eventId: existing.eventId,
      status: existing.status,
      receivedAt: existing.receivedAt,
      duplicate: true,
    };
  }

  private async requireEnvironment(tenantId: string, environmentId: string) {
    const environment = await prisma.tenantEnvironment.findFirst({
      where: { id: environmentId, tenantId, status: 'ACTIVE' },
    });
    if (!environment)
      throw new NotFoundException(`Active environment '${environmentId}' was not found.`);
    return environment;
  }

  private async persistSourceProfile(
    tenantId: string,
    userId: string,
    connectionId: string,
    traceId: string,
    body: unknown,
    sampleRecordLimit: number,
    readiness: {
      status: 'READY' | 'READY_WITH_LIMITS';
      statusReasonCode: string | null;
    } = { status: 'READY', statusReasonCode: null },
  ) {
    const profile = this.connectorProfileService.profile(body, sampleRecordLimit);
    const checksum = createHash('sha256').update(canonicalJson(profile.schema)).digest('hex');
    const schemaVersion = await this.withSerializableRetry(async () =>
      prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.sourceSchemaVersion.findUnique({
            where: { connectionId_checksum: { connectionId, checksum } },
          });
          if (existing) return existing;
          const previous = await transaction.sourceSchemaVersion.findFirst({
            where: { connectionId, tenantId },
            orderBy: { version: 'desc' },
          });
          const compatibility = this.jsonSchemaService.compatibility(
            previous?.schema as Record<string, unknown> | null,
            profile.schema,
            'BACKWARD',
          );
          const nextVersion = (previous?.version ?? 0) + 1;
          const created = await transaction.sourceSchemaVersion.create({
            data: {
              tenantId,
              connectionId,
              version: nextVersion,
              schema: profile.schema as Prisma.InputJsonValue,
              checksum,
              maskedSample: profile.maskedSample as Prisma.InputJsonValue,
              classification: profile.classification as unknown as Prisma.InputJsonValue,
              compatibility: compatibility as unknown as Prisma.InputJsonValue,
              breakingChange: !compatibility.compatible,
              createdById: userId,
            },
          });
          await transaction.sourceConnection.update({
            where: { id: connectionId },
            data: { observedSchemaVersion: nextVersion, ...readiness },
          });
          await transaction.auditLog.create({
            data: {
              tenantId,
              userId,
              action: 'IMPORT',
              resource: 'source-schema-version',
              resourceId: created.id,
              correlationId: traceId,
              after: {
                connectionId,
                version: nextVersion,
                checksum,
                breakingChange: !compatibility.compatible,
                recordCountObserved: profile.recordCountObserved,
                maskedFieldCount: profile.classification.maskedFieldCount,
              },
            },
          });
          return created;
        },
        { isolationLevel: 'Serializable' },
      ),
    );
    return {
      connectionId,
      traceId,
      version: schemaVersion.version,
      checksum: schemaVersion.checksum,
      schema: schemaVersion.schema,
      maskedSample: schemaVersion.maskedSample,
      classification: schemaVersion.classification,
      compatibility: schemaVersion.compatibility,
      breakingChange: schemaVersion.breakingChange,
      recordCountObserved: profile.recordCountObserved,
    };
  }

  private async requireConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<
    ConnectionWithCredential & {
      statusReasonCode: string | null;
      lastTestedAt: Date | null;
      lastSuccessfulAt: Date | null;
      lastLatencyMs: number | null;
      consecutiveFailures: number;
    }
  > {
    const connection = await prisma.sourceConnection.findFirst({
      where: { id: connectionId, tenantId },
      include: {
        credentialReference: {
          select: {
            id: true,
            provider: true,
            reference: true,
            authType: true,
            headerName: true,
            status: true,
          },
        },
      },
    });
    if (!connection) throw new NotFoundException(`Connection '${connectionId}' was not found.`);
    return connection as typeof connection & ConnectionWithCredential;
  }

  private connectorConfiguration(
    interfaceType: ConnectionWithCredential['interfaceType'],
    configuration: Prisma.JsonValue,
  ): StoredConnectorConfiguration {
    if (!this.isRecord(configuration))
      throw new Error('Stored connector configuration is invalid.');
    const sampleRecordLimit = configuration.sampleRecordLimit;
    if (!Number.isSafeInteger(sampleRecordLimit) || Number(sampleRecordLimit) < 1) {
      throw new Error('Stored connector configuration is invalid.');
    }
    if (RETIRED_PULL_INTERFACES.has(interfaceType)) throw new GoneException(PULL_RETIRED_MESSAGE);
    if (interfaceType === 'WEBHOOK') {
      const { signatureHeader, timestampHeader, maxSkewSeconds } = configuration;
      if (
        typeof signatureHeader !== 'string' ||
        typeof timestampHeader !== 'string' ||
        signatureHeader === timestampHeader ||
        !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(signatureHeader) ||
        !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(timestampHeader) ||
        !Number.isSafeInteger(maxSkewSeconds) ||
        Number(maxSkewSeconds) < 1
      ) {
        throw new Error('Stored webhook connector configuration is invalid.');
      }
      return {
        signatureHeader,
        timestampHeader,
        maxSkewSeconds: Number(maxSkewSeconds),
        sampleRecordLimit: Number(sampleRecordLimit),
      };
    }
    const { acceptedContentTypes, csvDelimiter } = configuration;
    if (
      !Array.isArray(acceptedContentTypes) ||
      acceptedContentTypes.length < 1 ||
      acceptedContentTypes.some(
        (contentType) => !['application/json', 'text/csv'].includes(String(contentType)),
      ) ||
      new Set(acceptedContentTypes).size !== acceptedContentTypes.length ||
      typeof csvDelimiter !== 'string' ||
      csvDelimiter.length !== 1
    ) {
      throw new Error('Stored file connector configuration is invalid.');
    }
    return {
      acceptedContentTypes: acceptedContentTypes as Array<'application/json' | 'text/csv'>,
      csvDelimiter,
      sampleRecordLimit: Number(sampleRecordLimit),
    };
  }

  private assertCompatibleCredential(
    interfaceType: ConnectionWithCredential['interfaceType'],
    authType: string,
  ): void {
    const permitted =
      interfaceType === 'WEBHOOK'
        ? ['HMAC_SHA256']
        : interfaceType === 'POSTGRESQL'
          ? ['USERNAME_PASSWORD']
          : interfaceType === 'FILE_UPLOAD'
            ? ['NONE']
            : ['NONE', 'BEARER_TOKEN', 'API_KEY_HEADER'];
    if (!permitted.includes(authType)) {
      throw new BadRequestException(
        `Credential type '${authType}' is not valid for the ${interfaceType} connector.`,
      );
    }
  }

  private verifyWebhookSignature(
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
    configuration: StoredWebhookConnectorConfiguration,
    credential: ConnectorCredential | null,
  ): void {
    const timestamp = this.singleHeader(headers[configuration.timestampHeader]);
    const supplied = this.singleHeader(headers[configuration.signatureHeader]);
    if (
      !rawBody ||
      rawBody.length === 0 ||
      rawBody.length > runtimeConfig.connectorHttpMaxResponseBytes ||
      !timestamp ||
      !supplied ||
      credential?.authType !== 'HMAC_SHA256'
    ) {
      throw new UnauthorizedException('Webhook signature is missing or invalid.');
    }
    const timestampSeconds = Number(timestamp);
    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(Math.floor(Date.now() / 1_000) - timestampSeconds) > configuration.maxSkewSeconds
    ) {
      throw new UnauthorizedException('Webhook timestamp is outside the accepted window.');
    }
    const secret = this.connectorCredentialService.resolveSecret(credential);
    const expected = `sha256=${createHmac('sha256', secret)
      .update(timestamp)
      .update('.')
      .update(rawBody)
      .digest('hex')}`;
    if (!/^sha256=[a-f0-9]{64}$/.test(supplied)) {
      throw new UnauthorizedException('Webhook signature is missing or invalid.');
    }
    const suppliedBytes = Buffer.from(supplied, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      throw new UnauthorizedException('Webhook signature is missing or invalid.');
    }
  }

  private singleHeader(value: string | string[] | undefined): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private sourceRoleHasWritePrivileges(fetchResult: unknown): boolean {
    if (!this.isRecord(fetchResult) || !this.isRecord(fetchResult.diagnostics)) return false;
    return fetchResult.diagnostics.sourceRoleHasWritePrivileges === true;
  }

  private isUniqueConstraint(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= runtimeConfig.workflowPublishMaxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const retryable =
          !!error &&
          typeof error === 'object' &&
          'code' in error &&
          ['P2034', 'P2002'].includes(String(error.code));
        if (!retryable || attempt === runtimeConfig.workflowPublishMaxRetries) throw error;
      }
    }
    throw lastError;
  }
}
