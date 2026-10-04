import {
  CreateBankAccountInputV1Schema,
  ImportBankStatementInputV1Schema,
  AutoMatchInputV1Schema,
  ManualMatchInputV1Schema,
  CreateFeeAdjustmentInputV1Schema,
  SealReconciliationInputV1Schema,
  CreateReconciliationSessionInputV1Schema,
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
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { TreasuryService } from './treasury.service.js';

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

@Controller('v1/treasury')
@UseGuards(AuthorizationGuard)
export class TreasuryController {
  constructor(private readonly treasuryService: TreasuryService) {}

  // ─── Bank Accounts ───────────────────────────────────────────────────────────

  @Post('bank-accounts')
  @RequirePermissions('finance:books:manage')
  async createBankAccount(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateBankAccountInputV1Schema, body);
    return this.treasuryService.createBankAccount(principal.tenantId, principal.subject, input);
  }

  @Get('bank-accounts')
  @RequirePermissions('finance:read')
  async listBankAccounts(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.treasuryService.listBankAccounts(principal.tenantId);
  }

  @Get('bank-accounts/:id')
  @RequirePermissions('finance:read')
  async getBankAccount(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.treasuryService.getBankAccount(principal.tenantId, id);
  }

  // ─── Bank Statements ─────────────────────────────────────────────────────────

  @Post('bank-statements/import')
  @RequirePermissions('finance:journals:manage')
  async importStatement(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(ImportBankStatementInputV1Schema, body);
    return this.treasuryService.importStatement(principal.tenantId, principal.subject, input);
  }

  @Get('bank-statements')
  @RequirePermissions('finance:read')
  async listBankStatements(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('bankAccountId') bankAccountId: string,
  ) {
    return this.treasuryService.listBankStatements(principal.tenantId, bankAccountId);
  }

  @Get('bank-statements/:id')
  @RequirePermissions('finance:read')
  async getBankStatement(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.treasuryService.getBankStatement(principal.tenantId, id);
  }

  // ─── Reconciliation Sessions ─────────────────────────────────────────────────

  @Post('reconciliations/sessions')
  @RequirePermissions('finance:journals:manage')
  async createSession(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateReconciliationSessionInputV1Schema, body);
    return this.treasuryService.createReconciliationSession(
      principal.tenantId,
      principal.subject,
      input.bankAccountId,
      input.statementId,
      input.reconciliationDate,
    );
  }

  @Get('reconciliations/sessions')
  @RequirePermissions('finance:read')
  async getSession(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('bankAccountId') bankAccountId: string,
    @Query('statementId') statementId: string,
  ) {
    return this.treasuryService.getReconciliationSession(principal.tenantId, bankAccountId, statementId);
  }

  @Post('reconciliations/auto-match')
  @RequirePermissions('finance:journals:manage')
  async autoMatch(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(AutoMatchInputV1Schema, body);
    return this.treasuryService.autoMatch(principal.tenantId, principal.subject, input);
  }

  @Post('reconciliations/manual-match')
  @RequirePermissions('finance:journals:manage')
  async manualMatch(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(ManualMatchInputV1Schema, body);
    return this.treasuryService.manualMatch(principal.tenantId, principal.subject, input);
  }

  @Delete('reconciliations/matches/:id')
  @RequirePermissions('finance:journals:manage')
  async unmatch(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') matchId: string,
  ) {
    await this.treasuryService.unmatch(principal.tenantId, principal.subject, matchId);
    return { success: true };
  }

  @Post('reconciliations/fee-adjustments')
  @RequirePermissions('finance:journals:post')
  async createFeeAdjustment(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateFeeAdjustmentInputV1Schema, body);
    return this.treasuryService.createFeeAdjustment(principal.tenantId, principal.subject, input);
  }

  @Post('reconciliations/seal')
  @RequirePermissions('finance:journals:post')
  async sealReconciliation(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(SealReconciliationInputV1Schema, body);
    return this.treasuryService.sealReconciliation(principal.tenantId, principal.subject, input);
  }

  @Get('reconciliations/:id/report')
  @RequirePermissions('finance:reports:view')
  async getReconciliationReport(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') reconciliationId: string,
  ) {
    return this.treasuryService.getReconciliationReport(principal.tenantId, reconciliationId);
  }
}
