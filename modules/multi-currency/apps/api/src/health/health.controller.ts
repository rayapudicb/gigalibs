import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('api/currency/v1')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  async health(): Promise<{ status: string; module: string; timestamp: string; database: string }> {
    try {
      await this.db.query('SELECT 1;');
      return {
        status: 'healthy',
        module: 'multi-currency',
        timestamp: new Date().toISOString(),
        database: 'connected',
      };
    } catch {
      return {
        status: 'degraded',
        module: 'multi-currency',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      };
    }
  }
}
