import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { WorkforceDatabaseService } from '../database/database.service.js';

@Controller('v1/health')
export class WorkforceHealthController {
  constructor(private readonly database: WorkforceDatabaseService) {}

  @Get('live')
  getLiveness() {
    return {
      status: 'ok',
      service: 'gigalibs-workforce-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(['', 'ready'])
  async getReadiness() {
    try {
      const state = await this.database.readiness();
      return {
        status: 'ok',
        service: 'gigalibs-workforce-api',
        database: 'ready',
        schema: 'gigalibs_workforce',
        migrationVersion: state.migrationVersion,
        businessCapabilitiesEnabled: false,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException('Workforce runtime is not ready.');
    }
  }
}
