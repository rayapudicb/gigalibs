import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get(['health', 'api/tax/v1/health'])
  async check(): Promise<{ status: string; module: string; timestamp: string }> {
    await this.db.query('SELECT 1');
    return {
      status: 'healthy',
      module: 'tax-configuration',
      timestamp: new Date().toISOString(),
    };
  }
}
