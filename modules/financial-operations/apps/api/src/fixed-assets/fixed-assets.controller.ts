import {
  CreateFixedAssetClassInputV1Schema,
  CreateFixedAssetInputV1Schema,
  CapitalizeFixedAssetInputV1Schema,
  ExecuteDepreciationRunInputV1Schema,
  DisposeFixedAssetInputV1Schema,
} from '@gigalibs/contracts';
import {
  CurrentPrincipal,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { FixedAssetsService } from './fixed-assets.service.js';

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException(
      `Validation error: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    );
  }
  return parsed.data;
}

@Controller('v1/fixed-assets')
@UseGuards(AuthorizationGuard)
export class FixedAssetsController {
  constructor(private readonly fixedAssetsService: FixedAssetsService) {}

  // ─── 1. Fixed Asset Classes ──────────────────────────────────────────────────

  @Post('asset-classes')
  @RequirePermissions('finance:books:manage')
  async createAssetClass(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateFixedAssetClassInputV1Schema, body);
    return this.fixedAssetsService.createAssetClass(principal.tenantId, input);
  }

  @Get('asset-classes')
  @RequirePermissions('finance:reports:read')
  async listAssetClasses(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.fixedAssetsService.listAssetClasses(principal.tenantId);
  }

  @Get('asset-classes/:id')
  @RequirePermissions('finance:reports:read')
  async getAssetClass(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.fixedAssetsService.getAssetClass(principal.tenantId, id);
  }

  // ─── 2. Fixed Assets Register ────────────────────────────────────────────────

  @Post('assets')
  @RequirePermissions('finance:books:manage')
  async createFixedAsset(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateFixedAssetInputV1Schema, body);
    return this.fixedAssetsService.createFixedAsset(principal.tenantId, principal.subject, input);
  }

  @Get('assets')
  @RequirePermissions('finance:reports:read')
  async listFixedAssets(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('status') status?: string,
  ) {
    return this.fixedAssetsService.listFixedAssets(principal.tenantId, status);
  }

  @Get('assets/:id')
  @RequirePermissions('finance:reports:read')
  async getFixedAsset(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.fixedAssetsService.getFixedAsset(principal.tenantId, id);
  }

  @Post('assets/:id/capitalize')
  @RequirePermissions('finance:journals:post')
  async capitalizeFixedAsset(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(CapitalizeFixedAssetInputV1Schema, body);
    return this.fixedAssetsService.capitalizeFixedAsset(
      principal.tenantId,
      principal.subject,
      id,
      input,
    );
  }

  @Get('assets/:id/schedules')
  @RequirePermissions('finance:reports:read')
  async getAssetSchedules(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.fixedAssetsService.getAssetSchedules(principal.tenantId, id);
  }

  // ─── 3. Periodic Depreciation Runs ───────────────────────────────────────────

  @Post('depreciation-runs')
  @RequirePermissions('finance:journals:post')
  async executeDepreciationRun(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(ExecuteDepreciationRunInputV1Schema, body);
    return this.fixedAssetsService.executeDepreciationRun(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  // ─── 4. Asset Disposals ──────────────────────────────────────────────────────

  @Post('assets/:id/dispose')
  @RequirePermissions('finance:journals:post')
  async disposeFixedAsset(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(DisposeFixedAssetInputV1Schema, body);
    return this.fixedAssetsService.disposeFixedAsset(
      principal.tenantId,
      principal.subject,
      id,
      input,
    );
  }
}
