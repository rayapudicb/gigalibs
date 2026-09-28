import { Controller, Get, Headers, Query, BadRequestException } from '@nestjs/common';
import { LogsService } from './logs.service.js';

@Controller('api/rules/v1')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  private extractTenantId(tenantHeader?: string, tenantQuery?: string): string {
    const tenantId = tenantHeader || tenantQuery;
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }
    return tenantId;
  }

  @Get('evaluation-logs')
  async getLogs(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
    @Query('limit') limitStr?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const logs = await this.logsService.getLogs(tenantId, limit);
    return {
      success: true,
      count: logs.length,
      logs,
    };
  }

  @Get('stats')
  async getStats(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const stats = await this.logsService.getStats(tenantId);
    return {
      success: true,
      ...stats,
    };
  }
}
