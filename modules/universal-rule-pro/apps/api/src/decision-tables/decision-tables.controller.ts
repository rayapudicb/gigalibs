import { Controller, Get, Post, Body, Param, Query, Headers, BadRequestException } from '@nestjs/common';
import { DecisionTablesService, DecisionTableDto } from './decision-tables.service.js';

@Controller('api/rules/v1/decision-tables')
export class DecisionTablesController {
  constructor(private readonly decisionTablesService: DecisionTablesService) {}

  private extractTenantId(tenantHeader?: string, tenantQuery?: string, bodyTenant?: string): string {
    const tenantId = tenantHeader || tenantQuery || bodyTenant;
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }
    return tenantId;
  }

  @Get()
  async listTables(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
    @Query('domain') domain?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const tables = await this.decisionTablesService.listTables(tenantId, domain);
    return {
      success: true,
      count: tables.length,
      tables,
    };
  }

  @Get(':idOrCode')
  async getTable(
    @Param('idOrCode') idOrCode: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const table = await this.decisionTablesService.getTable(tenantId, idOrCode);
    return {
      success: true,
      table,
    };
  }

  @Post()
  async createTable(
    @Body() body: DecisionTableDto & { tenant_id?: string },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery, body.tenant_id);
    const table = await this.decisionTablesService.createTable(tenantId, body);
    return {
      success: true,
      table,
    };
  }

  @Post('evaluate')
  async evaluate(
    @Body() body: { table_code: string; input_context: Record<string, any>; tenant_id?: string; preview?: boolean },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery, body.tenant_id);
    return this.decisionTablesService.evaluateTable(
      tenantId,
      body.table_code,
      body.input_context,
      Boolean(body.preview),
    );
  }
}
