import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live() {
    return { status: 'live', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready() {
    const isReady = await this.db.isReady();
    if (!isReady) {
      throw new ServiceUnavailableException('Spend API database dependencies not ready');
    }
    return { status: 'ready', timestamp: new Date().toISOString() };
  }
}
