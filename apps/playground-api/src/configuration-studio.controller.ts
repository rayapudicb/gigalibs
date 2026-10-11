import { CurrentUser } from '@gigalibs/auth-nest';
import {
  ActivateConfigurationSchema,
  ConfigurationExtensionValuesSchema,
  ConfigurationReasonSchema,
  ConfigurationRuntimeCurrentQuerySchema,
  ConfigurationRuntimePreviewQuerySchema,
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
  ConfigurationActivationListResponseSchema,
  ConfigurationActivationResponseSchema,
  ConfigurationChangeSetListResponseSchema,
  ConfigurationChangeSetResponseSchema,
  ConfigurationDeletedResourceResponseSchema,
  ConfigurationDeletedSavedFilterResponseSchema,
  ConfigurationExtensionValueResponseSchema,
  ConfigurationImpactReportSchema,
  ConfigurationPackageEnvelopeSchema,
  ConfigurationPackageImportResponseSchema,
  ConfigurationPublishedVersionListResponseSchema,
  ConfigurationPublishedVersionResponseSchema,
  ConfigurationRecordDetailResponseSchema,
  ConfigurationRecordListResponseSchema,
  ConfigurationRecordMutationResponseSchema,
  ConfigurationRuntimeApplicationListResponseSchema,
  ConfigurationRuntimeManifestCurrentResponseSchema,
  ConfigurationRuntimeManifestResponseSchema,
  ConfigurationSavedFilterListResponseSchema,
  ConfigurationSavedFilterResponseSchema,
  ConfigurationSurfaceListResponseSchema,
  ConfigurationTemplateListResponseSchema,
  ConfigurationTemplateResponseSchema,
  ConfigurationTemplateUpdateResponseSchema,
  type ActivateConfigurationDto,
  type ConfigurationExtensionValuesDto,
  type ConfigurationReasonDto,
  type ConfigurationRuntimeCurrentQuery,
  type ConfigurationRuntimePreviewQuery,
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
  GovernedCatalogueQuerySchema,
  type GovernedCatalogueKind,
  InstallGovernedCatalogueSchema,
  type InstallGovernedCatalogueDto,
} from '@gigalibs/contracts';
import { RbacService, RequirePermissions } from '@gigalibs/rbac-nest';
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
  Put,
  Query,
} from '@nestjs/common';
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

  private response<T>(schema: { parse(value: unknown): T }, value: unknown): T {
    return schema.parse(value);
  }

  @Get('surfaces')
  @RequirePermissions('configuration:read')
  async surfaces(@CurrentTenant('tenantId') tenantId?: string) {
    return this.response(
      ConfigurationSurfaceListResponseSchema,
      tenantId
        ? await this.configuration.listSurfaces(tenantId)
        : this.configuration.listSurfaces(),
    );
  }

  @Get('dictionary/descriptors')
  @RequirePermissions('configuration:read')
  async dictionaryDescriptors() {
    return this.configuration.listDescriptors();
  }

  @Get('dictionary/contributions')
  @RequirePermissions('configuration:read')
  async dictionaryContributions() {
    return this.configuration.listDictionaryContributions();
  }

  @Get('change-sets')
  @RequirePermissions('configuration:read')
  async list(@CurrentTenant('tenantId') tenantId: string) {
    return this.response(
      ConfigurationChangeSetListResponseSchema,
      await this.configuration.listChangeSets(tenantId),
    );
  }

  @Get('change-sets/:id/impact')
  @RequirePermissions('configuration:read')
  async impact(@CurrentTenant('tenantId') tenantId: string, @Param('id') id: string) {
    return this.response(
      ConfigurationImpactReportSchema,
      await this.configuration.changeSetImpact(tenantId, id),
    );
  }

  @Get('published-versions')
  @RequirePermissions('configuration:read')
  async published(@CurrentTenant('tenantId') tenantId: string) {
    return this.response(
      ConfigurationPublishedVersionListResponseSchema,
      await this.configuration.listPublishedVersions(tenantId),
    );
  }

  @Get('activations')
  @RequirePermissions('configuration:read')
  async activations(@CurrentTenant('tenantId') tenantId: string) {
    return this.response(
      ConfigurationActivationListResponseSchema,
      await this.configuration.listActivations(tenantId),
    );
  }

  @Get('apps')
  @RequirePermissions('configuration-apps:read')
  async apps(@CurrentTenant('tenantId') tenantId: string, @CurrentUser('sub') actorId: string) {
    return this.response(
      ConfigurationRuntimeApplicationListResponseSchema,
      await this.configuration.listRuntimeApplications(
        tenantId,
        await this.permissions(tenantId, actorId),
      ),
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
    return this.response(
      ConfigurationPackageEnvelopeSchema,
      await this.configuration.exportPackage(
        tenantId,
        actorId,
        dto,
        await this.permissions(tenantId, actorId),
      ),
    );
  }

  @Post('packages/import')
  @HttpCode(201)
  @RequirePermissions('configuration:import')
  async importPackage(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(ImportConfigurationPackageSchema))
    dto: ImportConfigurationPackageDto,
  ) {
    return this.response(
      ConfigurationPackageImportResponseSchema,
      await this.configuration.importPackage(tenantId, actorId, dto),
    );
  }

  @Get('apps/:entityKey/records')
  @RequirePermissions('configuration-apps:read')
  async records(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Query(new ZodValidationPipe(ListApplicationRecordsQuerySchema))
    query: ListApplicationRecordsQuery,
  ) {
    return this.response(
      ConfigurationRecordListResponseSchema,
      await this.configuration.listApplicationRecords(
        tenantId,
        entityKey,
        await this.permissions(tenantId, actorId),
        query,
      ),
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
    return this.response(
      ConfigurationRecordDetailResponseSchema,
      await this.configuration.getApplicationRecord(
        tenantId,
        entityKey,
        recordId,
        await this.permissions(tenantId, actorId),
      ),
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
    return this.response(
      ConfigurationRecordMutationResponseSchema,
      await this.configuration.createApplicationRecord(
        tenantId,
        actorId,
        entityKey,
        dto,
        await this.permissions(tenantId, actorId),
      ),
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
    return this.response(
      ConfigurationRecordMutationResponseSchema,
      await this.configuration.updateApplicationRecord(
        tenantId,
        actorId,
        entityKey,
        recordId,
        dto,
        await this.permissions(tenantId, actorId),
      ),
    );
  }

  @Delete('apps/:entityKey/records/:recordId')
  @RequirePermissions('configuration-apps:write')
  async deleteRecord(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('recordId') recordId: string,
    @Body(new ZodValidationPipe(DeleteConfigurationRecordSchema)) dto: DeleteConfigurationRecordDto,
  ) {
    return this.response(
      ConfigurationRecordMutationResponseSchema,
      await this.configuration.deleteApplicationRecord(tenantId, actorId, entityKey, recordId, dto),
    );
  }

  @Post('change-sets')
  @HttpCode(201)
  @RequirePermissions('configuration:draft')
  async create(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(CreateConfigurationChangeSetSchema))
    dto: CreateConfigurationChangeSetDto,
  ) {
    return this.response(
      ConfigurationChangeSetResponseSchema,
      await this.configuration.createChangeSet(tenantId, actorId, dto),
    );
  }

  @Patch('change-sets/:id')
  @RequirePermissions('configuration:draft')
  async update(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateConfigurationChangeSetSchema))
    dto: UpdateConfigurationChangeSetDto,
  ) {
    return this.response(
      ConfigurationChangeSetResponseSchema,
      await this.configuration.updateChangeSet(tenantId, actorId, id, dto),
    );
  }

  @Post('change-sets/:id/submit')
  @HttpCode(200)
  @RequirePermissions('configuration:submit')
  async submit(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConfigurationReasonSchema)) dto: ConfigurationReasonDto,
  ) {
    return this.response(
      ConfigurationChangeSetResponseSchema,
      await this.configuration.submit(tenantId, actorId, id, dto),
    );
  }

  @Post('change-sets/:id/approve')
  @HttpCode(200)
  @RequirePermissions('configuration:approve')
  async approve(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConfigurationReasonSchema)) dto: ConfigurationReasonDto,
  ) {
    return this.response(
      ConfigurationChangeSetResponseSchema,
      await this.configuration.approve(tenantId, actorId, id, dto),
    );
  }

  @Post('change-sets/:id/reject')
  @HttpCode(200)
  @RequirePermissions('configuration:approve')
  async reject(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConfigurationReasonSchema)) dto: ConfigurationReasonDto,
  ) {
    return this.response(
      ConfigurationChangeSetResponseSchema,
      await this.configuration.reject(tenantId, actorId, id, dto),
    );
  }

  @Post('change-sets/:id/publish')
  @HttpCode(200)
  @RequirePermissions('configuration:publish')
  async publish(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConfigurationReasonSchema)) dto: ConfigurationReasonDto,
  ) {
    return this.response(
      ConfigurationPublishedVersionResponseSchema,
      await this.configuration.publish(tenantId, actorId, id, dto),
    );
  }

  @Post('activations')
  @HttpCode(201)
  @RequirePermissions('configuration:activate')
  async activate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(ActivateConfigurationSchema)) dto: ActivateConfigurationDto,
  ) {
    return this.response(
      ConfigurationActivationResponseSchema,
      await this.configuration.activate(tenantId, actorId, dto),
    );
  }

  @Post('activations/rollback')
  @HttpCode(201)
  @RequirePermissions('configuration:rollback')
  async rollback(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(ActivateConfigurationSchema)) dto: ActivateConfigurationDto,
  ) {
    return this.response(
      ConfigurationActivationResponseSchema,
      await this.configuration.rollback(tenantId, actorId, dto),
    );
  }

  // WI-OI-064c/121h: typed catalogues and the bounded Assistant tenant policy.
  @Get('catalogues')
  @RequirePermissions('configuration:read')
  async catalogues(@CurrentTenant('tenantId') tenantId: string) {
    return { items: await this.configuration.listGovernedCatalogues(tenantId) };
  }

  @Post('catalogues/install')
  @HttpCode(201)
  @RequirePermissions('configuration:draft')
  async installCatalogue(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(InstallGovernedCatalogueSchema)) dto: InstallGovernedCatalogueDto,
  ) {
    return this.response(
      ConfigurationChangeSetResponseSchema,
      await this.configuration.installGovernedCatalogue(tenantId, actorId, dto),
    );
  }

  @Get('catalogues/current')
  @RequirePermissions('configuration-runtime:read')
  async currentCatalogue(
    @CurrentTenant('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(GovernedCatalogueQuerySchema)) query: { kind: GovernedCatalogueKind; surfaceKey: string },
  ) {
    return this.configuration.currentGovernedCatalogue(tenantId, query.kind, query.surfaceKey);
  }

  /** WI-OI-107: the workspace's active industry and country packs, in the solution-layer format. */
  @Get('packs/active')
  @RequirePermissions('configuration-runtime:read')
  async activePacks(@CurrentTenant('tenantId') tenantId: string) {
    return this.configuration.activePacks(tenantId);
  }

  @Get('runtime/manifest')
  @RequirePermissions('configuration-runtime:read')
  async runtime(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Query(new ZodValidationPipe(ConfigurationRuntimeQuerySchema)) query: ConfigurationRuntimeQuery,
  ) {
    return this.response(
      ConfigurationRuntimeManifestResponseSchema,
      await this.configuration.runtimeManifest(
        tenantId,
        query.moduleKey,
        query.entityKey,
        query.surfaceKey,
        query.environmentKey,
        query.cohortKey,
        await this.permissions(tenantId, actorId),
      ),
    );
  }

  @Get('runtime/manifest/current')
  @RequirePermissions('configuration-runtime:read')
  async currentRuntime(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Query(new ZodValidationPipe(ConfigurationRuntimeCurrentQuerySchema))
    query: ConfigurationRuntimeCurrentQuery,
  ) {
    return this.response(
      ConfigurationRuntimeManifestCurrentResponseSchema,
      await this.configuration.currentRuntimeManifest(
        tenantId,
        query.moduleKey,
        query.entityKey,
        query.surfaceKey,
        await this.permissions(tenantId, actorId),
      ),
    );
  }

  @Get('runtime/manifest/preview')
  @RequirePermissions('configuration-runtime:read', 'configuration:read')
  async previewRuntime(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Query(new ZodValidationPipe(ConfigurationRuntimePreviewQuerySchema))
    query: ConfigurationRuntimePreviewQuery,
  ) {
    return this.response(
      ConfigurationRuntimeManifestResponseSchema,
      await this.configuration.previewRuntimeManifest(
        tenantId,
        actorId,
        query.moduleKey,
        query.entityKey,
        query.surfaceKey,
        query.environmentKey,
        query.cohortKey,
        await this.permissions(tenantId, actorId),
      ),
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
    return this.response(
      ConfigurationExtensionValueResponseSchema.nullable(),
      await this.configuration.getExtensionValues(
        tenantId,
        ownerType,
        ownerId,
        await this.permissions(tenantId, actorId),
      ),
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
    return this.response(
      ConfigurationExtensionValueResponseSchema,
      await this.configuration.saveExtensionValues(
        tenantId,
        actorId,
        ownerType,
        ownerId,
        dto,
        await this.permissions(tenantId, actorId),
      ),
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
    return this.response(
      ConfigurationTemplateListResponseSchema,
      await this.configuration.listTemplates(
        tenantId,
        entityKey,
        await this.permissions(tenantId, actorId),
      ),
    );
  }

  @Post('apps/:entityKey/templates')
  @HttpCode(201)
  @RequirePermissions('configuration-apps:write')
  async createTemplate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Body(new ZodValidationPipe(CreateConfigurationTemplateSchema))
    dto: CreateConfigurationTemplateDto,
  ) {
    return this.response(
      ConfigurationTemplateResponseSchema,
      await this.configuration.createTemplate(
        tenantId,
        entityKey,
        actorId,
        dto,
        await this.permissions(tenantId, actorId),
      ),
    );
  }

  @Put('apps/:entityKey/templates/:templateId')
  @RequirePermissions('configuration-apps:write')
  async updateTemplate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('templateId') templateId: string,
    @Body(new ZodValidationPipe(UpdateConfigurationTemplateSchema))
    dto: UpdateConfigurationTemplateDto,
  ) {
    return this.response(
      ConfigurationTemplateUpdateResponseSchema,
      await this.configuration.updateTemplate(
        tenantId,
        entityKey,
        templateId,
        actorId,
        dto,
        await this.permissions(tenantId, actorId),
      ),
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
    @Body(new ZodValidationPipe(DuplicateConfigurationTemplateSchema))
    dto: DuplicateConfigurationTemplateDto,
  ) {
    return this.response(
      ConfigurationTemplateResponseSchema,
      await this.configuration.duplicateTemplate(tenantId, entityKey, templateId, actorId, dto),
    );
  }

  @Delete('apps/:entityKey/templates/:templateId')
  @RequirePermissions('configuration-apps:write')
  async deleteTemplate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('templateId') templateId: string,
  ) {
    return this.response(
      ConfigurationDeletedResourceResponseSchema,
      await this.configuration.deleteTemplate(tenantId, entityKey, templateId, actorId),
    );
  }

  // ---------------------------------------------------------------------------
  // Saved filters (P1)
  // ---------------------------------------------------------------------------

  @Get('apps/:entityKey/saved-filters')
  @RequirePermissions('configuration-apps:read')
  async listSavedFilters(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('entityKey') entityKey: string,
  ) {
    return this.response(
      ConfigurationSavedFilterListResponseSchema,
      await this.configuration.listSavedFilters(tenantId, entityKey),
    );
  }

  @Post('apps/:entityKey/saved-filters')
  @HttpCode(201)
  @RequirePermissions('configuration-apps:read')
  async createSavedFilter(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Body(new ZodValidationPipe(CreateSavedFilterSchema)) dto: CreateSavedFilterDto,
  ) {
    return this.response(
      ConfigurationSavedFilterResponseSchema,
      await this.configuration.createSavedFilter(tenantId, entityKey, actorId, dto),
    );
  }

  @Delete('apps/:entityKey/saved-filters/:filterId')
  @RequirePermissions('configuration-apps:read')
  async deleteSavedFilter(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('entityKey') entityKey: string,
    @Param('filterId') filterId: string,
  ) {
    return this.response(
      ConfigurationDeletedSavedFilterResponseSchema,
      await this.configuration.deleteSavedFilter(tenantId, entityKey, filterId, actorId),
    );
  }
}
