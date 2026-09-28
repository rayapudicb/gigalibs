import { Controller, Get, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async getHealth() {
    const dbReady = await this.db.isReady();
    return {
      status: dbReady ? 'healthy' : 'degraded',
      service: 'ontology-api',
      timestamp: new Date().toISOString(),
      database: dbReady ? 'connected' : 'unreachable',
    };
  }
}
