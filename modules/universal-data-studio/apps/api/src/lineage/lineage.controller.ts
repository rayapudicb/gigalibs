import { Controller, Get, Headers, BadRequestException } from '@nestjs/common';
import { LineageService } from './lineage.service.js';

@Controller('api/data-studio/v1/lineage')
export class LineageController {
  constructor(private readonly lineageService: LineageService) {}

  private extractTenant(tenantHeader?: string): string {
    if (!tenantHeader || tenantHeader.trim() === '') {
      throw new BadRequestException('x-tenant-id header is required');
    }
    return tenantHeader.trim();
  }

  @Get()
  async getLineageGraph(@Headers('x-tenant-id') tenantHeader?: string) {
    const tenantId = this.extractTenant(tenantHeader);
    return this.lineageService.getLineageGraph(tenantId);
  }
}
