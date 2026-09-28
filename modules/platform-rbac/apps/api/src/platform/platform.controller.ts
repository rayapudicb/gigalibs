import { Controller, Get, Post, Put, Param, Body, Query } from '@nestjs/common';
import { PlatformService } from './platform.service.js';

@Controller('api/platform/v1')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('metrics')
  async getMetrics() {
    return this.platformService.getMetrics();
  }

  @Get('tenants')
  async getTenants(
    @Query('search') search?: string,
    @Query('planTier') planTier?: string,
    @Query('status') status?: string,
  ) {
    return this.platformService.getTenants({ search, planTier, status });
  }

  @Get('tenants/:id')
  async getTenantById(@Param('id') id: string) {
    return this.platformService.getTenantById(id);
  }

  @Post('tenants')
  async provisionTenant(
    @Body()
    body: {
      name: string;
      slug: string;
      subdomain: string;
      planTier: string;
      primaryContactEmail: string;
      entitledModules: string[];
    },
  ) {
    return this.platformService.provisionTenant(body);
  }

  @Post('tenants/:id/entitlements')
  async updateEntitlements(
    @Param('id') id: string,
    @Body() body: { modules: string[]; reason?: string },
  ) {
    return this.platformService.updateEntitlements(id, body.modules, body.reason);
  }

  @Post('tenants/:id/impersonate')
  async impersonateTenant(
    @Param('id') id: string,
    @Body() body: { adminUserId: string; reason: string; ticketNumber: string },
  ) {
    return this.platformService.impersonateTenant(id, body.adminUserId, body.reason, body.ticketNumber);
  }

  @Get('settings')
  async getSettings() {
    return this.platformService.getSettings();
  }

  @Put('settings/:key')
  async updateSetting(
    @Param('key') key: string,
    @Body() body: { value: any; updatedBy?: string },
  ) {
    return this.platformService.updateSetting(key, body.value, body.updatedBy);
  }

  @Get('staff')
  async getStaff() {
    return this.platformService.getStaff();
  }

  @Post('staff')
  async createStaff(
    @Body() body: { name: string; email: string; role: string; productAccess?: string[] },
  ) {
    return this.platformService.createStaff(body);
  }

  @Get('audit')
  async getAuditLogs() {
    return this.platformService.getAuditLogs();
  }

  @Get('plans')
  async getPlans() {
    return this.platformService.getPlans();
  }

  @Put('plans/:code')
  async updatePlan(
    @Param('code') code: string,
    @Body() body: any,
  ) {
    return this.platformService.updatePlan(code, body);
  }

  @Get('dimensions')
  async getDimensions() {
    return this.platformService.getDimensions();
  }

  @Put('dimensions/:code')
  async updateDimension(
    @Param('code') code: string,
    @Body() body: any,
  ) {
    return this.platformService.updateDimension(code, body);
  }

  @Post('tenants/onboard')
  async onboardTenant(@Body() body: any) {
    return this.platformService.onboardTenant(body);
  }

  @Get('recharge-packs')
  async getRechargePacks() {
    return this.platformService.getRechargePacks();
  }

  @Post('recharge-packs')
  async createRechargePack(@Body() body: any) {
    return this.platformService.createRechargePack(body);
  }

  @Put('recharge-packs/:id')
  async updateRechargePack(@Param('id') id: string, @Body() body: any) {
    return this.platformService.updateRechargePack(id, body);
  }

  @Get('tenants/:id/wallets')
  async getTenantWallets(@Param('id') id: string) {
    return this.platformService.getTenantWallets(id);
  }

  @Post('tenants/:id/wallets/adjust')
  async adjustTenantWallet(@Param('id') id: string, @Body() body: any) {
    return this.platformService.adjustTenantWallet(id, body);
  }
}
