import {
  CreateBudgetStructureInputV1Schema,
  CreateBudgetRevisionInputV1Schema,
  CreateBudgetLineInputV1Schema,
  CheckBudgetAvailabilityInputV1Schema,
  RecordCommitmentInputV1Schema,
  LiquidateCommitmentInputV1Schema,
  ReleaseCommitmentInputV1Schema,
  DistributeAnnualBudgetInputV1Schema,
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
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { BudgetingService } from './budgeting.service.js';

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

@Controller('v1/budgeting')
@UseGuards(AuthorizationGuard)
export class BudgetingController {
  constructor(private readonly budgetingService: BudgetingService) {}

  // ─── 1. Budget Structures ───────────────────────────────────────────────────

  @Post('structures')
  @RequirePermissions('finance:books:manage')
  async createStructure(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateBudgetStructureInputV1Schema, body);
    return this.budgetingService.createBudgetStructure(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  @Get('structures')
  @RequirePermissions('finance:read')
  async listStructures(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.budgetingService.listBudgetStructures(principal.tenantId);
  }

  @Get('structures/:id')
  @RequirePermissions('finance:read')
  async getStructure(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.budgetingService.getBudgetStructure(principal.tenantId, id);
  }

  // ─── 2. Budget Revisions ───────────────────────────────────────────────────

  @Post('revisions')
  @RequirePermissions('finance:books:manage')
  async createRevision(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateBudgetRevisionInputV1Schema, body);
    return this.budgetingService.createBudgetRevision(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  @Get('revisions/:id')
  @RequirePermissions('finance:read')
  async getRevision(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.budgetingService.getBudgetRevision(principal.tenantId, id);
  }

  @Post('revisions/:id/submit')
  @RequirePermissions('finance:journals:manage')
  async submitRevision(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.budgetingService.submitBudgetRevision(
      principal.tenantId,
      principal.subject,
      id,
    );
  }

  @Post('revisions/:id/approve')
  @RequirePermissions('finance:journals:post')
  async approveRevision(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.budgetingService.approveBudgetRevision(
      principal.tenantId,
      principal.subject,
      id,
    );
  }

  @Post('revisions/:id/activate')
  @RequirePermissions('finance:journals:post')
  async activateRevision(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.budgetingService.activateBudgetRevision(
      principal.tenantId,
      principal.subject,
      id,
    );
  }

  @Post('revisions/:id/freeze')
  @RequirePermissions('finance:journals:post')
  async freezeRevision(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.budgetingService.freezeBudgetRevision(
      principal.tenantId,
      principal.subject,
      id,
    );
  }

  // ─── 3. Budget Lines & Distribution ─────────────────────────────────────────

  @Post('lines')
  @RequirePermissions('finance:journals:manage')
  async createLine(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateBudgetLineInputV1Schema, body);
    return this.budgetingService.createBudgetLine(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  @Post('distribute-annual')
  @RequirePermissions('finance:journals:manage')
  async distributeAnnual(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(DistributeAnnualBudgetInputV1Schema, body);
    return this.budgetingService.distributeAnnualBudget(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  // ─── 4. Availability Check Gate ─────────────────────────────────────────────

  @Post('check-availability')
  @RequirePermissions('finance:read')
  async checkAvailability(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CheckBudgetAvailabilityInputV1Schema, body);
    return this.budgetingService.checkBudgetAvailability(principal.tenantId, input);
  }

  // ─── 5. Commitments ─────────────────────────────────────────────────────────

  @Post('commitments')
  @RequirePermissions('finance:journals:manage')
  async recordCommitment(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(RecordCommitmentInputV1Schema, body);
    return this.budgetingService.recordCommitment(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  @Post('commitments/liquidate')
  @RequirePermissions('finance:journals:manage')
  async liquidateCommitment(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(LiquidateCommitmentInputV1Schema, body);
    return this.budgetingService.liquidateCommitment(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  @Post('commitments/release')
  @RequirePermissions('finance:journals:manage')
  async releaseCommitment(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(ReleaseCommitmentInputV1Schema, body);
    return this.budgetingService.releaseCommitment(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  // ─── 6. Variance Reporting ──────────────────────────────────────────────────

  @Get('revisions/:id/variance')
  @RequirePermissions('finance:reports:view')
  async getVarianceReport(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.budgetingService.getBudgetVarianceReport(principal.tenantId, id);
  }
}
