import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('api/connectors/v1/health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get('live')
  getLiveness() {
    return {
      status: 'ok',
      service: 'universal-connector-hub',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(['', 'ready'])
  async getReadiness() {
    try {
      const state = await this.db.readiness();
      return {
        status: 'ok',
        service: 'universal-connector-hub',
        port: 4100,
        database: 'ready',
        schema: 'gigalibs_connectors',
        migrationVersion: state.migrationVersion,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException('Connector Hub is not ready.');
    }
  }
}
