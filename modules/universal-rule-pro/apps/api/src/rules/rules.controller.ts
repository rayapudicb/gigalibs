import { Controller, Get, Post, Patch, Body, Param, Query, Headers, BadRequestException } from '@nestjs/common';
import { RulesService, RuleDto, LifecycleStatus } from './rules.service.js';

@Controller('api/rules/v1/rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  private extractTenantId(tenantHeader?: string, tenantQuery?: string, bodyTenant?: string): string {
    const tenantId = tenantHeader || tenantQuery || bodyTenant;
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }
    return tenantId;
  }

  @Get()
  async listRules(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
    @Query('domain') domain?: string,
    @Query('scope') scope?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
    @Query('lifecycle_status') lifecycleStatus?: string,
    @Query('search') search?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const rules = await this.rulesService.getRules(tenantId, domain, scope, department, status, lifecycleStatus, search);
    return {
      success: true,
      count: rules.length,
      rules,
    };
  }

  @Get(':id')
  async getRule(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const rule = await this.rulesService.getRuleById(tenantId, id);
    return {
      success: true,
      rule,
    };
  }

  @Post()
  async createRule(
    @Body() body: RuleDto & { tenant_id?: string; creator_id?: string },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery, body.tenant_id);
    const rule = await this.rulesService.createRule(tenantId, body, body.creator_id);
    return {
      success: true,
      rule,
    };
  }

  @Post(':id/versions')
  async publishVersion(
    @Param('id') id: string,
    @Body() body: {
      version: string;
      approver_id: string;
      condition_ast?: any;
      condition_expression?: string;
      action_type?: string;
      action_params?: any;
    },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const rule = await this.rulesService.publishRuleVersion(
      tenantId,
      id,
      body.version,
      body.approver_id,
      body.condition_ast,
      body.condition_expression,
      body.action_type,
      body.action_params,
    );
    return {
      success: true,
      rule,
    };
  }

  @Patch(':id/lifecycle')
  async updateLifecycle(
    @Param('id') id: string,
    @Body() body: { lifecycle_status: LifecycleStatus; approver_id?: string },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const rule = await this.rulesService.updateRuleLifecycle(
      tenantId,
      id,
      body.lifecycle_status,
      body.approver_id,
    );
    return {
      success: true,
      rule,
    };
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const rule = await this.rulesService.updateRuleStatus(tenantId, id, status);
    return {
      success: true,
      rule,
    };
  }
}
