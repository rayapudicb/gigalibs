import { CurrentUser } from '@gigalibs/auth-nest';
import {
  type ActivateOrgHierarchyV1,
  ActivateOrgHierarchyV1Schema,
  type CreateOrgDraftVersionV1,
  CreateOrgDraftVersionV1Schema,
  type CreateOrgScopeGrantV1,
  CreateOrgScopeGrantV1Schema,
  type CreateOrgTreeV1,
  CreateOrgTreeV1Schema,
  type CreateOrgUnitTypeV1,
  CreateOrgUnitTypeV1Schema,
  type CreateOrgUnitPlaceLinkV1,
  CreateOrgUnitPlaceLinkV1Schema,
  type CreateOrgUnitV1,
  CreateOrgUnitV1Schema,
  type EndOrgUnitPlaceLinkV1,
  EndOrgUnitPlaceLinkV1Schema,
  type ImportOrgDepartmentsV1,
  ImportOrgDepartmentsV1Schema,
  ORGANIZATION_CLIENT_MANIFEST_V1,
  type OrgAsOfQuery,
  OrgAsOfQuerySchema,
  type OrgEdgeListQuery,
  OrgEdgeListQuerySchema,
  type OrgGrantListQuery,
  OrgGrantListQuerySchema,
  type OrgRecordStatusChangeV1,
  OrgRecordStatusChangeV1Schema,
  type OrgUnitListQuery,
  OrgUnitListQuerySchema,
  type OrgVersionCheckV1,
  OrgVersionCheckV1Schema,
  type OrgVersionTransitionV1,
  OrgVersionTransitionV1Schema,
  type RequestOrgSyncV1,
  RequestOrgSyncV1Schema,
  type RevokeOrgScopeGrantV1,
  RevokeOrgScopeGrantV1Schema,
  type UpdateOrgDraftEdgesV1,
  UpdateOrgDraftEdgesV1Schema,
  type UpdateOrgUnitTypeV1,
  UpdateOrgUnitTypeV1Schema,
  type UpdateOrgUnitV1,
  UpdateOrgUnitV1Schema,
} from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { CurrentTenant } from './decorators/current-tenant.decorator.js';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { OrganizationService } from './organization.service.js';

/** Only the header setter is needed from the HTTP response. */
interface HeaderTarget {
  setHeader(name: string, value: string): unknown;
}

// WI-OI-109c (ADR-0018): organization administration. OpenAPI: docs/contracts/organization/openapi.yaml.
// Tenant and actor come from the session; optimistic versions and idempotency keys travel in request bodies.
@Controller('tenants/current/organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  /** Versioned discovery metadata for generated web, tablet and phone clients (WI-OI-109f). */
  @Get('client-manifest')
  @RequirePermissions('organization:read')
  getClientManifest() {
    return ORGANIZATION_CLIENT_MANIFEST_V1;
  }

  // ─── Unit types ──────────────────────────────────────────────────────────────

  @Get('unit-types')
  @RequirePermissions('organization:read')
  listUnitTypes(@CurrentTenant('tenantId') tenantId: string) {
    return this.organization.listUnitTypes(tenantId);
  }

  @Post('unit-types')
  @RequirePermissions('organization:draft')
  createUnitType(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(CreateOrgUnitTypeV1Schema)) dto: CreateOrgUnitTypeV1,
  ) {
    return this.organization.createUnitType(tenantId, actorId, dto);
  }

  @Patch('unit-types/:unitTypeId')
  @RequirePermissions('organization:draft')
  updateUnitType(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('unitTypeId') unitTypeId: string,
    @Body(new ZodValidationPipe(UpdateOrgUnitTypeV1Schema)) dto: UpdateOrgUnitTypeV1,
  ) {
    return this.organization.updateUnitType(tenantId, actorId, unitTypeId, dto);
  }

  @Post('unit-types/:unitTypeId/archive')
  @HttpCode(200)
  @RequirePermissions('organization:draft')
  archiveUnitType(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('unitTypeId') unitTypeId: string,
    @Body(new ZodValidationPipe(OrgRecordStatusChangeV1Schema)) dto: OrgRecordStatusChangeV1,
  ) {
    return this.organization.setUnitTypeArchived(tenantId, actorId, unitTypeId, true, dto);
  }

  @Post('unit-types/:unitTypeId/restore')
  @HttpCode(200)
  @RequirePermissions('organization:draft')
  restoreUnitType(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('unitTypeId') unitTypeId: string,
    @Body(new ZodValidationPipe(OrgRecordStatusChangeV1Schema)) dto: OrgRecordStatusChangeV1,
  ) {
    return this.organization.setUnitTypeArchived(tenantId, actorId, unitTypeId, false, dto);
  }

  // ─── Units ───────────────────────────────────────────────────────────────────

  @Get('units')
  @RequirePermissions('organization:read')
  listUnits(
    @CurrentTenant('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(OrgUnitListQuerySchema)) query: OrgUnitListQuery,
  ) {
    return this.organization.listUnits(tenantId, query);
  }

  @Get('units/:unitId')
  @RequirePermissions('organization:read')
  async getUnit(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('unitId') unitId: string,
    @Res({ passthrough: true }) response: HeaderTarget,
  ) {
    const unit = await this.organization.getUnit(tenantId, unitId);
    response.setHeader('ETag', `"${unit.version}"`);
    return unit;
  }

  @Post('units')
  @RequirePermissions('organization:draft')
  createUnit(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(CreateOrgUnitV1Schema)) dto: CreateOrgUnitV1,
  ) {
    return this.organization.createUnit(tenantId, actorId, dto);
  }

  @Patch('units/:unitId')
  @RequirePermissions('organization:draft')
  updateUnit(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('unitId') unitId: string,
    @Body(new ZodValidationPipe(UpdateOrgUnitV1Schema)) dto: UpdateOrgUnitV1,
  ) {
    return this.organization.updateUnit(tenantId, actorId, unitId, dto);
  }

  @Post('units/:unitId/archive')
  @HttpCode(200)
  @RequirePermissions('organization:draft')
  archiveUnit(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('unitId') unitId: string,
    @Body(new ZodValidationPipe(OrgRecordStatusChangeV1Schema)) dto: OrgRecordStatusChangeV1,
  ) {
    return this.organization.setUnitArchived(tenantId, actorId, unitId, true, dto);
  }

  @Post('units/:unitId/restore')
  @HttpCode(200)
  @RequirePermissions('organization:draft')
  restoreUnit(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('unitId') unitId: string,
    @Body(new ZodValidationPipe(OrgRecordStatusChangeV1Schema)) dto: OrgRecordStatusChangeV1,
  ) {
    return this.organization.setUnitArchived(tenantId, actorId, unitId, false, dto);
  }

  @Get('units/:unitId/place-links')
  @RequirePermissions('organization:read')
  listPlaceLinks(@CurrentTenant('tenantId') tenantId: string, @Param('unitId') unitId: string) {
    return this.organization.listPlaceLinks(tenantId, unitId);
  }

  @Post('units/:unitId/place-links')
  @RequirePermissions('organization:draft')
  createPlaceLink(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('unitId') unitId: string,
    @Body(new ZodValidationPipe(CreateOrgUnitPlaceLinkV1Schema)) dto: CreateOrgUnitPlaceLinkV1,
  ) {
    return this.organization.createPlaceLink(tenantId, actorId, unitId, dto);
  }

  @Post('place-links/:linkId/end')
  @HttpCode(200)
  @RequirePermissions('organization:draft')
  endPlaceLink(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('linkId') linkId: string,
    @Body(new ZodValidationPipe(EndOrgUnitPlaceLinkV1Schema)) dto: EndOrgUnitPlaceLinkV1,
  ) {
    return this.organization.endPlaceLink(tenantId, actorId, linkId, dto);
  }

  @Post('departments/import')
  @HttpCode(200)
  @RequirePermissions('organization:draft')
  importDepartments(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(ImportOrgDepartmentsV1Schema)) dto: ImportOrgDepartmentsV1,
  ) {
    return this.organization.importDepartments(tenantId, actorId, dto);
  }

  // ─── Trees, versions and activation ──────────────────────────────────────────

  @Get('trees')
  @RequirePermissions('organization:read')
  listTrees(@CurrentTenant('tenantId') tenantId: string) {
    return this.organization.listTrees(tenantId);
  }

  @Post('trees')
  @RequirePermissions('organization:draft')
  createTree(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(CreateOrgTreeV1Schema)) dto: CreateOrgTreeV1,
  ) {
    return this.organization.createTree(tenantId, actorId, dto);
  }

  @Get('trees/:treeId/versions')
  @RequirePermissions('organization:read')
  listVersions(@CurrentTenant('tenantId') tenantId: string, @Param('treeId') treeId: string) {
    return this.organization.listVersions(tenantId, treeId);
  }

  @Post('trees/:treeId/versions')
  @RequirePermissions('organization:draft')
  createDraft(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('treeId') treeId: string,
    @Body(new ZodValidationPipe(CreateOrgDraftVersionV1Schema)) dto: CreateOrgDraftVersionV1,
  ) {
    return this.organization.createDraft(tenantId, actorId, treeId, dto);
  }

  @Get('trees/:treeId/active')
  @RequirePermissions('organization:read')
  getActive(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('treeId') treeId: string,
    @Query(new ZodValidationPipe(OrgAsOfQuerySchema)) query: OrgAsOfQuery,
  ) {
    return this.organization.getActive(tenantId, treeId, query);
  }

  @Post('trees/:treeId/sync')
  @HttpCode(200)
  @RequirePermissions('organization:activate')
  requestSync(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('treeId') treeId: string,
    @Body(new ZodValidationPipe(RequestOrgSyncV1Schema)) dto: RequestOrgSyncV1,
  ) {
    return this.organization.requestSync(tenantId, actorId, treeId, dto);
  }

  @Get('trees/:treeId/activations')
  @RequirePermissions('organization:read')
  listActivations(@CurrentTenant('tenantId') tenantId: string, @Param('treeId') treeId: string) {
    return this.organization.listActivations(tenantId, treeId);
  }

  @Get('versions/:versionId')
  @RequirePermissions('organization:read')
  async getVersion(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('versionId') versionId: string,
    @Res({ passthrough: true }) response: HeaderTarget,
  ) {
    const version = await this.organization.getVersion(tenantId, versionId);
    response.setHeader('ETag', `"${version.lockVersion}"`);
    return version;
  }

  @Get('versions/:versionId/edges')
  @RequirePermissions('organization:read')
  listEdges(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('versionId') versionId: string,
    @Query(new ZodValidationPipe(OrgEdgeListQuerySchema)) query: OrgEdgeListQuery,
  ) {
    return this.organization.listEdges(tenantId, versionId, query);
  }

  @Patch('versions/:versionId/edges')
  @RequirePermissions('organization:draft')
  updateEdges(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('versionId') versionId: string,
    @Body(new ZodValidationPipe(UpdateOrgDraftEdgesV1Schema)) dto: UpdateOrgDraftEdgesV1,
  ) {
    return this.organization.updateEdges(tenantId, actorId, versionId, dto);
  }

  @Get('versions/:versionId/impact')
  @RequirePermissions('organization:read')
  impact(@CurrentTenant('tenantId') tenantId: string, @Param('versionId') versionId: string) {
    return this.organization.impact(tenantId, versionId);
  }

  @Post('versions/:versionId/validate')
  @HttpCode(200)
  @RequirePermissions('organization:draft')
  validate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('versionId') versionId: string,
    @Body(new ZodValidationPipe(OrgVersionCheckV1Schema)) dto: OrgVersionCheckV1,
  ) {
    return this.organization.validate(tenantId, actorId, versionId, dto);
  }

  @Post('versions/:versionId/submit')
  @HttpCode(200)
  @RequirePermissions('organization:draft')
  submit(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('versionId') versionId: string,
    @Body(new ZodValidationPipe(OrgVersionTransitionV1Schema)) dto: OrgVersionTransitionV1,
  ) {
    return this.organization.submit(tenantId, actorId, versionId, dto);
  }

  @Post('versions/:versionId/withdraw')
  @HttpCode(200)
  @RequirePermissions('organization:draft')
  withdraw(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('versionId') versionId: string,
    @Body(new ZodValidationPipe(OrgVersionTransitionV1Schema)) dto: OrgVersionTransitionV1,
  ) {
    return this.organization.withdraw(tenantId, actorId, versionId, dto);
  }

  @Post('versions/:versionId/approve')
  @HttpCode(200)
  @RequirePermissions('organization:approve')
  approve(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('versionId') versionId: string,
    @Body(new ZodValidationPipe(OrgVersionTransitionV1Schema)) dto: OrgVersionTransitionV1,
  ) {
    return this.organization.approve(tenantId, actorId, versionId, dto);
  }

  @Post('versions/:versionId/reject')
  @HttpCode(200)
  @RequirePermissions('organization:approve')
  reject(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('versionId') versionId: string,
    @Body(new ZodValidationPipe(OrgVersionTransitionV1Schema)) dto: OrgVersionTransitionV1,
  ) {
    return this.organization.reject(tenantId, actorId, versionId, dto);
  }

  @Post('versions/:versionId/publish')
  @HttpCode(200)
  @RequirePermissions('organization:activate')
  publish(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('versionId') versionId: string,
    @Body(new ZodValidationPipe(OrgVersionTransitionV1Schema)) dto: OrgVersionTransitionV1,
  ) {
    return this.organization.publish(tenantId, actorId, versionId, dto);
  }

  @Post('activations')
  @RequirePermissions('organization:activate')
  activate(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(ActivateOrgHierarchyV1Schema)) dto: ActivateOrgHierarchyV1,
  ) {
    return this.organization.activate(tenantId, actorId, dto);
  }

  // ─── Member scope grants ─────────────────────────────────────────────────────

  @Get('grants')
  @RequirePermissions('organization:grant')
  listGrants(
    @CurrentTenant('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(OrgGrantListQuerySchema)) query: OrgGrantListQuery,
  ) {
    return this.organization.listGrants(tenantId, query);
  }

  @Post('grants')
  @RequirePermissions('organization:grant')
  createGrant(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(CreateOrgScopeGrantV1Schema)) dto: CreateOrgScopeGrantV1,
  ) {
    return this.organization.createGrant(tenantId, actorId, dto);
  }

  @Post('grants/:grantId/revoke')
  @HttpCode(200)
  @RequirePermissions('organization:grant')
  revokeGrant(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('grantId') grantId: string,
    @Body(new ZodValidationPipe(RevokeOrgScopeGrantV1Schema)) dto: RevokeOrgScopeGrantV1,
  ) {
    return this.organization.revokeGrant(tenantId, actorId, grantId, dto);
  }
}
