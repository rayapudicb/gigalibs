import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { PlatformContextAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { CurrentPrincipal } from '../auth/principal.decorator.js';
import { FormulaMeasureService } from './formula-measure.service.js';

@Controller('v1/formula-measures')
@UseGuards(PlatformContextAuthorizationGuard)
export class FormulaMeasureController {
  constructor(private readonly formulas: FormulaMeasureService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('analytics:models:write')
  create(@CurrentPrincipal() principal: AnalyticsPrincipal, @Body() body: unknown) {
    return this.formulas.create(principal, body);
  }

  @Get('model/:semanticModelId')
  @RequirePermissions('analytics:read')
  list(@CurrentPrincipal() principal: AnalyticsPrincipal, @Param('semanticModelId') semanticModelId: string) {
    return this.formulas.listForModel(principal, semanticModelId);
  }

  @Get(':formulaMeasureId')
  @RequirePermissions('analytics:read')
  get(@CurrentPrincipal() principal: AnalyticsPrincipal, @Param('formulaMeasureId') formulaMeasureId: string) {
    return this.formulas.get(principal, formulaMeasureId);
  }

  @Post(':formulaMeasureId/versions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('analytics:models:write')
  createVersion(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('formulaMeasureId') formulaMeasureId: string,
    @Body() body: unknown,
  ) {
    return this.formulas.createVersion(principal, formulaMeasureId, body);
  }

  @Post(':formulaMeasureId/versions/:versionId/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('analytics:models:write')
  submit(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('formulaMeasureId') formulaMeasureId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    return this.formulas.submit(principal, formulaMeasureId, versionId, body);
  }

  @Post(':formulaMeasureId/versions/:versionId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('analytics:models:publish')
  approve(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('formulaMeasureId') formulaMeasureId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    return this.formulas.approve(principal, formulaMeasureId, versionId, body);
  }

  @Post(':formulaMeasureId/versions/:versionId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('analytics:models:publish')
  reject(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('formulaMeasureId') formulaMeasureId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    return this.formulas.reject(principal, formulaMeasureId, versionId, body);
  }
}
