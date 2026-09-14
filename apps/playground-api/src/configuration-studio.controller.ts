import { CurrentUser } from '@gigalibs/auth-nest';
import {
  ActivateConfigurationSchema,
  ConfigurationExtensionValuesSchema,
  ConfigurationReasonSchema,
  ConfigurationRuntimeQuerySchema,
  CreateConfigurationRecordSchema,
  DeleteConfigurationRecordSchema,
  ExportConfigurationPackageSchema,
  ImportConfigurationPackageSchema,
  CreateConfigurationChangeSetSchema,
  UpdateConfigurationChangeSetSchema,
  UpdateConfigurationRecordSchema,
  ListApplicationRecordsQuerySchema,
  CreateConfigurationTemplateSchema,
  UpdateConfigurationTemplateSchema,
  DuplicateConfigurationTemplateSchema,
  CreateSavedFilterSchema,
  type ActivateConfigurationDto,
  type ConfigurationExtensionValuesDto,
  type ConfigurationReasonDto,
  type ConfigurationRuntimeQuery,
  type CreateConfigurationChangeSetDto,
  type CreateConfigurationRecordDto,
  type DeleteConfigurationRecordDto,
  type ExportConfigurationPackageDto,
  type ImportConfigurationPackageDto,
  type UpdateConfigurationChangeSetDto,
  type UpdateConfigurationRecordDto,
  type ListApplicationRecordsQuery,
  type CreateConfigurationTemplateDto,
  type UpdateConfigurationTemplateDto,
  type DuplicateConfigurationTemplateDto,
  type CreateSavedFilterDto,
} from '@gigalibs/contracts';
import { RbacService, RequirePermissions } from '@gigalibs/rbac-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ConfigurationStudioService } from './configuration-studio.service.js';

@Controller('configuration')
export class ConfigurationStudioController {
  constructor(
    private readonly configuration: ConfigurationStudioService,
    private readonly rbac: RbacService,
  ) {}

  private permissions(tenantId: string, actorId: string) {
    return this.rbac.getUserPermissions(actorId, tenantId);
  }

  @Get('surfaces')
  @RequirePermissions('configuration:read')
  async surfaces(@CurrentTenant('tenantId') tenantId?: string) {
    return tenantId ? this.configuration.listSurfaces(tenantId) : this.configuration.listSurfaces();
  }

  @Get('change-sets')
  @RequirePermissions('configuration:read')
  list(@CurrentTenant('tenantId') tenantId: string) {
    return this.configuration.listChangeSets(tenantId);
  }

  @Get('change-sets/:id/impact')
  @RequirePermissions('configuration:read')
  impact(@CurrentTenant('tenantId') tenantId: string, @Param('id') id: string) {
    return this.configuration.changeSetImpact(tenantId, id);
  }

  @Get('published-versions')
  @RequirePermissions('configuration:read')
  published(@CurrentTenant('tenantId') tenantId: string) {
    return this.configuration.listPublishedVersions(tenantId);
  }

  @Get('activations')
  @RequirePermissions('configuration:read')
  activations(@CurrentTenant('tenantId') tenantId: string) {
    return this.configuration.listActivations(tenantId);
  }

  @Get('apps')
  @RequirePermissions('configuration-apps:read')
  async apps(@CurrentTenant('tenantId') tenantId: string, @CurrentUser('sub') actorId: string) {
    return this.configuration.listRuntimeApplications(
      tenantId,
      await this.permissions(tenantId, actorId),
    );
  }

  @Post('packages/export')
  @HttpCode(200)
  @RequirePermissions('configuration:export')
  async exportPackage(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(ExportConfigurationPackageSchema))
    dto: ExportConfigurationPackageDto,
  ) {
    return this.configuration.exportPackage(
      tenantId,
      actorId,
      dto,
      await this.permissions(tenantId, actorId),
    );
  }

  @Post('packages/import')
  @HttpCode(201)
  @RequirePermissions('configuration:import')
  importPackage(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(ImportConfigurationPackageSchema))
    dto: ImportConfigurationPackageDto,
  ) {
    return this.configuration.importPackage(tenantId, actorId, dto);
  }

  @Get('apps/:entityKey/records')
  @RequirePermissions('configuration-apps:read')
  async records(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Query(new ZodValidationPipe(ListApplicationRecordsQuerySchema)) query: ListApplicationRecordsQuery,
  ) {
    return this.configuration.listApplicationRecords(
      tenantId,
      entityKey,
      await this.permissions(tenantId, actorId),
      query,
    );
  }

  @Get('apps/:entityKey/records/:recordId')
  @RequirePermissions('configuration-apps:read')
  async record(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('recordId') recordId: string,
  ) {
    return this.configuration.getApplicationRecord(
      tenantId,
      entityKey,
      recordId,
      await this.permissions(tenantId, actorId),
    );
  }

  @Post('apps/:entityKey/records')
  @HttpCode(201)
  @RequirePermissions('configuration-apps:write')
  async createRecord(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Body(new ZodValidationPipe(CreateConfigurationRecordSchema)) dto: CreateConfigurationRecordDto,
  ) {
    return this.configuration.createApplicationRecord(
      tenantId,
      actorId,
      entityKey,
      dto,
      await this.permissions(tenantId, actorId),
    );
  }

  @Patch('apps/:entityKey/records/:recordId')
  @RequirePermissions('configuration-apps:write')
  async updateRecord(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('recordId') recordId: string,
    @Body(new ZodValidationPipe(UpdateConfigurationRecordSchema)) dto: UpdateConfigurationRecordDto,
  ) {
    return this.configuration.updateApplicationRecord(
      tenantId,
      actorId,
      entityKey,
      recordId,
      dto,
      await this.permissions(tenantId, actorId),
    );
  }

  @Delete('apps/:entityKey/records/:recordId')
  @RequirePermissions('configuration-apps:write')
  deleteRecord(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('recordId') recordId: string,
    @Body(new ZodValidationPipe(DeleteConfigurationRecordSchema)) dto: DeleteConfigurationRecordDto,
  ) {
    return this.configuration.deleteApplicationRecord(tenantId, actorId, entityKey, recordId, dto);
  }

  @Post('change-sets')
  @HttpCode(201)
  @RequirePermissions('configuration:draft')
  create(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(CreateConfigurationChangeSetSchema))
    dto: CreateConfigurationChangeSetDto,
  ) {
    return this.configuration.createChangeSet(tenantId, actorId, dto);
  }

  @Patch('change-sets/:id')
  @RequirePermissions('configuration:draft')
  update(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateConfigurationChangeSetSchema))
    dto: UpdateConfigurationChangeSetDto,
  ) {
    return this.configuration.updateChangeSet(tenantId, actorId, id, dto);
  }

  @Post('change-sets/:id/submit')
  @HttpCode(200)
  @RequirePermissions('configuration:submit')
  submit(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConfigurationReasonSchema)) dto: ConfigurationReasonDto,
  ) {
    return this.configuration.submit(tenantId, actorId, id, dto);
  }

  @Post('change-sets/:id/approve')
  @HttpCode(200)
  @RequirePermissions('configuration:approve')
  approve(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConfigurationReasonSchema)) dto: ConfigurationReasonDto,
  ) {
    return this.configuration.approve(tenantId, actorId, id, dto);
  }

  @Post('change-sets/:id/reject')
  @HttpCode(200)
  @RequirePermissions('configuration:approve')
  reject(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConfigurationReasonSchema)) dto: ConfigurationReasonDto,
  ) {
    return this.configuration.reject(tenantId, actorId, id, dto);
  }

  @Post('change-sets/:id/publish')
  @HttpCode(200)
  @RequirePermissions('configuration:publish')
  publish(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConfigurationReasonSchema)) dto: ConfigurationReasonDto,
  ) {
    return this.configuration.publish(tenantId, actorId, id, dto);
  }

  @Post('activations')
  @HttpCode(201)
  @RequirePermissions('configuration:activate')
  activate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(ActivateConfigurationSchema)) dto: ActivateConfigurationDto,
  ) {
    return this.configuration.activate(tenantId, actorId, dto);
  }

  @Post('activations/rollback')
  @HttpCode(201)
  @RequirePermissions('configuration:rollback')
  rollback(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(ActivateConfigurationSchema)) dto: ActivateConfigurationDto,
  ) {
    return this.configuration.rollback(tenantId, actorId, dto);
  }

  @Get('runtime/manifest')
  @RequirePermissions('configuration-runtime:read')
  async runtime(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Query(new ZodValidationPipe(ConfigurationRuntimeQuerySchema)) query: ConfigurationRuntimeQuery,
  ) {
    return this.configuration.runtimeManifest(
      tenantId,
      query.moduleKey,
      query.entityKey,
      query.surfaceKey,
      query.environmentKey,
      query.cohortKey,
      await this.permissions(tenantId, actorId),
    );
  }

  @Get('extension-values/:ownerType/:ownerId')
  @RequirePermissions('configuration-values:read')
  async values(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('ownerType') ownerType: string,
    @Param('ownerId') ownerId: string,
  ) {
    return this.configuration.getExtensionValues(
      tenantId,
      ownerType,
      ownerId,
      await this.permissions(tenantId, actorId),
    );
  }

  @Post('extension-values/:ownerType/:ownerId')
  @HttpCode(200)
  @RequirePermissions('configuration-values:update')
  async saveValues(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('ownerType') ownerType: string,
    @Param('ownerId') ownerId: string,
    @Body(new ZodValidationPipe(ConfigurationExtensionValuesSchema))
    dto: ConfigurationExtensionValuesDto,
  ) {
    return this.configuration.saveExtensionValues(
      tenantId,
      actorId,
      ownerType,
      ownerId,
      dto,
      await this.permissions(tenantId, actorId),
    );
  }

  // ---------------------------------------------------------------------------
  // Template catalog (P1)
  // ---------------------------------------------------------------------------

  @Get('apps/:entityKey/templates')
  @RequirePermissions('configuration-apps:read')
  async listTemplates(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
  ) {
    return this.configuration.listTemplates(
      tenantId,
      entityKey,
      await this.permissions(tenantId, actorId),
    );
  }

  @Post('apps/:entityKey/templates')
  @HttpCode(201)
  @RequirePermissions('configuration-apps:write')
  async createTemplate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Body(new ZodValidationPipe(CreateConfigurationTemplateSchema)) dto: CreateConfigurationTemplateDto,
  ) {
    return this.configuration.createTemplate(
      tenantId,
      entityKey,
      actorId,
      dto,
      await this.permissions(tenantId, actorId),
    );
  }

  @Put('apps/:entityKey/templates/:templateId')
  @RequirePermissions('configuration-apps:write')
  async updateTemplate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('templateId') templateId: string,
    @Body(new ZodValidationPipe(UpdateConfigurationTemplateSchema)) dto: UpdateConfigurationTemplateDto,
  ) {
    return this.configuration.updateTemplate(
      tenantId,
      entityKey,
      templateId,
      actorId,
      dto,
      await this.permissions(tenantId, actorId),
    );
  }

  @Post('apps/:entityKey/templates/:templateId/duplicate')
  @HttpCode(201)
  @RequirePermissions('configuration-apps:write')
  async duplicateTemplate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('templateId') templateId: string,
    @Body(new ZodValidationPipe(DuplicateConfigurationTemplateSchema)) dto: DuplicateConfigurationTemplateDto,
  ) {
    return this.configuration.duplicateTemplate(tenantId, entityKey, templateId, actorId, dto);
  }

  @Delete('apps/:entityKey/templates/:templateId')
  @RequirePermissions('configuration-apps:write')
  deleteTemplate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('templateId') templateId: string,
  ) {
    return this.configuration.deleteTemplate(tenantId, entityKey, templateId, actorId);
  }

  // ---------------------------------------------------------------------------
  // Saved filters (P1)
  // ---------------------------------------------------------------------------

  @Get('apps/:entityKey/saved-filters')
  @RequirePermissions('configuration-apps:read')
  listSavedFilters(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('entityKey') entityKey: string,
  ) {
    return this.configuration.listSavedFilters(tenantId, entityKey);
  }

  @Post('apps/:entityKey/saved-filters')
  @HttpCode(201)
  @RequirePermissions('configuration-apps:read')
  createSavedFilter(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Body(new ZodValidationPipe(CreateSavedFilterSchema)) dto: CreateSavedFilterDto,
  ) {
    return this.configuration.createSavedFilter(tenantId, entityKey, actorId, dto);
  }

  @Delete('apps/:entityKey/saved-filters/:filterId')
  @RequirePermissions('configuration-apps:read')
  deleteSavedFilter(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('filterId') filterId: string,
  ) {
    return this.configuration.deleteSavedFilter(tenantId, entityKey, filterId, actorId);
  }
}
