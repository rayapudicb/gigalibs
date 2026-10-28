import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SCHEMA } from './config.js';
import { DatabaseService } from './database.service.js';

@Controller('v1/health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  /** Liveness: the process answers; it never touches dependencies. */
  @Get('live')
  live() {
    return { status: 'ok', service: 'gigalibs-business-partners-api', timestamp: new Date().toISOString() };
  }

  /** Readiness: the schema is exactly at the image contract and the runtime role is least-privileged. */
  @Get(['', 'ready'])
  async ready() {
    try {
      const state = await this.database.readiness();
      return {
        status: 'ok',
        service: 'gigalibs-business-partners-api',
        database: 'ready',
        schema: SCHEMA,
        migrationVersion: state.migrationVersion,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException('Universal Business Partner runtime is not ready.');
    }
  }
}
