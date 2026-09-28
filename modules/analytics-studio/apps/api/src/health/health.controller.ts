import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('v1/health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get('live')
  getLiveness() {
    return {
      status: 'ok',
      service: 'gigalibs-analytics-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(['', 'ready'])
  async getReadiness() {
    try {
      const state = await this.db.readiness();
      return {
        status: 'ok',
        service: 'gigalibs-analytics-api',
        database: 'ready',
        schema: 'gigalibs_analytics',
        migrationVersion: state.migrationVersion,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException('Analytics is not ready.');
    }
  }
}
