import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SCHEMA } from './config.js';
import { DatabaseService } from './database.service.js';

@Controller('v1/health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  live() {
    return { status: 'ok', service: 'gigalibs-product-catalogue-api', timestamp: new Date().toISOString() };
  }

  @Get(['', 'ready'])
  async ready() {
    try {
      const state = await this.database.readiness();
      return { status: 'ok', service: 'gigalibs-product-catalogue-api', database: 'ready', schema: SCHEMA, migrationVersion: state.migrationVersion, timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('Product Catalogue runtime is not ready.');
    }
  }
}
