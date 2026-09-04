import { Controller, Get, Post, Body, Param, Put, Delete, Query } from '@nestjs/common';
import { BillingService, CreatePlanDto, SubscribeDto, ChangePlanDto } from './billing.service.js';

@Controller('api/v1/billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  async getPlans() {
    return this.billingService.getPlans();
  }

  @Get('plans/:slug')
  async getPlan(@Param('slug') slug: string) {
    return this.billingService.getPlanBySlug(slug);
  }

  @Post('plans')
  async upsertPlan(@Body() dto: CreatePlanDto) {
    return this.billingService.upsertPlan(dto);
  }

  @Get('subscription/:tenantId')
  async getTenantSubscription(@Param('tenantId') tenantId: string) {
    return this.billingService.getTenantSubscription(tenantId);
  }

  @Post('subscribe')
  async subscribe(@Body() dto: SubscribeDto) {
    return this.billingService.subscribe(dto);
  }

  @Put('subscription/change-plan')
  async changePlan(@Body() dto: ChangePlanDto) {
    return this.billingService.changePlan(dto);
  }

  @Delete('subscription/:id')
  async cancelSubscription(
    @Param('id') id: string,
    @Query('atPeriodEnd') atPeriodEnd?: string
  ) {
    return this.billingService.cancelSubscription(id, atPeriodEnd === 'true');
  }

  @Get('invoices/:tenantId')
  async getInvoices(@Param('tenantId') tenantId: string) {
    return this.billingService.getInvoices(tenantId);
  }
}
