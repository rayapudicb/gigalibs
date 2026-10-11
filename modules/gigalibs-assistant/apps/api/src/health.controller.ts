import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

@Controller('v1/health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  live() { return { status: 'ok', service: 'gigalibs-assistant-api' }; }

  @Get(['', 'ready'])
  async ready() {
    try {
      const state = await this.database.readiness();
      return { status: 'ok', service: 'gigalibs-assistant-api', migrationVersion: state.migrationVersion };
    } catch {
      throw new ServiceUnavailableException('Assistant runtime is not ready.');
    }
  }
}
