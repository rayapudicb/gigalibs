import { Controller, Get, Post, Param, Body, Query, Headers, BadRequestException } from '@nestjs/common';
import { DriftService } from './drift.service.js';

@Controller('api/data-studio/v1/drift')
export class DriftController {
  constructor(private readonly driftService: DriftService) {}

  private extractTenant(tenantHeader?: string): string {
    if (!tenantHeader || tenantHeader.trim() === '') {
      throw new BadRequestException('x-tenant-id header is required');
    }
    return tenantHeader.trim();
  }

  @Get()
  async getDriftLogs(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('limit') limitStr?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const logs = await this.driftService.getDriftLogs(tenantId, limit);
    return {
      success: true,
      count: logs.length,
      drift_logs: logs,
    };
  }

  @Post(':id/resolve')
  async resolveDrift(
    @Param('id') id: string,
    @Body('notes') notes: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    return this.driftService.resolveDrift(tenantId, id, notes);
  }
}
