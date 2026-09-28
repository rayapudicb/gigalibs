import { Controller, Get, Param, Headers, Query, BadRequestException } from '@nestjs/common';
import { RunsService } from './runs.service.js';

@Controller('api/workflow/v1')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  private extractTenantId(tenantHeader?: string, tenantQuery?: string): string {
    const tenantId = tenantHeader || tenantQuery;
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }
    return tenantId;
  }

  @Get('runs')
  async listRuns(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
    @Query('limit') limitStr?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const runs = await this.runsService.getRuns(tenantId, limit);
    return {
      success: true,
      count: runs.length,
      runs,
    };
  }

  @Get('runs/ledger/verify')
  async verifyLedger(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const verification = await this.runsService.verifyLedger(tenantId);
    return {
      success: verification.valid,
      verification,
    };
  }

  @Get('runs/:runId')
  async getRun(
    @Param('runId') runId: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const run = await this.runsService.getRunById(tenantId, runId);
    return {
      success: true,
      run,
    };
  }

  @Get('stats')
  async getStats(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const stats = await this.runsService.getStats(tenantId);
    return {
      success: true,
      stats,
    };
  }
}
