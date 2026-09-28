import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { SyncService, SyncOptions } from './sync.service.js';

@Controller('api/connectors/v1')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  private extractTenant(tenantHeader?: string): string {
    if (!tenantHeader || tenantHeader.trim() === '') {
      throw new BadRequestException('x-tenant-id header is required');
    }
    return tenantHeader.trim();
  }

  @Get('journal')
  async getJournal(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('limit') limitStr?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const journal = await this.syncService.getJournal(tenantId, limit);
    return {
      success: true,
      count: journal.length,
      journal,
    };
  }

  @Post('connections/:id/sync')
  async triggerSync(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Body() options?: SyncOptions,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    return this.syncService.triggerSync(tenantId, id, options);
  }

  @Get('stats')
  async getStats(@Headers('x-tenant-id') tenantHeader?: string) {
    const tenantId = this.extractTenant(tenantHeader);
    const stats = await this.syncService.getStats(tenantId);
    return {
      success: true,
      stats,
    };
  }
}
