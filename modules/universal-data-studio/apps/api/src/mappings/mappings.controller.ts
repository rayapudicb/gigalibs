import { Controller, Get, Post, Body, Headers, BadRequestException } from '@nestjs/common';
import { MappingsService } from './mappings.service.js';

@Controller('api/data-studio/v1/mappings')
export class MappingsController {
  constructor(private readonly mappingsService: MappingsService) {}

  private extractTenant(tenantHeader?: string): string {
    if (!tenantHeader || tenantHeader.trim() === '') {
      throw new BadRequestException('x-tenant-id header is required');
    }
    return tenantHeader.trim();
  }

  @Get()
  async listMappings(@Headers('x-tenant-id') tenantHeader?: string) {
    const tenantId = this.extractTenant(tenantHeader);
    const mappings = await this.mappingsService.getMappings(tenantId);
    return {
      success: true,
      count: mappings.length,
      mappings,
    };
  }

  @Post()
  async createMapping(
    @Body() body: any,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader || body.tenant_id);
    const mapping = await this.mappingsService.createMapping(tenantId, body);
    return {
      success: true,
      mapping,
    };
  }

  @Post('transform')
  async transformPayload(
    @Body() body: { mapping_id: string; raw_data: any; rate_override_micros?: number | string },
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    return this.mappingsService.transformPayload(tenantId, body);
  }
}
