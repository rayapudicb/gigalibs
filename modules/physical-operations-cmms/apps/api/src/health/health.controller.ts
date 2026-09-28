import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('v1/health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  /** Liveness: the process answers; it never touches dependencies. */
  @Get('live')
  live() {
    return { status: 'ok', service: 'gigalibs-cmms-api', timestamp: new Date().toISOString() };
  }

  /** Readiness: the schema is exactly at the image contract and the runtime role is least-privileged. */
  @Get(['', 'ready'])
  async ready() {
    try {
      const state = await this.database.readiness();
      return {
        status: 'ok',
        service: 'gigalibs-cmms-api',
        database: 'ready',
        schema: 'gigalibs_cmms',
        migrationVersion: state.migrationVersion,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException('CMMS runtime is not ready.');
    }
  }
}
