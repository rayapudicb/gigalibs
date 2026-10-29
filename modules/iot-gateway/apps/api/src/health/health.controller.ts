import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('v1/health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async health() {
    const state = await this.database.readiness();
    return { status: 'ok', migrationVersion: state.migrationVersion };
  }

  @Get('ready')
  async ready() {
    await this.database.readiness();
    return { status: 'ready' };
  }
}
