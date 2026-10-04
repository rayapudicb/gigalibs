import {
  CreateConsolidationGroupInputV1Schema,
  AddConsolidationEntityInputV1Schema,
  SetConsolidationFxRateInputV1Schema,
  CreateIntercompanyPairInputV1Schema,
  ExecuteConsolidationRunInputV1Schema,
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
import { ConsolidationService } from './consolidation.service.js';

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

@Controller('v1/consolidation')
@UseGuards(AuthorizationGuard)
export class ConsolidationController {
  constructor(private readonly consolidationService: ConsolidationService) {}

  // ─── 1. Consolidation Groups ────────────────────────────────────────────────

  @Post('groups')
  @RequirePermissions('finance:books:manage')
  async createGroup(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateConsolidationGroupInputV1Schema, body);
    return this.consolidationService.createConsolidationGroup(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  @Get('groups')
  @RequirePermissions('finance:reports:read')
  async listGroups(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.consolidationService.getConsolidationGroups(principal.tenantId);
  }

  @Get('groups/:id')
  @RequirePermissions('finance:reports:read')
  async getGroup(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.consolidationService.getConsolidationGroup(principal.tenantId, id);
  }

  // ─── 2. Consolidation Entities ──────────────────────────────────────────────

  @Post('groups/:id/entities')
  @RequirePermissions('finance:books:manage')
  async addEntity(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') groupId: string,
    @Body() body: unknown,
  ) {
    const input = parse(AddConsolidationEntityInputV1Schema, body);
    return this.consolidationService.addConsolidationEntity(
      principal.tenantId,
      groupId,
      input,
    );
  }

  @Get('groups/:id/entities')
  @RequirePermissions('finance:reports:read')
  async listEntities(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') groupId: string,
  ) {
    return this.consolidationService.getConsolidationEntities(principal.tenantId, groupId);
  }

  // ─── 3. Consolidation FX Rates ──────────────────────────────────────────────

  @Post('groups/:id/fx-rates')
  @RequirePermissions('finance:books:manage')
  async setFxRate(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') groupId: string,
    @Body() body: unknown,
  ) {
    const input = parse(SetConsolidationFxRateInputV1Schema, body);
    return this.consolidationService.setConsolidationFxRate(
      principal.tenantId,
      groupId,
      input,
    );
  }

  @Get('groups/:id/fx-rates')
  @RequirePermissions('finance:reports:read')
  async listFxRates(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') groupId: string,
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
  ) {
    return this.consolidationService.getConsolidationFxRates(
      principal.tenantId,
      groupId,
      fiscalPeriodId,
    );
  }

  // ─── 4. Intercompany Account Pairs ──────────────────────────────────────────

  @Post('groups/:id/intercompany-pairs')
  @RequirePermissions('finance:books:manage')
  async createIntercompanyPair(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') groupId: string,
    @Body() body: unknown,
  ) {
    const input = parse(CreateIntercompanyPairInputV1Schema, body);
    return this.consolidationService.createIntercompanyPair(
      principal.tenantId,
      groupId,
      input,
    );
  }

  @Get('groups/:id/intercompany-pairs')
  @RequirePermissions('finance:reports:read')
  async listIntercompanyPairs(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') groupId: string,
  ) {
    return this.consolidationService.getIntercompanyPairs(principal.tenantId, groupId);
  }

  // ─── 5. Consolidation Runs ──────────────────────────────────────────────────

  @Post('runs')
  @RequirePermissions('finance:journals:post')
  async executeRun(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(ExecuteConsolidationRunInputV1Schema, body);
    return this.consolidationService.executeConsolidationRun(principal.tenantId, input);
  }

  @Get('runs/:id')
  @RequirePermissions('finance:reports:read')
  async getRun(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.consolidationService.getConsolidationRun(principal.tenantId, id);
  }

  @Post('runs/:id/seal')
  @RequirePermissions('finance:journals:post')
  async sealRun(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.consolidationService.sealConsolidationRun(principal.tenantId, id);
  }

  @Get('runs/:id/statement')
  @RequirePermissions('finance:reports:read')
  async getStatement(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.consolidationService.getConsolidatedFinancialStatement(
      principal.tenantId,
      id,
    );
  }
}
