import {
  CreateAccountInputV1Schema,
  CreateAccountingBookInputV1Schema,
  CreateFiscalPeriodInputV1Schema,
  CreateFiscalYearInputV1Schema,
  GenerateStandardFiscalYearInputV1Schema,
  PostJournalInputV1Schema,
  ReverseJournalInputV1Schema,
  UpdateAccountInputV1Schema,
  UpdatePeriodStatusInputV1Schema,
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
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { FinanceService } from './finance.service.js';

@Controller('v1')
@UseGuards(AuthorizationGuard)
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  // ─── 1. Accounting Books ───────────────────────────────────────────────────

  @Get('books')
  @RequirePermissions('finance:read')
  async listBooks(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.service.listAccountingBooks(principal.tenantId);
  }

  @Post('books')
  @RequirePermissions('finance:books:manage')
  async createBook(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const input = parse(CreateAccountingBookInputV1Schema, body);
    return this.service.createAccountingBook(principal.tenantId, principal.subject, input);
  }

  @Get('books/:id')
  @RequirePermissions('finance:read')
  async getBook(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.service.getAccountingBook(principal.tenantId, id);
  }

  // ─── 2. Chart of Accounts ───────────────────────────────────────────────────

  @Get('accounts')
  @RequirePermissions('finance:read')
  async listAccounts(@CurrentPrincipal() principal: ModulePrincipal, @Query('bookId') bookId: string) {
    if (!bookId) throw new BadRequestException('Query param bookId is required');
    return this.service.listAccounts(principal.tenantId, bookId);
  }

  @Post('accounts')
  @RequirePermissions('finance:coa:manage')
  async createAccount(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const input = parse(CreateAccountInputV1Schema, body);
    return this.service.createAccount(principal.tenantId, principal.subject, input);
  }

  @Get('accounts/:id')
  @RequirePermissions('finance:read')
  async getAccount(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.service.getAccount(principal.tenantId, id);
  }

  @Put('accounts/:id')
  @RequirePermissions('finance:coa:manage')
  async updateAccount(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(UpdateAccountInputV1Schema, body);
    return this.service.updateAccount(principal.tenantId, principal.subject, id, input);
  }

  // ─── 3. Fiscal Years & Periods ──────────────────────────────────────────────

  @Post('fiscal-years')
  @RequirePermissions('finance:periods:manage')
  async createFiscalYear(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const input = parse(CreateFiscalYearInputV1Schema, body);
    return this.service.createFiscalYear(principal.tenantId, principal.subject, input);
  }

  @Post('fiscal-years/standard')
  @RequirePermissions('finance:periods:manage')
  async generateStandardFiscalYear(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const input = parse(GenerateStandardFiscalYearInputV1Schema, body);
    return this.service.generateStandardPeriods(principal.tenantId, principal.subject, input.accountingBookId, input.year);
  }

  @Get('fiscal-periods')
  @RequirePermissions('finance:read')
  async listFiscalPeriods(@CurrentPrincipal() principal: ModulePrincipal, @Query('bookId') bookId: string) {
    if (!bookId) throw new BadRequestException('Query param bookId is required');
    return this.service.listFiscalPeriods(principal.tenantId, bookId);
  }

  @Put('fiscal-periods/:id/status')
  @RequirePermissions('finance:periods:manage')
  async updatePeriodStatus(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(UpdatePeriodStatusInputV1Schema, body);
    return this.service.updatePeriodStatus(principal.tenantId, principal.subject, id, input);
  }

  // ─── 4. General Ledger Journals ─────────────────────────────────────────────

  @Get('journals')
  @RequirePermissions('finance:read')
  async listJournals(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('bookId') bookId: string,
    @Query('limit') limitStr?: string,
  ) {
    if (!bookId) throw new BadRequestException('Query param bookId is required');
    const limit = limitStr ? parseInt(limitStr, 10) : 100;
    return this.service.listJournals(principal.tenantId, bookId, limit);
  }

  @Post('journals')
  @RequirePermissions('finance:journals:post')
  async postJournal(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const input = parse(PostJournalInputV1Schema, body);
    return this.service.postJournal(principal.tenantId, principal.subject, input);
  }

  @Get('journals/:id')
  @RequirePermissions('finance:read')
  async getJournal(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.service.getJournal(principal.tenantId, id);
  }

  @Post('journals/:id/reverse')
  @HttpCode(200)
  @RequirePermissions('finance:journals:reverse')
  async reverseJournal(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = parse(ReverseJournalInputV1Schema, { ...(typeof body === 'object' && body !== null ? body : {}), journalId: id });
    return this.service.reverseJournal(principal.tenantId, principal.subject, parsed);
  }

  // ─── 5. Financial Statements & Reporting ────────────────────────────────────

  @Get('reports/trial-balance')
  @RequirePermissions('finance:reports:view')
  async getTrialBalance(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('bookId') bookId: string,
    @Query('asOfDate') asOfDate: string,
  ) {
    if (!bookId || !asOfDate) {
      throw new BadRequestException('Query params bookId and asOfDate are required');
    }
    return this.service.generateTrialBalance(principal.tenantId, bookId, asOfDate);
  }

  @Get('reports/balance-sheet')
  @RequirePermissions('finance:reports:view')
  async getBalanceSheet(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('bookId') bookId: string,
    @Query('asOfDate') asOfDate: string,
  ) {
    if (!bookId || !asOfDate) {
      throw new BadRequestException('Query params bookId and asOfDate are required');
    }
    return this.service.generateBalanceSheet(principal.tenantId, bookId, asOfDate);
  }

  @Get('reports/income-statement')
  @RequirePermissions('finance:reports:view')
  async getIncomeStatement(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('bookId') bookId: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    if (!bookId || !fromDate || !toDate) {
      throw new BadRequestException('Query params bookId, fromDate, and toDate are required');
    }
    return this.service.generateIncomeStatement(principal.tenantId, bookId, fromDate, toDate);
  }
}

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
