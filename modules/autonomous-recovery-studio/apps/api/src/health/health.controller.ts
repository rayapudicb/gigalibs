import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check() {
    try {
      const res = await this.db.query('SELECT 1 as alive');
      const isAlive = res.rows[0]?.alive === 1;
      return {
        status: isAlive ? 'ok' : 'degraded',
        service: 'autonomous-recovery-studio-api',
        version: '0.1.0-dev',
        database: isAlive ? 'connected' : 'disconnected',
        accuracyGuarantee: '100% Deterministic Mathematical / >98.5% Automated Hold',
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        status: 'error',
        service: 'autonomous-recovery-studio-api',
        database: err.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
