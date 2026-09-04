import { CurrentUser } from '@gigalibs/auth-nest';
import {
  type CreateApRuleDto,
  CreateApRuleSchema,
  type DecideBusinessActionDto,
  DecideBusinessActionSchema,
  type ListBusinessActionsDto,
  ListBusinessActionsSchema,
  type ListSupplierInvoicesDto,
  ListSupplierInvoicesSchema,
  type PublishApRuleVersionDto,
  PublishApRuleVersionSchema,
} from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ApActionService } from './ap-action.service.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ApMatchingService } from './ap-matching.service.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ApPolicyService } from './ap-policy.service.js';

@Controller('ap')
export class ApController {
  constructor(
    private readonly policyService: ApPolicyService,
    private readonly matchingService: ApMatchingService,
    private readonly actionService: ApActionService,
  ) {}

  @Get('rules')
  @RequirePermissions('ap:read')
  listRules(@CurrentTenant('tenantId') tenantId: string) {
    return this.policyService.listRules(tenantId);
  }

  @Post('rules')
  @RequirePermissions('ap:configure')
  createRule(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateApRuleSchema)) dto: CreateApRuleDto,
  ) {
    return this.policyService.createRule(tenantId, userId, dto);
  }

  @Post('rules/:ruleId/publish')
  @RequirePermissions('ap:configure')
  publishRule(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('ruleId') ruleId: string,
    @Body(new ZodValidationPipe(PublishApRuleVersionSchema)) dto: PublishApRuleVersionDto,
  ) {
    return this.policyService.publishRule(tenantId, userId, ruleId, dto);
  }

  @Get('invoices')
  @RequirePermissions('ap:read')
  listInvoices(
    @CurrentTenant('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(ListSupplierInvoicesSchema)) query: ListSupplierInvoicesDto,
  ) {
    return this.actionService.listInvoices(tenantId, query);
  }

  @Get('invoices/:invoiceId')
  @RequirePermissions('ap:read')
  getInvoice(@CurrentTenant('tenantId') tenantId: string, @Param('invoiceId') invoiceId: string) {
    return this.actionService.getInvoice(tenantId, invoiceId);
  }

  @Post('invoices/:invoiceId/evaluate')
  @RequirePermissions('ap:evaluate')
  evaluateInvoice(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.matchingService.evaluate(tenantId, invoiceId);
  }

  @Get('actions')
  @RequirePermissions('actions:read')
  listActions(
    @CurrentTenant('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(ListBusinessActionsSchema)) query: ListBusinessActionsDto,
  ) {
    return this.actionService.listActions(tenantId, query);
  }

  @Get('actions/:actionId')
  @RequirePermissions('actions:read')
  getAction(@CurrentTenant('tenantId') tenantId: string, @Param('actionId') actionId: string) {
    return this.actionService.getAction(tenantId, actionId);
  }

  @Post('actions/:actionId/approve')
  @RequirePermissions('actions:approve')
  approveAction(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('actionId') actionId: string,
    @Body(new ZodValidationPipe(DecideBusinessActionSchema)) dto: DecideBusinessActionDto,
  ) {
    return this.actionService.approve(tenantId, userId, actionId, dto);
  }

  @Post('actions/:actionId/reject')
  @RequirePermissions('actions:approve')
  rejectAction(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('actionId') actionId: string,
    @Body(new ZodValidationPipe(DecideBusinessActionSchema)) dto: DecideBusinessActionDto,
  ) {
    return this.actionService.reject(tenantId, userId, actionId, dto);
  }
}
