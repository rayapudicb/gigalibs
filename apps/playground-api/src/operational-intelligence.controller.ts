import { CurrentUser, Public } from '@gigalibs/auth-nest';
import {
  type AssignRetentionClassDto,
  AssignRetentionClassSchema,
  type CompleteSourceFileDto,
  CompleteSourceFileSchema,
  type CreateConnectionDto,
  CreateConnectionSchema,
  type CreateCredentialReferenceDto,
  CreateCredentialReferenceSchema,
  type CreateDataContractDto,
  CreateDataContractSchema,
  type CreateEnvironmentDto,
  CreateEnvironmentSchema,
  type CreateRetentionClassDto,
  CreateRetentionClassSchema,
  type CreateRetentionHoldDto,
  CreateRetentionHoldSchema,
  type IngestOperationalEventDto,
  IngestOperationalEventSchema,
  type PublishDataContractDto,
  PublishDataContractSchema,
  type ReleaseRetentionHoldDto,
  ReleaseRetentionHoldSchema,
  type RequestSourceFileUploadDto,
  RequestSourceFileUploadSchema,
  type UpdateRetentionClassDto,
  UpdateRetentionClassSchema,
} from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { OperationalIntelligenceService } from './operational-intelligence.service.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { RetentionClassService } from './retention-class.service.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { RetentionService } from './retention.service.js';

interface RawWebhookRequest {
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

@Controller('operational-intelligence')
export class OperationalIntelligenceController {
  constructor(
    private readonly service: OperationalIntelligenceService,
    private readonly retentionService: RetentionService,
    private readonly retentionClassService: RetentionClassService,
  ) {}

  @Get('environments')
  @RequirePermissions('connections:read')
  listEnvironments(@CurrentTenant('tenantId') tenantId: string) {
    return this.service.listEnvironments(tenantId);
  }

  @Post('environments')
  @RequirePermissions('connections:create')
  createEnvironment(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateEnvironmentSchema)) dto: CreateEnvironmentDto,
  ) {
    return this.service.createEnvironment(tenantId, userId, dto);
  }

  @Get('retention-holds')
  @RequirePermissions('retention:read')
  listRetentionHolds(
    @CurrentTenant('tenantId') tenantId: string,
    @Query('environmentId') environmentId?: string,
  ) {
    return this.retentionService.list(tenantId, environmentId);
  }

  @Post('retention-holds')
  @RequirePermissions('retention:manage')
  createRetentionHold(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateRetentionHoldSchema)) dto: CreateRetentionHoldDto,
  ) {
    return this.retentionService.create(tenantId, userId, dto);
  }

  @Post('retention-holds/:holdId/release')
  @RequirePermissions('retention:manage')
  releaseRetentionHold(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('holdId') holdId: string,
    @Body(new ZodValidationPipe(ReleaseRetentionHoldSchema)) dto: ReleaseRetentionHoldDto,
  ) {
    return this.retentionService.release(tenantId, userId, holdId, dto);
  }

  // WI-OI-120 (T9b): named retention classes — the reusable periods an environment adopts.
  @Get('retention-classes')
  @RequirePermissions('retention:read')
  listRetentionClasses(
    @CurrentTenant('tenantId') tenantId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.retentionClassService.list(tenantId, includeArchived === 'true');
  }

  @Post('retention-classes')
  @RequirePermissions('retention:manage')
  createRetentionClass(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateRetentionClassSchema)) dto: CreateRetentionClassDto,
  ) {
    return this.retentionClassService.create(tenantId, userId, dto);
  }

  @Patch('retention-classes/:classId')
  @RequirePermissions('retention:manage')
  updateRetentionClass(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(UpdateRetentionClassSchema)) dto: UpdateRetentionClassDto,
  ) {
    return this.retentionClassService.update(tenantId, userId, classId, dto);
  }

  @Delete('retention-classes/:classId')
  @RequirePermissions('retention:manage')
  archiveRetentionClass(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('classId') classId: string,
  ) {
    return this.retentionClassService.archive(tenantId, userId, classId);
  }

  @Post('retention-classes/assign')
  @RequirePermissions('retention:manage')
  assignRetentionClass(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(AssignRetentionClassSchema)) dto: AssignRetentionClassDto,
  ) {
    return this.retentionClassService.assign(tenantId, userId, dto);
  }

  @Get('credential-references')
  @RequirePermissions('connections:read')
  listCredentialReferences(
    @CurrentTenant('tenantId') tenantId: string,
    @Query('environmentId') environmentId?: string,
  ) {
    return this.service.listCredentialReferences(tenantId, environmentId);
  }

  @Post('credential-references')
  @RequirePermissions('connections:credentials')
  createCredentialReference(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateCredentialReferenceSchema)) dto: CreateCredentialReferenceDto,
  ) {
    return this.service.createCredentialReference(tenantId, userId, dto);
  }

  @Post('credential-references/:credentialId/revoke')
  @RequirePermissions('connections:credentials')
  revokeCredentialReference(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('credentialId') credentialId: string,
  ) {
    return this.service.revokeCredentialReference(tenantId, userId, credentialId);
  }

  @Get('connections')
  @RequirePermissions('connections:read')
  listConnections(
    @CurrentTenant('tenantId') tenantId: string,
    @Query('environmentId') environmentId?: string,
  ) {
    return this.service.listConnections(tenantId, environmentId);
  }

  @Post('connections')
  @RequirePermissions('connections:create')
  createConnection(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateConnectionSchema)) dto: CreateConnectionDto,
  ) {
    return this.service.createConnection(tenantId, userId, dto);
  }

  @Get('connections/:connectionId')
  @RequirePermissions('connections:read')
  getConnection(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.service.getConnection(tenantId, connectionId);
  }

  @Post('connections/:connectionId/test')
  @RequirePermissions('connections:test')
  testConnection(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.service.testConnection(tenantId, userId, connectionId);
  }

  @Post('connections/:connectionId/profile')
  @RequirePermissions('connections:profile')
  profileConnection(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.service.profileConnection(tenantId, userId, connectionId);
  }

  @Get('connections/:connectionId/health')
  @RequirePermissions('connections:read')
  getConnectionHealth(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.service.getConnectionHealth(tenantId, connectionId);
  }

  @Get('connections/:connectionId/files')
  @RequirePermissions('connections:read')
  listSourceFiles(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.service.listSourceFiles(tenantId, connectionId);
  }

  @Post('connections/:connectionId/files/upload-request')
  @RequirePermissions('connections:profile')
  requestSourceFileUpload(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('connectionId') connectionId: string,
    @Body(new ZodValidationPipe(RequestSourceFileUploadSchema)) dto: RequestSourceFileUploadDto,
  ) {
    return this.service.requestSourceFileUpload(tenantId, userId, connectionId, dto);
  }

  @Post('connections/:connectionId/files/:fileId/complete')
  @RequirePermissions('connections:profile', 'events:ingest')
  completeSourceFile(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('connectionId') connectionId: string,
    @Param('fileId') fileId: string,
    @Body(new ZodValidationPipe(CompleteSourceFileSchema)) dto: CompleteSourceFileDto,
  ) {
    return this.service.completeSourceFile(tenantId, userId, connectionId, fileId, dto);
  }

  @Public()
  @Post('webhooks/:connectionId')
  @HttpCode(202)
  ingestWebhook(
    @Param('connectionId') connectionId: string,
    @Req() request: RawWebhookRequest,
    @Body() body: unknown,
  ) {
    return this.service.ingestWebhook(connectionId, request.rawBody, request.headers, body);
  }

  @Get('data-contracts')
  @RequirePermissions('contracts:read')
  listDataContracts(
    @CurrentTenant('tenantId') tenantId: string,
    @Query('environmentId') environmentId?: string,
  ) {
    return this.service.listDataContracts(tenantId, environmentId);
  }

  @Post('data-contracts')
  @RequirePermissions('contracts:create')
  createDataContract(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateDataContractSchema)) dto: CreateDataContractDto,
  ) {
    return this.service.createDataContract(tenantId, userId, dto);
  }

  @Post('data-contracts/:contractId/publish')
  @RequirePermissions('contracts:publish')
  publishDataContract(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('contractId') contractId: string,
    @Body(new ZodValidationPipe(PublishDataContractSchema)) dto: PublishDataContractDto,
  ) {
    return this.service.publishDataContract(tenantId, userId, contractId, dto);
  }

  @Post('events/ingest')
  @RequirePermissions('events:ingest')
  ingestEvent(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(IngestOperationalEventSchema)) dto: IngestOperationalEventDto,
  ) {
    return this.service.ingestEvent(tenantId, userId, dto);
  }

  @Get('events/:eventId')
  @RequirePermissions('events:read')
  getEventMetadata(@CurrentTenant('tenantId') tenantId: string, @Param('eventId') eventId: string) {
    return this.service.getEventMetadata(tenantId, eventId);
  }
}
