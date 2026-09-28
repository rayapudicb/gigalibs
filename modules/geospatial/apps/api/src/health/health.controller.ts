import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { GeospatialDatabaseService } from '../database/database.service.js';

@Controller('v1/health')
export class GeospatialHealthController {
  constructor(private readonly database: GeospatialDatabaseService) {}

  @Get('live')
  getLiveness() {
    return {
      status: 'ok',
      service: 'gigalibs-geospatial-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(['', 'ready'])
  async getReadiness() {
    try {
      const state = await this.database.readiness();
      return {
        status: 'ok',
        service: 'gigalibs-geospatial-api',
        database: 'ready',
        schema: 'gigalibs_geospatial',
        migrationVersion: state.migrationVersion,
        businessCapabilitiesEnabled: true,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException('Geospatial runtime is not ready.');
    }
  }
}
